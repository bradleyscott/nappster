import { describe, it, expect } from 'vitest'
import {
  getCountdownContext,
  isPlanStaleForNaps,
  parseTimeWindowDual,
  defaultWakeWindowMin,
  defaultNapMin,
  defaultOvernightMin,
} from '../countdown-projection'
import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string },
): SleepEvent {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
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

// Fixed reference time: 2024-06-15 10:00 AM UTC
const NOW = new Date('2024-06-15T10:00:00Z')

// ---------------------------------------------------------------------------
// isPlanStaleForNaps
// ---------------------------------------------------------------------------

describe('isPlanStaleForNaps', () => {
  it('returns true when plan is null', () => {
    expect(isPlanStaleForNaps(null, [], 'America/New_York', NOW)).toBe(true)
  })

  it('returns true when plan has no schedule', () => {
    expect(isPlanStaleForNaps({}, [], 'America/New_York', NOW)).toBe(true)
  })

  it('returns false when plan claims fewer or equal completed naps than actual nap_ends', () => {
    const events = [
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:30:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        { type: 'nap', status: 'upcoming', timeWindow: '11:00 - 11:30am' },
      ]),
    }
    const stale = isPlanStaleForNaps(plan, events, 'America/New_York', NOW)
    expect(stale, `plan=${JSON.stringify(plan)} now=${NOW.toISOString()}`).toBe(false)
  })

  it('returns true when plan claims more completed naps than actual nap_ends', () => {
    const events: SleepEvent[] = [] // no nap_ends today
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        { type: 'nap', status: 'upcoming' },
      ]),
    }
    expect(isPlanStaleForNaps(plan, events, 'America/New_York', NOW)).toBe(true)
  })

  it('returns true when upcoming nap window is in the past', () => {
    const events = [
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:30:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        {
          type: 'nap',
          status: 'upcoming',
          timeWindow: '9:00 - 9:30am', // already past at 10:00
          label: 'Nap 2',
        },
      ]),
    }
    expect(isPlanStaleForNaps(plan, events, 'America/New_York', NOW)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getCountdownContext — overnight_sleep
// ---------------------------------------------------------------------------

describe('getCountdownContext — overnight_sleep', () => {
  it('uses default overnight duration when no plan or trends', () => {
    const events = [
      makeEvent({
        event_type: 'bedtime',
        event_time: '2024-06-15T02:00:00Z', // 10pm previous day ET
      }),
    ]
    const ctx = getCountdownContext('overnight_sleep', events, null, undefined, NOW)
    expect(ctx.mode).toBe('overnight')
    expect(ctx.source).toBe('default')
    // 11h default overnight from 02:00 → 13:00
    expect(ctx.targetTime!.getTime()).toBeGreaterThan(NOW.getTime())
    expect(ctx.progress).toBeGreaterThan(0)
    expect(ctx.timeRemaining).not.toBe('--')
    expect(ctx.expectedText).toBe('Expected wake')
    expect(ctx.startedAt).not.toBeNull()
  })

  it('uses plan wake hour when available', () => {
    const events = [
      makeEvent({
        event_type: 'bedtime',
        event_time: '2024-06-15T02:00:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'upcoming', timeWindow: '7:00 - 7:30am', label: 'Wake' },
      ]),
    }
    const ctx = getCountdownContext('overnight_sleep', events, plan, undefined, NOW)
    expect(ctx.mode).toBe('overnight')
    expect(ctx.source).toBe('plan')
    // Wake at 7am → 7.0 decimal, starting from bedtime at 2:00
    expect(ctx.expectedTime).toMatch(/7:00/)
    expect(ctx.startedAt).not.toBeNull()
  })

  it('uses trends wake hour when no plan but trends available', () => {
    const events = [
      makeEvent({
        event_type: 'bedtime',
        event_time: '2024-06-15T02:00:00Z',
      }),
    ]
    const ctx = getCountdownContext('overnight_sleep', events, null, undefined, NOW, {
      trendsWakeHour: 7.5, // 7:30am
    })
    expect(ctx.mode).toBe('overnight')
    expect(ctx.source).toBe('trends')
    expect(ctx.expectedTime).toMatch(/7:30/)
  })
})

// ---------------------------------------------------------------------------
// getCountdownContext — daytime_napping
// ---------------------------------------------------------------------------

describe('getCountdownContext — daytime_napping', () => {
  it('uses default nap duration when no plan', () => {
    const events = [
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T09:00:00Z',
      }),
    ]
    const ctx = getCountdownContext('daytime_napping', events, null, undefined, NOW)
    expect(ctx.mode).toBe('nap_end')
    expect(ctx.source).toBe('default')
    // 90 min default nap from 09:00 → 10:30
    expect(ctx.targetTime!.getTime()).toBeGreaterThan(NOW.getTime())
    expect(ctx.progress).toBeGreaterThan(0)
    expect(ctx.expectedText).toBe('Expected end')
  })

  it('uses plan end time when in-progress nap exists', () => {
    const events = [
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T09:00:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        {
          type: 'nap',
          status: 'in_progress',
          timeWindow: '9:00 - 10:00am',
        },
      ]),
    }
    const ctx = getCountdownContext('daytime_napping', events, plan, undefined, NOW)
    expect(ctx.mode).toBe('nap_end')
    expect(ctx.source).toBe('plan')
    expect(ctx.expectedTime).toMatch(/10:00/)
  })
})

// ---------------------------------------------------------------------------
// getCountdownContext — daytime_awake (nap next)
// ---------------------------------------------------------------------------

describe('getCountdownContext — daytime_awake (nap next)', () => {
  it('uses age-based default when no plan and no trends', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:30:00Z',
      }),
    ]
    const ctx = getCountdownContext('daytime_awake', events, null, undefined, NOW)
    expect(ctx.mode).toBe('nap')
    expect(ctx.source).toBe('default')
    // Last event (nap_end) at 09:30 + default wake window (150 min) = 12:00
    expect(ctx.expectedText).toBe('Next nap')
  })

  it('falls back to trends nap hours when plan is stale', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
    ]
    // Plan claims more completed naps than actual — stale
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        { type: 'nap', status: 'completed' },
        { type: 'nap', status: 'upcoming', timeWindow: '5:00 - 5:30pm' },
      ]),
    }
    const ctx = getCountdownContext('daytime_awake', events, plan, undefined, NOW, {
      trendsNextNapHours: [11.0], // 11:00am — ahead of 10:00 now
    })
    expect(ctx.mode).toBe('nap')
    expect(ctx.source).toBe('trends')
    expect(ctx.expectedText).toBe('Next nap (typical)')
  })

  it('uses fresh plan nap window when not stale', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:30:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        {
          type: 'nap',
          status: 'upcoming',
          timeWindow: '11:00 - 11:30am',
          label: 'Nap 2',
        },
      ]),
    }
    const ctx = getCountdownContext('daytime_awake', events, plan, undefined, NOW, {
      trendsNextNapHours: [14.0], // 2pm — plan at 11am should win
    })
    expect(ctx.mode).toBe('nap')
    expect(ctx.source).toBe('plan')
    expect(ctx.expectedTime).toMatch(/11:00/)
  })
})

// ---------------------------------------------------------------------------
// getCountdownContext — daytime_awake (bedtime next)
// ---------------------------------------------------------------------------

describe('getCountdownContext — daytime_awake (bedtime next)', () => {
  it('shows bedtime when all naps done and plan is fresh', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T11:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T12:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T14:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T15:00:00Z',
      }),
    ]
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed', timeWindow: '9:00 - 10:00am' },
        { type: 'nap', status: 'completed', timeWindow: '11:00am - 12:30pm' },
        { type: 'nap', status: 'completed', timeWindow: '2:00 - 3:30pm' },
      ]),
      targetBedtime: '7:00 - 7:30pm',
    }
    const ctx = getCountdownContext('daytime_awake', events, plan, undefined, NOW)
    expect(ctx.mode).toBe('bedtime')
    expect(ctx.source).toBe('plan')
    expect(ctx.expectedText).toBe('Target bedtime')
  })

  it('falls back to trends bedtime when plan is stale and all trends naps are past', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
    ]
    // Stale plan: claims completed naps that haven't happened
    const plan = {
      schedule: makeSchedule([
        { type: 'nap', status: 'completed' },
        { type: 'nap', status: 'completed' },
      ]),
    }
    const ctx = getCountdownContext('daytime_awake', events, plan, undefined, NOW, {
      trendsNextNapHours: [],
      trendsBedtimeHour: 19.5, // 7:30pm
    })
    expect(ctx.mode).toBe('bedtime')
    expect(ctx.source).toBe('trends')
  })
})

// ---------------------------------------------------------------------------
// getCountdownContext — awaiting_morning_wake
// ---------------------------------------------------------------------------

describe('getCountdownContext — awaiting_morning_wake', () => {
  it('returns EMPTY countdown for zero events', () => {
    const ctx = getCountdownContext('awaiting_morning_wake', [], null, undefined, NOW)
    expect(ctx.mode).toBe('welcome')
    expect(ctx.progress).toBe(0)
    expect(ctx.timeRemaining).toBe('--')
    expect(ctx.expectedText).toBe('Log your first event to begin')
    expect(ctx.targetTime).toBeNull()
    expect(ctx.startedAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseTimeWindowDual
// ---------------------------------------------------------------------------

describe('parseTimeWindowDual', () => {
  it('parses "7:00 - 7:30pm" correctly', () => {
    const result = parseTimeWindowDual('7:00 - 7:30pm')
    expect(result.start).toBeCloseTo(19.0)
    expect(result.end).toBeCloseTo(19.5)
  })

  it('parses "9:30am - 10:00am" correctly', () => {
    const result = parseTimeWindowDual('9:30am - 10:00am')
    expect(result.start).toBeCloseTo(9.5)
    expect(result.end).toBeCloseTo(10.0)
  })

  it('returns null for null input', () => {
    const result = parseTimeWindowDual(null)
    expect(result.start).toBeNull()
    expect(result.end).toBeNull()
  })

  it('infers AM/PM from the right side', () => {
    const result = parseTimeWindowDual('7:00 - 7:30pm')
    expect(result.start).toBeCloseTo(19.0)
    expect(result.end).toBeCloseTo(19.5)
  })
})

// ---------------------------------------------------------------------------
// Age-based defaults
// ---------------------------------------------------------------------------

describe('age-based defaults', () => {
  it('defaultWakeWindowMin returns correct values', () => {
    expect(defaultWakeWindowMin(null)).toBe(150)
    expect(defaultWakeWindowMin(1)).toBe(75)
    expect(defaultWakeWindowMin(3)).toBe(120)
    expect(defaultWakeWindowMin(7)).toBe(180)
    expect(defaultWakeWindowMin(24)).toBe(300)
  })

  it('defaultNapMin returns correct values', () => {
    expect(defaultNapMin(null)).toBe(90)
    expect(defaultNapMin(2)).toBe(120)
    expect(defaultNapMin(4)).toBe(90)
    expect(defaultNapMin(12)).toBe(75)
  })

  it('defaultOvernightMin returns correct values', () => {
    expect(defaultOvernightMin(null)).toBe(660) // 11h
    expect(defaultOvernightMin(3)).toBe(660)
    expect(defaultOvernightMin(8)).toBe(690) // 11h30m
    expect(defaultOvernightMin(18)).toBe(660)
  })
})
