import { describe, it, expect } from 'vitest'
import {
  computeCurrentState,
  isValidEvent,
  getNextState,
  getQuickEntryButtons,
  shouldShowBedtime,
  getSuggestedQuestions,
  SLEEP_STATES,
  type SleepState,
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
  it('allows wake from awaiting_morning_wake', () => {
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
  it('returns only morning wake from awaiting_morning_wake', () => {
    const buttons = getQuickEntryButtons('awaiting_morning_wake')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].eventType).toBe('wake')
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
      'What time should Luna wake up?',
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
