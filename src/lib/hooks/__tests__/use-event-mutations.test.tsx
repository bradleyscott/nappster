import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEventMutations } from '../use-event-mutations'
import type { SleepEvent, EventType, Context } from '@/types/database'

// Mock the Supabase client so network calls are captured.
const createMockSupabase = () => {
  let lastInsert: Record<string, unknown> | null = null
  let lastUpdate: { id: string; data: Record<string, unknown> } | null = null
  let lastDeleteId: string | null = null
  let nextResponses: Array<{ data: unknown; error: unknown }> = []

  const client = {
    from: vi.fn(() => client),
    insert: vi.fn((data: Record<string, unknown>) => {
      lastInsert = data
      return client
    }),
    update: vi.fn((data: Record<string, unknown>) => {
      lastUpdate = { id: '', data }
      return client
    }),
    delete: vi.fn(() => client),
    eq: vi.fn(function (this: unknown, _column: string, value: unknown) {
      if (lastUpdate && typeof value === 'string') lastUpdate.id = value
      if (typeof value === 'string') lastDeleteId = value
      return client
    }),
    select: vi.fn(() => client),
    single: vi.fn(() => {
      const response = nextResponses.shift() ?? { data: null, error: null }
      return Promise.resolve(response)
    }),
    rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
    _lastInsert: () => lastInsert,
    _lastUpdate: () => lastUpdate,
    _lastDeleteId: () => lastDeleteId,
    _setNextResponses: (responses: Array<{ data: unknown; error: unknown }>) => {
      nextResponses = responses
    },
    _reset: () => {
      lastInsert = null
      lastUpdate = null
      lastDeleteId = null
      nextResponses = []
    },
  }
  return client
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

let mockSupabase: ReturnType<typeof createMockSupabase>

const makeEvent = (
  overrides: Partial<SleepEvent> & { id: string; event_type: EventType; event_time: string }
): SleepEvent => ({
  baby_id: 'baby-1',
  end_time: null,
  context: 'home' as Context,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

const wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>

describe('useEventMutations', () => {
  beforeEach(() => {
    mockSupabase = createMockSupabase()
    mockSupabase._reset()
  })

  it('saveSession reverts the start event when the end-event update fails', async () => {
    const originalStart = makeEvent({
      id: 'start-1',
      event_type: 'nap_start',
      event_time: '2024-06-15T09:00:00Z',
      context: 'home',
      notes: 'original',
    })

    const { result } = renderHook(
      () =>
        useEventMutations({
          babyId: 'baby-1',
          onEventChange: vi.fn(),
        }),
      { wrapper }
    )

    // First update succeeds, second update fails, revert succeeds.
    mockSupabase._setNextResponses([
      { data: { ...originalStart, event_time: '2024-06-15T09:30:00Z' }, error: null },
      { data: null, error: new Error('DB timeout') },
      { data: originalStart, error: null },
    ])

    let saveResult: boolean | undefined
    await act(async () => {
      saveResult = await result.current.saveSession(
        {
          startEvent: {
            id: 'start-1',
            event_time: '2024-06-15T09:30:00Z',
            context: 'home',
            notes: 'updated',
          },
          endEvent: {
            id: 'end-1',
            event_type: 'nap_end',
            event_time: '2024-06-15T10:00:00Z',
            context: 'home',
            notes: null,
          },
        },
        [originalStart]
      )
    })

    expect(saveResult).toBe(false)
    // The revert call should restore the original start event_time.
    expect(mockSupabase._lastUpdate()?.id).toBe('start-1')
    expect(mockSupabase._lastUpdate()?.data.event_time).toBe(originalStart.event_time)
  })

  it('deleteSession marks deleted IDs and broadcasts both events', async () => {
    const broadcastDelete = vi.fn()
    const startEvent = makeEvent({
      id: 'start-2',
      event_type: 'nap_start',
      event_time: '2024-06-15T09:00:00Z',
    })
    const endEvent = makeEvent({
      id: 'end-2',
      event_type: 'nap_end',
      event_time: '2024-06-15T10:00:00Z',
    })

    const { result } = renderHook(
      () =>
        useEventMutations({
          babyId: 'baby-1',
          onEventChange: vi.fn(),
          broadcastDelete,
        }),
      { wrapper }
    )

    mockSupabase._setNextResponses([
      { data: null, error: null },
      { data: null, error: null },
    ])

    await act(async () => {
      await result.current.deleteSession('start-2', 'end-2', [startEvent, endEvent])
    })

    expect(mockSupabase._lastDeleteId()).toBe('end-2')
    expect(broadcastDelete).toHaveBeenCalledWith('sleep_events', startEvent)
    expect(broadcastDelete).toHaveBeenCalledWith('sleep_events', endEvent)
    expect(result.current.deletedEventIds.has('start-2')).toBe(true)
    expect(result.current.deletedEventIds.has('end-2')).toBe(true)
  })

  it('createEvent tracks locally created events', async () => {
    const newEvent = makeEvent({
      id: 'new-1',
      event_type: 'wake',
      event_time: '2024-06-15T07:00:00Z',
    })

    const { result } = renderHook(
      () =>
        useEventMutations({
          babyId: 'baby-1',
          onEventChange: vi.fn(),
        }),
      { wrapper }
    )

    mockSupabase._setNextResponses([{ data: newEvent, error: null }])

    let created: SleepEvent | null = null
    await act(async () => {
      created = await result.current.createEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
        context: 'home',
        notes: null,
      })
    })

    expect(created).toEqual(newEvent)
    expect(result.current.localEvents).toContainEqual(newEvent)
  })
})
