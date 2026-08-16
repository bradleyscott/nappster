import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBackgroundPlanGeneration } from '../use-background-plan-generation'
import type { SleepEvent } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

const mockFetch = vi.fn()

vi.mock('../use-now', () => ({
  useNow: () => new Date('2024-01-15T10:30:00Z'),
}))

describe('useBackgroundPlanGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = mockFetch
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function makeEvent(event_type: string, event_time: string): SleepEvent {
    return {
      id: `e-${event_time}`,
      baby_id: 'baby-1',
      event_type,
      event_time,
      end_time: null,
      context: null,
      notes: null,
      created_at: event_time,
    }
  }

  it('calls /api/sleep-plan/generate when there is no plan and events exist', async () => {
    const events = [makeEvent('wake', '2024-01-15T06:45:00Z')]

    renderHook(() =>
      useBackgroundPlanGeneration({
        babyId: 'baby-1',
        events,
        sleepPlan: null,
        timezone: 'UTC',
      })
    )

    expect(mockFetch).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sleep-plan/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ babyId: 'baby-1', timezone: 'UTC' }),
      })
    )
  })

  it('does not call the API when a fresh plan is present', async () => {
    const events = [makeEvent('wake', '2024-01-15T06:45:00Z')]
    const sleepPlan: SleepPlan = {
      currentState: 'daytime_awake',
      nextAction: { label: 'Bedtime', timeWindow: '7:00 - 7:30pm', isUrgent: false },
      schedule: [
        { type: 'bedtime', label: 'Bedtime', timeWindow: '7:00 - 7:30pm', status: 'upcoming', notes: '' },
      ],
      targetBedtime: '7:00 - 7:30pm',
      summary: 'Fresh plan',
    }

    renderHook(() =>
      useBackgroundPlanGeneration({
        babyId: 'baby-1',
        events,
        sleepPlan,
        timezone: 'UTC',
      })
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call the API while chat is streaming', async () => {
    const events = [makeEvent('wake', '2024-01-15T06:45:00Z')]

    renderHook(() =>
      useBackgroundPlanGeneration({
        babyId: 'baby-1',
        events,
        sleepPlan: null,
        timezone: 'UTC',
        isChatStreaming: true,
      })
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls the API when the plan is stale (completed naps exceed actual nap_ends)', async () => {
    const events = [makeEvent('wake', '2024-01-15T06:45:00Z')]
    const sleepPlan: SleepPlan = {
      currentState: 'daytime_awake',
      nextAction: { label: 'Nap 2', timeWindow: '2:00 - 3:00pm', isUrgent: false },
      schedule: [
        { type: 'nap', label: 'Nap 1', timeWindow: '9:30 - 10:00am', status: 'completed', notes: '' },
        { type: 'nap', label: 'Nap 2', timeWindow: '2:00 - 3:00pm', status: 'upcoming', notes: '' },
        { type: 'bedtime', label: 'Bedtime', timeWindow: '7:00 - 7:30pm', status: 'upcoming', notes: '' },
      ],
      targetBedtime: '7:00 - 7:30pm',
      summary: 'Stale plan',
    }

    renderHook(() =>
      useBackgroundPlanGeneration({
        babyId: 'baby-1',
        events,
        sleepPlan,
        timezone: 'UTC',
      })
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
