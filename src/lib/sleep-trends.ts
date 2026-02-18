import { startOfDay, subDays, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { SleepEvent } from '@/types/database'

/**
 * Axis origin is midnight (0). The 24-hour axis runs from midnight (0) to midnight (24).
 * Midday (12) is in the centre of the chart.
 */

/** A sleep block positioned on the 24-hour timeline. */
export interface SleepBlock {
  /** Fractional hours from midnight */
  startHour: number
  endHour: number
  type: 'bedtime' | 'wake' | 'nap'
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

/** Expected/typical day computed from averages. */
export interface ExpectedDay {
  label: string
  blocks: SleepBlock[]
}

/**
 * Convert an absolute Date to a fractional hour (0–24).
 */
function toAxisHour(date: Date): number {
  return date.getHours() + date.getMinutes() / 60
}

/**
 * Each chart day is simply the calendar date.
 */
function getChartDayKey(date: Date): string {
  return format(startOfDay(date), 'yyyy-MM-dd')
}

/**
 * Process raw sleep events into chart-ready day rows.
 *
 * With a midnight-to-midnight axis each event is placed on its calendar day:
 *   - bedtime  → block from event time to midnight (24)
 *   - wake     → block from midnight (0) to event time
 *   - nap      → block between paired nap_start / nap_end
 *   - night_wake → marker
 */
export function buildDayRows(
  events: SleepEvent[],
  timezone: string,
  days: number = 14
): DayRow[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )

  // Group events by calendar day
  const dayMap = new Map<string, SleepEvent[]>()

  for (const event of sorted) {
    const zonedDate = toZonedTime(parseISO(event.event_time), timezone)
    const dayKey = getChartDayKey(zonedDate)
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push(event)
  }

  const now = new Date()
  const rowMap = new Map<string, { blocks: SleepBlock[]; nightWakes: NightWakeMarker[]; isDaycareDay: boolean }>()

  for (const [dayKey, dayEvents] of dayMap) {
    const blocks: SleepBlock[] = []
    const nightWakes: NightWakeMarker[] = []
    let isDaycareDay = false
    const usedNapEnds = new Set<string>()

    // Use only the last bedtime per day (handles re-settling)
    const bedtimeEvents = dayEvents.filter(e => e.event_type === 'bedtime')
    const lastBedtime = bedtimeEvents.length > 0 ? bedtimeEvents[bedtimeEvents.length - 1] : null

    // Use only the last wake per day (the morning wake)
    const wakeEvents = dayEvents.filter(e => e.event_type === 'wake')
    const lastWake = wakeEvents.length > 0 ? wakeEvents[wakeEvents.length - 1] : null

    if (lastBedtime) {
      const zonedDate = toZonedTime(parseISO(lastBedtime.event_time), timezone)
      const hour = toAxisHour(zonedDate)
      blocks.push({ startHour: hour, endHour: 24, type: 'bedtime', isDaycare: lastBedtime.context === 'daycare' })
      if (lastBedtime.context === 'daycare') isDaycareDay = true
    }

    if (lastWake) {
      const zonedDate = toZonedTime(parseISO(lastWake.event_time), timezone)
      const hour = toAxisHour(zonedDate)
      blocks.push({ startHour: 0, endHour: hour, type: 'wake', isDaycare: lastWake.context === 'daycare' })
      if (lastWake.context === 'daycare') isDaycareDay = true
    }

    for (const event of dayEvents) {
      if (event.context === 'daycare') isDaycareDay = true

      if (event.event_type === 'nap_start') {
        const zonedStart = toZonedTime(parseISO(event.event_time), timezone)
        const startHour = toAxisHour(zonedStart)

        const napEnd = dayEvents.find(e =>
          e.event_type === 'nap_end' &&
          !usedNapEnds.has(e.id) &&
          new Date(e.event_time).getTime() > new Date(event.event_time).getTime()
        )

        let endHour: number
        if (napEnd) {
          usedNapEnds.add(napEnd.id)
          endHour = toAxisHour(toZonedTime(parseISO(napEnd.event_time), timezone))
        } else {
          // In-progress nap: extend to current time if recent, otherwise short default
          const ageMs = now.getTime() - new Date(event.event_time).getTime()
          endHour = ageMs < 24 * 60 * 60 * 1000
            ? toAxisHour(toZonedTime(now, timezone))
            : startHour + 0.5
        }

        blocks.push({
          startHour,
          endHour: Math.min(endHour, 24),
          type: 'nap',
          isDaycare: event.context === 'daycare',
        })
      } else if (event.event_type === 'night_wake') {
        nightWakes.push({ hour: toAxisHour(toZonedTime(parseISO(event.event_time), timezone)) })
      }
    }

    rowMap.set(dayKey, { blocks, nightWakes, isDaycareDay })
  }

  // Handle in-progress overnight: if the most recent event is a bedtime,
  // show a wake block on today from midnight to current time.
  const lastEvent = sorted[sorted.length - 1]
  if (lastEvent && lastEvent.event_type === 'bedtime') {
    const ageMs = now.getTime() - new Date(lastEvent.event_time).getTime()
    if (ageMs < 24 * 60 * 60 * 1000) {
      const zonedNow = toZonedTime(now, timezone)
      const todayKey = getChartDayKey(zonedNow)
      const currentHour = toAxisHour(zonedNow)

      if (!rowMap.has(todayKey)) {
        rowMap.set(todayKey, { blocks: [], nightWakes: [], isDaycareDay: false })
      }
      const todayData = rowMap.get(todayKey)!
      const hasWake = todayData.blocks.some(b => b.type === 'wake')
      if (!hasWake && currentHour > 0) {
        todayData.blocks.push({
          startHour: 0,
          endHour: currentHour,
          type: 'wake',
          isDaycare: false,
        })
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
    const label = format(dayStart, 'EEE d MMM')

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
 * Uses medians of wake and bedtime timestamps.
 */
export function computeExpectedDays(rows: DayRow[]): {
  home: ExpectedDay | null
  daycare: ExpectedDay | null
} {
  const homeRows = rows.filter(r => !r.isDaycareDay && r.blocks.length > 0)
  const daycareRows = rows.filter(r => r.isDaycareDay && r.blocks.length > 0)

  return {
    home: computeMedianDay(homeRows, 'Home Day'),
    daycare: computeMedianDay(daycareRows, 'Daycare Day'),
  }
}

function computeMedianDay(rows: DayRow[], label: string): ExpectedDay | null {
  if (rows.length < 2) return null

  const bedtimeHours: number[] = []
  const wakeHours: number[] = []
  const napSlots: { starts: number[]; ends: number[] }[] = []

  for (const row of rows) {
    const bedtimes = row.blocks.filter(b => b.type === 'bedtime')
    const wakes = row.blocks.filter(b => b.type === 'wake')
    const naps = row.blocks.filter(b => b.type === 'nap').sort((a, b) => a.startHour - b.startHour)

    // Use the last bedtime's start (the actual sleep onset)
    if (bedtimes.length > 0) {
      bedtimeHours.push(bedtimes[bedtimes.length - 1].startHour)
    }

    // Use the last wake's end (the morning wake time)
    if (wakes.length > 0) {
      wakeHours.push(wakes[wakes.length - 1].endHour)
    }

    naps.forEach((nap, i) => {
      if (!napSlots[i]) napSlots[i] = { starts: [], ends: [] }
      napSlots[i].starts.push(nap.startHour)
      napSlots[i].ends.push(nap.endHour)
    })
  }

  const blocks: SleepBlock[] = []

  if (bedtimeHours.length >= 2) {
    blocks.push({
      startHour: median(bedtimeHours),
      endHour: 24,
      type: 'bedtime',
      isDaycare: false,
    })
  }

  if (wakeHours.length >= 2) {
    blocks.push({
      startHour: 0,
      endHour: median(wakeHours),
      type: 'wake',
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
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}
