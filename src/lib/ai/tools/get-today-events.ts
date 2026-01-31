import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import { calculateDurationMinutes, formatDuration, formatTime, countNaps } from '@/lib/sleep-utils'
import { computeCurrentState } from '@/lib/state-machine'
import type { SleepEvent } from '@/types/database'

/**
 * Creates a tool that fetches today's sleep events.
 * This provides context about what has happened today.
 */
export function createGetTodayEventsTool(context: ToolContext) {
  const { supabase, babyId, timezone } = context

  return tool({
    description: `Get today's sleep events to understand what has happened today.
Call this to see the current day's schedule including wake time, naps, and any logged events.
This is essential for making recommendations about the next nap or bedtime.`,
    inputSchema: z.object({}),
    execute: async () => {
      const { start: todayStart, end: todayEnd } = getTodayBoundsForTimezone(timezone)

      const { data: events, error } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('event_time', todayStart)
        .lt('event_time', todayEnd)
        .order('event_time', { ascending: true })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!events || events.length === 0) {
        return {
          success: true,
          message: 'No events logged yet today.',
          events: [],
          currentState: 'awaiting_morning_wake',
          summary: {
            hasWake: false,
            napCount: 0,
            isNapInProgress: false,
            isOvernight: false
          }
        }
      }

      // Format events for display
      const formattedEvents = events.map(e => {
        const time = formatTime(e.event_time, timezone)
        const type = e.event_type.replace('_', ' ')
        let description = `${time}: ${type}`

        if (e.context) {
          description += ` (${e.context})`
        }
        if (e.end_time && e.event_type === 'night_wake') {
          const endTime = formatTime(e.end_time, timezone)
          const duration = calculateDurationMinutes(e.event_time, e.end_time)
          description += ` -> back to sleep ${endTime} (${formatDuration(duration)} awake)`
        }
        if (e.notes) {
          description += ` - ${e.notes}`
        }

        return {
          id: e.id,
          type: e.event_type,
          time,
          description,
          context: e.context,
          notes: e.notes
        }
      })

      // Compute current state from events using the state machine
      const currentState = computeCurrentState(events as SleepEvent[])

      // Calculate summary stats
      const lastEvent = events[events.length - 1]
      const hasWake = events.some(e => e.event_type === 'wake')
      const napCount = countNaps(events)

      return {
        success: true,
        events: formattedEvents,
        currentState,
        summary: {
          hasWake,
          napCount,
          lastEventType: lastEvent?.event_type,
          lastEventTime: lastEvent ? formatTime(lastEvent.event_time, timezone) : null
        }
      }
    },
  })
}
