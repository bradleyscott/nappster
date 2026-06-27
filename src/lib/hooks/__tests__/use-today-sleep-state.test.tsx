import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodaySleepState } from '../use-today-sleep-state'
import type { SleepEvent } from '@/types/database'

const makeEvent = (overrides: Partial<SleepEvent> & { event_type: string; event_time: string }): SleepEvent => ({
  id: `evt-${overrides.event_type}-${overrides.event_time}`,
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

describe('useTodaySleepState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns awaiting_morning_wake when no events', () => {
    const { result } = renderHook(() => useTodaySleepState([]))
    expect(result.current).toBe('awaiting_morning_wake')
  })

  it('returns daytime_awake after wake', () => {
    const events = [makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' })]
    const { result } = renderHook(() => useTodaySleepState(events))
    expect(result.current).toBe('daytime_awake')
  })

  it('keeps overnight_sleep across midnight (bedtime logged previous evening)', () => {
    // Bedtime logged at 7pm yesterday; current time is noon today. The overnight
    // stretch has not been ended by a `wake` event, so state MUST stay
    // overnight_sleep — not fall back to awaiting_morning_wake.
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T19:00:00Z' })]
    const { result } = renderHook(() => useTodaySleepState(events))
    expect(result.current).toBe('overnight_sleep')
  })

  it('keeps overnight_sleep across a midnight timezone boundary', () => {
    // Noon UTC = 7am EST. Bedtime at 4:00 UTC = 11pm EST the previous calendar day.
    // Per the spec the overnight state continues until morning wake regardless of date.
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-15T04:00:00Z' })]
    const { result } = renderHook(() => useTodaySleepState(events))
    expect(result.current).toBe('overnight_sleep')
  })

  it('ends overnight when a morning wake is logged', () => {
    const events = [
      makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T19:00:00Z' }),
      makeEvent({ event_type: 'wake', event_time: '2024-01-15T06:30:00Z' }),
    ]
    const { result } = renderHook(() => useTodaySleepState(events))
    expect(result.current).toBe('daytime_awake')
  })
})
