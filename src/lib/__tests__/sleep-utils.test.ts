import { describe, it, expect } from 'vitest'
import {
  groupEventsIntoSessions,
  findSessionForEvent,
  computeEventsHash,
  calculateDurationMinutes,
  formatDuration,
  formatTime,
  formatAge,
  calculateAgeInMonths,
  countNaps,
} from '../sleep-utils'
import { SleepEvent } from '@/types/database'

// Helper to create test events with sensible defaults
const makeEvent = (overrides: Partial<SleepEvent> & { id: string; event_type: string; event_time: string }): SleepEvent => ({
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

describe('groupEventsIntoSessions', () => {
  describe('nap pairing', () => {
    it('pairs nap_start with next nap_end', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('session')
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('nap')
        expect(result[0].session.startEvent.id).toBe('1')
        expect(result[0].session.endEvent?.id).toBe('2')
        expect(result[0].session.durationMinutes).toBe(30)
      }
    })

    it('handles unpaired nap_start (in-progress nap)', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('session')
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('nap')
        expect(result[0].session.endEvent).toBeNull()
        expect(result[0].session.durationMinutes).toBeNull()
      }
    })

    it('handles orphaned nap_end as standalone', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('standalone')
      if (result[0].kind === 'standalone') {
        expect(result[0].event.id).toBe('1')
      }
    })

    it('pairs multiple naps correctly', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
        makeEvent({ id: '3', event_type: 'nap_start', event_time: '2024-01-15T13:00:00Z' }),
        makeEvent({ id: '4', event_type: 'nap_end', event_time: '2024-01-15T14:30:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(2)
      expect(result[0].kind).toBe('session')
      expect(result[1].kind).toBe('session')

      if (result[0].kind === 'session' && result[1].kind === 'session') {
        expect(result[0].session.durationMinutes).toBe(30)
        expect(result[1].session.durationMinutes).toBe(90)
      }
    })

    it('stops at next nap_start when looking for nap_end', () => {
      // Two consecutive nap_starts without an end between them
      const events = [
        makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ id: '2', event_type: 'nap_start', event_time: '2024-01-15T10:00:00Z' }),
        makeEvent({ id: '3', event_type: 'nap_end', event_time: '2024-01-15T10:30:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(2)
      // First nap should be unpaired
      if (result[0].kind === 'session') {
        expect(result[0].session.startEvent.id).toBe('1')
        expect(result[0].session.endEvent).toBeNull()
      }
      // Second nap should be paired
      if (result[1].kind === 'session') {
        expect(result[1].session.startEvent.id).toBe('2')
        expect(result[1].session.endEvent?.id).toBe('3')
      }
    })

    it('skips already consumed nap_end events', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
        makeEvent({ id: '3', event_type: 'nap_start', event_time: '2024-01-15T13:00:00Z' }),
        // No nap_end for second nap - should not pair with first nap_end
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(2)
      if (result[0].kind === 'session') {
        expect(result[0].session.endEvent?.id).toBe('2')
      }
      if (result[1].kind === 'session') {
        expect(result[1].session.endEvent).toBeNull()
      }
    })
  })

  describe('overnight pairing', () => {
    it('pairs bedtime with wake within 16 hours', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
        makeEvent({ id: '2', event_type: 'wake', event_time: '2024-01-16T07:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('session')
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('overnight')
        expect(result[0].session.startEvent.id).toBe('1')
        expect(result[0].session.endEvent?.id).toBe('2')
        expect(result[0].session.durationMinutes).toBe(12 * 60) // 12 hours
      }
    })

    it('does NOT pair bedtime with wake after 16 hours', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
        makeEvent({ id: '2', event_type: 'wake', event_time: '2024-01-16T12:00:00Z' }), // 17 hours later
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(2)
      // Bedtime unpaired
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('overnight')
        expect(result[0].session.endEvent).toBeNull()
      }
      // Wake is standalone
      expect(result[1].kind).toBe('standalone')
    })

    it('handles bedtime exactly at 16 hour boundary', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
        makeEvent({ id: '2', event_type: 'wake', event_time: '2024-01-16T11:00:00Z' }), // exactly 16 hours
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      if (result[0].kind === 'session') {
        expect(result[0].session.endEvent?.id).toBe('2')
      }
    })

    it('handles bedtime yesterday, wake today with night_wake in between', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'bedtime', event_time: '2024-01-14T19:30:00Z' }),
        makeEvent({ id: '2', event_type: 'night_wake', event_time: '2024-01-15T02:00:00Z' }),
        makeEvent({ id: '3', event_type: 'wake', event_time: '2024-01-15T06:45:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(2)
      // Bedtime + wake = overnight session
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('overnight')
        expect(result[0].session.startEvent.id).toBe('1')
        expect(result[0].session.endEvent?.id).toBe('3')
      }
      // night_wake is standalone
      expect(result[1].kind).toBe('standalone')
      if (result[1].kind === 'standalone') {
        expect(result[1].event.id).toBe('2')
      }
    })

    it('handles unpaired bedtime (baby still sleeping)', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'bedtime', event_time: '2024-01-15T19:30:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      if (result[0].kind === 'session') {
        expect(result[0].session.type).toBe('overnight')
        expect(result[0].session.endEvent).toBeNull()
        expect(result[0].session.durationMinutes).toBeNull()
      }
    })
  })

  describe('standalone events', () => {
    it('treats night_wake as standalone', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'night_wake', event_time: '2024-01-15T03:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('standalone')
      if (result[0].kind === 'standalone') {
        expect(result[0].event.event_type).toBe('night_wake')
      }
    })

    it('treats wake without preceding bedtime as standalone', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('standalone')
    })
  })

  describe('mixed events', () => {
    it('handles a full day with wake, nap, and bedtime', () => {
      const events = [
        makeEvent({ id: '1', event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
        makeEvent({ id: '2', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ id: '3', event_type: 'nap_end', event_time: '2024-01-15T10:30:00Z' }),
        makeEvent({ id: '4', event_type: 'nap_start', event_time: '2024-01-15T13:00:00Z' }),
        makeEvent({ id: '5', event_type: 'nap_end', event_time: '2024-01-15T14:30:00Z' }),
        makeEvent({ id: '6', event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
      ]

      const result = groupEventsIntoSessions(events)

      expect(result).toHaveLength(4)
      // wake standalone
      expect(result[0].kind).toBe('standalone')
      // nap 1
      expect(result[1].kind).toBe('session')
      if (result[1].kind === 'session') {
        expect(result[1].session.type).toBe('nap')
        expect(result[1].session.durationMinutes).toBe(60)
      }
      // nap 2
      expect(result[2].kind).toBe('session')
      if (result[2].kind === 'session') {
        expect(result[2].session.type).toBe('nap')
        expect(result[2].session.durationMinutes).toBe(90)
      }
      // bedtime (unpaired as no wake yet)
      expect(result[3].kind).toBe('session')
      if (result[3].kind === 'session') {
        expect(result[3].session.type).toBe('overnight')
        expect(result[3].session.endEvent).toBeNull()
      }
    })

    it('handles empty events array', () => {
      const result = groupEventsIntoSessions([])
      expect(result).toHaveLength(0)
    })
  })
})

describe('findSessionForEvent', () => {
  it('finds session for nap_start event', () => {
    const events = [
      makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
      makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
    ]
    const napStart = events[0]

    const session = findSessionForEvent(napStart, events)

    expect(session).not.toBeNull()
    expect(session?.startEvent.id).toBe('1')
    expect(session?.endEvent?.id).toBe('2')
  })

  it('finds session for nap_end event', () => {
    const events = [
      makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
      makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
    ]
    const napEnd = events[1]

    const session = findSessionForEvent(napEnd, events)

    expect(session).not.toBeNull()
    expect(session?.startEvent.id).toBe('1')
  })

  it('returns null for standalone event', () => {
    const events = [
      makeEvent({ id: '1', event_type: 'night_wake', event_time: '2024-01-15T03:00:00Z' }),
    ]

    const session = findSessionForEvent(events[0], events)

    expect(session).toBeNull()
  })
})

describe('computeEventsHash', () => {
  it('produces consistent hash for same events', () => {
    const events = [
      { id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' },
      { id: '2', event_time: '2024-01-15T09:30:00Z', event_type: 'nap_start' },
    ]

    const hash1 = computeEventsHash(events)
    const hash2 = computeEventsHash(events)

    expect(hash1).toBe(hash2)
  })

  it('produces same hash regardless of event order', () => {
    const eventsA = [
      { id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' },
      { id: '2', event_time: '2024-01-15T09:30:00Z', event_type: 'nap_start' },
    ]
    const eventsB = [
      { id: '2', event_time: '2024-01-15T09:30:00Z', event_type: 'nap_start' },
      { id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' },
    ]

    expect(computeEventsHash(eventsA)).toBe(computeEventsHash(eventsB))
  })

  it('produces different hash when event_time changes', () => {
    const events1 = [{ id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]
    const events2 = [{ id: '1', event_time: '2024-01-15T07:01:00Z', event_type: 'wake' }]

    expect(computeEventsHash(events1)).not.toBe(computeEventsHash(events2))
  })

  it('produces different hash when event_type changes', () => {
    const events1 = [{ id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]
    const events2 = [{ id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'nap_start' }]

    expect(computeEventsHash(events1)).not.toBe(computeEventsHash(events2))
  })

  it('produces different hash when event is added', () => {
    const events1 = [{ id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]
    const events2 = [
      { id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' },
      { id: '2', event_time: '2024-01-15T09:30:00Z', event_type: 'nap_start' },
    ]

    expect(computeEventsHash(events1)).not.toBe(computeEventsHash(events2))
  })

  it('produces different hash when event id changes', () => {
    const events1 = [{ id: 'abc', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]
    const events2 = [{ id: 'xyz', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]

    expect(computeEventsHash(events1)).not.toBe(computeEventsHash(events2))
  })

  it('handles empty array', () => {
    const hash = computeEventsHash([])
    expect(hash).toBeDefined()
    expect(typeof hash).toBe('string')
    expect(hash.length).toBe(8)
  })

  it('returns 8-character hex string', () => {
    const events = [{ id: '1', event_time: '2024-01-15T07:00:00Z', event_type: 'wake' }]
    const hash = computeEventsHash(events)

    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('calculateDurationMinutes', () => {
  it('calculates duration between two times', () => {
    const duration = calculateDurationMinutes(
      '2024-01-15T09:30:00Z',
      '2024-01-15T10:00:00Z'
    )
    expect(duration).toBe(30)
  })

  it('calculates duration across midnight', () => {
    const duration = calculateDurationMinutes(
      '2024-01-15T23:00:00Z',
      '2024-01-16T01:30:00Z'
    )
    expect(duration).toBe(150) // 2.5 hours
  })

  it('returns 0 for same time', () => {
    const duration = calculateDurationMinutes(
      '2024-01-15T09:30:00Z',
      '2024-01-15T09:30:00Z'
    )
    expect(duration).toBe(0)
  })

  it('returns negative for reversed times', () => {
    const duration = calculateDurationMinutes(
      '2024-01-15T10:00:00Z',
      '2024-01-15T09:30:00Z'
    )
    expect(duration).toBe(-30)
  })
})

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(30)).toBe('30m')
    expect(formatDuration(45)).toBe('45m')
  })

  it('formats exact hours', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(150)).toBe('2h 30m')
  })

  it('handles zero minutes', () => {
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatTime', () => {
  it('formats Date object', () => {
    const date = new Date('2024-01-15T14:30:00Z')
    const formatted = formatTime(date, 'UTC')
    expect(formatted).toBe('2:30 pm')
  })

  it('formats ISO string', () => {
    const formatted = formatTime('2024-01-15T08:00:00Z', 'UTC')
    expect(formatted).toBe('8:00 am')
  })

  it('handles null/undefined', () => {
    expect(formatTime(null)).toBe('--:--')
    expect(formatTime(undefined)).toBe('--:--')
  })

  it('respects timezone parameter', () => {
    // 14:30 UTC = 9:30am EST
    const formatted = formatTime('2024-01-15T14:30:00Z', 'America/New_York')
    expect(formatted).toBe('9:30 am')
  })
})

describe('formatAge', () => {
  it('formats newborn (under 1 month)', () => {
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 15) // 15 days ago
    expect(formatAge(recentDate.toISOString().split('T')[0])).toBe('newborn')
  })

  it('formats 1 month singular', () => {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 5) // Ensure full month
    expect(formatAge(oneMonthAgo.toISOString().split('T')[0])).toBe('1 month')
  })

  it('formats multiple months plural', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    expect(formatAge(sixMonthsAgo.toISOString().split('T')[0])).toBe('6 months')
  })
})

describe('calculateAgeInMonths', () => {
  it('calculates age in months', () => {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    expect(calculateAgeInMonths(threeMonthsAgo.toISOString().split('T')[0])).toBe(3)
  })

  it('returns 0 for current date', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(calculateAgeInMonths(today)).toBe(0)
  })
})

describe('countNaps', () => {
  it('counts nap_end events', () => {
    const events = [
      makeEvent({ id: '1', event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
      makeEvent({ id: '2', event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
      makeEvent({ id: '3', event_type: 'nap_start', event_time: '2024-01-15T13:00:00Z' }),
      makeEvent({ id: '4', event_type: 'nap_end', event_time: '2024-01-15T14:00:00Z' }),
    ]

    expect(countNaps(events)).toBe(2)
  })

  it('returns 0 for no naps', () => {
    const events = [
      makeEvent({ id: '1', event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      makeEvent({ id: '2', event_type: 'bedtime', event_time: '2024-01-15T19:00:00Z' }),
    ]

    expect(countNaps(events)).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(countNaps([])).toBe(0)
  })
})
