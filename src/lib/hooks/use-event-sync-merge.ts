'use client'

import { useCallback, useRef } from 'react'
import type { SleepEvent } from '@/types/database'

/**
 * Hook for merging and deduplicating sleep events from realtime streams
 * and background refreshes.
 *
 * Extracted from use-sleep-event-crud to separate merge/dedup concern
 * from mutation logic.
 */
export function useEventSyncMerge() {
  // Track locally created events to avoid duplicates from realtime
  const locallyCreatedEventIds = useRef(new Set<string>())

  // Track which tool-created events we've already added to avoid duplicates
  const processedToolEventIds = useRef(new Set<string>())

  // Check if an event is already tracked (to prevent realtime duplicates)
  const isEventTracked = useCallback((eventId: string): boolean => {
    return (
      locallyCreatedEventIds.current.has(eventId) ||
      processedToolEventIds.current.has(eventId)
    )
  }, [])

  // Mark an event as locally created (so realtime INSERTs skip it)
  const markLocallyCreated = useCallback((eventId: string): void => {
    locallyCreatedEventIds.current.add(eventId)
  }, [])

  // Mark an event as tool-created
  const markToolCreated = useCallback((eventId: string): void => {
    processedToolEventIds.current.add(eventId)
  }, [])

  // Handle realtime event changes from other family members
  const handleRealtimeEvent = useCallback(
    (
      event: SleepEvent,
      changeType: 'INSERT' | 'UPDATE' | 'DELETE',
      localEvents: SleepEvent[],
      deletedEventIds: Set<string>,
      onEventChange?: () => void,
    ): { localEvents: SleepEvent[]; deletedEventIds: Set<string> } => {
      // Skip events we created ourselves (already in state)
      if (isEventTracked(event.id)) {
        return { localEvents, deletedEventIds }
      }

      if (changeType === 'DELETE') {
        const nextDeleted = new Set(deletedEventIds).add(event.id)
        const nextEvents = localEvents.filter((e) => e.id !== event.id)
        onEventChange?.()
        return { localEvents: nextEvents, deletedEventIds: nextDeleted }
      }

      let nextEvents: SleepEvent[]
      switch (changeType) {
        case 'INSERT':
          if (localEvents.some((e) => e.id === event.id)) {
            return { localEvents, deletedEventIds }
          }
          nextEvents = [...localEvents, event]
          break
        case 'UPDATE':
          nextEvents = localEvents.map((e) =>
            e.id === event.id ? { ...e, ...event } : e,
          )
          break
        default:
          return { localEvents, deletedEventIds }
      }

      onEventChange?.()
      return { localEvents: nextEvents, deletedEventIds }
    },
    [isEventTracked],
  )

  // Add an event created by AI tools
  const addToolCreatedEvent = useCallback(
    (
      event: SleepEvent,
      localEvents: SleepEvent[],
      onEventChange?: () => void,
    ): SleepEvent[] => {
      if (processedToolEventIds.current.has(event.id)) {
        return localEvents
      }
      processedToolEventIds.current.add(event.id)
      if (localEvents.some((e) => e.id === event.id)) {
        onEventChange?.()
        return localEvents
      }
      onEventChange?.()
      return [...localEvents, event]
    },
    [],
  )

  // Merge refreshed events from background refresh (visibility change, reconnect)
  const mergeRefreshedEvents = useCallback(
    (
      events: SleepEvent[],
      localEvents: SleepEvent[],
      deletedEventIds: Set<string>,
    ): SleepEvent[] => {
      const existingIds = new Set(localEvents.map((e) => e.id))
      const updated = [...localEvents]

      for (const event of events) {
        if (deletedEventIds.has(event.id)) continue

        if (existingIds.has(event.id)) {
          const index = updated.findIndex((e) => e.id === event.id)
          if (index !== -1) {
            updated[index] = event
          }
        } else {
          updated.push(event)
        }
      }

      return updated
    },
    [],
  )

  return {
    isEventTracked,
    markLocallyCreated,
    markToolCreated,
    handleRealtimeEvent,
    addToolCreatedEvent,
    mergeRefreshedEvents,
  }
}
