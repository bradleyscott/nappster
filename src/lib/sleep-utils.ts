import { differenceInMonths, differenceInMinutes, differenceInHours, parseISO } from 'date-fns'
import { Baby, SleepEvent, SleepSession, TimelineItem, ChatHistoryMessage } from '@/types/database'

/**
 * Calculate baby's age in months from birthdate
 */
export function calculateAgeInMonths(birthDate: string): number {
  return differenceInMonths(new Date(), parseISO(birthDate))
}

/**
 * Format age as a human-readable string
 */
export function formatAge(birthDate: string): string {
  const months = calculateAgeInMonths(birthDate)
  if (months < 1) {
    return 'newborn'
  } else if (months === 1) {
    return '1 month'
  } else {
    return `${months} months`
  }
}

/**
 * Format time for display (e.g., "8:30am")
 * Uses toLocaleTimeString to ensure proper UTC to local time conversion
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}m`
}

/**
 * Calculate duration between two times in minutes
 */
export function calculateDurationMinutes(start: string, end: string): number {
  return differenceInMinutes(parseISO(end), parseISO(start))
}

/**
 * Get today's date at midnight in ISO format
 */
export function getTodayStart(): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.toISOString()
}

/**
 * Get today's date at 11:59pm in ISO format
 */
export function getTodayEnd(): string {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return today.toISOString()
}

/**
 * Format relative date for chat history display
 * Uses native Date methods for proper local time conversion
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()

  // Compare dates in local timezone
  const dateLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((nowLocal.getTime() - dateLocal.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format chat history messages for inclusion in system prompt
 */
export function formatChatHistoryForPrompt(messages: ChatHistoryMessage[]): string {
  if (messages.length === 0) return ''

  const formatted = messages.map(msg => {
    const relDate = formatRelativeDate(msg.created_at)
    const time = formatTime(msg.created_at)
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    // Truncate long messages for token efficiency
    const text = msg.text.length > 500 ? msg.text.slice(0, 497) + '...' : msg.text
    return `[${relDate}, ${time}] ${role}: ${text}`
  }).join('\n')

  return `
## Recent Conversation History
The following are messages from previous conversations. Use this context to maintain continuity and remember past discussions. Note: sleep events mentioned here may be outdated - always prioritize "Today's Sleep Events" for current information.

${formatted}
`
}

/**
 * Build system prompt for AI with baby context
 */
export function buildSystemPrompt(baby: Baby, events: SleepEvent[], recentHistory?: SleepEvent[], chatHistory?: ChatHistoryMessage[]): string {
  const age = formatAge(baby.birth_date)

  let prompt = `You are an expert baby sleep consultant. You provide helpful, evidence-based advice about baby sleep.

## Baby Information
- Name: ${baby.name}
- Age: ${age}
${baby.sleep_training_method ? `- Sleep training method: ${baby.sleep_training_method}` : ''}
${baby.pattern_notes ? `- Known patterns: ${baby.pattern_notes}` : ''}

## Today's Sleep Events
${events.length === 0 ? 'No events logged yet today.' : events.map(e => {
  const time = formatTime(e.event_time)
  const type = e.event_type.replace('_', ' ')
  return `- ${time}: ${type}${e.context ? ` (${e.context})` : ''}${e.notes ? ` - ${e.notes}` : ''}`
}).join('\n')}

## Guidelines
- Base wake window recommendations on the baby's age
- For a ${age} old baby, typical wake windows are approximately:
  - First wake window: 2.5-3 hours
  - Between naps: 2.75-3.25 hours
  - Last wake window before bed: 3-3.75 hours
- Adjust recommendations based on nap lengths (shorter naps = shorter wake windows)
- Consider the baby's known patterns when making recommendations
- Be concise but supportive in your responses
- When calculating bedtime, count from when the last nap ended
- If total day sleep is low, recommend an earlier bedtime
- Format times as readable (e.g., "7:15pm" not "19:15")

## Event Logging
You have a createSleepEvent tool. Use it when users describe sleep events that happened:
- "She woke up at 7am" → event_type='wake', event_time=today at 7:00 AM
- "Just put her down for a nap" → event_type='nap_start', event_time=now
- "Nap ended 30 minutes ago" → event_type='nap_end', event_time=30 min before now
- "She went to bed at 7:15pm" → event_type='bedtime', event_time=today at 7:15 PM
- "Nap at daycare ended at 2pm" → event_type='nap_end', context='daycare'

Do NOT use the tool for:
- Questions ("When should her next nap be?")
- Hypothetical scenarios ("What if she napped at 4pm?")
- Events already in Today's Sleep Events above

After logging an event, confirm it was logged and offer relevant advice based on the updated schedule.

## Pattern Notes
You have an updatePatternNotes tool. Use it to save important information about the baby's sleep patterns that should be remembered for future recommendations.

Save patterns when the user shares:
- "She's a light sleeper" → "Light sleeper"
- "He always wakes up around 6:30" → "Typically wakes around 6:30am"
- "She fights the last nap every day" → "Often fights the last nap of the day"
- "We use white noise for all sleeps" → "Uses white noise for sleep"
- "He needs his pacifier to fall asleep" → "Needs pacifier to fall asleep"
- "Naps are always short, around 30 minutes" → "Typically takes 30-minute naps"
- "She does better with 3 naps than 2" → "Does better on a 3-nap schedule"

Do NOT save:
- One-time events (those go in createSleepEvent)
- Information already in Known patterns above
- Temporary situations ("she's sick today")

When saving a pattern, briefly confirm what you noted.
`

  if (recentHistory && recentHistory.length > 0) {
    prompt += `
## Recent History (last 7 days)
${recentHistory.slice(0, 20).map(e => {
  const eventDate = new Date(e.event_time)
  const date = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = formatTime(e.event_time)
  return `- ${date} ${time}: ${e.event_type.replace('_', ' ')}`
}).join('\n')}
`
  }

  if (chatHistory && chatHistory.length > 0) {
    prompt += formatChatHistoryForPrompt(chatHistory)
  }

  return prompt
}

/**
 * Determine what the next expected event should be based on current events
 */
export function getNextExpectedEvent(events: SleepEvent[]): 'wake' | 'nap_start' | 'nap_end' | 'bedtime' | null {
  if (events.length === 0) {
    return 'wake'
  }

  const lastEvent = events[events.length - 1]

  switch (lastEvent.event_type) {
    case 'wake':
      return 'nap_start'
    case 'nap_start':
      return 'nap_end'
    case 'nap_end':
      // Could be another nap or bedtime depending on time
      return 'nap_start' // Default to nap, UI will show both options
    case 'bedtime':
      return null // Day is complete
    case 'night_wake':
      return null
    default:
      return null
  }
}

/**
 * Count completed naps from events
 */
export function countNaps(events: SleepEvent[]): number {
  return events.filter(e => e.event_type === 'nap_end').length
}

/**
 * Group sleep events into sessions (naps, overnight) and standalone events.
 *
 * Pairing rules:
 * - nap_start pairs with the next nap_end
 * - bedtime pairs with the next wake event (within 16 hours)
 * - wake and night_wake remain standalone unless part of an overnight session
 */
export function groupEventsIntoSessions(events: SleepEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const consumed = new Set<string>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]

    if (consumed.has(event.id)) {
      continue
    }

    if (event.event_type === 'nap_start') {
      // Look ahead for matching nap_end
      let endEvent: SleepEvent | null = null
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].event_type === 'nap_end' && !consumed.has(events[j].id)) {
          endEvent = events[j]
          consumed.add(events[j].id)
          break
        }
        // Stop if we hit another nap_start (unpaired)
        if (events[j].event_type === 'nap_start') {
          break
        }
      }

      const session: SleepSession = {
        type: 'nap',
        startEvent: event,
        endEvent,
        durationMinutes: endEvent
          ? calculateDurationMinutes(event.event_time, endEvent.event_time)
          : null
      }
      items.push({ kind: 'session', session })
      consumed.add(event.id)

    } else if (event.event_type === 'bedtime') {
      // Look ahead for matching wake (within 16 hours)
      let endEvent: SleepEvent | null = null
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].event_type === 'wake' && !consumed.has(events[j].id)) {
          const hoursDiff = differenceInHours(
            parseISO(events[j].event_time),
            parseISO(event.event_time)
          )
          if (hoursDiff <= 16) {
            endEvent = events[j]
            consumed.add(events[j].id)
          }
          break
        }
      }

      const session: SleepSession = {
        type: 'overnight',
        startEvent: event,
        endEvent,
        durationMinutes: endEvent
          ? calculateDurationMinutes(event.event_time, endEvent.event_time)
          : null
      }
      items.push({ kind: 'session', session })
      consumed.add(event.id)

    } else {
      // Standalone event (wake not paired with bedtime, night_wake, or orphaned nap_end)
      items.push({ kind: 'standalone', event })
    }
  }

  return items
}

/**
 * Given a single event, find the session it belongs to.
 * Returns null if the event is standalone.
 */
export function findSessionForEvent(event: SleepEvent, events: SleepEvent[]): SleepSession | null {
  const items = groupEventsIntoSessions(events)

  for (const item of items) {
    if (item.kind === 'session') {
      if (item.session.startEvent.id === event.id ||
          item.session.endEvent?.id === event.id) {
        return item.session
      }
    }
  }

  return null
}
