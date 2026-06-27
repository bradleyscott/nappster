import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSleepEventCRUD } from '../use-sleep-event-crud'
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '@/lib/__tests__/mocks/supabase'
import type { SleepEvent } from '@/types/database'

// Track the current mock instance across beforeEach resets
let currentMock: MockSupabaseClient | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => currentMock,
}))

function makeEvent(
  id: string,
  overrides: Partial<SleepEvent> = {}
): SleepEvent {
  return {
    id,
    baby_id: 'baby-1',
    event_type: 'wake',
    event_time: '2024-01-01T08:00:00Z',
    end_time: null,
    context: 'home',
    notes: null,
    created_at: '2024-01-01T08:00:00Z',
    ...overrides,
  } as SleepEvent
}

describe('useSleepEventCRUD', () => {
  const onEventChange = vi.fn()
  const broadcastDelete = vi.fn()

  beforeEach(() => {
    currentMock = createMockSupabaseClient()
    currentMock._reset()
    onEventChange.mockClear()
    broadcastDelete.mockClear()
  })

  afterEach(() => {
    currentMock = null
  })

  describe('state management', () => {
    it('starts with empty state', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1' })
      )
      expect(result.current.localEvents).toEqual([])
      expect(result.current.deletedEventIds.size).toBe(0)
    })

    it('handleRealtimeEvent adds INSERT events', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )
      act(() => {
        result.current.handleRealtimeEvent(makeEvent('evt-1'), 'INSERT')
      })
      expect(result.current.localEvents).toHaveLength(1)
      expect(result.current.localEvents[0].id).toBe('evt-1')
      expect(onEventChange).toHaveBeenCalled()
    })

    it('handleRealtimeEvent updates matching events on UPDATE', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )
      act(() => {
        result.current.handleRealtimeEvent(makeEvent('evt-1'), 'INSERT')
      })
      act(() => {
        result.current.handleRealtimeEvent(
          makeEvent('evt-1', { context: 'daycare' }),
          'UPDATE'
        )
      })
      expect(result.current.localEvents).toHaveLength(1)
      expect(result.current.localEvents[0].context).toBe('daycare')
    })

    it('handleRealtimeEvent removes events on DELETE', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )
      act(() => {
        result.current.handleRealtimeEvent(makeEvent('evt-1'), 'INSERT')
      })
      act(() => {
        result.current.handleRealtimeEvent(makeEvent('evt-1'), 'DELETE')
      })
      expect(result.current.localEvents).toHaveLength(0)
      expect(result.current.deletedEventIds.has('evt-1')).toBe(true)
    })

    it('handleRealtimeEvent ignores events tracked by isEventTracked', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )
      const event = makeEvent('evt-1')
      act(() => {
        result.current.handleRealtimeEvent(event, 'INSERT')
      })
      // Second INSERT with same id should be ignored
      act(() => {
        result.current.handleRealtimeEvent(event, 'INSERT')
      })
      expect(result.current.localEvents).toHaveLength(1)
    })

    it('addToolCreatedEvent adds event once', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )
      const event = makeEvent('evt-1')
      act(() => {
        result.current.addToolCreatedEvent(event)
      })
      expect(result.current.localEvents).toHaveLength(1)
      // Second add should be ignored
      act(() => {
        result.current.addToolCreatedEvent(event)
      })
      expect(result.current.localEvents).toHaveLength(1)
    })

    it('mergeRefreshedEvents adds new events and updates existing ones', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1' })
      )
      const event1 = makeEvent('evt-1', {
        event_time: '2024-01-01T08:00:00Z',
      })
      act(() => {
        result.current.handleRealtimeEvent(event1, 'INSERT')
      })
      // Merge refreshed — update evt-1 and add evt-2
      const updated1 = makeEvent('evt-1', {
        event_time: '2024-01-01T09:00:00Z',
      })
      const event2 = makeEvent('evt-2', {
        event_time: '2024-01-01T10:00:00Z',
      })
      act(() => {
        result.current.mergeRefreshedEvents([updated1, event2])
      })
      const events = result.current.localEvents
      expect(events).toHaveLength(2)
      expect(events.find((e) => e.id === 'evt-1')?.event_time).toBe(
        '2024-01-01T09:00:00Z'
      )
      expect(events.find((e) => e.id === 'evt-2')).toBeDefined()
    })

    it('mergeRefreshedEvents skips deleted events', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange, broadcastDelete })
      )
      const event = makeEvent('evt-1')
      act(() => {
        result.current.handleRealtimeEvent(event, 'INSERT')
      })
      // Mark as deleted
      act(() => {
        result.current.handleRealtimeEvent(event, 'DELETE')
      })
      // Merge should not bring back deleted event
      act(() => {
        result.current.mergeRefreshedEvents([makeEvent('evt-1')])
      })
      expect(result.current.localEvents).toHaveLength(0)
    })
  })

  describe('isEventTracked', () => {
    it('returns false for unknown events', () => {
      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1' })
      )
      expect(result.current.isEventTracked('unknown')).toBe(false)
    })
  })

  describe('createEvent', () => {
    it('creates event and adds to local state', async () => {
      if (!currentMock) throw new Error('mock not initialized')
      currentMock._setInsertResponse({
        data: makeEvent('evt-1', { event_time: '2024-01-01T08:30:00Z' }),
        error: null,
      })

      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange })
      )

      let created: SleepEvent | null = null
      await act(async () => {
        created = await result.current.createEvent({
          event_type: 'wake',
          event_time: '2024-01-01T08:30:00Z',
          context: 'home',
          notes: null,
        })
      })

      expect(created).not.toBeNull()
      expect(created!.id).toBe('evt-1')
      expect(result.current.localEvents).toHaveLength(1)
      expect(onEventChange).toHaveBeenCalled()
    })

    it('returns null on failure', async () => {
      if (!currentMock) throw new Error('mock not initialized')
      currentMock._setInsertResponse({
        data: null,
        error: new Error('DB error'),
      })

      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1' })
      )

      let created: SleepEvent | null = null
      await act(async () => {
        created = await result.current.createEvent({
          event_type: 'wake',
          event_time: '2024-01-01T08:30:00Z',
          context: 'home',
          notes: null,
        })
      })

      expect(created).toBeNull()
    })
  })

  describe('deleteEvent', () => {
    it('deletes and tracks the event id', async () => {
      if (!currentMock) throw new Error('mock not initialized')
      currentMock._setInsertResponse({ data: null, error: null })

      const { result } = renderHook(() =>
        useSleepEventCRUD({ babyId: 'baby-1', onEventChange, broadcastDelete })
      )

      // First add an event
      act(() => {
        result.current.handleRealtimeEvent(makeEvent('evt-1'), 'INSERT')
      })

      let success = false
      await act(async () => {
        success = await result.current.deleteEvent(makeEvent('evt-1'))
      })

      expect(success).toBe(true)
      expect(result.current.localEvents).toHaveLength(0)
      expect(result.current.deletedEventIds.has('evt-1')).toBe(true)
      expect(broadcastDelete).toHaveBeenCalledWith(
        'sleep_events',
        expect.objectContaining({ id: 'evt-1' })
      )
    })
  })
})
