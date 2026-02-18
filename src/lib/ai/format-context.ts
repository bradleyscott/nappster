import {
  formatTime,
  calculateDurationMinutes,
  formatDuration,
  countNaps,
} from '@/lib/sleep-utils'
import { computeCurrentState, type SleepState } from '@/lib/state-machine'
import type { SleepEvent } from '@/types/database'

export interface FormattedEvent {
  id: string
  type: string
  time: string
  description: string
}

export interface EventSummary {
  hasWake: boolean
  napCount: number
  lastEventType?: string
  lastEventTime?: string | null
}

export interface BabyProfileContext {
  name: string
  age: string
  birthDate: string
  sleepTrainingMethod: string | null
  patternNotes: string | null
}

export interface ChatContext {
  babyProfile?: BabyProfileContext
  todayEvents?: FormattedEvent[]
  currentState?: SleepState
  eventSummary?: EventSummary
  recentMessages?: Array<{ role: 'user' | 'assistant'; text: string }>
  lastSessionRecap?: string
  /** Pre-formatted sleep trends string for prompt injection */
  sleepTrends?: string | null
}

/**
 * Build a short recap string from recent messages.
 * Truncates each message to keep the recap compact.
 */
export function buildSessionRecap(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
  maxMessages = 6,
  maxCharsPerMessage = 150
): string {
  const recent = messages.slice(-maxMessages)
  const lines = recent.map((m) => {
    const label = m.role === 'user' ? 'Parent' : 'Assistant'
    const text = m.text.length > maxCharsPerMessage
      ? m.text.slice(0, maxCharsPerMessage) + '…'
      : m.text
    return `${label}: ${text}`
  })
  return lines.join('\n')
}

/**
 * Format a single sleep event for display in the prompt.
 * Reuses logic from get-today-events.ts
 */
export function formatEventForPrompt(
  event: SleepEvent,
  timezone: string
): FormattedEvent {
  const time = formatTime(event.event_time, timezone)
  const type = event.event_type.replace('_', ' ')
  let description = `${time}: ${type}`

  if (event.context) {
    description += ` (${event.context})`
  }
  if (event.end_time && event.event_type === 'night_wake') {
    const endTime = formatTime(event.end_time, timezone)
    const duration = calculateDurationMinutes(event.event_time, event.end_time)
    description += ` -> back to sleep ${endTime} (${formatDuration(duration)} awake)`
  }
  if (event.notes) {
    description += ` - ${event.notes}`
  }

  return {
    id: event.id,
    type: event.event_type,
    time,
    description,
  }
}

/**
 * Extract text content from message parts.
 * Reuses logic from get-chat-history.ts
 */
export function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p: { type: string }) => p.type === 'text')
    .map((p: { text?: string }) => p.text || '')
    .join(' ')
    .trim()
}

/**
 * Format an array of sleep events and compute summary information.
 */
export function formatEventsContext(
  events: SleepEvent[],
  timezone: string
): {
  formattedEvents: FormattedEvent[]
  currentState: SleepState
  eventSummary: EventSummary
} {
  const formattedEvents = events.map((e) => formatEventForPrompt(e, timezone))
  const currentState = computeCurrentState(events)

  const lastEvent = events[events.length - 1]
  const eventSummary: EventSummary = {
    hasWake: events.some((e) => e.event_type === 'wake'),
    napCount: countNaps(events),
    lastEventType: lastEvent?.event_type,
    lastEventTime: lastEvent ? formatTime(lastEvent.event_time, timezone) : null,
  }

  return { formattedEvents, currentState, eventSummary }
}
