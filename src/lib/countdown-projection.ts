/**
 * Countdown projection for the dashboard hero ring.
 *
 * Computes a LIVE target countdown (progress 0..1, time remaining, expected
 * label) for the current sleep state, using, in priority order:
 *   1. The active AI sleep plan's schedule (authoritative when fresh)
 *   2. Trends-derived "typical day" projection
 *   3. Age-based defaults
 *
 * Extracted from the original state-machine.ts to separate concerns.
 */

import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'
import { calculateAgeInMonths } from '@/lib/sleep-utils'
import { getTodayBoundsForTimezone } from '@/lib/timezone'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structural subset of a SleepPlan that this helper consumes. */
export interface CountdownPlanInput {
  schedule?: ScheduleItem[] | undefined
  targetBedtime?: string | undefined
  summary?: string | undefined
}

/** Options for live countdown projection (passed from the dashboard). */
export interface CountdownOptions {
  /** IANA timezone, used to scope "today" for plan-staleness checks. */
  timezone?: string
  /** Trends-derived typical-day nap start hours (24h decimal), ascending. */
  trendsNextNapHours?: number[]
  /** Trends-derived typical-day bedtime start hour (24h decimal), or null. */
  trendsBedtimeHour?: number | null
  /** Trends-derived typical morning wake hour (24h decimal), or null. */
  trendsWakeHour?: number | null
}

export type CountdownMode =
  | 'overnight'
  | 'nap'
  | 'bedtime'
  | 'nap_end'
  | 'welcome'

export interface CountdownContext {
  /** 0..1 elapsed fraction toward the target. Clamped. */
  progress: number
  /** Human countdown string, e.g. "2h 15m" or "6h 02m". */
  timeRemaining: string
  /** Small label under the countdown, e.g. "until wake". */
  timeLabel: string
  /** Expected-label block under the ring. */
  expectedIcon: string
  expectedText: string
  expectedTime: string
  /** What the awake state is counting down to — drives the button variant. */
  mode: CountdownMode
  /** Absolute target instant (for debugging/tests). */
  targetTime: Date | null
  /** Instant the current segment started. */
  startedAt: Date | null
  /** AI-generated explanation for this target, when available. */
  explanation: string | null
  /** Source of the target (and any explanation). */
  source: 'plan' | 'trends' | 'default'
}

const EMPTY: CountdownContext = {
  progress: 0,
  timeRemaining: '--',
  timeLabel: 'start',
  expectedIcon: '✨',
  expectedText: 'Log your first event to begin',
  expectedTime: '',
  mode: 'welcome',
  targetTime: null,
  startedAt: null,
  explanation: null,
  source: 'default',
}

// ---------------------------------------------------------------------------
// Age-based default tables
// ---------------------------------------------------------------------------

function ageMonths(birthDate: string | undefined): number | null {
  if (!birthDate) return null
  try {
    const m = calculateAgeInMonths(birthDate)
    return Number.isFinite(m) ? m : null
  } catch {
    return null
  }
}

export function defaultWakeWindowMin(age: number | null): number {
  if (age == null) return 150
  if (age < 2) return 75
  if (age < 4) return 120
  if (age < 6) return 150
  if (age < 9) return 180
  if (age < 12) return 195
  if (age < 18) return 240
  return 300
}

export function defaultNapMin(age: number | null): number {
  if (age == null) return 90
  if (age < 3) return 120
  if (age < 6) return 90
  return 75
}

export function defaultOvernightMin(age: number | null): number {
  if (age == null) return 11 * 60
  if (age < 4) return 11 * 60
  if (age < 12) return 11 * 60 + 30
  return 11 * 60
}

// ---------------------------------------------------------------------------
// Time-window parsing
// ---------------------------------------------------------------------------

/**
 * Parse a time-window string such as "7:00 - 7:30pm" or "9:30am - 10:00am"
 * into start/end decimal hours (24h, e.g. 19.0 / 19.5, or 9.5 / 10.0).
 *
 * Handles meridiem inheritance: when only one side carries am/pm (e.g.
 * "7:00 - 7:30pm") the rightmost meridiem applies to both sides. Falls back to
 * a heuristic when no meridiem is present (nap morning hours default to AM,
 * evening hours default to PM).
 */
export function parseTimeWindowDual(
  window: string | undefined | null
): { start: number | null; end: number | null } {
  if (!window) return { start: null, end: null }
  const sides = window
    .split(/\s+[\u2010-\u2015-]\s+|\s+to\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sides.length === 0) return { start: null, end: null }

  const rightMer = sides[sides.length - 1]
    .match(/(am|pm)/i)?.[1].toLowerCase() as 'am' | 'pm' | undefined

  const parseSide = (
    s: string,
    inherit?: 'am' | 'pm' | null
  ): number | null => {
    const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
    if (!m) return null
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    let mer = (m[3] ? m[3].toLowerCase() : inherit) as
      | 'am'
      | 'pm'
      | null
      | undefined
    if (!mer) {
      // No meridiem anywhere — apply a sensible default for sleep scheduling:
      //   6am–11am window → AM (morning naps), 12 → noon (PM), 1pm–11pm → PM (afternoon naps / bedtime).
      if (h === 12) mer = 'pm'
      else if (h >= 6 && h <= 11) mer = 'am'
      else mer = 'pm'
    }
    if (mer === 'pm' && h !== 12) h += 12
    if (mer === 'am' && h === 12) h = 0
    return h + min / 60
  }

  const start = parseSide(sides[0], rightMer ?? null)
  const end = sides.length > 1 ? parseSide(sides[1], rightMer ?? null) : null
  return { start, end }
}

/** Build a Date on `base`'s calendar day at the given 24h decimal hour. */
export function dateAtHour(decimalHour: number, base: Date): Date {
  const d = new Date(base)
  const h = Math.floor(decimalHour)
  const m = Math.round((decimalHour - h) * 60)
  d.setHours(h, m, 0, 0)
  return d
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h 00m`
  return `${m}m`
}

function formatTime12h(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// ---------------------------------------------------------------------------
// Plan helpers
// ---------------------------------------------------------------------------

/** Find the last event of a given type from a chronologically-sorted event list. */
function lastEvent(
  events: SleepEvent[],
  type: EventType
): SleepEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event_type === type) return events[i]
  }
  return undefined
}

/** The expected wake time (decimal 24h hour) per the plan, or null. */
function wakeHourFromPlan(plan: CountdownPlanInput | null): number | null {
  if (!plan?.schedule) return null
  const wake = plan.schedule.find(
    (i) => i.type === 'nap' && /wake/i.test(i.label) && i.status !== 'completed' && i.status !== 'skipped'
  )
  if (wake) return parseTimeWindowDual(wake.timeWindow).start
  return null
}

/** First upcoming / in-progress nap on the schedule, or null. */
function nextUpcomingNap(
  plan: CountdownPlanInput | null
): ScheduleItem | undefined {
  if (!plan?.schedule) return undefined
  return plan.schedule.find(
    (i) =>
      i.type === 'nap' &&
      (i.status === 'upcoming' || i.status === 'in_progress')
  )
}

/** The in-progress nap item (currently being slept), or null. */
function inProgressNap(
  plan: CountdownPlanInput | null
): ScheduleItem | undefined {
  if (!plan?.schedule) return undefined
  return plan.schedule.find(
    (i) => i.type === 'nap' && i.status === 'in_progress'
  )
}

/**
 * Find the schedule item that best explains the current countdown target.
 * This is used to surface the AI's "why" commentary for the dashboard hero.
 */
function findTargetScheduleItem(
  plan: CountdownPlanInput | null,
  mode: CountdownMode
): ScheduleItem | undefined {
  if (!plan?.schedule) return undefined
  switch (mode) {
    case 'overnight':
      return plan.schedule.find(
        (i) =>
          i.type === 'nap' &&
          /wake/i.test(i.label) &&
          i.status !== 'completed' &&
          i.status !== 'skipped'
      )
    case 'nap_end':
      return plan.schedule.find((i) => i.type === 'nap' && i.status === 'in_progress')
    case 'nap':
      return plan.schedule.find(
        (i) =>
          i.type === 'nap' &&
          (i.status === 'upcoming' || i.status === 'in_progress')
      )
    case 'bedtime':
      return plan.schedule.find(
        (i) =>
          i.type === 'bedtime' &&
          (i.status === 'upcoming' || i.status === 'in_progress')
      )
    default:
      return undefined
  }
}

/**
 * Build the user-facing explanation string for a countdown target.
 * Only returns non-null text when the source is the AI plan (fresh plan data).
 */
function buildExplanation(
  plan: CountdownPlanInput | null,
  mode: CountdownMode,
  source: 'plan' | 'trends' | 'default'
): string | null {
  if (source !== 'plan') return null
  const item = findTargetScheduleItem(plan, mode)
  const text = item?.notes || plan?.summary
  return text?.trim() || null
}

/** True if every nap on the schedule is completed or skipped (so bedtime is next). */
function allNapsDone(plan: CountdownPlanInput | null): boolean {
  if (!plan?.schedule) return false
  const naps = plan.schedule.filter((i) => i.type === 'nap')
  if (naps.length === 0) return false
  return naps.every((i) => i.status === 'completed' || i.status === 'skipped')
}

/**
 * Count actual `nap_end` events that occurred today (in the given timezone).
 * Used to detect a stale plan whose schedule claims more completed naps than
 * actually happened today. When `timezone` is omitted, falls back to all events.
 */
function countNapEndsToday(
  events: SleepEvent[],
  timezone: string | undefined,
  now: Date = new Date()
): number {
  let scoped = events
  if (timezone) {
    try {
      const { start, end } = getTodayBoundsForTimezone(timezone, now)
      scoped = events.filter((e) => e.event_time >= start && e.event_time < end)
    } catch {
      // getTodayBoundsForTimezone validates the tz; if it somehow fails, keep all events.
    }
  }
  return scoped.filter((e) => e.event_type === 'nap_end').length
}

// ---------------------------------------------------------------------------
// Exported helpers (plan staleness and trends projections)
// ---------------------------------------------------------------------------

/**
 * Detect whether a sleep plan is stale for the purposes of projecting today's
 * next nap. A plan is stale when EITHER:
 *   1. Its schedule claims more `completed`/`in_progress` naps than the number of
 *      `nap_end` events actually logged today (the schedule was written for an
 *      earlier state and never regenerated), OR
 *   2. Its first `upcoming` nap's projected target time is already in the past
 *      (the window for that nap has come and gone).
 *
 * Returns `true` for an absent plan so callers treat "no plan" as "fall back to
 * trends" rather than trusting nothing.
 */
export function isPlanStaleForNaps(
  plan: CountdownPlanInput | null,
  events: SleepEvent[],
  timezone: string | undefined,
  now: Date
): boolean {
  if (!plan?.schedule) return true

  const claimedDone = plan.schedule.filter(
    (i) => i.type === 'nap' && (i.status === 'completed' || i.status === 'in_progress')
  ).length
  const actualDone = countNapEndsToday(events, timezone, now)
  if (claimedDone > actualDone) return true

  const nextNap = nextUpcomingNap(plan)
  if (nextNap) {
    const napHour = parseTimeWindowDual(nextNap.timeWindow).start
    if (napHour != null) {
      const target = dateAtHour(napHour, now)
      if (target.getTime() <= now.getTime()) return true
    }
  }
  return false
}

/**
 * Pick the first trends-derived nap slot (24h decimal hour) that projects to a
 * time strictly ahead of `now`; returns the projected Date or null.
 */
function firstTrendsNapAhead(
  trendsNextNapHours: number[] | undefined,
  now: Date
): Date | null {
  if (!trendsNextNapHours || trendsNextNapHours.length === 0) return null
  for (const hour of trendsNextNapHours) {
    const target = dateAtHour(hour, now)
    if (target.getTime() > now.getTime()) return target
  }
  return null
}

/**
 * Project the trends-derived bedtime hour (24h decimal) onto the current day,
 * rolling forward 24h if it has already passed. Returns null when no trends
 * bedtime hour is available.
 */
function trendsBedtimeTarget(
  opts: CountdownOptions,
  now: Date
): Date | null {
  if (opts.trendsBedtimeHour == null) return null
  const target = dateAtHour(opts.trendsBedtimeHour, now)
  return target.getTime() > now.getTime() ? target : new Date(target.getTime() + 24 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Main projection function
// ---------------------------------------------------------------------------

/**
 * Compute the live countdown context for the dashboard hero ring.
 */
export function getCountdownContext(
  state: import('./state-machine').SleepState,
  events: SleepEvent[],
  plan: CountdownPlanInput | null,
  birthDate: string | undefined,
  now: Date = new Date(),
  opts: CountdownOptions = {}
): CountdownContext {
  const age = ageMonths(birthDate)
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )
  const planStale = isPlanStaleForNaps(plan, sorted, opts.timezone, now)

  switch (state) {
    case 'overnight_sleep': {
      const bedtime = lastEvent(sorted, 'bedtime')
      if (!bedtime) {
        return { ...EMPTY, mode: 'overnight', expectedIcon: '☀️', expectedText: 'Expected wake', expectedTime: '—', timeLabel: 'until wake' }
      }
      const startedAt = new Date(bedtime.event_time)
      let target: Date
      const expectedText = 'Expected wake'
      const planWakeHour = wakeHourFromPlan(plan)
      const trendsWakeHour = opts.trendsWakeHour
      const wakeHour = planWakeHour ?? trendsWakeHour
      if (wakeHour != null) {
        target = dateAtHour(wakeHour, startedAt)
        if (target.getTime() <= startedAt.getTime()) {
          target = new Date(target.getTime() + 24 * 60 * 60 * 1000)
        }
      } else {
        const totalMin = defaultOvernightMin(age)
        target = new Date(startedAt.getTime() + totalMin * 60000)
      }
      const expectedTime = formatTime12h(target)
      const totalMs = target.getTime() - startedAt.getTime()
      const elapsed = now.getTime() - startedAt.getTime()
      const remaining = target.getTime() - now.getTime()
      const progress = totalMs > 0 ? Math.min(1, Math.max(0, elapsed / totalMs)) : 0
      const source: CountdownContext['source'] = planWakeHour != null ? 'plan' : trendsWakeHour != null ? 'trends' : 'default'
      return {
        progress,
        timeRemaining: formatCountdown(remaining),
        timeLabel: 'until wake',
        expectedIcon: '☀️',
        expectedText,
        expectedTime,
        mode: 'overnight',
        targetTime: target,
        startedAt,
        explanation: buildExplanation(plan, 'overnight', source),
        source,
      }
    }

    case 'daytime_napping': {
      const napStart = lastEvent(sorted, 'nap_start')
      if (!napStart) return EMPTY
      const startedAt = new Date(napStart.event_time)
      let target: Date
      let expectedTime: string
      const inProgress = inProgressNap(plan)
      const endHour = inProgress ? parseTimeWindowDual(inProgress.timeWindow).end : null
      if (endHour != null) {
        target = dateAtHour(endHour, now)
        expectedTime = formatTime12h(target)
      } else {
        const totalMin = defaultNapMin(age)
        target = new Date(startedAt.getTime() + totalMin * 60000)
        expectedTime = formatTime12h(target)
      }
      const totalMs = target.getTime() - startedAt.getTime()
      const elapsed = now.getTime() - startedAt.getTime()
      const remaining = target.getTime() - now.getTime()
      const progress = totalMs > 0 ? Math.min(1, Math.max(0, elapsed / totalMs)) : 0
      const source: CountdownContext['source'] = inProgress ? 'plan' : 'default'
      return {
        progress,
        timeRemaining: formatCountdown(remaining),
        timeLabel: 'remaining',
        expectedIcon: '🌤️',
        expectedText: 'Expected end',
        expectedTime,
        mode: 'nap_end',
        targetTime: target,
        startedAt,
        explanation: buildExplanation(plan, 'nap_end', source),
        source,
      }
    }

    case 'daytime_awake': {
      const napEnd = lastEvent(sorted, 'nap_end')
      const wake = lastEvent(sorted, 'wake')
      const starter = napEnd ?? wake
      if (!starter) return EMPTY
      const startedAt = new Date(starter.event_time)
      const ageDefaultWindowMin = defaultWakeWindowMin(age)

      const trendsBedtime = trendsBedtimeTarget(opts, now)
      const bedtimeNext = !planStale
        ? allNapsDone(plan)
        : !firstTrendsNapAhead(opts.trendsNextNapHours, now) && !!trendsBedtime

      if (bedtimeNext) {
        let target: Date
        const bedtimeHour = !planStale && plan?.targetBedtime
          ? parseTimeWindowDual(plan.targetBedtime).start
          : null
        if (bedtimeHour != null) target = dateAtHour(bedtimeHour, now)
        else if (trendsBedtime) target = trendsBedtime
        else target = dateAtHour(19, now)
        const expectedTime = formatTime12h(target)
        const totalMs = target.getTime() - startedAt.getTime()
        const remaining = target.getTime() - now.getTime()
        const elapsed = now.getTime() - startedAt.getTime()
        const denom = totalMs > 0 ? totalMs : ageDefaultWindowMin * 60000
        const progress = Math.min(1, Math.max(0, elapsed / denom))
        const source: CountdownContext['source'] = bedtimeHour != null ? 'plan' : trendsBedtime ? 'trends' : 'default'
        return {
          progress,
          timeRemaining: formatCountdown(remaining),
          timeLabel: 'until bedtime',
          expectedIcon: '🌙',
          expectedText: 'Target bedtime',
          expectedTime,
          mode: 'bedtime',
          targetTime: target,
          startedAt,
          explanation: buildExplanation(plan, 'bedtime', source),
          source,
        }
      }

      let target: Date
      let expectedTime: string
      let expectedText = 'Next nap'
      const nextNap = !planStale ? nextUpcomingNap(plan) : undefined
      const planNapHour = nextNap ? parseTimeWindowDual(nextNap.timeWindow).start : null
      const planNapTarget = planNapHour != null ? dateAtHour(planNapHour, now) : null
      const trendsNapTarget = firstTrendsNapAhead(opts.trendsNextNapHours, now)

      if (planNapTarget && planNapTarget.getTime() > now.getTime()) {
        target = planNapTarget
        expectedTime = formatTime12h(target)
      } else if (trendsNapTarget) {
        target = trendsNapTarget
        expectedTime = formatTime12h(target)
        expectedText = 'Next nap (typical)'
      } else {
        target = new Date(startedAt.getTime() + ageDefaultWindowMin * 60000)
        expectedTime = formatTime12h(target)
      }
      const remaining = target.getTime() - now.getTime()
      const elapsed = now.getTime() - startedAt.getTime()
      const totalMs = target.getTime() - startedAt.getTime()
      const denom = totalMs > 0 ? totalMs : ageDefaultWindowMin * 60000
      const progress = Math.min(1, Math.max(0, elapsed / denom))
      const source: CountdownContext['source'] = planNapTarget && planNapTarget.getTime() > now.getTime() ? 'plan' : trendsNapTarget ? 'trends' : 'default'
      return {
        progress,
        timeRemaining: formatCountdown(remaining),
        timeLabel: 'until next nap',
        expectedIcon: '😴',
        expectedText,
        expectedTime,
        mode: 'nap',
        targetTime: target,
        startedAt,
        explanation: buildExplanation(plan, 'nap', source),
        source,
      }
    }

    case 'awaiting_morning_wake':
    default:
      return EMPTY
  }
}
