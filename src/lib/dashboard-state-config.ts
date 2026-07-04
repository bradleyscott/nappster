/**
 * Dashboard state configuration.
 *
 * Derives the full UI config (pills, buttons, countdown, hero accent) for the
 * current sleep state. Extracted from sleep-dashboard.tsx as a pure function
 * so it can be unit-tested without rendering.
 */

import type { SleepState } from '@/lib/state-machine'
import { getCountdownContext, type CountdownOptions } from '@/lib/state-machine'
import type { Baby, SleepEvent, EventType } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ButtonConfig {
  icon: string
  label: string
  subtitle?: string
  timeBadge?: string
  accent?: string
  variant?: 'primary' | 'secondary'
  eventType?: EventType
}

export interface StateConfig {
  accent: 'lavender' | 'peach' | 'mint' | 'sunset'
  icon: string
  title: string
  elevated: boolean
  pills: Array<{ icon?: string; label: string; dot?: boolean; color?: 'lavender' | 'peach' | 'mint' | 'rose'; eventId?: string }>
  countdown: { progress: number; timeRemaining: string; timeLabel: string }
  expectedLabel: { icon: string; text: string; time: string }
  explanation: string | null
  source: 'plan' | 'trends' | 'default'
  buttons: ButtonConfig[]
}

export interface DashboardConfigOptions extends CountdownOptions {
  timezone?: string
  trendsNextNapHours?: number[]
  trendsBedtimeHour?: number | null
  trendsWakeHour?: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getLastEventTime(events: SleepEvent[], type: EventType): string {
  const match = [...events].reverse().find(e => e.event_type === type)
  if (!match) return ''
  const d = new Date(match.event_time)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function getDurationSince(events: SleepEvent[], type: EventType, now: Date = new Date()): string {
  const match = [...events].reverse().find(e => e.event_type === type)
  if (!match) return ''
  return formatDuration(now.getTime() - new Date(match.event_time).getTime())
}

// ---------------------------------------------------------------------------
// Main derivation
// ---------------------------------------------------------------------------

/**
 * Derive the full UI configuration (hero pills, action buttons, countdown,
 * accent color) from the current sleep state and events.
 *
 * Pure function — no side effects. Can be called server-side or client-side.
 */
export function getDashboardStateConfig(
  state: SleepState,
  baby: Baby,
  sleepPlan: SleepPlan | null,
  events: SleepEvent[],
  now: Date,
  opts: DashboardConfigOptions = {}
): StateConfig {
  // Single source of truth for the live countdown arc + expected label block.
  const ctx = getCountdownContext(state, events, sleepPlan, baby.birth_date, now, opts)
  const countdown = {
    progress: ctx.progress,
    timeRemaining: ctx.timeRemaining,
    timeLabel: ctx.timeLabel,
  }
  const expectedLabel = {
    icon: ctx.expectedIcon,
    text: ctx.expectedText,
    time: ctx.expectedTime,
  }
  const explanation = ctx.explanation
  const source = ctx.source

  switch (state) {
    case 'overnight_sleep': {
      const bedtimeTime = getLastEventTime(events, 'bedtime')
      const sleepingFor = getDurationSince(events, 'bedtime', now)
      const bedtimeEvent = [...events].reverse().find(e => e.event_type === 'bedtime')
      const nightWakeCount = bedtimeEvent
        ? events.filter(
            e =>
              e.event_type === 'night_wake' &&
              new Date(e.event_time) > new Date(bedtimeEvent.event_time)
          ).length
        : events.filter(e => e.event_type === 'night_wake').length
      return {
        accent: 'lavender',
        icon: '🌙',
        title: 'Sleeping Soundly',
        elevated: false,
        pills: [
          { icon: '🌙', label: `Bedtime ${bedtimeTime}`, color: 'lavender', eventId: bedtimeEvent?.id },
          { dot: true, label: `Sleeping for ${sleepingFor}`, color: 'lavender' },
        ],
        countdown,
        expectedLabel,
        explanation,
        source,
        buttons: [
          { icon: '☀️', label: 'Log Wake Up', eventType: 'wake', accent: 'purple' as const },
          { icon: '👀', label: 'Night Wake', subtitle: nightWakeCount > 0 ? `${nightWakeCount} already` : undefined, eventType: 'night_wake', variant: 'secondary' as const },
        ],
      }
    }

    case 'daytime_awake': {
      if (ctx.mode === 'bedtime') {
        const napEndTime = getLastEventTime(events, 'nap_end') || getLastEventTime(events, 'wake')
        const awakeFor = getDurationSince(events, 'nap_end', now) || getDurationSince(events, 'wake', now)
        const napEndEvent = [...events].reverse().find(e => e.event_type === 'nap_end')
        const wakeEvent = [...events].reverse().find(e => e.event_type === 'wake')
        return {
          accent: 'sunset',
          icon: '🌆',
          title: 'Awake & Ready',
          elevated: true,
          pills: [
            { icon: '🌤️', label: napEndTime ? `Nap ended ${napEndTime}` : 'Awake', color: 'peach', eventId: napEndEvent?.id ?? wakeEvent?.id },
            { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
          ],
          countdown,
          expectedLabel,
          explanation,
          source,
          buttons: [
            { icon: '🌙', label: 'Start Bedtime', subtitle: 'Nighttime sleep', eventType: 'bedtime', accent: 'sunset' as const },
          ],
        }
      }

      const wakeTime = getLastEventTime(events, 'wake')
      const napEndEvent = [...events].reverse().find(e => e.event_type === 'nap_end')
      const wakeEvent = [...events].reverse().find(e => e.event_type === 'wake')
      const pillAnchor = wakeEvent ?? napEndEvent
      const pillAnchorType = wakeEvent ? 'wake' : 'nap_end'
      const pillLabel = wakeTime
        ? `Woke at ${wakeTime}`
        : pillAnchorType === 'nap_end' ? `Nap ended ${getLastEventTime(events, 'nap_end')}` : 'Awake'
      const awakeFor = getDurationSince(events, pillAnchorType, now)
      return {
        accent: 'peach',
        icon: '☀️',
        title: 'Awake & Playing',
        elevated: false,
        pills: [
          { icon: '☀️', label: pillLabel, color: 'peach', eventId: pillAnchor?.id },
          { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
        ],
        countdown,
        expectedLabel,
        explanation,
        source,
        buttons: [
          { icon: '😴', label: 'Log Nap', subtitle: 'Start a nap', eventType: 'nap_start', accent: 'green' as const },
        ],
      }
    }

    case 'daytime_napping': {
      const napStartTime = getLastEventTime(events, 'nap_start')
      const nappingFor = getDurationSince(events, 'nap_start', now)
      const napStartEvent = [...events].reverse().find(e => e.event_type === 'nap_start')
      return {
        accent: 'mint',
        icon: '😴',
        title: 'Taking a Nap',
        elevated: false,
        pills: [
          { icon: '😴', label: napStartTime ? `Nap started ${napStartTime}` : 'Napping', color: 'mint', eventId: napStartEvent?.id },
          { dot: true, label: `Napping for ${nappingFor}`, color: 'mint' },
        ],
        countdown,
        expectedLabel,
        explanation,
        source,
        buttons: [
          { icon: '🌤️', label: 'End Nap', subtitle: 'Wake baby up', eventType: 'nap_end', accent: 'green' as const },
        ],
      }
    }

    case 'awaiting_morning_wake':
    default: {
      return {
        accent: 'lavender',
        icon: '👋',
        title: `Welcome, ${baby.name}`,
        elevated: false,
        pills: [],
        countdown,
        expectedLabel,
        explanation,
        source,
        buttons: [
          { icon: '🌙', label: 'Log Bedtime', subtitle: 'Start overnight sleep', eventType: 'bedtime', accent: 'purple' as const },
        ],
      }
    }
  }
}
