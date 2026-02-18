import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import { countNaps } from '@/lib/sleep-utils'
import { formatEventForPrompt } from '@/lib/ai/format-context'
import { computeCurrentState } from '@/lib/state-machine'
import type { SleepEvent } from '@/types/database'
import { formatTime } from '@/lib/sleep-utils'

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

      // Format events for display using shared formatting function
      const formattedEvents = (events as SleepEvent[]).map(e => {
        const formatted = formatEventForPrompt(e, timezone)
        return {
          ...formatted,
          context: e.context,
          notes: e.notes,
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
