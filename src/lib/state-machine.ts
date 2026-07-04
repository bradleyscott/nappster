/**
 * Sleep State Machine
 *
 * This module defines the explicit state machine for baby sleep tracking.
 * State is computed deterministically from events, not inferred by LLMs.
 *
 * IMPORTANT: This module re-exports from ./countdown-projection and
 * ./state-ui-config for backward compatibility. New code should import
 * directly from those modules.
 */

import type { SleepEvent, EventType } from '@/types/database'

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
    night_wake: 'overnight_sleep',
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
 * @param events - Array of sleep events, sorted by event_time ascending
 * @returns The current sleep state
 */
export function computeCurrentState(events: SleepEvent[]): SleepState {
  if (events.length === 0) {
    return 'awaiting_morning_wake'
  }

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

// ---------------------------------------------------------------------------
// Backward-compatible re-exports
// ---------------------------------------------------------------------------
export type {
  CountdownPlanInput,
  CountdownOptions,
  CountdownMode,
  CountdownContext,
} from './countdown-projection'
export {
  getCountdownContext,
  isPlanStaleForNaps,
  defaultWakeWindowMin,
  defaultNapMin,
  defaultOvernightMin,
  parseTimeWindowDual,
  dateAtHour,
} from './countdown-projection'
export type { QuickEntryButton } from './state-ui-config'
export {
  getQuickEntryButtons,
  getSuggestedQuestions,
  shouldShowBedtime,
} from './state-ui-config'
