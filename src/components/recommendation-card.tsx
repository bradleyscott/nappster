/**
 * @deprecated This component has been replaced by SleepPlanHeader which provides a
 * collapsible sleep schedule in the unified chat interface.
 * This file is kept for reference only and will be removed in a future release.
 */
'use client'

import { useEffect, useState, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { Baby, SleepEvent } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const recommendationSchema = z.object({
  type: z.enum(['next_nap', 'bedtime', 'waiting']),
  timeWindow: z.string(),
  explanation: z.string(),
})

type Recommendation = z.infer<typeof recommendationSchema>

interface RecommendationCardProps {
  babyId: string
  events: SleepEvent[]
  baby: Baby
  refreshKey?: number
}

// Generate a cache key based on events (using IDs and times)
function getEventsCacheKey(babyId: string, events: SleepEvent[]): string {
  const eventsHash = events
    .map(e => `${e.id}:${e.event_time}:${e.event_type}`)
    .join('|')
  return `recommendation:${babyId}:${eventsHash}`
}

// Cache helpers
function getCachedRecommendation(key: string): Recommendation | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = sessionStorage.getItem(key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function setCachedRecommendation(key: string, recommendation: Recommendation): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(recommendation))
  } catch {
    // Ignore storage errors
  }
}

export function RecommendationCard({ babyId, events, baby, refreshKey }: RecommendationCardProps) {
  const { object, submit, isLoading, error } = useObject({
    api: '/api/recommend',
    schema: recommendationSchema,
  })

  // Track the cache key to detect when events actually change
  const cacheKey = getEventsCacheKey(babyId, events)
  const lastCacheKeyRef = useRef<string>('')
  const lastRefreshKeyRef = useRef<number>(refreshKey ?? 0)
  const isSubmittingRef = useRef(false)
  // Initialize as null to avoid hydration mismatch - sessionStorage only exists on client
  const [cachedRecommendation, setCachedState] = useState<Recommendation | null>(null)

  // Load cached recommendation after hydration to avoid SSR mismatch
  useEffect(() => {
    const cached = getCachedRecommendation(cacheKey)
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with external sessionStorage
      setCachedState(cached)
    }
  }, [cacheKey])

  // Request recommendation when events change (and we have at least one event)
  useEffect(() => {
    if (events.length === 0) return
    if (isSubmittingRef.current) return  // Prevent duplicate requests

    const cached = getCachedRecommendation(cacheKey)
    const refreshKeyChanged = refreshKey !== undefined && refreshKey !== lastRefreshKeyRef.current

    // Use cache if: we have cached data AND cache key hasn't changed AND no explicit refresh requested
    if (cached && cacheKey === lastCacheKeyRef.current && !refreshKeyChanged) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with external sessionStorage
      setCachedState(cached)
      return
    }

    // On initial mount with valid cache, use it without fetching
    if (cached && lastCacheKeyRef.current === '' && !refreshKeyChanged) {
      lastCacheKeyRef.current = cacheKey
      setCachedState(cached)
      return
    }

    // Fetch new recommendation
    lastCacheKeyRef.current = cacheKey
    lastRefreshKeyRef.current = refreshKey ?? 0
    isSubmittingRef.current = true
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    submit({ babyId, events, baby, timezone })
  }, [cacheKey, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update cache when we get a new result
  useEffect(() => {
    if (object?.type && object?.timeWindow && object?.explanation) {
      const recommendation = object as Recommendation
      setCachedRecommendation(cacheKey, recommendation)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing streaming result to local state
      setCachedState(recommendation)
      isSubmittingRef.current = false
    }
  }, [object, cacheKey])

  // Reset submitting flag on error
  useEffect(() => {
    if (error) {
      isSubmittingRef.current = false
    }
  }, [error])

  // No events yet
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Log your baby&apos;s wake time to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  // Use cached recommendation or streaming result
  const displayRecommendation = (object?.type ? object : cachedRecommendation) as Recommendation | null

  // Loading state - only show if no cached recommendation available
  if ((isLoading || !displayRecommendation) && !cachedRecommendation) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    )
  }

  // Error state - only show if no cached recommendation to fall back on
  if (error && !displayRecommendation) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Unable to get recommendation. Try refreshing.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Show recommendation
  const typeLabels: Record<string, string> = {
    next_nap: 'Next Nap',
    bedtime: 'Bedtime',
    waiting: 'Status',
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span>💡</span>
          <span>Recommendation</span>
          {isLoading && <span className="text-xs text-muted-foreground">(updating...)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayRecommendation ? (
          <div>
            <p className="text-xl font-semibold">
              {typeLabels[displayRecommendation.type] || displayRecommendation.type}: {displayRecommendation.timeWindow}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {displayRecommendation.explanation}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Processing...
          </p>
        )}
      </CardContent>
    </Card>
  )
}
