import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import { calculateDurationMinutes, formatDuration, formatTime, countNaps } from '@/lib/sleep-utils'

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

      // Calculate summary stats
      const lastEvent = events[events.length - 1]
      const hasWake = events.some(e => e.event_type === 'wake')
      const napCount = countNaps(events)
      const isNapInProgress = lastEvent?.event_type === 'nap_start'

      // Check for overnight state
      const lastBedtime = [...events].reverse().find(e => e.event_type === 'bedtime')
      const lastWake = [...events].reverse().find(e => e.event_type === 'wake')
      const isOvernight = lastBedtime &&
        (!lastWake || new Date(lastBedtime.event_time) > new Date(lastWake.event_time))

      return {
        success: true,
        events: formattedEvents,
        summary: {
          hasWake,
          napCount,
          isNapInProgress,
          isOvernight,
          lastEventType: lastEvent?.event_type,
          lastEventTime: lastEvent ? formatTime(lastEvent.event_time, timezone) : null
        }
      }
    },
  })
}
