import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildDayRows,
  computeExpectedDays,
} from '../sleep-chart-blocks'
import {
  computeSleepTrends,
  formatSleepTrends,
  median,
  type SleepTrends,
} from '../sleep-stats'
import type { SleepEvent, EventType } from '@/types/database'

const makeEvent = (overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string }): SleepEvent => ({
  id: `evt-${overrides.event_type}-${overrides.event_time}`,
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

describe('sleep-trends', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-25T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('buildDayRows', () => {
    it('returns empty rows when no events', () => {
      const rows = buildDayRows([], 'UTC')
      expect(rows).toHaveLength(15) // 14 days + today
      expect(rows.every(r => r.blocks.length === 0)).toBe(true)
    })

    it('places wake and bedtime on the correct day', () => {
      const events = [
        makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T19:00:00Z' }),
        makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan14 = rows.find(r => r.dateKey === '2024-01-14')!
      const jan15 = rows.find(r => r.dateKey === '2024-01-15')!

      expect(jan14.blocks).toContainEqual(expect.objectContaining({ type: 'bedtime', startHour: 19, endHour: 24 }))
      expect(jan15.blocks).toContainEqual(expect.objectContaining({ type: 'wake', startHour: 0, endHour: 7 }))
    })

    it('pairs nap_start with the next nap_end', () => {
      const events = [
        makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' }),
        makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:30:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan15 = rows.find(r => r.dateKey === '2024-01-15')!
      expect(jan15.blocks).toContainEqual(expect.objectContaining({ type: 'nap', startHour: 9, endHour: 10.5 }))
    })

    it('marks a day as daycare when any event has daycare context', () => {
      const events = [
        makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z', context: 'daycare' }),
        makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:30:00Z', context: 'daycare' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan15 = rows.find(r => r.dateKey === '2024-01-15')!
      expect(jan15.isDaycareDay).toBe(true)
    })

    it('places night wakes as markers', () => {
      const events = [
        makeEvent({ event_type: 'night_wake', event_time: '2024-01-15T03:00:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan15 = rows.find(r => r.dateKey === '2024-01-15')!
      expect(jan15.nightWakes).toHaveLength(1)
      expect(jan15.nightWakes[0].hour).toBe(3)
    })

    it('uses only the last bedtime and wake per day', () => {
      const events = [
        makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T19:00:00Z' }),
        makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T20:00:00Z' }),
        makeEvent({ event_type: 'wake', event_time: '2024-01-15T06:00:00Z' }),
        makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan14 = rows.find(r => r.dateKey === '2024-01-14')!
      const jan15 = rows.find(r => r.dateKey === '2024-01-15')!
      const bedtimes = jan14.blocks.filter(b => b.type === 'bedtime')
      const wakes = jan15.blocks.filter(b => b.type === 'wake')

      expect(bedtimes).toHaveLength(1)
      expect(bedtimes[0].startHour).toBe(20)
      expect(wakes).toHaveLength(1)
      expect(wakes[0].endHour).toBe(7)
    })

    it('handles in-progress naps within the last 24 hours', () => {
      const events = [
        makeEvent({ event_type: 'nap_start', event_time: '2024-01-25T11:00:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const jan25 = rows.find(r => r.dateKey === '2024-01-25')!
      const naps = jan25.blocks.filter(b => b.type === 'nap')
      expect(naps).toHaveLength(1)
      expect(naps[0].startHour).toBe(11)
      expect(naps[0].endHour).toBe(12) // current time
    })
  })

  describe('computeExpectedDays', () => {
    it('returns null when fewer than 2 rows exist', () => {
      const rows = buildDayRows([], 'UTC')
      const expected = computeExpectedDays(rows)
      expect(expected.home).toBeNull()
      expect(expected.daycare).toBeNull()
    })

    it('computes median home day', () => {
      const events = [
        // Day 1
        makeEvent({ event_type: 'bedtime', event_time: '2024-01-13T19:00:00Z' }),
        makeEvent({ event_type: 'wake', event_time: '2024-01-14T07:00:00Z' }),
        makeEvent({ event_type: 'nap_start', event_time: '2024-01-14T09:00:00Z' }),
        makeEvent({ event_type: 'nap_end', event_time: '2024-01-14T10:00:00Z' }),
        // Day 2
        makeEvent({ event_type: 'bedtime', event_time: '2024-01-14T20:00:00Z' }),
        makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:30:00Z' }),
        makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:30:00Z' }),
        makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:30:00Z' }),
      ]
      const rows = buildDayRows(events, 'UTC')
      const expected = computeExpectedDays(rows)

      expect(expected.home).not.toBeNull()
      expect(expected.home!.blocks).toContainEqual(expect.objectContaining({ type: 'bedtime', startHour: 19.5 }))
      expect(expected.home!.blocks).toContainEqual(expect.objectContaining({ type: 'wake', endHour: 7.25 }))
      expect(expected.home!.blocks).toContainEqual(expect.objectContaining({ type: 'nap', startHour: 9.25, endHour: 10.25 }))
    })
  })
})

describe('sleep-trend-stats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-25T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('median', () => {
    it('returns the middle value for odd-length arrays', () => {
      expect(median([1, 2, 3])).toBe(2)
    })

    it('returns the average of middle values for even-length arrays', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5)
    })

    it('returns 0 for empty arrays', () => {
      expect(median([])).toBe(0)
    })
  })

  describe('computeSleepTrends', () => {
    it('returns null patterns with insufficient data', () => {
      const events = [
        makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      ]
      const trends = computeSleepTrends(events, 'UTC')
      expect(trends.home).toBeNull()
      expect(trends.daycare).toBeNull()
    })

    it('separates home and daycare days', () => {
      const events: SleepEvent[] = []
      for (let i = 0; i < 6; i++) {
        const day = 14 + i // 14-19, today (15) excluded leaves 5 days with 3 daycare + 2 home
        events.push(makeEvent({ event_type: 'wake', event_time: `2024-01-${day}T07:00:00Z` }))
        events.push(makeEvent({ event_type: 'nap_start', event_time: `2024-01-${day}T09:00:00Z`, context: i % 2 === 0 ? 'daycare' : 'home' }))
        events.push(makeEvent({ event_type: 'nap_end', event_time: `2024-01-${day}T10:00:00Z`, context: i % 2 === 0 ? 'daycare' : 'home' }))
        events.push(makeEvent({ event_type: 'bedtime', event_time: `2024-01-${day}T19:00:00Z` }))
      }
      const trends = computeSleepTrends(events, 'UTC')
      expect(trends.home).not.toBeNull()
      expect(trends.daycare).not.toBeNull()
      expect(trends.home!.sampleDays).toBeGreaterThan(0)
      expect(trends.daycare!.sampleDays).toBeGreaterThan(0)
    })

    it('computes wake time and bedtime statistics', () => {
      const events: SleepEvent[] = []
      for (let i = 0; i < 5; i++) {
        const day = 10 + i
        events.push(makeEvent({ event_type: 'wake', event_time: `2024-01-${day}T07:00:00Z` }))
        events.push(makeEvent({ event_type: 'bedtime', event_time: `2024-01-${day}T19:00:00Z` }))
      }
      const trends = computeSleepTrends(events, 'UTC')
      expect(trends.home).not.toBeNull()
      expect(trends.home!.wakeTime.median).toBe(7)
      expect(trends.home!.bedtime?.median).toBe(19)
    })

    it('computes nap duration and count trends', () => {
      const events: SleepEvent[] = []
      for (let i = 0; i < 5; i++) {
        const day = 10 + i
        events.push(makeEvent({ event_type: 'wake', event_time: `2024-01-${day}T07:00:00Z` }))
        events.push(makeEvent({ event_type: 'nap_start', event_time: `2024-01-${day}T09:00:00Z` }))
        events.push(makeEvent({ event_type: 'nap_end', event_time: `2024-01-${day}T10:00:00Z` }))
        events.push(makeEvent({ event_type: 'bedtime', event_time: `2024-01-${day}T19:00:00Z` }))
      }
      const trends = computeSleepTrends(events, 'UTC')
      expect(trends.home!.typicalNapCount).toBe(1)
      expect(trends.home!.naps[0].duration.median).toBe(60)
    })
  })

  describe('formatSleepTrends', () => {
    it('returns null when both patterns are null', () => {
      const trends: SleepTrends = { home: null, daycare: null }
      expect(formatSleepTrends(trends)).toBeNull()
    })

    it('formats a home-day pattern', () => {
      const events: SleepEvent[] = []
      for (let i = 0; i < 5; i++) {
        const day = 10 + i
        events.push(makeEvent({ event_type: 'wake', event_time: `2024-01-${day}T07:00:00Z` }))
        events.push(makeEvent({ event_type: 'nap_start', event_time: `2024-01-${day}T09:00:00Z` }))
        events.push(makeEvent({ event_type: 'nap_end', event_time: `2024-01-${day}T10:00:00Z` }))
        events.push(makeEvent({ event_type: 'bedtime', event_time: `2024-01-${day}T19:00:00Z` }))
      }
      const trends = computeSleepTrends(events, 'UTC')
      const formatted = formatSleepTrends(trends)
      expect(formatted).not.toBeNull()
      expect(formatted).toContain('Recent Sleep Trends')
      expect(formatted).toContain('Home Days')
      expect(formatted).toContain('Morning wake')
      expect(formatted).toContain('Bedtime')
    })
  })
})
