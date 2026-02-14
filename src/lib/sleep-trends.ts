import { startOfDay, subDays, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { SleepEvent } from '@/types/database'
import { groupEventsIntoSessions } from '@/lib/sleep-utils'

/**
 * Axis origin is 5pm. The 24-hour axis runs from 5pm (0) to 5pm next day (24).
 * 5pm=0, 8pm=3, 11pm=6, 2am=9, 5am=12, 8am=15, 11am=18, 2pm=21, 5pm=24.
 */
const AXIS_ORIGIN_HOUR = 17 // 5pm

/** A sleep block positioned on the 24-hour timeline. */
export interface SleepBlock {
  /** Fractional hours from the axis origin (6pm) */
  startHour: number
  endHour: number
  type: 'overnight' | 'nap'
  isDaycare: boolean
}

/** A night wake marker positioned on the timeline. */
export interface NightWakeMarker {
  hour: number
}

/** One row in the chart representing a single day. */
export interface DayRow {
  label: string
  dateKey: string
  isDaycareDay: boolean
  blocks: SleepBlock[]
  nightWakes: NightWakeMarker[]
}

/** Expected/typical day computed from medians. */
export interface ExpectedDay {
  label: string
  blocks: SleepBlock[]
}

/**
 * Convert an absolute Date to a fractional hour offset from 6pm.
 */
function toAxisHour(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60
  const shifted = hours - AXIS_ORIGIN_HOUR
  return shifted < 0 ? shifted + 24 : shifted
}

/**
 * Determine which "chart day" a timestamp belongs to.
 * A chart day for date X runs from 6pm on (X-1) to 6pm on X.
 * So anything from 6pm onwards belongs to the NEXT calendar day's row.
 *
 * Returns a dateKey string like "2026-02-10".
 */
function getChartDayKey(date: Date): string {
  const hour = date.getHours()
  if (hour >= AXIS_ORIGIN_HOUR) {
    // After 6pm: belongs to next calendar day's chart row
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    return format(startOfDay(nextDay), 'yyyy-MM-dd')
  }
  return format(startOfDay(date), 'yyyy-MM-dd')
}

/**
 * Process raw sleep events into chart-ready day rows.
 *
 * Strategy: group ALL events into sessions first, then assign each
 * session/event to the appropriate chart day. This correctly handles
 * overnight sessions that span from evening to morning.
 */
export function buildDayRows(
  events: SleepEvent[],
  timezone: string,
  days: number = 14
): DayRow[] {
  // Sort all events chronologically
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )

  // Group into sessions across the entire dataset
  const items = groupEventsIntoSessions(sorted)

  // Build a map of dateKey -> DayRow data
  const rowMap = new Map<string, { blocks: SleepBlock[]; nightWakes: NightWakeMarker[]; isDaycareDay: boolean }>()

  const now = new Date()

  for (const item of items) {
    if (item.kind === 'session') {
      const { session } = item
      const startDate = toZonedTime(parseISO(session.startEvent.event_time), timezone)
      const startAxisHour = toAxisHour(startDate)

      let endAxisHour: number
      if (session.endEvent) {
        const endDate = toZonedTime(parseISO(session.endEvent.event_time), timezone)
        endAxisHour = toAxisHour(endDate)
      } else {
        // In-progress: use current time for today, default duration for historical
        const ageMs = now.getTime() - new Date(session.startEvent.event_time).getTime()
        const isRecent = ageMs < 24 * 60 * 60 * 1000
        if (isRecent) {
          const zonedNow = toZonedTime(now, timezone)
          endAxisHour = toAxisHour(zonedNow)
        } else {
          endAxisHour = startAxisHour + (session.type === 'nap' ? 0.5 : 10)
        }
      }

      // Handle wrap-around
      if (endAxisHour <= startAxisHour) {
        endAxisHour += 24
      }

      // Clamp to 0-24
      const clampedStart = Math.max(0, Math.min(24, startAxisHour))
      const clampedEnd = Math.max(0, Math.min(24, endAxisHour))

      if (clampedEnd <= clampedStart) continue

      // Assign to chart day based on session start
      const dayKey = getChartDayKey(startDate)
      const isDaycare = session.startEvent.context === 'daycare'

      if (!rowMap.has(dayKey)) {
        rowMap.set(dayKey, { blocks: [], nightWakes: [], isDaycareDay: false })
      }
      const row = rowMap.get(dayKey)!
      if (isDaycare) row.isDaycareDay = true

      row.blocks.push({
        startHour: clampedStart,
        endHour: clampedEnd,
        type: session.type,
        isDaycare,
      })
    } else if (item.kind === 'standalone' && item.event.event_type === 'night_wake') {
      const nwDate = toZonedTime(parseISO(item.event.event_time), timezone)
      const hour = toAxisHour(nwDate)
      const dayKey = getChartDayKey(nwDate)

      if (hour >= 0 && hour <= 24) {
        if (!rowMap.has(dayKey)) {
          rowMap.set(dayKey, { blocks: [], nightWakes: [], isDaycareDay: false })
        }
        rowMap.get(dayKey)!.nightWakes.push({ hour })
      }
    }
  }

  // Also scan raw events for daycare context on days that may only have standalone events
  for (const event of sorted) {
    if (event.context === 'daycare') {
      const eventDate = toZonedTime(parseISO(event.event_time), timezone)
      const dayKey = getChartDayKey(eventDate)
      if (rowMap.has(dayKey)) {
        rowMap.get(dayKey)!.isDaycareDay = true
      }
    }
  }

  // Build ordered rows for the requested day range
  const rows: DayRow[] = []
  for (let daysAgo = days; daysAgo >= 0; daysAgo--) {
    const date = subDays(now, daysAgo)
    const zonedDate = toZonedTime(date, timezone)
    const dayStart = startOfDay(zonedDate)
    const dateKey = format(dayStart, 'yyyy-MM-dd')
    const label = format(dayStart, 'MMM d EEE')

    const data = rowMap.get(dateKey)
    rows.push({
      label,
      dateKey,
      isDaycareDay: data?.isDaycareDay ?? false,
      blocks: data?.blocks ?? [],
      nightWakes: data?.nightWakes ?? [],
    })
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

    naps.forEach((nap, i) => {
      if (!napSlots[i]) napSlots[i] = { starts: [], ends: [] }
      napSlots[i].starts.push(nap.startHour)
      napSlots[i].ends.push(nap.endHour)
    })
  }

  const blocks: SleepBlock[] = []

  if (overnightStarts.length > 0) {
    blocks.push({
      startHour: median(overnightStarts),
      endHour: median(overnightEnds),
      type: 'overnight',
      isDaycare: false,
    })
  }

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
