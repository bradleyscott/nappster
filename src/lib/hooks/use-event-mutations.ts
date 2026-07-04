'use client'

import { useState, useCallback } from 'react'
import type { SleepEvent, EventType, Context } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import {
  createSleepEvent,
  updateSleepEvent,
  deleteSleepEvent,
} from '@/lib/services/sleep-events'

// ---------------------------------------------------------------------------
// Types (exported for callers)
// ---------------------------------------------------------------------------

export interface CreateEventData {
  event_type: EventType
  event_time: string
  end_time?: string | null
  context: Context
  notes: string | null
}

export interface SaveEventData {
  id?: string
  event_type: EventType
  event_time: string
  end_time?: string | null
  context: Context
  notes: string | null
}

export interface SaveSessionData {
  startEvent: {
    id: string
    event_time: string
    context: Context
    notes: string | null
  }
  endEvent?: {
    id?: string
    event_type?: EventType
    event_time: string
    context: Context
    notes: string | null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Revert a single event to its original values. */
async function revertEvent(
  supabase: ReturnType<typeof createClient>,
  id: string,
  original: SleepEvent,
): Promise<void> {
  await updateSleepEvent(supabase, id, {
    event_time: original.event_time,
    context: original.context as Context,
    notes: original.notes,
  })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseEventMutationsOptions {
  babyId: string
  onEventChange?: () => void
  broadcastDelete?: (table: string, event: SleepEvent) => Promise<void>
  /** Called to mark an event as locally created (for realtime dedup) */
  markLocallyCreated?: (eventId: string) => void
}

export function useEventMutations({
  babyId,
  onEventChange,
  broadcastDelete,
  markLocallyCreated,
}: UseEventMutationsOptions) {
  const supabase = createClient()

  // Local events state for realtime updates and optimistic UI
  const [localEvents, setLocalEvents] = useState<SleepEvent[]>([])

  // Track deleted event IDs (needed for realtime deletes of events in initial/history arrays)
  const [deletedEventIds, setDeletedEventIds] = useState<Set<string>>(new Set())

  // --- Single event CRUD ---

  const createEvent = useCallback(
    async (data: CreateEventData): Promise<SleepEvent | null> => {
      const { data: newEvent, error } = await createSleepEvent(supabase, {
        baby_id: babyId,
        event_type: data.event_type,
        event_time: data.event_time,
        end_time: data.end_time ?? null,
        context: data.context,
        notes: data.notes,
      })

      if (error || !newEvent) {
        console.error('Error creating event:', error)
        return null
      }

      // Track locally created event to avoid duplicate from realtime
      markLocallyCreated?.(newEvent.id)
      setLocalEvents((prev) => [...prev, newEvent])
      onEventChange?.()

      return newEvent
    },
    [babyId, supabase, onEventChange, markLocallyCreated],
  )

  const saveEvent = useCallback(
    async (data: SaveEventData): Promise<boolean> => {
      if (data.id) {
        const { data: updatedEvent, error } = await updateSleepEvent(
          supabase,
          data.id,
          {
            event_type: data.event_type,
            event_time: data.event_time,
            end_time: data.end_time,
            context: data.context,
            notes: data.notes,
          },
        )

        if (error || !updatedEvent) {
          console.error('Error updating event:', error)
          return false
        }

        setLocalEvents((prev) => {
          const existing = prev.find((e) => e.id === updatedEvent.id)
          if (existing) {
            return prev.map((e) =>
              e.id === updatedEvent.id ? updatedEvent : e,
            )
          }
          return [...prev, updatedEvent]
        })
      } else {
        const created = await createEvent(data)
        if (!created) return false
      }

      onEventChange?.()
      return true
    },
    [supabase, createEvent, onEventChange],
  )

  const deleteEvent = useCallback(
    async (event: SleepEvent): Promise<boolean> => {
      const { error } = await deleteSleepEvent(supabase, event.id)

      if (error) {
        console.error('Error deleting event:', error)
        return false
      }

      if (broadcastDelete) {
        await broadcastDelete('sleep_events', event)
      }

      setDeletedEventIds((prev) => new Set(prev).add(event.id))
      setLocalEvents((prev) => prev.filter((e) => e.id !== event.id))
      onEventChange?.()

      return true
    },
    [supabase, broadcastDelete, onEventChange],
  )

  // --- Session CRUD ---

  /**
   * Save a session (paired events like nap_start/nap_end).
   *
   * Accepts an optional `allEvents` array so callers can supply an
   * authoritative event list for the revert-on-failure path, avoiding
   * the stale-closure risk of reading `localEvents` from the hook.
   */
  const saveSession = useCallback(
    async (
      data: SaveSessionData,
      allEvents?: SleepEvent[],
    ): Promise<boolean> => {
      const { data: startData, error: startError } = await updateSleepEvent(
        supabase,
        data.startEvent.id,
        {
          event_time: data.startEvent.event_time,
          context: data.startEvent.context,
          notes: data.startEvent.notes,
        },
      )

      if (startError || !startData) {
        console.error('Error updating start event:', startError)
        return false
      }

      let endData: SleepEvent | null = null
      if (data.endEvent) {
        if (data.endEvent.id) {
          const { data: endResult, error: endError } =
            await updateSleepEvent(supabase, data.endEvent.id, {
              event_time: data.endEvent.event_time,
              context: data.endEvent.context,
              notes: data.endEvent.notes,
            })

          if (endError) {
            console.error('Error updating end event:', endError)
            // Revert the start event using the caller-supplied events (or fall
            // back to localEvents) to avoid a stale-closure read of hook state.
            const revertFrom = allEvents ?? localEvents
            const originalStart = revertFrom.find(
              (e) => e.id === data.startEvent.id,
            )
            if (originalStart) {
              await revertEvent(supabase, data.startEvent.id, originalStart)
            }
            return false
          }

          endData = endResult
        } else {
          const { data: endResult, error: endError } =
            await createSleepEvent(supabase, {
              baby_id: babyId,
              event_type: data.endEvent.event_type!,
              event_time: data.endEvent.event_time,
              context: data.endEvent.context,
              notes: data.endEvent.notes,
            })

          if (endError) {
            console.error('Error creating end event:', endError)
            const revertFrom = allEvents ?? localEvents
            const originalStart = revertFrom.find(
              (e) => e.id === data.startEvent.id,
            )
            if (originalStart) {
              await revertEvent(supabase, data.startEvent.id, originalStart)
            }
            return false
          }

          markLocallyCreated?.(endResult!.id)
          endData = endResult
        }
      }

      // Both updates succeeded — commit to local state
      setLocalEvents((prev) => {
        let updated = prev.map((e) =>
          e.id === startData.id ? startData : e,
        )
        if (endData) {
          const exists = updated.some((e) => e.id === endData.id)
          if (exists) {
            updated = updated.map((e) =>
              e.id === endData.id ? endData : e,
            )
          } else {
            updated = [...updated, endData]
          }
        }
        return updated
      })

      onEventChange?.()
      return true
    },
    [supabase, babyId, onEventChange, markLocallyCreated, localEvents],
  )

  const deleteSession = useCallback(
    async (
      startId: string,
      endId: string | null,
      allEvents: SleepEvent[],
    ): Promise<boolean> => {
      const startEvent = allEvents.find((e) => e.id === startId)
      const endEvent = endId ? allEvents.find((e) => e.id === endId) : null

      const { error: startError } = await deleteSleepEvent(supabase, startId)

      if (startError) {
        console.error('Error deleting start event:', startError)
        return false
      }

      if (broadcastDelete && startEvent) {
        await broadcastDelete('sleep_events', startEvent)
      }

      if (endId) {
        const { error: endError } = await deleteSleepEvent(supabase, endId)

        if (endError) {
          console.error('Error deleting end event:', endError)
          // Start is already gone — mark it and continue
          setDeletedEventIds((prev) => new Set(prev).add(startId))
          setLocalEvents((prev) => prev.filter((e) => e.id !== startId))
          onEventChange?.()
          return false
        }

        if (broadcastDelete && endEvent) {
          await broadcastDelete('sleep_events', endEvent)
        }
      }

      setDeletedEventIds((prev) => {
        const next = new Set(prev)
        next.add(startId)
        if (endId) next.add(endId)
        return next
      })
      setLocalEvents((prev) =>
        prev.filter((e) => e.id !== startId && e.id !== endId),
      )
      onEventChange?.()

      return true
    },
    [supabase, broadcastDelete, onEventChange],
  )

  // --- Direct state access for the facade ---

  const setLocalEventsDirect = useCallback(
    (eventsOrUpdater: SleepEvent[] | ((prev: SleepEvent[]) => SleepEvent[])): void => {
      setLocalEvents(eventsOrUpdater)
    },
    [],
  )

  const setDeletedEventIdsDirect = useCallback(
    (
      idsOrUpdater:
        | Set<string>
        | ((prev: Set<string>) => Set<string>),
    ): void => {
      setDeletedEventIds(idsOrUpdater)
    },
    [],
  )

  return {
    localEvents,
    deletedEventIds,
    createEvent,
    saveEvent,
    deleteEvent,
    saveSession,
    deleteSession,
    setLocalEvents: setLocalEventsDirect,
    setDeletedEventIds: setDeletedEventIdsDirect,
  }
}
