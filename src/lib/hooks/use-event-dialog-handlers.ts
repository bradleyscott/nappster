'use client'

import { useCallback } from 'react'
import type { SleepEvent, SleepSession } from '@/types/database'
import type { SaveEventData, SaveSessionData } from './use-sleep-event-crud'

interface UseEventDialogHandlersOptions {
  selectedItem: SleepSession | SleepEvent | null
  allEvents: SleepEvent[]
  broadcastDelete: (table: 'sleep_events', event: SleepEvent) => Promise<void>
  onClose: () => void
  crud: {
    saveEvent: (eventData: SaveEventData) => Promise<boolean>
    deleteEvent: (event: SleepEvent) => Promise<boolean>
    saveSession: (sessionData: SaveSessionData) => Promise<boolean>
    deleteSession: (startId: string, endId: string | null, allEvents: SleepEvent[]) => Promise<boolean>
  }
}

interface UseEventDialogHandlersReturn {
  saveEvent: (eventData: SaveEventData) => Promise<void>
  deleteEvent: () => Promise<void>
  saveSession: (sessionData: SaveSessionData) => Promise<void>
  deleteSession: (startId: string, endId: string | null) => Promise<void>
}

export function useEventDialogHandlers({
  selectedItem,
  allEvents,
  broadcastDelete,
  onClose,
  crud,
}: UseEventDialogHandlersOptions): UseEventDialogHandlersReturn {
  const { saveEvent, deleteEvent, saveSession, deleteSession } = crud

  const handleSaveEvent = useCallback(async (eventData: SaveEventData) => {
    const success = await saveEvent(eventData)
    if (success) onClose()
  }, [saveEvent, onClose])

  const handleDeleteEvent = useCallback(async () => {
    if (!selectedItem || !('event_type' in selectedItem)) return
    const success = await deleteEvent(selectedItem)
    if (success) {
      await broadcastDelete('sleep_events', selectedItem)
      onClose()
    }
  }, [selectedItem, deleteEvent, broadcastDelete, onClose])

  const handleSaveSession = useCallback(async (sessionData: SaveSessionData) => {
    const success = await saveSession(sessionData)
    if (success) onClose()
  }, [saveSession, onClose])

  const handleDeleteSession = useCallback(async (startId: string, endId: string | null) => {
    const success = await deleteSession(startId, endId, allEvents)
    if (success) onClose()
  }, [deleteSession, allEvents, onClose])

  return {
    saveEvent: handleSaveEvent,
    deleteEvent: handleDeleteEvent,
    saveSession: handleSaveSession,
    deleteSession: handleDeleteSession,
  }
}
