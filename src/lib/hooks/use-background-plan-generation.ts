'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeCurrentState,
  isPlanStaleForNaps,
} from '@/lib/state-machine'
import { useNow } from '@/lib/hooks/use-now'
import type { SleepEvent } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

interface UseBackgroundPlanGenerationOptions {
  babyId: string
  events: SleepEvent[]
  sleepPlan: SleepPlan | null
  timezone: string
  enabled?: boolean
  isChatStreaming?: boolean
  debounceMs?: number
  cooldownMs?: number
}

interface UseBackgroundPlanGenerationReturn {
  /** True while a background generation request is in flight. */
  isGenerating: boolean
  /** Set if the most recent generation attempt failed. */
  error: Error | null
}

/**
 * Kicks off background sleep plan generation when the active AI plan is stale
 * or missing. The dashboard still shows the trends fallback synchronously;
 * this hook just ensures a fresh AI plan is fetched asynchronously.
 *
 * Guards:
 *   - Debounced (default 2s) so rapid event edits don't spam the API.
 *   - Cooldown (default 30s) between requests unless deps change again.
 *   - Skips while the user is actively chatting.
 *   - Skips during overnight sleep if a plan already exists.
 */
export function useBackgroundPlanGeneration({
  babyId,
  events,
  sleepPlan,
  timezone,
  enabled = true,
  isChatStreaming = false,
  debounceMs = 2000,
  cooldownMs = 30000,
}: UseBackgroundPlanGenerationOptions): UseBackgroundPlanGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const isFetchingRef = useRef(false)
  const lastRequestedAtRef = useRef<number>(0)
  const mountedRef = useRef(true)
  const now = useNow(30000)

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
      ),
    [events]
  )

  const currentState = useMemo(
    () => computeCurrentState(sortedEvents),
    [sortedEvents]
  )

  const shouldGenerate = useMemo(() => {
    if (!enabled) return false
    if (isChatStreaming) return false
    if (currentState === 'overnight_sleep' && sleepPlan) return false

    if (sleepPlan) {
      return isPlanStaleForNaps(
        { schedule: sleepPlan.schedule, targetBedtime: sleepPlan.targetBedtime },
        sortedEvents,
        timezone,
        now
      )
    }

    // No plan: generate once there are events to schedule around.
    return sortedEvents.length > 0
  }, [
    enabled,
    isChatStreaming,
    currentState,
    sleepPlan,
    sortedEvents,
    timezone,
    now,
  ])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!shouldGenerate) return
    if (isFetchingRef.current) return
    if (Date.now() - lastRequestedAtRef.current < cooldownMs) return

    const id = setTimeout(async () => {
      // Re-check after the debounce window; conditions may have changed.
      if (!shouldGenerate || isFetchingRef.current) return
      if (Date.now() - lastRequestedAtRef.current < cooldownMs) return

      isFetchingRef.current = true
      lastRequestedAtRef.current = Date.now()
      if (mountedRef.current) setIsGenerating(true)
      if (mountedRef.current) setError(null)

      try {
        const res = await fetch('/api/sleep-plan/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ babyId, timezone }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            body.error ?? `Plan generation failed (${res.status})`
          )
        }
      } catch (err) {
        // Clear the cooldown so a later event change (or the next effect run)
        // can retry instead of silently wedging generation on a failed request.
        lastRequestedAtRef.current = 0
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        isFetchingRef.current = false
        if (mountedRef.current) setIsGenerating(false)
      }
    }, debounceMs)

    return () => clearTimeout(id)
  }, [shouldGenerate, babyId, timezone, debounceMs, cooldownMs, sortedEvents])

  return { isGenerating, error }
}
