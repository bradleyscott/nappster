import { startOfDay, subDays, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { SleepEvent } from '@/types/database'
import { groupEventsIntoSessions } from '@/lib/sleep-utils'

/** A sleep block positioned on a 24-hour timeline (8pm to 8pm). */
export interface SleepBlock {
  /** Fractional hours from the axis origin (8pm = 0, 8am = 12, 8pm next day = 24) */
  startHour: number
  endHour: number
  type: 'overnight' | 'nap'
  /** Whether this block is from a daycare context */
  isDaycare: boolean
}

/** A night wake marker positioned on the timeline. */
export interface NightWakeMarker {
  hour: number
}

/** One row in the chart representing a single day. */
export interface DayRow {
  /** Date label like "Mon 2/10" */
  label: string
  /** Full date string for grouping: "2026-02-10" */
  dateKey: string
  /** Whether any events on this day have daycare context */
  isDaycareDay: boolean
  /** Sleep blocks to render as rectangles */
  blocks: SleepBlock[]
  /** Night wake positions to render as markers */
  nightWakes: NightWakeMarker[]
}

/** Expected/typical day computed from averages. */
export interface ExpectedDay {
  label: string
  blocks: SleepBlock[]
}

/**
 * Convert an absolute Date to a fractional hour offset from 8pm.
 * The 24-hour axis runs from 8pm (0) to 8pm next day (24).
 * So 8pm = 0, 9pm = 1, midnight = 4, 6am = 10, noon = 16, 6pm = 22.
 */
function toAxisHour(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60
  // Shift so 8pm (20:00) = 0
  const shifted = hours - 20
  return shifted < 0 ? shifted + 24 : shifted
}

/**
 * Process raw sleep events into chart-ready day rows.
 *
 * Each "day" runs from 8pm the previous evening to 8pm.
 * This centers overnight sleep in the chart.
 */
export function buildDayRows(
  events: SleepEvent[],
  timezone: string,
  days: number = 30
): DayRow[] {
  const now = new Date()
  const rows: DayRow[] = []

  for (let daysAgo = days; daysAgo >= 0; daysAgo--) {
    const date = subDays(now, daysAgo)
    const zonedDate = toZonedTime(date, timezone)
    const dayStart = startOfDay(zonedDate)

    // The "chart day" for date X shows 8pm on (X-1) through 8pm on X
    const windowStart = new Date(dayStart)
    windowStart.setDate(windowStart.getDate() - 1)
    windowStart.setHours(20, 0, 0, 0)

    const windowEnd = new Date(dayStart)
    windowEnd.setHours(20, 0, 0, 0)

    const dateKey = format(dayStart, 'yyyy-MM-dd')
    const label = format(dayStart, 'EEE M/d')

    // Find events that fall within this window
    const windowEvents = events.filter(e => {
      const eventDate = toZonedTime(parseISO(e.event_time), timezone)
      return eventDate >= windowStart && eventDate < windowEnd
    })

    // Group into sessions to get sleep blocks
    const sorted = [...windowEvents].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
    const items = groupEventsIntoSessions(sorted)

    const blocks: SleepBlock[] = []
    const nightWakes: NightWakeMarker[] = []
    let isDaycareDay = false

    for (const item of items) {
      if (item.kind === 'session') {
        const { session } = item
        const startDate = toZonedTime(parseISO(session.startEvent.event_time), timezone)
        const startHour = toAxisHour(startDate)

        let endHour: number
        if (session.endEvent) {
          const endDate = toZonedTime(parseISO(session.endEvent.event_time), timezone)
          endHour = toAxisHour(endDate)
        } else {
          // In-progress session: extend to current time or a reasonable default
          if (daysAgo === 0) {
            const zonedNow = toZonedTime(now, timezone)
            endHour = toAxisHour(zonedNow)
          } else {
            // Historical in-progress: assume 30 min for naps, skip for overnight
            endHour = startHour + (session.type === 'nap' ? 0.5 : 0)
          }
        }

        // Handle wrap-around (if end is before start, it crossed the axis boundary)
        if (endHour < startHour) {
          endHour += 24
        }

        // Clamp to 0-24 range
        const clampedStart = Math.max(0, Math.min(24, startHour))
        const clampedEnd = Math.max(0, Math.min(24, endHour))

        if (clampedEnd > clampedStart) {
          const isDaycare = session.startEvent.context === 'daycare'
          if (isDaycare) isDaycareDay = true

          blocks.push({
            startHour: clampedStart,
            endHour: clampedEnd,
            type: session.type,
            isDaycare,
          })
        }
      } else if (item.kind === 'standalone' && item.event.event_type === 'night_wake') {
        const nwDate = toZonedTime(parseISO(item.event.event_time), timezone)
        const hour = toAxisHour(nwDate)
        if (hour >= 0 && hour <= 24) {
          nightWakes.push({ hour })
        }
      }
    }

    // Also check event contexts directly for daycare detection
    if (!isDaycareDay) {
      isDaycareDay = windowEvents.some(e => e.context === 'daycare')
    }

    rows.push({ label, dateKey, isDaycareDay, blocks, nightWakes })
  }

  return rows
}

/**
 * Compute the "expected" / typical day from historical data.
 * Returns separate expected days for daycare and non-daycare.
 */
export function computeExpectedDays(rows: DayRow[]): {
  home: ExpectedDay | null
  daycare: ExpectedDay | null
} {
  const homeRows = rows.filter(r => !r.isDaycareDay && r.blocks.length > 0)
  const daycareRows = rows.filter(r => r.isDaycareDay && r.blocks.length > 0)

  return {
    home: computeMedianDay(homeRows, 'Typical Home Day'),
    daycare: computeMedianDay(daycareRows, 'Typical Daycare Day'),
  }
}

function computeMedianDay(rows: DayRow[], label: string): ExpectedDay | null {
  if (rows.length < 2) return null

  // Collect all overnight blocks and nap blocks separately
  const overnightStarts: number[] = []
  const overnightEnds: number[] = []
  const napSlots: { starts: number[]; ends: number[] }[] = []

  for (const row of rows) {
    const overnight = row.blocks.filter(b => b.type === 'overnight')
    const naps = row.blocks.filter(b => b.type === 'nap').sort((a, b) => a.startHour - b.startHour)

    if (overnight.length > 0) {
      overnightStarts.push(overnight[0].startHour)
      overnightEnds.push(overnight[0].endHour)
    }

    // Group naps by slot index (1st nap, 2nd nap, etc.)
    naps.forEach((nap, i) => {
      if (!napSlots[i]) napSlots[i] = { starts: [], ends: [] }
      napSlots[i].starts.push(nap.startHour)
      napSlots[i].ends.push(nap.endHour)
    })
  }

  const blocks: SleepBlock[] = []

  // Median overnight
  if (overnightStarts.length > 0) {
    blocks.push({
      startHour: median(overnightStarts),
      endHour: median(overnightEnds),
      type: 'overnight',
      isDaycare: false,
    })
  }

  // Median naps
  for (const slot of napSlots) {
    if (slot.starts.length >= 2) {
      blocks.push({
        startHour: median(slot.starts),
        endHour: median(slot.ends),
        type: 'nap',
        isDaycare: false,
      })
    }
  }

  if (blocks.length === 0) return null

  return { label, blocks }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}
