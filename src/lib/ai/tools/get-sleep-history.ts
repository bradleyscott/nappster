import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { formatTime } from '@/lib/sleep-utils'

/**
 * Creates a tool that retrieves sleep history for up to 30 days.
 * Use this when the user asks about sleep patterns, trends, or needs data
 * beyond the recent 7-day history.
 */
export function createGetSleepHistoryTool(context: ToolContext) {
  const { supabase, babyId, timezone } = context

  return tool({
    description: `Retrieve sleep history for up to 30 days. Use this when the user asks about sleep patterns, trends, or needs data beyond the recent 7-day history.

Examples of when to use:
- "How has her sleep been this month?"
- "Has she been sleeping longer recently?"
- "What's her typical bedtime been?"
- "Show me her nap patterns over the past few weeks"`,
    inputSchema: z.object({
      days: z.number().min(1).max(30).default(7)
        .describe('Number of days of history to retrieve (1-30, default 7)'),
    }),
    execute: async ({ days }) => {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data: historyEvents, error } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('event_time', startDate.toISOString())
        .order('event_time', { ascending: true })

      if (error) {
        return { success: false, error: error.message }
      }

      // Group events by day for easier analysis
      const byDay = new Map<string, Array<{ type: string; time: string; notes?: string | null }>>()
      for (const event of historyEvents || []) {
        const date = new Date(event.event_time)
        const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, [])
        }
        byDay.get(dayKey)!.push({
          type: event.event_type,
          time: formatTime(event.event_time, timezone),
          notes: event.notes
        })
      }

      const formattedHistory = Array.from(byDay.entries()).map(([day, dayEvents]) => ({
        day,
        events: dayEvents
      }))

      return {
        success: true,
        days_retrieved: days,
        total_events: historyEvents?.length || 0,
        history: formattedHistory
      }
    },
  })
}
