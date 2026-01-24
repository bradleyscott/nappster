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
 * Format event time with relative date prefix if not from today
 */
function formatEventWithDate(eventTime: string): string {
  const eventDate = new Date(eventTime)
  const now = new Date()

  // Compare dates in local timezone
  const eventLocal = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((nowLocal.getTime() - eventLocal.getTime()) / (1000 * 60 * 60 * 24))

  const time = formatTime(eventTime)

  if (diffDays === 0) {
    return time // Today, just show time
  } else if (diffDays === 1) {
    return `Yesterday ${time}`
  } else if (diffDays === -1) {
    return `Tomorrow ${time}` // Shouldn't happen but handle edge case
  } else {
    return `${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
  }
}

/**
 * Format recent history events grouped by day with nap durations calculated
 */
function formatRecentHistory(events: SleepEvent[]): string {
  if (events.length === 0) return ''

  // Sort events chronologically (they come in reverse order)
  const sorted = [...events].sort((a, b) =>
    new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )

  // Group events by day
  const byDay = new Map<string, SleepEvent[]>()
  for (const event of sorted) {
    const date = new Date(event.event_time)
    const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, [])
    }
    byDay.get(dayKey)!.push(event)
  }

  const lines: string[] = []

  for (const [day, dayEvents] of byDay) {
    const dayLines: string[] = []
    const consumed = new Set<string>()

    for (let i = 0; i < dayEvents.length; i++) {
      const event = dayEvents[i]
      if (consumed.has(event.id)) continue

      if (event.event_type === 'nap_start') {
        // Look for matching nap_end
        let endEvent: SleepEvent | null = null
        for (let j = i + 1; j < dayEvents.length; j++) {
          if (dayEvents[j].event_type === 'nap_end' && !consumed.has(dayEvents[j].id)) {
            endEvent = dayEvents[j]
            consumed.add(dayEvents[j].id)
            break
          }
          if (dayEvents[j].event_type === 'nap_start') break
        }
        consumed.add(event.id)

        const startTime = formatTime(event.event_time)
        if (endEvent) {
          const endTime = formatTime(endEvent.event_time)
          const duration = calculateDurationMinutes(event.event_time, endEvent.event_time)
          let line = `Nap ${startTime}-${endTime} (${formatDuration(duration)})`
          if (event.context) line += ` [${event.context}]`
          dayLines.push(line)
        } else {
          dayLines.push(`Nap started ${startTime} (no end logged)`)
        }
      } else if (event.event_type === 'nap_end' && !consumed.has(event.id)) {
        // Orphaned nap_end (no matching start)
        dayLines.push(`Nap ended ${formatTime(event.event_time)}`)
        consumed.add(event.id)
      } else if (event.event_type === 'wake') {
        let line = `Wake ${formatTime(event.event_time)}`
        if (event.notes) line += ` - ${event.notes}`
        dayLines.push(line)
      } else if (event.event_type === 'bedtime') {
        let line = `Bedtime ${formatTime(event.event_time)}`
        if (event.notes) line += ` - ${event.notes}`
        dayLines.push(line)
      } else if (event.event_type === 'night_wake') {
        let line = `Night wake ${formatTime(event.event_time)}`
        if (event.notes) line += ` - ${event.notes}`
        dayLines.push(line)
      }
    }

    if (dayLines.length > 0) {
      lines.push(`**${day}:** ${dayLines.join(', ')}`)
    }
  }

  return lines.join('\n')
}

/**
 * Build system prompt for AI with baby context
 */
export function buildSystemPrompt(baby: Baby, events: SleepEvent[], recentHistory?: SleepEvent[], chatHistory?: ChatHistoryMessage[]): string {
  const age = formatAge(baby.birth_date)

  // Check if events span multiple days
  const hasMultipleDays = events.length > 0 && events.some(e => {
    const eventDate = new Date(e.event_time)
    const now = new Date()
    return eventDate.toDateString() !== now.toDateString()
  })

  let prompt = `You are an expert baby sleep consultant. You provide helpful, evidence-based advice about baby sleep.

## Baby Information
- Name: ${baby.name}
- Age: ${age}
${baby.sleep_training_method ? `- Sleep training method: ${baby.sleep_training_method}` : ''}
${baby.pattern_notes ? `- Known patterns: ${baby.pattern_notes}` : ''}

## Today's Sleep Events
${events.length === 0 ? 'No events logged yet today.' : events.map(e => {
  const timeStr = hasMultipleDays ? formatEventWithDate(e.event_time) : formatTime(e.event_time)
  const type = e.event_type.replace('_', ' ')
  return `- ${timeStr}: ${type}${e.context ? ` (${e.context})` : ''}${e.notes ? ` - ${e.notes}` : ''}`
}).join('\n')}

## Guidelines
- Base wake window recommendations on the baby's age
- Adjust recommendations based on nap lengths (shorter naps = shorter wake windows)
- Consider the baby's known patterns when making recommendations
- Be concise but supportive in your responses
- When calculating bedtime, count from when the last nap ended
- Format times as readable (e.g., "7:15pm" not "19:15")

## Event Logging
You have a createSleepEvent tool. Use it when users describe sleep events that happened.

**Single event examples:**
- "She woke up at 7am" → event_type='wake', event_time=today at 7:00 AM
- "Just put her down for a nap" → event_type='nap_start', event_time=now
- "Nap ended 30 minutes ago" → event_type='nap_end', event_time=30 min before now
- "She went to bed at 7:15pm" → event_type='bedtime', event_time=today at 7:15 PM
- "Nap at daycare ended at 2pm" → event_type='nap_end', context='daycare'

**Multiple events in one message:**
When a user describes multiple events (like an entire night or full day), call createSleepEvent MULTIPLE TIMES IN PARALLEL - one call per event. Parse ALL events mentioned and create them all at once.

Example: "Went to bed at 6:47pm, woke at 3:30am then self settled, woke at 8am for the day"
→ Call createSleepEvent 3 times simultaneously:
  1. event_type='bedtime', event_time=yesterday at 6:47 PM
  2. event_type='night_wake', event_time=today at 3:30 AM, notes='self settled'
  3. event_type='wake', event_time=today at 8:00 AM

**Overnight date handling:**
When the user reports overnight events (typically in the morning), assign dates carefully:
- Bedtime (evening times like 6pm-10pm) → YESTERDAY's date
- Night wakes before midnight (10pm-11:59pm) → YESTERDAY's date
- Night wakes after midnight (12am-6am) → TODAY's date
- Morning wake (6am-10am) → TODAY's date

Context clues:
- "last night" → bedtime was yesterday, night wakes span yesterday/today
- "this morning" → today's date for wake events
- If user sends message in morning describing night events, assume bedtime was yesterday

**Do NOT use the tool for:**
- Questions ("When should her next nap be?")
- Hypothetical scenarios ("What if she napped at 4pm?")
- Events already in Today's Sleep Events above

**After logging events:**
- For single events: confirm it was logged and offer relevant advice
- For multiple events: summarize ALL events in a clear list, then offer advice about the pattern

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
${formatRecentHistory(recentHistory)}
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
