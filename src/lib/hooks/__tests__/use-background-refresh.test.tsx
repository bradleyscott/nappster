import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBackgroundRefresh } from '../use-background-refresh'
import type { SleepEvent, SleepPlanRow, ChatMessage } from '@/types/database'

const mocks = {
  getRecentSleepEvents: vi.fn(),
  getChatMessages: vi.fn(),
  getRecentSleepPlans: vi.fn(),
}

vi.mock('@/lib/services/sleep-events', () => ({
  getRecentSleepEvents: (...args: unknown[]) => mocks.getRecentSleepEvents(...args),
}))

vi.mock('@/lib/services/chat-messages', () => ({
  getChatMessages: (...args: unknown[]) => mocks.getChatMessages(...args),
}))

vi.mock('@/lib/services/sleep-plans', () => ({
  getRecentSleepPlans: (...args: unknown[]) => mocks.getRecentSleepPlans(...args),
}))

function makeHook() {
  const mergeRefreshedEvents = vi.fn()
  const mergeRefreshedMessages = vi.fn()
  const onPlansRefreshed = vi.fn()

  const { result } = renderHook(() =>
    useBackgroundRefresh({
      babyId: 'baby-1',
      timezone: 'UTC',
      mergeRefreshedEvents,
      mergeRefreshedMessages,
      onPlansRefreshed,
    })
  )

  return { result, mergeRefreshedEvents, mergeRefreshedMessages, onPlansRefreshed }
}

const makeEvent = (): SleepEvent => ({
  id: 'evt-1',
  baby_id: 'baby-1',
  event_type: 'wake',
  event_time: '2024-01-15T07:00:00Z',
  end_time: null,
  context: null,
  notes: null,
  created_at: '2024-01-15T07:00:00Z',
})

const makeMessage = (): ChatMessage => ({
  id: 'msg-1',
  baby_id: 'baby-1',
  message_id: 'msg-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
  created_at: '2024-01-15T07:00:00Z',
})

const makePlan = (): SleepPlanRow => ({
  id: 'plan-1',
  baby_id: 'baby-1',
  current_state: 'daytime_awake',
  next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
  schedule: [],
  target_bedtime: '7:00pm',
  summary: 'Plan',
  events_hash: 'abc',
  plan_date: '2024-01-15',
  is_active: true,
  created_by: null,
  created_at: '2024-01-15T08:00:00Z',
})

describe('useBackgroundRefresh — debounce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    mocks.getRecentSleepEvents.mockResolvedValue({ data: [], error: null })
    mocks.getChatMessages.mockResolvedValue({ data: [], error: null })
    mocks.getRecentSleepPlans.mockResolvedValue({ data: [], error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips second call within debounce window', async () => {
    const { result } = makeHook()

    await act(async () => {
      await result.current()
      await result.current()
    })

    expect(mocks.getRecentSleepEvents).toHaveBeenCalledTimes(1)
  })
})

describe('useBackgroundRefresh — merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls mergeRefreshedEvents with fetched events', async () => {
    const event = makeEvent()
    mocks.getRecentSleepEvents.mockResolvedValue({ data: [event], error: null })
    mocks.getChatMessages.mockResolvedValue({ data: [], error: null })
    mocks.getRecentSleepPlans.mockResolvedValue({ data: [], error: null })

    const { result, mergeRefreshedEvents } = makeHook()

    await act(async () => {
      await result.current()
    })

    expect(mergeRefreshedEvents).toHaveBeenCalledWith([event])
  })

  it('calls mergeRefreshedMessages with formatted messages', async () => {
    const message = makeMessage()
    mocks.getRecentSleepEvents.mockResolvedValue({ data: [], error: null })
    mocks.getChatMessages.mockResolvedValue({ data: [message], error: null })
    mocks.getRecentSleepPlans.mockResolvedValue({ data: [], error: null })

    const { result, mergeRefreshedMessages } = makeHook()

    await act(async () => {
      await result.current()
    })

    expect(mergeRefreshedMessages).toHaveBeenCalled()
    const formatted = mergeRefreshedMessages.mock.calls[0][0]
    expect(formatted[0].role).toBe('user')
  })

  it('calls onPlansRefreshed with fetched plans', async () => {
    const plan = makePlan()
    mocks.getRecentSleepEvents.mockResolvedValue({ data: [], error: null })
    mocks.getChatMessages.mockResolvedValue({ data: [], error: null })
    mocks.getRecentSleepPlans.mockResolvedValue({ data: [plan], error: null })

    const { result, onPlansRefreshed } = makeHook()

    await act(async () => {
      await result.current()
    })

    expect(onPlansRefreshed).toHaveBeenCalledWith([plan])
  })
})
