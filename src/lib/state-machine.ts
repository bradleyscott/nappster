/**
 * Sleep State Machine
 *
 * This module defines the explicit state machine for baby sleep tracking.
 * State is computed deterministically from events, not inferred by LLMs.
 */

import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'
import { calculateAgeInMonths } from '@/lib/sleep-utils'

/**
 * All possible baby sleep states.
 * These are the ONLY valid values for currentState.
 */
export const SLEEP_STATES = [
  'awaiting_morning_wake',
  'overnight_sleep',
  'daytime_awake',
  'daytime_napping',
] as const

export type SleepState = (typeof SLEEP_STATES)[number]

/**
 * Valid events that can be logged from each state.
 * This defines which quick entry buttons should be available.
 */
export const VALID_EVENTS: Record<SleepState, EventType[]> = {
  // The empty-events / freshly-onboarded state. The user's first action is to log
  // the baby's current overnight sleep, so both `bedtime` (start overnight) and
  // `wake` (skip straight to daytime) are valid here. We intentionally do NOT show
  // a "Good Morning" steady-state UX for this — see getStateConfig in the dashboard.
  awaiting_morning_wake: ['bedtime', 'wake'],
  overnight_sleep: ['wake', 'night_wake'],
  daytime_awake: ['nap_start', 'bedtime'],
  daytime_napping: ['nap_end'],
}

/**
 * State transitions: maps [currentState, event] -> newState
 * If an event doesn't cause a state change (like night_wake), it maps to the same state.
 */
const TRANSITIONS: Record<SleepState, Partial<Record<EventType, SleepState>>> = {
  awaiting_morning_wake: {
    bedtime: 'overnight_sleep',
    wake: 'daytime_awake',
  },
  overnight_sleep: {
    wake: 'daytime_awake',
    night_wake: 'overnight_sleep', // No state change, just logs the event
  },
  daytime_awake: {
    nap_start: 'daytime_napping',
    bedtime: 'overnight_sleep',
  },
  daytime_napping: {
    nap_end: 'daytime_awake',
  },
}

/**
 * Compute current state from chronologically-ordered events.
 * This is a PURE FUNCTION - no side effects, deterministic output.
 *
 * Uses a hybrid approach:
 * 1. First, infer state from the last event (handles missing wake events gracefully)
 * 2. Fall back to transition-based computation for edge cases
 *
 * @param events - Array of sleep events, sorted by event_time ascending
 * @returns The current sleep state
 */
export function computeCurrentState(events: SleepEvent[]): SleepState {
  if (events.length === 0) {
    return 'awaiting_morning_wake'
  }

  // Infer state from the last event - this handles cases where users
  // forget to log intermediate events (e.g., morning wake)
  const lastEvent = events[events.length - 1]
  const lastEventType = lastEvent.event_type as EventType

  switch (lastEventType) {
    case 'bedtime':
      return 'overnight_sleep'
    case 'nap_start':
      return 'daytime_napping'
    case 'nap_end':
    case 'wake':
      return 'daytime_awake'
    case 'night_wake':
      return 'overnight_sleep'
    default:
      return 'awaiting_morning_wake'
  }
}

/**
 * Check if a specific event type is valid from the current state.
 */
export function isValidEvent(
  currentState: SleepState,
  eventType: EventType
): boolean {
  return VALID_EVENTS[currentState]?.includes(eventType) ?? false
}

/**
 * Get the next state after applying an event.
 * Returns null if the transition is invalid.
 */
export function getNextState(
  currentState: SleepState,
  eventType: EventType
): SleepState | null {
  return TRANSITIONS[currentState]?.[eventType] ?? null
}

/**
 * Quick entry button configuration
 */
export interface QuickEntryButton {
  eventType: EventType
  label: string
  icon: string
}

/**
 * Get quick entry button configurations for a state.
 *
 * @param currentState - The current sleep state
 * @param options - Optional configuration
 * @param options.showBedtimeOverNap - If true, show bedtime button instead of nap in daytime_awake
 */
export function getQuickEntryButtons(
  currentState: SleepState,
  options?: { showBedtimeOverNap?: boolean }
): QuickEntryButton[] {
  switch (currentState) {
    case 'awaiting_morning_wake':
      // Zero-events / freshly-onboarded: prompt the user to log the baby's current
      // overnight sleep first. There is intentionally no "Good Morning" quick action.
      return [{ eventType: 'bedtime', label: 'Log Bedtime', icon: '🌙' }]

    case 'overnight_sleep':
      return [
        { eventType: 'wake', label: 'End Night', icon: '☀️' },
        { eventType: 'night_wake', label: 'Night Wake', icon: '👀' },
      ]

    case 'daytime_awake':
      if (options?.showBedtimeOverNap) {
        return [{ eventType: 'bedtime', label: 'Bedtime', icon: '🌙' }]
      }
      return [{ eventType: 'nap_start', label: 'Start Nap', icon: '😴' }]

    case 'daytime_napping':
      return [{ eventType: 'nap_end', label: 'End Nap', icon: '🌤️' }]

    default:
      return []
  }
}

/**
 * Determine if bedtime button should be shown over nap button.
 *
 * Logic:
 * - Show bedtime if all naps are completed or skipped (no upcoming naps)
 * - Show bedtime if within 1 hour of target bedtime
 *
 * @param schedule - The sleep plan schedule items
 * @param targetBedtime - Target bedtime string (e.g., "7:00 - 7:30pm")
 * @param currentTime - Current time (defaults to now)
 */
export function shouldShowBedtime(
  schedule: ScheduleItem[] | undefined,
  targetBedtime: string | undefined,
  currentTime: Date = new Date()
): boolean {
  if (!schedule) return false

  // Check if all naps are completed or skipped (no upcoming naps)
  const hasUpcomingNaps = schedule.some(
    (item) => item.type === 'nap' && item.status === 'upcoming'
  )

  if (!hasUpcomingNaps) return true

  // Check if within 1 hour of target bedtime
  if (targetBedtime) {
    const bedtimeHour = parseTimeWindowStartHour(targetBedtime)
    if (bedtimeHour !== null) {
      const currentHour = currentTime.getHours()
      const currentMinutes = currentTime.getMinutes()
      const currentDecimalHour = currentHour + currentMinutes / 60
      const hoursUntilBedtime = bedtimeHour - currentDecimalHour

      if (hoursUntilBedtime <= 1 && hoursUntilBedtime >= -0.5) {
        return true
      }
    }
  }

  return false
}

/**
 * Parse a time window string like "7:00 - 7:30pm" to get the start hour in 24h format.
 * Returns null if parsing fails.
 */
function parseTimeWindowStartHour(timeWindow: string): number | null {
  // Match patterns like "7:00pm", "7:00 - 7:30pm", "7:00am"
  const match = timeWindow.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3]?.toLowerCase()

  if (meridiem === 'pm' && hour !== 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  // If no meridiem specified, assume PM for typical bedtime hours (6pm-11pm)
  if (!meridiem && hour >= 6 && hour <= 11) hour += 12

  return hour + minutes / 60
}

/**
 * Get suggested questions for AI chat based on current sleep state.
 * These are contextual prompts that help users ask relevant timing questions.
 *
 * @param state - The current sleep state
 * @param babyName - The baby's name for personalization
 */
export function getSuggestedQuestions(
  state: SleepState,
  babyName: string
): string[] {
  switch (state) {
    case 'awaiting_morning_wake':
      return [`What time should ${babyName} go to bed?`]
    case 'daytime_awake':
      return [
        `When is ${babyName}'s next nap?`,
        `When should ${babyName} go to bed?`,
      ]
    case 'daytime_napping':
      return [
        `When should I wake ${babyName}?`,
        `How long should this nap be?`,
      ]
    case 'overnight_sleep':
      return [`What time should ${babyName} wake up tomorrow?`]
  }
}

// ---------------------------------------------------------------------------
// Countdown context
// ---------------------------------------------------------------------------
// The dashboard hero renders a circular countdown ring together with a small
// "expected" label. Previously those values were hard-coded static strings, so
// the ring never ticked and never filled completely (it always showed a fixed
// arc with a gap). getCountdownContext computes a LIVE target for the current
// state so the ring fills as time elapses and reaches a full circle exactly at
// the due time.
//
// Sources, in priority order:
//   1. The active sleep plan's schedule items / targetBedtime (authoritative —
//      generated by the AI from this baby's actual trends).
//   2. Age-based wake-window / nap-duration / overnight defaults.
//
// The returned `progress` is elapsed ÷ total-duration, clamped to [0, 1]. The
// `timeRemaining` string is a live countdown to the target.
// ---------------------------------------------------------------------------

/** Structural subset of a SleepPlan that this helper consumes. */
export interface CountdownPlanInput {
  schedule?: ScheduleItem[] | undefined
  targetBedtime?: string | undefined
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
}

/**
 * Parse a time-window string such as "7:00 - 7:30pm" or "9:30am - 10:00am"
 * into start/end decimal hours (24h, e.g. 19.0 / 19.5, or 9.5 / 10.0).
 *
 * Handles meridiem inheritance: when only one side carries am/pm (e.g.
 * "7:00 - 7:30pm") the rightmost meridiem applies to both sides. Falls back to
 * a heuristic when no meridiem is present (nap morning hours default to AM,
 * evening hours default to PM).
 */
function parseTimeWindowDual(
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
function dateAtHour(decimalHour: number, base: Date): Date {
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
  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function ageMonths(birthDate: string | undefined): number | null {
  if (!birthDate) return null
  try {
    const m = calculateAgeInMonths(birthDate)
    return Number.isFinite(m) ? m : null
  } catch {
    return null
  }
}

function defaultWakeWindowMin(age: number | null): number {
  // Hours of awake time this baby can typically tolerate between sleeps.
  if (age == null) return 150
  if (age < 2) return 75
  if (age < 4) return 120
  if (age < 6) return 150
  if (age < 9) return 180
  if (age < 12) return 195
  if (age < 18) return 240
  return 300
}

function defaultNapMin(age: number | null): number {
  if (age == null) return 90
  if (age < 3) return 120
  if (age < 6) return 90
  return 75
}

function defaultOvernightMin(age: number | null): number {
  // For a baby this is typically 10.5–12h of overnight sleep.
  if (age == null) return 11 * 60
  if (age < 4) return 11 * 60
  if (age < 12) return 11 * 60 + 30
  return 11 * 60
}

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
  // Look for a schedule item that represents the morning wake (label contains "wake").
  // Fall back to the bedtime item's partner which the AI usually gives a window too.
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

/** True if every nap on the schedule is completed or skipped (so bedtime is next). */
function allNapsDone(plan: CountdownPlanInput | null): boolean {
  if (!plan?.schedule) return false
  const naps = plan.schedule.filter((i) => i.type === 'nap')
  if (naps.length === 0) return false
  return naps.every((i) => i.status === 'completed' || i.status === 'skipped')
}

/**
 * Compute the live countdown context for the dashboard hero ring.
 */
export function getCountdownContext(
  state: SleepState,
  events: SleepEvent[],
  plan: CountdownPlanInput | null,
  birthDate: string | undefined,
  now: Date = new Date()
): CountdownContext {
  const age = ageMonths(birthDate)
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )

  switch (state) {
    case 'overnight_sleep': {
      const bedtime = lastEvent(sorted, 'bedtime')
      if (!bedtime) {
        // Events list inconsistent with state — fall back to a neutral overnight.
        return {
          ...EMPTY,
          mode: 'overnight',
          expectedIcon: '🌅',
          expectedText: 'Expected wake',
          expectedTime: '—',
          timeLabel: 'until wake',
        }
      }
      const startedAt = new Date(bedtime.event_time)
      // Resolve target wake: plan-derived wake hour, else default overnight duration.
      let target: Date
      let expectedTime: string
      const expectedText = 'Expected wake'
      const planWakeHour = wakeHourFromPlan(plan)
      if (planWakeHour != null) {
        target = dateAtHour(planWakeHour, now)
        expectedTime = formatTime12h(target)
      } else {
        const totalMin = defaultOvernightMin(age)
        target = new Date(startedAt.getTime() + totalMin * 60000)
        expectedTime = formatTime12h(target)
      }
      const totalMs = target.getTime() - startedAt.getTime()
      const elapsed = now.getTime() - startedAt.getTime()
      const remaining = target.getTime() - now.getTime()
      const progress = totalMs > 0 ? Math.min(1, Math.max(0, elapsed / totalMs)) : 0
      return {
        progress,
        timeRemaining: formatCountdown(remaining),
        timeLabel: 'until wake',
        expectedIcon: '🌅',
        expectedText,
        expectedTime,
        mode: 'overnight',
        targetTime: target,
        startedAt,
      }
    }

    case 'daytime_napping': {
      const napStart = lastEvent(sorted, 'nap_start')
      if (!napStart) return EMPTY
      const startedAt = new Date(napStart.event_time)
      // End target: in-progress nap timeWindow end, else default nap duration.
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
      }
    }

    case 'daytime_awake': {
      // Start of the current awake stretch: last nap_end, else last wake.
      const napEnd = lastEvent(sorted, 'nap_end')
      const wake = lastEvent(sorted, 'wake')
      const starter = napEnd ?? wake
      if (!starter) return EMPTY
      const startedAt = new Date(starter.event_time)
      const ageDefaultWindowMin = defaultWakeWindowMin(age)

      // Decide branch: bedtime is next only when ALL naps on the schedule are
      // completed/skipped. Otherwise we count down to the next upcoming nap.
      // When there's no plan, assume a nap is expected after a morning wake.
      const bedtimeNext = allNapsDone(plan)

      if (bedtimeNext) {
        // ---- Bedtime Next mode ----
        let target: Date
        let expectedTime: string
        const expectedText = 'Target bedtime'
        const bedtimeHour = plan?.targetBedtime
          ? parseTimeWindowDual(plan.targetBedtime).start
          : null
        if (bedtimeHour != null) {
          target = dateAtHour(bedtimeHour, now)
          expectedTime = formatTime12h(target)
        } else {
          // No plan: default bedtime = 7:00pm on the current day.
          target = dateAtHour(19, now)
          expectedTime = formatTime12h(target)
        }
        const totalMs = target.getTime() - startedAt.getTime()
        const remaining = target.getTime() - now.getTime()
        const elapsed = now.getTime() - startedAt.getTime()
        // Fall back to the age-based last wake window if total is implausible.
        const denom = totalMs > 0 ? totalMs : ageDefaultWindowMin * 60000
        const progress = Math.min(1, Math.max(0, elapsed / denom))
        return {
          progress,
          timeRemaining: formatCountdown(remaining),
          timeLabel: 'until bedtime',
          expectedIcon: '🌙',
          expectedText,
          expectedTime,
          mode: 'bedtime',
          targetTime: target,
          startedAt,
        }
      }

      // ---- Nap Next mode ----
      const nextNap = nextUpcomingNap(plan)
      let target: Date
      let expectedTime: string
      const expectedText = 'Next nap'
      const napHour = nextNap ? parseTimeWindowDual(nextNap.timeWindow).start : null
      if (napHour != null) {
        target = dateAtHour(napHour, now)
        expectedTime = formatTime12h(target)
      } else {
        // No plan: assume one nap after a morning wake — target = start of the next wake window.
        target = new Date(startedAt.getTime() + ageDefaultWindowMin * 60000)
        expectedTime = formatTime12h(target)
      }
      const remaining = target.getTime() - now.getTime()
      const elapsed = now.getTime() - startedAt.getTime()
      // Window total = plan target − startedAt (cap to default if pathologically large).
      const totalMs = target.getTime() - startedAt.getTime()
      const denom = totalMs > 0 ? totalMs : ageDefaultWindowMin * 60000
      const progress = Math.min(1, Math.max(0, elapsed / denom))
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
      }
    }

    case 'awaiting_morning_wake':
    default:
      // Zero-events / freshly-onboarded: no countdown, just a welcome prompt.
      return EMPTY
  }
}
