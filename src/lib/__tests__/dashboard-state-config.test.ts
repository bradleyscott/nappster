import { describe, it, expect } from 'vitest'
import { getDashboardStateConfig } from '../dashboard-state-config'
import type { SleepEvent, EventType, Baby } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_BABY: Baby = {
  id: 'baby-1',
  name: 'Luna',
  birth_date: '2025-12-01',
  pattern_notes: 'Prefers 3 naps',
  created_at: '2025-12-01T00:00:00Z',
  plan_generation_locked_until: null,
  last_plan_generated_at: null,
}

function makeEvent(
  overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string },
): SleepEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    baby_id: 'baby-1',
    end_time: null,
    context: null,
    notes: null,
    created_at: overrides.event_time,
    ...overrides,
  }
}

const NOW = new Date('2024-06-15T10:00:00Z')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getDashboardStateConfig', () => {
  it('returns welcome state for awaitng_morning_wake with no events', () => {
    const config = getDashboardStateConfig(
      'awaiting_morning_wake',
      MOCK_BABY,
      null,
      [],
      NOW,
    )
    expect(config.accent).toBe('lavender')
    expect(config.icon).toBe('wave')
    expect(config.title).toContain('Welcome')
    expect(config.title).toContain('Luna')
    expect(config.pills).toEqual([])
    expect(config.buttons).toHaveLength(1)
    expect(config.buttons[0].label).toBe('Log Bedtime')
    expect(config.elevated).toBe(false)
  })

  it('returns overnight state with pills and buttons', () => {
    const events = [
      makeEvent({
        event_type: 'bedtime',
        event_time: '2024-06-15T02:00:00Z',
      }),
    ]
    const config = getDashboardStateConfig(
      'overnight_sleep',
      MOCK_BABY,
      null,
      events,
      NOW,
    )
    expect(config.accent).toBe('lavender')
    expect(config.icon).toBe('moon')
    expect(config.title).toBe('Sleeping Soundly')
    expect(config.elevated).toBe(false)
    expect(config.pills).toHaveLength(2)
    expect(config.pills[0]).toHaveProperty('icon', 'moon')
    expect(config.pills[0].label).toMatch(/Bedtime/)
    expect(config.pills[1].label).toMatch(/Sleeping for/)
    expect(config.buttons).toHaveLength(2)
    expect(config.buttons[0].label).toBe('Log Wake Up')
    expect(config.buttons[1].label).toBe('Night Wake')
    expect(config.buttons[1]).toHaveProperty('variant', 'secondary')
  })

  it('returns daytime_awake nap-next state with wake pill', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
    ]
    const config = getDashboardStateConfig(
      'daytime_awake',
      MOCK_BABY,
      null,
      events,
      NOW,
    )
    expect(config.accent).toBe('peach')
    expect(config.icon).toBe('sun')
    expect(config.title).toBe('Awake & Playing')
    expect(config.elevated).toBe(false)
    expect(config.pills[0].label).toMatch(/Woke at/)
    expect(config.buttons).toHaveLength(1)
    expect(config.buttons[0].label).toBe('Log Nap')
  })

  it('returns daytime_awake bedtime-next state when all naps done', () => {
    const events = [
      makeEvent({
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
      }),
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T08:30:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T09:30:00Z',
      }),
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T12:30:00Z',
      }),
      makeEvent({
        event_type: 'nap_end',
        event_time: '2024-06-15T13:30:00Z',
      }),
    ]
    const plan = {
      schedule: [
        { type: 'nap' as const, label: 'Nap 1', timeWindow: '9:00am', status: 'completed' as const, notes: '' },
        { type: 'nap' as const, label: 'Nap 2', timeWindow: '1:00pm', status: 'completed' as const, notes: '' },
      ],
      targetBedtime: '7:00 - 7:30pm',
      summary: '',
    }
    const config = getDashboardStateConfig(
      'daytime_awake',
      MOCK_BABY,
      plan as unknown as SleepPlan,
      events,
      NOW,
      { timezone: 'UTC' },
    )
    expect(config.accent).toBe('sunset')
    expect(config.icon).toBe('sparkle')
    expect(config.title).toBe('Awake & Ready')
    expect(config.elevated).toBe(true)
    expect(config.buttons).toHaveLength(1)
    expect(config.buttons[0].label).toBe('Start Bedtime')
  })

  it('returns daytime_napping state with nap pill', () => {
    const events = [
      makeEvent({
        event_type: 'nap_start',
        event_time: '2024-06-15T09:00:00Z',
      }),
    ]
    const config = getDashboardStateConfig(
      'daytime_napping',
      MOCK_BABY,
      null,
      events,
      NOW,
    )
    expect(config.accent).toBe('mint')
    expect(config.icon).toBe('cloud-sun')
    expect(config.title).toBe('Taking a Nap')
    expect(config.elevated).toBe(false)
    expect(config.pills[0].label).toMatch(/Nap started/)
    expect(config.buttons).toHaveLength(1)
    expect(config.buttons[0].label).toBe('End Nap')
  })

  it('includes night_wake count subtitle when night wakes exist', () => {
    const events = [
      makeEvent({ event_type: 'bedtime', event_time: '2024-06-14T23:00:00Z' }),
      makeEvent({ event_type: 'night_wake', event_time: '2024-06-15T02:00:00Z' }),
    ]
    const config = getDashboardStateConfig(
      'overnight_sleep',
      MOCK_BABY,
      null,
      events,
      NOW,
    )
    const nwButton = config.buttons.find((b) => b.eventType === 'night_wake')
    expect(nwButton).toBeDefined()
    expect(nwButton!.subtitle).toBe('1 already')
  })

  it('returns explanation and source from plan when available', () => {
    const events = [
      makeEvent({
        event_type: 'bedtime',
        event_time: '2024-06-15T02:00:00Z',
      }),
    ]
    const plan = {
      schedule: [
        { type: 'nap' as const, label: 'Wake', timeWindow: '7:00 - 7:30am', status: 'upcoming' as const, notes: '' },
      ],
      targetBedtime: '',
      summary: '',
    }
    const config = getDashboardStateConfig(
      'overnight_sleep',
      MOCK_BABY,
      plan as unknown as SleepPlan,
      events,
      NOW,
    )
    // When plan provides a wake hour, source should be 'plan'
    expect(config.source).toBe('plan')
    expect(config.expectedLabel.text).toBe('Expected wake')
  })
})
