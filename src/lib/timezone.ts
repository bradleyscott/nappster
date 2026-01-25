import { startOfDay, endOfDay, subDays } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

/**
 * Get a date 7 days ago for fetching recent history.
 */
export function getWeekAgoDate(): Date {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  return weekAgo
}

/**
 * Get the start and end of "today" in the user's timezone, returned as UTC ISO strings
 * for database queries.
 */
export function getTodayBoundsForTimezone(timezone: string): { start: string; end: string } {
  const now = new Date()
  const zonedNow = toZonedTime(now, timezone)

  const zonedStart = startOfDay(zonedNow)
  const zonedEnd = endOfDay(zonedNow)

  const utcStart = fromZonedTime(zonedStart, timezone)
  const utcEnd = fromZonedTime(zonedEnd, timezone)

  return {
    start: utcStart.toISOString(),
    end: utcEnd.toISOString()
  }
}

/**
 * Get the start and end of "yesterday" in the user's timezone, returned as UTC ISO strings
 * for database queries.
 */
export function getYesterdayBoundsForTimezone(timezone: string): { start: string; end: string } {
  const now = new Date()
  const zonedNow = toZonedTime(now, timezone)
  const zonedYesterday = subDays(zonedNow, 1)

  const zonedStart = startOfDay(zonedYesterday)
  const zonedEnd = endOfDay(zonedYesterday)

  const utcStart = fromZonedTime(zonedStart, timezone)
  const utcEnd = fromZonedTime(zonedEnd, timezone)

  return {
    start: utcStart.toISOString(),
    end: utcEnd.toISOString()
  }
}

/**
 * Format a date/time in a specific timezone for display.
 */
export function formatTimeInTimezone(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).toLowerCase()
}
