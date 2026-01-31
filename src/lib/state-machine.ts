/**
 * Sleep State Machine
 *
 * This module defines the explicit state machine for baby sleep tracking.
 * State is computed deterministically from events, not inferred by LLMs.
 */

import type { SleepEvent, EventType, ScheduleItem } from '@/types/database'

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
  awaiting_morning_wake: ['wake'],
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
      return [{ eventType: 'wake', label: 'Morning Wake', icon: '☀️' }]

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

  // If no meridiem specified, try to infer from context or assume PM for typical bedtime hours
  if (meridiem === 'pm' && hour !== 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  return hour + minutes / 60
}
