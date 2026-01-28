import { differenceInMonths, differenceInMinutes, differenceInHours, parseISO } from 'date-fns'
import { SleepEvent, SleepSession, TimelineItem } from '@/types/database'

// Maximum hours between bedtime and wake to consider them a paired overnight session.
// Prevents pairing a bedtime with a wake that happened much later (e.g., next evening).
const MAX_OVERNIGHT_HOURS = 16

/**
 * Calculate baby's age in months from birthdate
 */
export function calculateAgeInMonths(birthDate: string): number {
  return differenceInMonths(new Date(), parseISO(birthDate))
}

/**
 * Format age as a human-readable string
 */
export function formatAge(birthDate: string): string {
  const months = calculateAgeInMonths(birthDate)
  if (months < 1) {
    return 'newborn'
  } else if (months === 1) {
    return '1 month'
  } else {
    return `${months} months`
  }
}

/**
 * Format time for display (e.g., "8:30am")
 * Uses toLocaleTimeString with optional timezone for server-side rendering
 */
export function formatTime(date: Date | string | undefined | null, timezone?: string): string {
  if (!date) return '--:--'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timezone && { timeZone: timezone })
  }).toLowerCase()
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}m`
}

/**
 * Calculate duration between two times in minutes
 */
export function calculateDurationMinutes(start: string, end: string): number {
  return differenceInMinutes(parseISO(end), parseISO(start))
}

/**
 * Count completed naps from events
 */
export function countNaps(events: SleepEvent[]): number {
  return events.filter(e => e.event_type === 'nap_end').length
}

/**
 * Group sleep events into sessions (naps, overnight) and standalone events.
 *
 * Pairing rules:
 * - nap_start pairs with the next nap_end
 * - bedtime pairs with the next wake event (within 16 hours)
 * - wake and night_wake remain standalone unless part of an overnight session
 */
export function groupEventsIntoSessions(events: SleepEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const consumed = new Set<string>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]

    if (consumed.has(event.id)) {
      continue
    }

    if (event.event_type === 'nap_start') {
      // Look ahead for matching nap_end
      let endEvent: SleepEvent | null = null
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].event_type === 'nap_end' && !consumed.has(events[j].id)) {
          endEvent = events[j]
          consumed.add(events[j].id)
          break
        }
        // Stop if we hit another nap_start (unpaired)
        if (events[j].event_type === 'nap_start') {
          break
        }
      }

      const session: SleepSession = {
        type: 'nap',
        startEvent: event,
        endEvent,
        durationMinutes: endEvent
          ? calculateDurationMinutes(event.event_time, endEvent.event_time)
          : null
      }
      items.push({ kind: 'session', session })
      consumed.add(event.id)

    } else if (event.event_type === 'bedtime') {
      // Look ahead for matching wake (within 16 hours)
      let endEvent: SleepEvent | null = null
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].event_type === 'wake' && !consumed.has(events[j].id)) {
          const hoursDiff = differenceInHours(
            parseISO(events[j].event_time),
            parseISO(event.event_time)
          )
          if (hoursDiff <= MAX_OVERNIGHT_HOURS) {
            endEvent = events[j]
            consumed.add(events[j].id)
          }
          break
        }
      }

      const session: SleepSession = {
        type: 'overnight',
        startEvent: event,
        endEvent,
        durationMinutes: endEvent
          ? calculateDurationMinutes(event.event_time, endEvent.event_time)
          : null
      }
      items.push({ kind: 'session', session })
      consumed.add(event.id)

    } else {
      // Standalone event (wake not paired with bedtime, night_wake, or orphaned nap_end)
      items.push({ kind: 'standalone', event })
    }
  }

  return items
}

/**
 * Given a single event, find the session it belongs to.
 * Returns null if the event is standalone.
 */
export function findSessionForEvent(event: SleepEvent, events: SleepEvent[]): SleepSession | null {
  const items = groupEventsIntoSessions(events)

  for (const item of items) {
    if (item.kind === 'session') {
      if (item.session.startEvent.id === event.id ||
          item.session.endEvent?.id === event.id) {
        return item.session
      }
    }
  }

  return null
}

/**
 * Compute a deterministic hash of sleep events for cache invalidation.
 * Only includes fields that affect the sleep plan: id, event_time, event_type.
 * Works in both browser and server environments.
 */
export function computeEventsHash(events: Array<{ id: string; event_time: string; event_type: string }>): string {
  // Create a normalized string of event data, sorted by id for consistency
  const normalized = events
    .map(e => `${e.id}:${e.event_time}:${e.event_type}`)
    .sort()
    .join('|')

  // Simple djb2 hash algorithm - fast and works in browser
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }

  // Convert to hex string, ensuring positive value
  return (hash >>> 0).toString(16).padStart(8, '0')
}
