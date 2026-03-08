'use client'

import { useState, useCallback, useRef } from 'react'
import { SleepEvent, EventType, Context } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

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
  // Merge refreshed events (from visibility change refresh)
  mergeRefreshedEvents: (events: SleepEvent[]) => void
}

export function useSleepEventCRUD({
  babyId,
  onEventChange,
  broadcastDelete,
}: UseSleepEventCRUDOptions): UseSleepEventCRUDReturn {
  const supabase = createClient()

  // Local events state for realtime updates and optimistic UI
  const [localEvents, setLocalEvents] = useState<SleepEvent[]>([])

  // Track deleted event IDs (needed for realtime deletes of events in initial/history arrays)
  const [deletedEventIds, setDeletedEventIds] = useState<Set<string>>(new Set())

  // Track locally created events to avoid duplicates from realtime
  const locallyCreatedEventIds = useRef(new Set<string>())

  // Track which tool-created events we've already added to avoid duplicates
  const processedToolEventIds = useRef(new Set<string>())

  // Check if an event is already tracked (to prevent realtime duplicates)
  const isEventTracked = useCallback((eventId: string): boolean => {
    return locallyCreatedEventIds.current.has(eventId) || processedToolEventIds.current.has(eventId)
  }, [])

  // Handle realtime event changes from other family members
  const handleRealtimeEvent = useCallback((event: SleepEvent, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
    // Skip events we created ourselves (already in state)
    if (isEventTracked(event.id)) {
      return
    }

    if (changeType === 'DELETE') {
      setDeletedEventIds(prev => new Set(prev).add(event.id))
      setLocalEvents(prev => prev.filter(e => e.id !== event.id))
    } else {
      setLocalEvents(prev => {
        switch (changeType) {
          case 'INSERT':
            if (prev.some(e => e.id === event.id)) return prev
            return [...prev, event]
          case 'UPDATE':
            return prev.map(e => e.id === event.id ? { ...e, ...event } : e)
          default:
            return prev
        }
      })
    }

    onEventChange?.()
  }, [isEventTracked, onEventChange])

  // Add an event created by AI tools
  const addToolCreatedEvent = useCallback((event: SleepEvent) => {
    if (!processedToolEventIds.current.has(event.id)) {
      processedToolEventIds.current.add(event.id)
      setLocalEvents(prev => {
        if (prev.some(e => e.id === event.id)) return prev
        return [...prev, event]
      })
      onEventChange?.()
    }
  }, [onEventChange])

  // Merge refreshed events from background refresh (visibility change, reconnect)
  // Updates existing events and adds new ones, respecting deleted events
  const mergeRefreshedEvents = useCallback((events: SleepEvent[]) => {
    setLocalEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id))
      const updatedEvents = [...prev]

      // Read current deletedEventIds inside the state updater to avoid stale closure
      setDeletedEventIds(currentDeletedIds => {
        for (const event of events) {
          // Skip deleted events
          if (currentDeletedIds.has(event.id)) continue

          if (existingIds.has(event.id)) {
            // Update existing event
            const index = updatedEvents.findIndex(e => e.id === event.id)
            if (index !== -1) {
              updatedEvents[index] = event
            }
          } else {
            // Add new event
            updatedEvents.push(event)
          }
        }
        // Return the same set (no mutation)
        return currentDeletedIds
      })

      return updatedEvents
    })
  }, [])

  // Create a new sleep event
  const createEvent = useCallback(async (data: CreateEventData): Promise<SleepEvent | null> => {
    const { data: newEvent, error } = await supabase
      .from('sleep_events')
      .insert({
        baby_id: babyId,
        event_type: data.event_type,
        event_time: data.event_time,
        end_time: data.end_time ?? null,
        context: data.context,
        notes: data.notes,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      return null
    }

    // Track locally created event to avoid duplicate from realtime
    locallyCreatedEventIds.current.add(newEvent.id)
    setLocalEvents(prev => [...prev, newEvent])
    onEventChange?.()

    return newEvent
  }, [babyId, supabase, onEventChange])

  // Save (create or update) an event
  const saveEvent = useCallback(async (data: SaveEventData): Promise<boolean> => {
    if (data.id) {
      // Update existing event
      const { data: updatedEvent, error } = await supabase
        .from('sleep_events')
        .update({
          event_type: data.event_type,
          event_time: data.event_time,
          end_time: data.end_time,
          context: data.context,
          notes: data.notes,
        })
        .eq('id', data.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating event:', error)
        return false
      }

      setLocalEvents(prev => {
        const existing = prev.find(e => e.id === updatedEvent.id)
        if (existing) {
          return prev.map(e => e.id === updatedEvent.id ? updatedEvent : e)
        }
        return [...prev, updatedEvent]
      })
    } else {
      // Create new event
      const created = await createEvent(data)
      if (!created) return false
    }

    onEventChange?.()
    return true
  }, [supabase, createEvent, onEventChange])

  // Delete an event
  const deleteEvent = useCallback(async (event: SleepEvent): Promise<boolean> => {
    const { error } = await supabase
      .from('sleep_events')
      .delete()
      .eq('id', event.id)

    if (error) {
      console.error('Error deleting event:', error)
      return false
    }

    // Broadcast delete to other family members (RLS blocks postgres_changes for DELETE)
    if (broadcastDelete) {
      await broadcastDelete('sleep_events', event)
    }

    setDeletedEventIds(prev => new Set(prev).add(event.id))
    setLocalEvents(prev => prev.filter(e => e.id !== event.id))
    onEventChange?.()

    return true
  }, [supabase, broadcastDelete, onEventChange])

  // Save a session (paired events like nap_start/nap_end)
  const saveSession = useCallback(async (data: SaveSessionData): Promise<boolean> => {
    // Update start event
    const { data: startData, error: startError } = await supabase
      .from('sleep_events')
      .update({
        event_time: data.startEvent.event_time,
        context: data.startEvent.context,
        notes: data.startEvent.notes,
      })
      .eq('id', data.startEvent.id)
      .select()
      .single()

    if (startError) {
      console.error('Error updating start event:', startError)
      return false
    }

    // Update or create end event if present — do this before committing to state
    let endData = null
    if (data.endEvent) {
      if (data.endEvent.id) {
        // Update existing end event
        const { data: endResult, error: endError } = await supabase
          .from('sleep_events')
          .update({
            event_time: data.endEvent.event_time,
            context: data.endEvent.context,
            notes: data.endEvent.notes,
          })
          .eq('id', data.endEvent.id)
          .select()
          .single()

        if (endError) {
          console.error('Error updating end event:', endError)
          // Revert start event to maintain consistency
          const originalStart = localEvents.find(e => e.id === data.startEvent.id)
          if (originalStart) {
            await supabase
              .from('sleep_events')
              .update({
                event_time: originalStart.event_time,
                context: originalStart.context,
                notes: originalStart.notes,
              })
              .eq('id', data.startEvent.id)
          }
          return false
        }

        endData = endResult
      } else {
        // Create new end event
        const { data: endResult, error: endError } = await supabase
          .from('sleep_events')
          .insert({
            baby_id: babyId,
            event_type: data.endEvent.event_type!,
            event_time: data.endEvent.event_time,
            context: data.endEvent.context,
            notes: data.endEvent.notes,
          })
          .select()
          .single()

        if (endError) {
          console.error('Error creating end event:', endError)
          // Revert start event to maintain consistency
          const originalStart = localEvents.find(e => e.id === data.startEvent.id)
          if (originalStart) {
            await supabase
              .from('sleep_events')
              .update({
                event_time: originalStart.event_time,
                context: originalStart.context,
                notes: originalStart.notes,
              })
              .eq('id', data.startEvent.id)
          }
          return false
        }

        // Track locally created event to avoid duplicate from realtime
        locallyCreatedEventIds.current.add(endResult.id)
        endData = endResult
      }
    }

    // Both updates succeeded — commit to local state
    setLocalEvents(prev => {
      let updated = prev.map(e => e.id === startData.id ? startData : e)
      if (endData) {
        const exists = updated.some(e => e.id === endData.id)
        if (exists) {
          updated = updated.map(e => e.id === endData.id ? endData : e)
        } else {
          updated = [...updated, endData]
        }
      }
      return updated
    })

    onEventChange?.()
    return true
  }, [supabase, onEventChange, localEvents])

  // Delete a session (both start and end events)
  const deleteSession = useCallback(async (
    startId: string,
    endId: string | null,
    allEvents: SleepEvent[]
  ): Promise<boolean> => {
    // Find the events before deleting so we can broadcast them
    const startEvent = allEvents.find(e => e.id === startId)
    const endEvent = endId ? allEvents.find(e => e.id === endId) : null

    const { error: startError } = await supabase
      .from('sleep_events')
      .delete()
      .eq('id', startId)

    if (startError) {
      console.error('Error deleting start event:', startError)
      return false
    }

    // Broadcast delete to other family members
    if (broadcastDelete && startEvent) {
      await broadcastDelete('sleep_events', startEvent)
    }

    if (endId) {
      const { error: endError } = await supabase
        .from('sleep_events')
        .delete()
        .eq('id', endId)

      if (endError) {
        console.error('Error deleting end event:', endError)
        // End event delete failed but start is already gone.
        // Still mark start as deleted and update state to stay consistent.
        setDeletedEventIds(prev => new Set(prev).add(startId))
        setLocalEvents(prev => prev.filter(e => e.id !== startId))
        onEventChange?.()
        return false
      }

      if (broadcastDelete && endEvent) {
        await broadcastDelete('sleep_events', endEvent)
      }
    }

    // Track deleted IDs
    setDeletedEventIds(prev => {
      const next = new Set(prev)
      next.add(startId)
      if (endId) next.add(endId)
      return next
    })
    setLocalEvents(prev => prev.filter(e => e.id !== startId && e.id !== endId))
    onEventChange?.()

    return true
  }, [supabase, broadcastDelete, onEventChange])

  return {
    localEvents,
    deletedEventIds,
    createEvent,
    saveEvent,
    deleteEvent,
    saveSession,
    deleteSession,
    handleRealtimeEvent,
    addToolCreatedEvent,
    isEventTracked,
    mergeRefreshedEvents,
  }
}
