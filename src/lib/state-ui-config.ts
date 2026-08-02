/**
 * State-driven UI configuration (quick-entry buttons and suggested questions).
 *
 * Extracted from the original state-machine.ts to separate UI concerns from
 * the core state machine logic.
 */

import type { EventType, ScheduleItem } from '@/types/database'
import { parseTimeWindowDual } from './countdown-projection'
import type { SleepState } from './state-machine'

// ---------------------------------------------------------------------------
// Quick-entry buttons
// ---------------------------------------------------------------------------

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
      return [{ eventType: 'bedtime', label: 'Log Bedtime', icon: 'moon' }]

    case 'overnight_sleep':
      return [
        { eventType: 'wake', label: 'End Night', icon: 'sun' },
        { eventType: 'night_wake', label: 'Night Wake', icon: 'eye' },
      ]

    case 'daytime_awake':
      if (options?.showBedtimeOverNap) {
        return [{ eventType: 'bedtime', label: 'Bedtime', icon: 'moon' }]
      }
      return [{ eventType: 'nap_start', label: 'Start Nap', icon: 'cloud-sun' }]

    case 'daytime_napping':
      return [{ eventType: 'nap_end', label: 'End Nap', icon: 'cloud-moon' }]

    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Suggested questions
// ---------------------------------------------------------------------------

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
// shouldShowBedtime (used by the dashboard action buttons)
// ---------------------------------------------------------------------------

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
    const bedtimeHour = parseTimeWindowDual(targetBedtime).start
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
