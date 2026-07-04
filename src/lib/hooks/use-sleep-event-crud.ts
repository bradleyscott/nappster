'use client'

/**
 * Thin facade composing useEventMutations + useEventSyncMerge.
 *
 * Preserves the exact same API as the original monolithic hook so callers
 * (chat-content, trends-view, use-event-dialog-handlers, and all tests)
 * keep working without changes.
 */
import { useCallback } from 'react'
import type { SleepEvent } from '@/types/database'
import { useEventMutations } from './use-event-mutations'
import { useEventSyncMerge } from './use-event-sync-merge'
import type {
  CreateEventData,
  SaveEventData,
  SaveSessionData,
} from './use-event-mutations'

// Re-export types used by external callers
export type { CreateEventData, SaveEventData, SaveSessionData }

interface UseSleepEventCRUDOptions {
  babyId: string
  onEventChange?: () => void
  broadcastDelete?: (table: string, event: SleepEvent) => Promise<void>
}

interface UseSleepEventCRUDReturn {
  localEvents: SleepEvent[]
  deletedEventIds: Set<string>
  createEvent: (data: CreateEventData) => Promise<SleepEvent | null>
  saveEvent: (data: SaveEventData) => Promise<boolean>
  deleteEvent: (event: SleepEvent) => Promise<boolean>
  saveSession: (data: SaveSessionData) => Promise<boolean>
  deleteSession: (startId: string, endId: string | null, allEvents: SleepEvent[]) => Promise<boolean>
  handleRealtimeEvent: (event: SleepEvent, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => void
  addToolCreatedEvent: (event: SleepEvent) => void
  isEventTracked: (eventId: string) => boolean
  mergeRefreshedEvents: (events: SleepEvent[]) => void
}

export function useSleepEventCRUD({
  babyId,
  onEventChange,
  broadcastDelete,
}: UseSleepEventCRUDOptions): UseSleepEventCRUDReturn {
  const syncMerge = useEventSyncMerge()

  const mutations = useEventMutations({
    babyId,
    onEventChange,
    broadcastDelete,
    markLocallyCreated: syncMerge.markLocallyCreated,
  })

  // Wire realtime events through the merge helper
  const handleRealtimeEvent = useCallback(
    (event: SleepEvent, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      const { localEvents, deletedEventIds } =
        syncMerge.handleRealtimeEvent(
          event,
          changeType,
          mutations.localEvents,
          mutations.deletedEventIds,
          onEventChange,
        )

      // Push merged state back into mutations
      mutations.setLocalEvents(localEvents)
      mutations.setDeletedEventIds(deletedEventIds)
    },
    [syncMerge, mutations, onEventChange],
  )

  const addToolCreatedEvent = useCallback(
    (event: SleepEvent) => {
      const updated = syncMerge.addToolCreatedEvent(
        event,
        mutations.localEvents,
        onEventChange,
      )
      mutations.setLocalEvents(updated)
    },
    [syncMerge, mutations, onEventChange],
  )

  const mergeRefreshedEvents = useCallback(
    (events: SleepEvent[]) => {
      const updated = syncMerge.mergeRefreshedEvents(
        events,
        mutations.localEvents,
        mutations.deletedEventIds,
      )
      mutations.setLocalEvents(updated)
    },
    [syncMerge, mutations],
  )

  return {
    localEvents: mutations.localEvents,
    deletedEventIds: mutations.deletedEventIds,
    createEvent: mutations.createEvent,
    saveEvent: mutations.saveEvent,
    deleteEvent: mutations.deleteEvent,
    saveSession: mutations.saveSession,
    deleteSession: mutations.deleteSession,
    handleRealtimeEvent,
    addToolCreatedEvent,
    isEventTracked: syncMerge.isEventTracked,
    mergeRefreshedEvents,
  }
}
