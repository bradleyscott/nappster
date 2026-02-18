import { parseISO, startOfDay, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import type { SleepEvent } from '@/types/database'

// --- Public types ---

export interface TrendStat {
  median: number
  p25: number
  p75: number
  trend: 'stable' | 'increasing' | 'decreasing'
}

export interface NapTrend {
  label: string
  startTime: TrendStat   // fractional hours
  duration: TrendStat     // minutes
}

export interface PatternTrends {
  sampleDays: number
  wakeTime: TrendStat           // fractional hours
  bedtime: TrendStat | null     // fractional hours (null if insufficient data)
  naps: NapTrend[]              // per nap slot
  wakeWindows: TrendStat[]      // minutes: morning→nap1, nap1→nap2, ..., lastNap→bed
  totalDaytimeSleep: TrendStat  // minutes
  nightWakesPerNight: TrendStat
  typicalNapCount: number
}

export interface SleepTrends {
  home: PatternTrends | null
  daycare: PatternTrends | null
}

// --- Internal types ---

interface NapSlot {
  startHour: number
  endHour: number
  durationMinutes: number
}

interface DayStats {
  dateKey: string
  wakeHour: number | null
  bedtimeHour: number | null
  naps: NapSlot[]
  wakeWindowMinutes: number[]
  nightWakeCount: number
  totalNapMinutes: number
  isDaycareDay: boolean
}

// --- Math helpers ---

function toFractionalHour(date: Date): number {
  return date.getHours() + date.getMinutes() / 60
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * p
  const lower = Math.floor(idx)
  const upper = Math.min(lower + 1, sorted.length - 1)
  const frac = idx - lower
  return sorted[lower] + frac * (sorted[upper] - sorted[lower])
}

function mode(values: number[]): number {
  if (values.length === 0) return 0
  const counts = new Map<number, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let maxCount = 0
  let modeValue = values[0]
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      modeValue = value
    }
  }
  return modeValue
}

/**
 * Compute median, p25, p75, and trend direction.
 * @param trendThreshold - absolute difference to consider significant
 *   Use 0.25 for fractional hours (15 min), 15 for raw minutes
 */
function computeTrendStat(
  allValues: number[],
  recentValues: number[],
  trendThreshold: number
): TrendStat {
  const med = median(allValues)
  const p25 = percentile(allValues, 0.25)
  const p75 = percentile(allValues, 0.75)

  let trend: TrendStat['trend'] = 'stable'
  if (recentValues.length >= 3 && allValues.length >= 5) {
    const recentMedian = median(recentValues)
    const diff = recentMedian - med
    if (diff > trendThreshold) trend = 'increasing'
    else if (diff < -trendThreshold) trend = 'decreasing'
  }

  return { median: med, p25, p75, trend }
}

// --- Day extraction ---

const MIN_DAYS = 3
const RECENT_DAYS = 7

function extractDayStats(events: SleepEvent[], timezone: string): DayStats[] {
  // Group events by calendar day
  const dayMap = new Map<string, SleepEvent[]>()
  for (const event of events) {
    const zonedDate = toZonedTime(parseISO(event.event_time), timezone)
    const dayKey = format(startOfDay(zonedDate), 'yyyy-MM-dd')
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push(event)
  }

  // Exclude today (partial day would skew stats)
  const todayKey = format(
    startOfDay(toZonedTime(new Date(), timezone)),
    'yyyy-MM-dd'
  )
  dayMap.delete(todayKey)

  const results: DayStats[] = []

  for (const [dateKey, dayEvents] of dayMap) {
    const sorted = [...dayEvents].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )

    let isDaycareDay = false
    let wakeHour: number | null = null
    let bedtimeHour: number | null = null
    let nightWakeCount = 0
    const naps: NapSlot[] = []
    let lastNapStartHour: number | null = null

    for (const event of sorted) {
      const zonedTime = toZonedTime(parseISO(event.event_time), timezone)
      const hour = toFractionalHour(zonedTime)
      if (event.context === 'daycare') isDaycareDay = true

      switch (event.event_type) {
        case 'wake':
          wakeHour = hour
          break
        case 'bedtime':
          bedtimeHour = hour
          break
        case 'nap_start':
          lastNapStartHour = hour
          break
        case 'nap_end':
          if (lastNapStartHour !== null) {
            const dur = (hour - lastNapStartHour) * 60
            naps.push({
              startHour: lastNapStartHour,
              endHour: hour,
              durationMinutes: Math.max(0, dur),
            })
            lastNapStartHour = null
          }
          break
        case 'night_wake':
          nightWakeCount++
          break
      }
    }

    // Compute wake windows: gaps between each awake-start and next sleep-start
    const wakeWindowMinutes: number[] = []
    // Build ordered awake-start times
    const awakeTimes: number[] = []
    if (wakeHour !== null) awakeTimes.push(wakeHour)
    for (const nap of naps) awakeTimes.push(nap.endHour)

    // Build ordered sleep-start times
    const sleepTimes: number[] = naps.map(n => n.startHour)
    if (bedtimeHour !== null) sleepTimes.push(bedtimeHour)
    sleepTimes.sort((a, b) => a - b)

    // Match each awake-start to the next sleep-start after it
    for (const awakeAt of awakeTimes) {
      const nextSleep = sleepTimes.find(s => s > awakeAt)
      if (nextSleep !== undefined) {
        wakeWindowMinutes.push((nextSleep - awakeAt) * 60)
      }
    }

    const totalNapMinutes = naps.reduce((sum, n) => sum + n.durationMinutes, 0)

    results.push({
      dateKey,
      wakeHour,
      bedtimeHour,
      naps,
      wakeWindowMinutes,
      nightWakeCount,
      totalNapMinutes,
      isDaycareDay,
    })
  }

  results.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return results
}

// --- Pattern computation ---

function computePatternTrends(days: DayStats[]): PatternTrends | null {
  // Need minimum days with wake data
  const daysWithWake = days.filter(d => d.wakeHour !== null)
  if (daysWithWake.length < MIN_DAYS) return null

  const recentDays = days.slice(-RECENT_DAYS)

  // Wake time
  const allWakes = daysWithWake.map(d => d.wakeHour!)
  const recentWakes = recentDays
    .filter(d => d.wakeHour !== null)
    .map(d => d.wakeHour!)
  const wakeTime = computeTrendStat(allWakes, recentWakes, 0.25)

  // Bedtime
  const allBedtimes = days.filter(d => d.bedtimeHour !== null).map(d => d.bedtimeHour!)
  const recentBedtimes = recentDays
    .filter(d => d.bedtimeHour !== null)
    .map(d => d.bedtimeHour!)
  const bedtime =
    allBedtimes.length >= MIN_DAYS
      ? computeTrendStat(allBedtimes, recentBedtimes, 0.25)
      : null

  // Typical nap count (modal)
  const napCounts = days.map(d => d.naps.length)
  const typicalNapCount = mode(napCounts)

  // Per-nap-slot stats (only from days that have this nap slot)
  const napTrends: NapTrend[] = []
  for (let i = 0; i < typicalNapCount; i++) {
    const withSlot = days.filter(d => d.naps[i])
    const recentWithSlot = recentDays.filter(d => d.naps[i])
    if (withSlot.length < MIN_DAYS) continue

    napTrends.push({
      label: `Nap ${i + 1}`,
      startTime: computeTrendStat(
        withSlot.map(d => d.naps[i].startHour),
        recentWithSlot.map(d => d.naps[i].startHour),
        0.25
      ),
      duration: computeTrendStat(
        withSlot.map(d => d.naps[i].durationMinutes),
        recentWithSlot.map(d => d.naps[i].durationMinutes),
        15
      ),
    })
  }

  // Wake windows — only from days with the typical nap count for proper alignment
  const typicalDays = days.filter(d => d.naps.length === typicalNapCount)
  const recentTypicalDays = recentDays.filter(d => d.naps.length === typicalNapCount)
  const wakeWindowTrends: TrendStat[] = []
  const maxWindows = typicalNapCount + 1
  for (let i = 0; i < maxWindows; i++) {
    const all = typicalDays
      .filter(d => d.wakeWindowMinutes[i] !== undefined)
      .map(d => d.wakeWindowMinutes[i])
    const recent = recentTypicalDays
      .filter(d => d.wakeWindowMinutes[i] !== undefined)
      .map(d => d.wakeWindowMinutes[i])
    if (all.length >= MIN_DAYS) {
      wakeWindowTrends.push(computeTrendStat(all, recent, 15))
    }
  }

  // Total daytime sleep & night wakes
  const totalDaytimeSleep = computeTrendStat(
    days.map(d => d.totalNapMinutes),
    recentDays.map(d => d.totalNapMinutes),
    15
  )
  const nightWakesPerNight = computeTrendStat(
    days.map(d => d.nightWakeCount),
    recentDays.map(d => d.nightWakeCount),
    0.5
  )

  return {
    sampleDays: days.length,
    wakeTime,
    bedtime,
    naps: napTrends,
    wakeWindows: wakeWindowTrends,
    totalDaytimeSleep,
    nightWakesPerNight,
    typicalNapCount,
  }
}

// --- Main entry point ---

export function computeSleepTrends(
  events: SleepEvent[],
  timezone: string
): SleepTrends {
  const allDays = extractDayStats(events, timezone)
  const homeDays = allDays.filter(d => !d.isDaycareDay)
  const daycareDays = allDays.filter(d => d.isDaycareDay)

  return {
    home: computePatternTrends(homeDays),
    daycare: computePatternTrends(daycareDays),
  }
}

// --- Formatting for prompt injection ---

function fractionalHourToTime(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const period = h >= 12 ? 'pm' : 'am'
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0
    ? `${displayHour}${period}`
    : `${displayHour}:${m.toString().padStart(2, '0')}${period}`
}

function minutesToDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTimeTrend(stat: TrendStat): string {
  const time = fractionalHourToTime(stat.median)
  const range = `${fractionalHourToTime(stat.p25)}-${fractionalHourToTime(stat.p75)}`
  const trend = stat.trend !== 'stable' ? ` [${stat.trend}]` : ''
  return `${time} (range: ${range})${trend}`
}

function formatDurationTrend(stat: TrendStat): string {
  const dur = minutesToDuration(stat.median)
  const range = `${minutesToDuration(stat.p25)}-${minutesToDuration(stat.p75)}`
  const trend = stat.trend !== 'stable' ? ` [${stat.trend}]` : ''
  return `~${dur} (range: ${range})${trend}`
}

function formatPatternTrends(trends: PatternTrends, label: string): string {
  const lines: string[] = [`### ${label} (${trends.sampleDays} days sampled)`]

  lines.push(`- Morning wake: ${formatTimeTrend(trends.wakeTime)}`)

  for (let i = 0; i < trends.naps.length; i++) {
    const nap = trends.naps[i]
    const ww = trends.wakeWindows[i]
    const wwStr = ww ? `wake window: ${minutesToDuration(ww.median)}` : ''
    lines.push(
      `- ${wwStr ? wwStr + ' → ' : ''}${nap.label}: ${fractionalHourToTime(nap.startTime.median)}, ${formatDurationTrend(nap.duration)}`
    )
  }

  // Last wake window (to bedtime)
  const lastWw = trends.wakeWindows[trends.naps.length]
  if (lastWw && trends.bedtime) {
    lines.push(
      `- wake window: ${minutesToDuration(lastWw.median)} → Bedtime: ${formatTimeTrend(trends.bedtime)}`
    )
  } else if (trends.bedtime) {
    lines.push(`- Bedtime: ${formatTimeTrend(trends.bedtime)}`)
  }

  lines.push(`- Total daytime sleep: ${formatDurationTrend(trends.totalDaytimeSleep)}`)
  lines.push(`- Night wakes: ${Math.round(trends.nightWakesPerNight.median)} per night (range: ${Math.round(trends.nightWakesPerNight.p25)}-${Math.round(trends.nightWakesPerNight.p75)})`)
  lines.push(`- Typical nap count: ${trends.typicalNapCount}`)

  return lines.join('\n')
}

function formatTrendShifts(trends: SleepTrends): string | null {
  const shifts: string[] = []

  for (const [label, pattern] of [
    ['Home', trends.home],
    ['Daycare', trends.daycare],
  ] as const) {
    if (!pattern) continue
    const prefix = trends.home && trends.daycare ? `${label}: ` : ''

    if (pattern.wakeTime.trend !== 'stable') {
      shifts.push(`${prefix}Morning wake ${pattern.wakeTime.trend}`)
    }
    if (pattern.bedtime?.trend !== 'stable') {
      shifts.push(`${prefix}Bedtime ${pattern.bedtime!.trend}`)
    }
    for (const nap of pattern.naps) {
      if (nap.duration.trend !== 'stable') {
        shifts.push(`${prefix}${nap.label} duration ${nap.duration.trend}`)
      }
      if (nap.startTime.trend !== 'stable') {
        shifts.push(`${prefix}${nap.label} start time ${nap.startTime.trend}`)
      }
    }
    for (let i = 0; i < pattern.wakeWindows.length; i++) {
      if (pattern.wakeWindows[i].trend !== 'stable') {
        const wwLabel = i < pattern.naps.length
          ? `Wake window before ${pattern.naps[i].label}`
          : 'Wake window before bedtime'
        shifts.push(`${prefix}${wwLabel} ${pattern.wakeWindows[i].trend}`)
      }
    }
  }

  return shifts.length > 0 ? shifts.join('\n- ') : null
}

/**
 * Format SleepTrends into a human-readable string for prompt injection.
 * Returns null if no trend data is available.
 */
export function formatSleepTrends(trends: SleepTrends): string | null {
  if (!trends.home && !trends.daycare) return null

  const homeDays = trends.home?.sampleDays ?? 0
  const daycareDays = trends.daycare?.sampleDays ?? 0
  const sections: string[] = [
    `## Recent Sleep Trends (${homeDays} home days, ${daycareDays} daycare days)`,
  ]

  if (trends.home) {
    sections.push(formatPatternTrends(trends.home, 'Home Days'))
  }
  if (trends.daycare) {
    sections.push(formatPatternTrends(trends.daycare, 'Daycare Days'))
  }

  const shifts = formatTrendShifts(trends)
  if (shifts) {
    sections.push(`### Trend Shifts (recent 7 days vs overall)\n- ${shifts}`)
  }

  return sections.join('\n\n')
}
