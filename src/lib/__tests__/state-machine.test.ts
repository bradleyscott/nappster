import { describe, it, expect } from 'vitest'
import {
  computeCurrentState,
  isValidEvent,
  getNextState,
  getQuickEntryButtons,
  shouldShowBedtime,
  getSuggestedQuestions,
  getCountdownContext,
  isPlanStaleForNaps,
  SLEEP_STATES,
  type SleepState,
  type CountdownPlanInput,
} from '../state-machine'
import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'

const makeEvent = (overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string }): SleepEvent => ({
  id: `evt-${overrides.event_time}-${overrides.event_type}`,
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

const makeSchedule = (items: Array<{ type: 'nap' | 'bedtime'; status: ScheduleItem['status'] }>): ScheduleItem[] =>
  items.map((item, i) => ({
    type: item.type,
    label: item.type === 'nap' ? `Nap ${i + 1}` : 'Bedtime',
    timeWindow: '7:00 - 7:30pm',
    status: item.status,
    notes: '',
  }))

describe('computeCurrentState', () => {
  it('returns awaiting_morning_wake for no events', () => {
    expect(computeCurrentState([])).toBe('awaiting_morning_wake')
  })

  it('infers daytime_awake after wake', () => {
    const events = [makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' })]
    expect(computeCurrentState(events)).toBe('daytime_awake')
  })

  it('infers daytime_napping after nap_start', () => {
    const events = [makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' })]
    expect(computeCurrentState(events)).toBe('daytime_napping')
  })

  it('infers daytime_awake after nap_end', () => {
    const events = [makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' })]
    expect(computeCurrentState(events)).toBe('daytime_awake')
  })

  it('infers overnight_sleep after bedtime', () => {
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' })]
    expect(computeCurrentState(events)).toBe('overnight_sleep')
  })

  it('infers overnight_sleep after night_wake', () => {
    const events = [makeEvent({ event_type: 'night_wake', event_time: '2024-01-15T02:00:00Z' })]
    expect(computeCurrentState(events)).toBe('overnight_sleep')
  })

  it('uses the last event when multiple are present', () => {
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
    ]
    expect(computeCurrentState(events)).toBe('daytime_awake')
  })

  it('handles a full day sequence ending at bedtime', () => {
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
      makeEvent({ event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
    ]
    expect(computeCurrentState(events)).toBe('overnight_sleep')
  })
})

describe('isValidEvent', () => {
  it('allows bedtime and wake from awaiting_morning_wake', () => {
    expect(isValidEvent('awaiting_morning_wake', 'bedtime')).toBe(true)
    expect(isValidEvent('awaiting_morning_wake', 'wake')).toBe(true)
    expect(isValidEvent('awaiting_morning_wake', 'nap_start')).toBe(false)
  })

  it('allows wake and night_wake from overnight_sleep', () => {
    expect(isValidEvent('overnight_sleep', 'wake')).toBe(true)
    expect(isValidEvent('overnight_sleep', 'night_wake')).toBe(true)
    expect(isValidEvent('overnight_sleep', 'nap_start')).toBe(false)
  })

  it('allows nap_start and bedtime from daytime_awake', () => {
    expect(isValidEvent('daytime_awake', 'nap_start')).toBe(true)
    expect(isValidEvent('daytime_awake', 'bedtime')).toBe(true)
    expect(isValidEvent('daytime_awake', 'wake')).toBe(false)
  })

  it('allows nap_end from daytime_napping', () => {
    expect(isValidEvent('daytime_napping', 'nap_end')).toBe(true)
    expect(isValidEvent('daytime_napping', 'nap_start')).toBe(false)
  })

  it('returns false for unknown states', () => {
    expect(isValidEvent('unknown' as SleepState, 'wake')).toBe(false)
  })
})

describe('getNextState', () => {
  it('returns null for invalid transitions', () => {
    expect(getNextState('awaiting_morning_wake', 'nap_start')).toBeNull()
  })

  it('transitions correctly for valid events', () => {
    // From the freshly-onboarded state, logging a bedtime jumps straight into
    // overnight_sleep (the Welcome card's primary action).
    expect(getNextState('awaiting_morning_wake', 'bedtime')).toBe('overnight_sleep')
    expect(getNextState('awaiting_morning_wake', 'wake')).toBe('daytime_awake')
    expect(getNextState('daytime_awake', 'nap_start')).toBe('daytime_napping')
    expect(getNextState('daytime_napping', 'nap_end')).toBe('daytime_awake')
    expect(getNextState('daytime_awake', 'bedtime')).toBe('overnight_sleep')
    expect(getNextState('overnight_sleep', 'wake')).toBe('daytime_awake')
  })

  it('keeps state on night_wake', () => {
    expect(getNextState('overnight_sleep', 'night_wake')).toBe('overnight_sleep')
  })
})

describe('getQuickEntryButtons', () => {
  it('returns a bedtime quick action from awaiting_morning_wake (no Good Morning)', () => {
    // The empty-events startup state prompts the user to log the baby's current
    // overnight sleep — there is intentionally no "Morning Wake" steady state.
    const buttons = getQuickEntryButtons('awaiting_morning_wake')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].eventType).toBe('bedtime')
  })

  it('returns nap_start by default from daytime_awake', () => {
    const buttons = getQuickEntryButtons('daytime_awake')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].eventType).toBe('nap_start')
  })

  it('returns bedtime when showBedtimeOverNap is true', () => {
    const buttons = getQuickEntryButtons('daytime_awake', { showBedtimeOverNap: true })
    expect(buttons).toHaveLength(1)
    expect(buttons[0].eventType).toBe('bedtime')
  })

  it('returns end night and night wake from overnight_sleep', () => {
    const buttons = getQuickEntryButtons('overnight_sleep')
    expect(buttons).toHaveLength(2)
    expect(buttons.map(b => b.eventType)).toContain('wake')
    expect(buttons.map(b => b.eventType)).toContain('night_wake')
  })

  it('returns nap_end from daytime_napping', () => {
    const buttons = getQuickEntryButtons('daytime_napping')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].eventType).toBe('nap_end')
  })
})

describe('shouldShowBedtime', () => {
  it('returns false when schedule is undefined', () => {
    expect(shouldShowBedtime(undefined, '7:00 - 7:30pm')).toBe(false)
  })

  it('returns true when no upcoming naps remain', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'completed' },
      { type: 'nap', status: 'completed' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    expect(shouldShowBedtime(schedule, '7:00 - 7:30pm')).toBe(true)
  })

  it('returns false when upcoming naps remain and bedtime is more than 1 hour away', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'upcoming' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    const currentTime = new Date('2024-01-15T12:00:00') // well before 7pm
    expect(shouldShowBedtime(schedule, '7:00 - 7:30pm', currentTime)).toBe(false)
  })

  it('returns true when within 1 hour of target bedtime', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'upcoming' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    const currentTime = new Date('2024-01-15T18:15:00') // 45 min before 7pm
    expect(shouldShowBedtime(schedule, '7:00 - 7:30pm', currentTime)).toBe(true)
  })

  it('returns true during the 30-minute window after bedtime starts', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'upcoming' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    const currentTime = new Date('2024-01-15T19:15:00') // 15 min after 7pm
    expect(shouldShowBedtime(schedule, '7:00 - 7:30pm', currentTime)).toBe(true)
  })

  it('returns false well past the bedtime window', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'upcoming' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    const currentTime = new Date('2024-01-15T21:00:00') // 9pm
    expect(shouldShowBedtime(schedule, '7:00 - 7:30pm', currentTime)).toBe(false)
  })

  it('handles AM/PM parsing for bedtime', () => {
    const schedule = makeSchedule([
      { type: 'nap', status: 'upcoming' },
      { type: 'bedtime', status: 'upcoming' },
    ])
    const currentTime = new Date('2024-01-15T18:45:00') // 6:45pm
    expect(shouldShowBedtime(schedule, '7:00pm', currentTime)).toBe(true)
  })
})

describe('getSuggestedQuestions', () => {
  it('returns state-specific questions', () => {
    expect(getSuggestedQuestions('awaiting_morning_wake', 'Luna')).toEqual([
      'What time should Luna go to bed?',
    ])
    expect(getSuggestedQuestions('daytime_awake', 'Luna')).toEqual([
      "When is Luna's next nap?",
      'When should Luna go to bed?',
    ])
    expect(getSuggestedQuestions('daytime_napping', 'Luna')).toEqual([
      'When should I wake Luna?',
      'How long should this nap be?',
    ])
    expect(getSuggestedQuestions('overnight_sleep', 'Luna')).toEqual([
      'What time should Luna wake up tomorrow?',
    ])
  })
})

describe('SLEEP_STATES', () => {
  it('contains exactly the four documented states', () => {
    expect(SLEEP_STATES).toEqual([
      'awaiting_morning_wake',
      'overnight_sleep',
      'daytime_awake',
      'daytime_napping',
    ])
  })
})

describe('getCountdownContext', () => {
  // A minimal plan shape compatible with CountdownPlanInput.
  const makePlan = (
    overrides: Partial<{
      targetBedtime: string
      schedule: ScheduleItem[]
    }> = {}) => ({
      targetBedtime: overrides.targetBedtime ?? '7:00 - 7:30pm',
      schedule: overrides.schedule ?? [],
  })

  const nap = (status: ScheduleItem['status'], timeWindow = '9:30 - 10:00am'): ScheduleItem => ({
    type: 'nap',
    label: 'Nap 1',
    timeWindow,
    status,
    notes: '',
  })

  it('returns the welcome fallback for the empty-events state', () => {
    const ctx = getCountdownContext('awaiting_morning_wake', [], null, '2023-06-01', new Date('2024-01-15T12:00:00Z'))
    expect(ctx.mode).toBe('welcome')
    expect(ctx.progress).toBe(0)
  })

  it('keeps overnight_sleep across midnight (bedtime logged before midnight)', () => {
    // Bedtime at 22:00 yesterday; we look at the state at 01:00 today (after
    // midnight). The state must still be overnight_sleep and the countdown must
    // read "until wake", NOT flip to a Good-Morning state.
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T22:00:00Z' })]
    const state = computeCurrentState(events)
    expect(state).toBe('overnight_sleep')

    const ctx = getCountdownContext(state, events, null, '2023-06-01', new Date('2024-01-15T01:00:00Z'))
    expect(ctx.mode).toBe('overnight')
    expect(ctx.timeLabel).toBe('until wake')
    expect(ctx.progress).toBeGreaterThan(0)
    expect(ctx.progress).toBeLessThan(1)
    expect(ctx.targetTime).not.toBeNull()
    expect(ctx.startedAt).not.toBeNull()
    // Remaining time should be a positive countdown string.
    expect(ctx.timeRemaining.length).toBeGreaterThan(0)
  })

  it('counts down to the next nap when the schedule still has upcoming naps', () => {
    // Morning wake at 06:45; now 07:00. Plan has one upcoming nap at 9:30–10am.
    const events = [makeEvent({ event_type: 'wake', event_time: '2024-01-15T06:45:00Z' })]
    const state = computeCurrentState(events)
    expect(state).toBe('daytime_awake')

    const plan = makePlan({ schedule: [nap('upcoming', '9:30 - 10:00am')] })
    const ctx = getCountdownContext(state, events, plan, '2023-06-01', new Date('2024-01-15T07:00:00Z'))
    expect(ctx.mode).toBe('nap')
    expect(ctx.timeLabel).toBe('until next nap')
    expect(ctx.expectedText).toBe('Next nap')
    expect(ctx.progress).toBeGreaterThanOrEqual(0)
    expect(ctx.progress).toBeLessThan(1)
    expect(ctx.targetTime).not.toBeNull()
  })

  it('switches to bedtime mode only when all scheduled naps are completed/skipped', () => {
    // Two naps marked completed in the schedule — log matching nap_end events so
    // the plan is NOT flagged stale by `isPlanStaleForNaps` (which requires the
    // count of completed naps on the schedule to match today's actual nap_ends).
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-01-15T06:45:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T12:30:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T13:30:00Z' }),
    ]
    const state = computeCurrentState(events)
    expect(state).toBe('daytime_awake')

    const plan = makePlan({
      schedule: [
        nap('completed', '9:30 - 10:00am'),
        nap('completed', '12:30 - 1:30pm'),
        { type: 'bedtime', label: 'Bedtime', timeWindow: '7:00 - 7:30pm', status: 'upcoming', notes: '' },
      ],
    })
    const ctx = getCountdownContext(state, events, plan, '2023-06-01', new Date('2024-01-15T17:00:00Z'))
    expect(ctx.mode).toBe('bedtime')
    expect(ctx.timeLabel).toBe('until bedtime')
    expect(ctx.expectedText).toBe('Target bedtime')
    expect(ctx.progress).toBeGreaterThanOrEqual(0)
    expect(ctx.progress).toBeLessThanOrEqual(1)
  })

  it('treats daytime_awake as nap-next by default when there is no plan', () => {
    // No plan → after a morning wake we must count down to the next nap, NOT
    // jump straight to bedtime (a baby waking is almost always expecting a nap).
    const events = [makeEvent({ event_type: 'wake', event_time: '2024-01-15T06:45:00Z' })]
    const state = computeCurrentState(events)
    const ctx = getCountdownContext(state, events, null, '2023-06-01', new Date('2024-01-15T07:00:00Z'))
    expect(ctx.mode).toBe('nap')
    expect(ctx.timeLabel).toBe('until next nap')
  })

  it('counts down the current nap toward its expected end', () => {
    // Uses the age-based default nap duration so the target does not depend on
    // the test runner's timezone (nap windows come from the user's tz in prod).
    const events = [makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' })]
    const state = computeCurrentState(events)
    expect(state).toBe('daytime_napping')

    const ctx = getCountdownContext(state, events, null, '2023-06-01', new Date('2024-01-15T09:30:00Z'))
    expect(ctx.mode).toBe('nap_end')
    expect(ctx.timeLabel).toBe('remaining')
    expect(ctx.expectedText).toBe('Expected end')
    // 30m elapsed of a default nap duration → strictly inside (0, 1).
    expect(ctx.progress).toBeGreaterThan(0)
    expect(ctx.progress).toBeLessThan(1)
  })

  it('parses an in-progress nap window target from the plan (label/mode only)', () => {
    // The schedule-derived branch is exercised structurally; the absolute target
    // time depends on the plan's tz framing so we only assert the mode/labels.
    const events = [makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' })]
    const plan = makePlan({ schedule: [nap('in_progress', '9:30 - 10:30am')] })
    const ctx = getCountdownContext('daytime_napping', events, plan, '2023-06-01', new Date('2024-01-15T09:45:00Z'))
    expect(ctx.mode).toBe('nap_end')
    expect(ctx.timeLabel).toBe('remaining')
  })

  it('reports progress = 1 (full ring) exactly when the target is reached', () => {
    // Bedtime at 22:00; default overnight target = +11h = 09:00 next day.
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T22:00:00Z' })]
    const ctx = getCountdownContext('overnight_sleep', events, null, '2023-06-01', new Date('2024-01-15T09:00:00Z'))
    expect(ctx.progress).toBe(1)
    expect(ctx.timeRemaining).toBe('0m')
  })

  it('uses trends-derived wake hour for overnight sleep when plan has no wake item', () => {
    // Bedtime at 22:00; trends say the baby usually wakes at 7:15am.
    const events = [makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T22:00:00Z' })]
    const ctx = getCountdownContext(
      'overnight_sleep',
      events,
      null,
      '2023-06-01',
      new Date('2024-01-15T01:00:00Z'),
      { trendsWakeHour: 7.25 }
    )
    expect(ctx.mode).toBe('overnight')
    expect(ctx.expectedText).toBe('Expected wake')
    expect(ctx.targetTime).not.toBeNull()
    expect(ctx.targetTime!.getHours()).toBe(7)
    expect(ctx.targetTime!.getMinutes()).toBe(15)
  })
})

describe('isPlanStaleForNaps', () => {
  const plan = (schedule: ScheduleItem[], targetBedtime = '7:00 - 7:30pm'): CountdownPlanInput => ({
    schedule,
    targetBedtime,
  })

  it('returns true when the plan is null/absent', () => {
    expect(isPlanStaleForNaps(null, [], undefined, new Date(2026, 5, 28, 10, 30))).toBe(true)
  })

  it('returns true when the schedule claims more completed naps than actually happened today', () => {
    // Stale plan: marks two naps "completed" but no nap_end has been logged.
    const p = plan([
      { type: 'nap', label: 'Nap 1', timeWindow: '8:30 - 9:00am', status: 'completed', notes: '' },
      { type: 'nap', label: 'Nap 2', timeWindow: '5:30 - 6:00pm', status: 'upcoming', notes: '' },
    ])
    const events = [makeEvent({ event_type: 'wake', event_time: '2026-06-28T06:45:00Z' })]
    expect(isPlanStaleForNaps(p, events, undefined, new Date(2026, 5, 28, 10, 30))).toBe(true)
  })

  it('returns true when the next upcoming nap window has already passed today', () => {
    const p = plan([
      { type: 'nap', label: 'Nap 1', timeWindow: '5:30pm', status: 'upcoming', notes: '' },
    ])
    // It is 18:30; the upcoming nap was scheduled for 17:30 — already past.
    expect(isPlanStaleForNaps(p, [], undefined, new Date(2026, 5, 28, 18, 30))).toBe(true)
  })

  it('returns false when the schedule matches reality and the next nap is ahead of now', () => {
    const p = plan([
      { type: 'nap', label: 'Nap 1', timeWindow: '8:30 - 9:00am', status: 'completed', notes: '' },
      { type: 'nap', label: 'Nap 2', timeWindow: '12:30 - 1:30pm', status: 'upcoming', notes: '' },
    ])
    // One nap_end logged (matches the one "completed" nap) and it's 10:30, before the 12:30 nap.
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2026-06-28T06:45:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2026-06-28T08:30:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2026-06-28T09:00:00Z' }),
    ]
    expect(isPlanStaleForNaps(p, events, undefined, new Date(2026, 5, 28, 10, 30))).toBe(false)
  })
})

describe('getCountdownContext awake nap fallback chain', () => {
  // Build plans from local hours to keep tests timezone-independent (dateAtHour
  // anchors to the local calendar of the explicit `now` Date passed below).
  const plan = (schedule: ScheduleItem[], targetBedtime = '7:00 - 7:30pm'): CountdownPlanInput => ({
    schedule,
    targetBedtime,
  })
  // A 7-month-old baby's morning wake at local 06:45.
  const morningWake = makeEvent({ event_type: 'wake', event_time: '2026-06-28T06:45:00Z' })

  it('uses the fresh plan\'s upcoming nap when it is ahead of now', () => {
    const ts = new Date(2026, 5, 28, 10, 30) // local 10:30am
    const now = new Date(ts)
    // No naps completed in schedule and no nap_ends logged ⇒ not stale; upcoming 12:30pm nap is used.
    const p = plan([
      { type: 'nap', label: 'Nap 1', timeWindow: '12:30 - 1:30pm', status: 'upcoming', notes: '' },
    ])
    const ctx = getCountdownContext('daytime_awake', [morningWake], p, '2025-12-01', now, {})
    expect(ctx.mode).toBe('nap')
    expect(ctx.timeLabel).toBe('until next nap')
    expect(ctx.targetTime!.getHours()).toBe(12)
    expect(ctx.targetTime!.getMinutes()).toBe(30)
    expect(ctx.targetTime!.getTime()).toBeGreaterThan(now.getTime())
  })

  it('falls back to the trends nap hour when the plan is stale (claimed naps exceed actual)', () => {
    const ts = new Date(2026, 5, 28, 10, 30) // local 10:30am
    const now = new Date(ts)
    // Stale plan: marks Nap 1 "completed" but no nap_end was logged; lists a late 5:30pm Nap 2 upcoming.
    const p = plan([
      { type: 'nap', label: 'Nap 1', timeWindow: '8:30 - 9:00am', status: 'completed', notes: '' },
      { type: 'nap', label: 'Nap 2', timeWindow: '5:30 - 6:00pm', status: 'upcoming', notes: '' },
    ])
    // Trends say the typical first nap is ~12:49 (12.82).
    const ctx = getCountdownContext('daytime_awake', [morningWake], p, '2025-12-01', now, {
      trendsNextNapHours: [12 + 49 / 60],
    })
    expect(ctx.mode).toBe('nap')
    expect(ctx.expectedText).toBe('Next nap (typical)')
    // The trends nap (~12:49) must be used, NOT the stale 5:30pm nap.
    expect(ctx.targetTime!.getHours()).toBe(12)
    expect(ctx.targetTime!.getMinutes()).toBe(49)
    expect(ctx.targetTime!.getTime()).toBeGreaterThan(now.getTime())
  })

  it('falls back to age-based wake window when the plan is stale and no trends data exists', () => {
    const ts = new Date(2026, 5, 28, 7, 30) // local 7:30am, ~45m after the 6:45 wake
    const now = new Date(ts)
    const p = null
    const ctx = getCountdownContext('daytime_awake', [morningWake], p, '2025-12-01', now, {})
    expect(ctx.mode).toBe('nap')
    // 7-month default wake window = 180m ⇒ target ≈ 6:45am + 3h = 9:45am.
    expect(ctx.targetTime!.getTime()).toBeGreaterThan(now.getTime())
  })

  it('enters bedtime mode when the stale plan has no trends nap remaining ahead but a trends bedtime is ahead of now', () => {
    // Local evening 6:00pm, all trends nap slots have passed, trends bedtime ~7:00pm is ahead.
    const ts = new Date(2026, 5, 28, 18, 0) // local 6:00pm
    const now = new Date(ts)
    const p = null
    const ctx = getCountdownContext('daytime_awake', [morningWake], p, '2025-12-01', now, {
      trendsNextNapHours: [9, 12.5],
      trendsBedtimeHour: 19,
    })
    expect(ctx.mode).toBe('bedtime')
    expect(ctx.timeLabel).toBe('until bedtime')
    expect(ctx.expectedText).toBe('Target bedtime')
    expect(ctx.targetTime!.getHours()).toBe(19)
  })

  it('uses the trends bedtime hour when a fresh plan lacks a targetBedtime string', () => {
    // Fresh plan (no stale trigger), all naps done, but NO targetBedtime — fall back to trends bedtime.
    // NB: built as a plain object (not via the `plan()` helper) so targetBedtime is genuinely
    // undefined, instead of being replaced by the helper's default '7:00 - 7:30pm'.
    const ts = new Date(2026, 5, 28, 18, 0) // local 6:00pm
    const now = new Date(ts)
    // One nap_end logged to match the one "completed" nap ⇒ not stale; allNapsDone true.
    const events = [
      morningWake,
      makeEvent({ event_type: 'nap_start', event_time: '2026-06-28T12:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2026-06-28T13:00:00Z' }),
    ]
    const p: CountdownPlanInput = {
      targetBedtime: undefined,
      schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '12:00 - 1:00pm', status: 'completed', notes: '' }],
    }
    const ctx = getCountdownContext('daytime_awake', events, p, '2025-12-01', now, {
      trendsBedtimeHour: 19.5, // 7:30pm
    })
    expect(ctx.mode).toBe('bedtime')
    expect(ctx.targetTime!.getHours()).toBe(19)
    expect(ctx.targetTime!.getMinutes()).toBe(30)
  })
})
