import { describe, it, expect } from 'vitest'
import { isPlanStaleForNaps } from '../countdown-projection'
import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'

function makeEvent(
  overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string },
): SleepEvent {
  return {
    id: `evt-${Math.random()}`,
    baby_id: 'baby-1',
    end_time: null,
    context: null,
    notes: null,
    created_at: overrides.event_time,
    ...overrides,
  }
}

function makeSchedule(
  items: Array<{
    type: 'nap' | 'bedtime'
    status: ScheduleItem['status']
    timeWindow?: string
    label?: string
  }>,
): ScheduleItem[] {
  return items.map((item, i) => ({
    type: item.type,
    label: item.label ?? (item.type === 'nap' ? `Nap ${i + 1}` : 'Bedtime'),
    timeWindow: item.timeWindow ?? '7:00 - 7:30pm',
    status: item.status,
    notes: '',
  }))
}

/**
 * Regression tests for the "sleep schedule doesn't regenerate after logging a
 * new nap" bug. The plan staleness check must detect that reality has diverged
 * from the plan — not just nap counts, but the actual nap TIMES — so the
 * background generator kicks in and the dashboard stops showing stale
 * (hallucinated) nap times.
 */
describe('isPlanStaleForNaps — nap-time drift detection', () => {
  // Plan written at 7am: Nap 1 completed 9–10am, Nap 2 upcoming 1–2pm.
  const plan = {
    schedule: makeSchedule([
      { type: 'nap', status: 'completed', timeWindow: '9:00 - 10:00am' },
      { type: 'nap', status: 'upcoming', timeWindow: '1:00 - 2:00pm' },
    ]),
    targetBedtime: '7:00 - 7:30pm',
  }

  it('is stale when an off-schedule nap was completed (extra nap the plan never saw)', () => {
    // The parent logged a short nap 11:30am–12:15pm — the plan still claims the
    // next nap is at 1:00pm. The plan must be flagged stale so it regenerates.
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T11:30:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-06-15T12:15:00Z' }),
    ]
    expect(isPlanStaleForNaps(plan, events, 'UTC', new Date('2024-06-15T12:20:00Z'))).toBe(true)
  })

  it('is stale when a nap started well before the planned window', () => {
    // The parent put the baby down at 12:00pm while the plan says the next nap
    // is at 1:00pm. The plan must regenerate to reflect the early start.
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-06-15T10:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T12:00:00Z' }),
    ]
    expect(isPlanStaleForNaps(plan, events, 'UTC', new Date('2024-06-15T12:05:00Z'))).toBe(true)
  })

  it('is stale when the same nap ended much later than the plan claimed', () => {
    // Nap 1 was planned 9–10am but actually ended at 11:00am — a 60-minute drift.
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T09:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-06-15T11:00:00Z' }),
    ]
    expect(isPlanStaleForNaps(plan, events, 'UTC', new Date('2024-06-15T11:05:00Z'))).toBe(true)
  })

  it('is not stale when the nap matched the plan within tolerance', () => {
    // The nap started 10 minutes early and ended 15 minutes early — within the
    // 30-minute tolerance, so no need to burn an OpenAI call.
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T08:50:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-06-15T09:45:00Z' }),
    ]
    expect(isPlanStaleForNaps(plan, events, 'UTC', new Date('2024-06-15T10:00:00Z'))).toBe(false)
  })

  it('is not stale mid-nap when the plan marks the nap in_progress', () => {
    // A freshly generated plan marks the current nap in_progress. Until the nap
    // actually ends, the plan reflects reality and must not trigger regeneration.
    const inProgressPlan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'in_progress', timeWindow: '9:00 - 10:30am' },
        { type: 'nap', status: 'upcoming', timeWindow: '1:00 - 2:00pm' },
      ]),
      targetBedtime: '7:00 - 7:30pm',
    }
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T09:00:00Z' }),
    ]
    expect(isPlanStaleForNaps(inProgressPlan, events, 'UTC', new Date('2024-06-15T10:00:00Z'))).toBe(false)
  })

  it('is stale after the nap ends when the plan still marks it in_progress', () => {
    // The nap ended at 10:45 but the plan still says in_progress (planned end
    // 10:30). Reality and the plan disagree → stale → regenerate.
    const inProgressPlan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'in_progress', timeWindow: '9:00 - 10:30am' },
        { type: 'nap', status: 'upcoming', timeWindow: '1:00 - 2:00pm' },
      ]),
      targetBedtime: '7:00 - 7:30pm',
    }
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-06-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-06-15T09:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-06-15T10:45:00Z' }),
    ]
    expect(isPlanStaleForNaps(inProgressPlan, events, 'UTC', new Date('2024-06-15T10:50:00Z'))).toBe(true)
  })
})
