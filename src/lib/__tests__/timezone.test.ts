import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getTodayBoundsForTimezone,
  getYesterdayBoundsForTimezone,
  getStartOfDaysAgoForTimezone,
  getWeekAgoDate,
} from '../timezone'

describe('getTodayBoundsForTimezone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns correct bounds for UTC', () => {
    // Set to Jan 15, 2024 2:30pm UTC
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const { start, end } = getTodayBoundsForTimezone('UTC')

    expect(start).toBe('2024-01-15T00:00:00.000Z')
    expect(end).toBe('2024-01-15T23:59:59.999Z')
  })

  it('returns correct bounds for America/New_York (EST)', () => {
    // Set to Jan 15, 2024 2:30pm EST (7:30pm UTC)
    vi.setSystemTime(new Date('2024-01-15T19:30:00Z'))

    const { start, end } = getTodayBoundsForTimezone('America/New_York')

    // Start should be midnight EST = 5am UTC (EST is UTC-5 in winter)
    expect(start).toBe('2024-01-15T05:00:00.000Z')
    // End should be 11:59:59.999pm EST = 4:59:59.999am UTC next day
    expect(end).toBe('2024-01-16T04:59:59.999Z')
  })

  it('returns correct bounds for America/Los_Angeles (PST)', () => {
    // Set to Jan 15, 2024 2:30pm PST (10:30pm UTC)
    vi.setSystemTime(new Date('2024-01-15T22:30:00Z'))

    const { start, end } = getTodayBoundsForTimezone('America/Los_Angeles')

    // Start should be midnight PST = 8am UTC (PST is UTC-8)
    expect(start).toBe('2024-01-15T08:00:00.000Z')
    // End should be 11:59:59.999pm PST = 7:59:59.999am UTC next day
    expect(end).toBe('2024-01-16T07:59:59.999Z')
  })

  it('handles timezone after midnight UTC but before midnight local', () => {
    // Set to Jan 16, 2024 2am UTC = Jan 15, 2024 9pm EST
    vi.setSystemTime(new Date('2024-01-16T02:00:00Z'))

    const { start, end } = getTodayBoundsForTimezone('America/New_York')

    // "Today" in EST is still Jan 15
    expect(start).toBe('2024-01-15T05:00:00.000Z')
    expect(end).toBe('2024-01-16T04:59:59.999Z')
  })

  it('handles Australia/Sydney (positive UTC offset)', () => {
    // Set to Jan 15, 2024 3pm AEDT which is Jan 15, 4am UTC
    vi.setSystemTime(new Date('2024-01-15T04:00:00Z'))

    const { start, end } = getTodayBoundsForTimezone('Australia/Sydney')

    // Jan 15 in Sydney (AEDT is UTC+11)
    // Midnight Jan 15 AEDT = 1pm Jan 14 UTC
    expect(start).toBe('2024-01-14T13:00:00.000Z')
    // 11:59:59.999pm Jan 15 AEDT = 12:59:59.999pm Jan 15 UTC
    expect(end).toBe('2024-01-15T12:59:59.999Z')
  })

  it('handles Europe/London (GMT in winter)', () => {
    // Set to Jan 15, 2024 2pm GMT
    vi.setSystemTime(new Date('2024-01-15T14:00:00Z'))

    const { start, end } = getTodayBoundsForTimezone('Europe/London')

    // GMT = UTC in winter
    expect(start).toBe('2024-01-15T00:00:00.000Z')
    expect(end).toBe('2024-01-15T23:59:59.999Z')
  })

  it('handles DST transition (spring forward) for US', () => {
    // March 10, 2024 is DST start for US - clocks spring forward at 2am
    // Set to March 10, 2024 3pm EDT (7pm UTC, after DST kicked in)
    vi.setSystemTime(new Date('2024-03-10T19:00:00Z'))

    const { start, end } = getTodayBoundsForTimezone('America/New_York')

    // Midnight March 10 is still EST (UTC-5) before DST kicks in at 2am
    // So midnight March 10 EST = 5am UTC
    expect(start).toBe('2024-03-10T05:00:00.000Z')
    // But end of day is in EDT (UTC-4) after DST kicked in
    // 11:59:59pm March 10 EDT = 3:59:59am March 11 UTC
    expect(end).toBe('2024-03-11T03:59:59.999Z')
  })

  it('returns ISO strings parseable as dates', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    const { start, end } = getTodayBoundsForTimezone('UTC')

    expect(() => new Date(start)).not.toThrow()
    expect(() => new Date(end)).not.toThrow()
    expect(new Date(start).toISOString()).toBe(start)
    expect(new Date(end).toISOString()).toBe(end)
  })

  it('end is always after start', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const timezones = [
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Australia/Sydney',
      'Asia/Tokyo',
    ]

    for (const tz of timezones) {
      const { start, end } = getTodayBoundsForTimezone(tz)
      expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime())
    }
  })
})

describe('getYesterdayBoundsForTimezone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns previous day bounds for UTC', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const { start, end } = getYesterdayBoundsForTimezone('UTC')

    expect(start).toBe('2024-01-14T00:00:00.000Z')
    expect(end).toBe('2024-01-14T23:59:59.999Z')
  })

  it('returns previous day bounds for America/New_York', () => {
    // Jan 15, 2024 2:30pm EST (7:30pm UTC)
    vi.setSystemTime(new Date('2024-01-15T19:30:00Z'))

    const { start, end } = getYesterdayBoundsForTimezone('America/New_York')

    // Yesterday (Jan 14) midnight EST = 5am UTC
    expect(start).toBe('2024-01-14T05:00:00.000Z')
    // Yesterday end = 4:59:59.999am UTC Jan 15
    expect(end).toBe('2024-01-15T04:59:59.999Z')
  })

  it('handles cross-year boundary', () => {
    // Jan 1, 2024 10am UTC
    vi.setSystemTime(new Date('2024-01-01T10:00:00Z'))

    const { start, end } = getYesterdayBoundsForTimezone('UTC')

    expect(start).toBe('2023-12-31T00:00:00.000Z')
    expect(end).toBe('2023-12-31T23:59:59.999Z')
  })

  it('yesterday end equals today start minus 1ms', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const yesterday = getYesterdayBoundsForTimezone('America/New_York')
    const today = getTodayBoundsForTimezone('America/New_York')

    // Yesterday's end should be 1ms before today's start
    const yesterdayEndMs = new Date(yesterday.end).getTime()
    const todayStartMs = new Date(today.start).getTime()

    expect(todayStartMs - yesterdayEndMs).toBe(1)
  })
})

describe('getStartOfDaysAgoForTimezone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns start of N days ago', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const threeDaysAgo = getStartOfDaysAgoForTimezone('UTC', 3)

    expect(threeDaysAgo).toBe('2024-01-12T00:00:00.000Z')
  })

  it('returns start of 7 days ago with timezone', () => {
    // Jan 15, 2024 2pm EST (7pm UTC)
    vi.setSystemTime(new Date('2024-01-15T19:00:00Z'))

    const sevenDaysAgo = getStartOfDaysAgoForTimezone('America/New_York', 7)

    // Jan 8, 2024 midnight EST = 5am UTC
    expect(sevenDaysAgo).toBe('2024-01-08T05:00:00.000Z')
  })

  it('returns today start for 0 days ago', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const zeroDaysAgo = getStartOfDaysAgoForTimezone('UTC', 0)
    const todayBounds = getTodayBoundsForTimezone('UTC')

    expect(zeroDaysAgo).toBe(todayBounds.start)
  })

  it('handles month boundary', () => {
    // March 3, 2024
    vi.setSystemTime(new Date('2024-03-03T14:30:00Z'))

    const fiveDaysAgo = getStartOfDaysAgoForTimezone('UTC', 5)

    expect(fiveDaysAgo).toBe('2024-02-27T00:00:00.000Z')
  })
})

describe('getWeekAgoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns date 7 days in the past', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const weekAgo = getWeekAgoDate()

    expect(weekAgo.toISOString()).toBe('2024-01-08T14:30:00.000Z')
  })

  it('handles month boundary', () => {
    vi.setSystemTime(new Date('2024-03-03T10:00:00Z'))

    const weekAgo = getWeekAgoDate()

    expect(weekAgo.toISOString()).toBe('2024-02-25T10:00:00.000Z')
  })

  it('handles year boundary', () => {
    vi.setSystemTime(new Date('2024-01-03T10:00:00Z'))

    const weekAgo = getWeekAgoDate()

    expect(weekAgo.toISOString()).toBe('2023-12-27T10:00:00.000Z')
  })

  it('returns a Date object', () => {
    vi.setSystemTime(new Date('2024-01-15T14:30:00Z'))

    const weekAgo = getWeekAgoDate()

    expect(weekAgo).toBeInstanceOf(Date)
  })
})
