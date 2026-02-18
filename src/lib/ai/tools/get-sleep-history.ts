import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { formatTime, calculateDurationMinutes } from '@/lib/sleep-utils'
import { getStartOfDaysAgoForTimezone } from '@/lib/timezone'

interface DaySummary {
  day: string
  wakeTime: string | null
  bedtime: string | null
  napCount: number
  totalNapMinutes: number
  nightWakes: number
  notes: string[]
}

/**
 * Summarise one day's events into a compact object.
 */
function summariseDay(
  dayKey: string,
  events: Array<{ event_type: string; event_time: string; end_time: string | null; notes: string | null }>,
  timezone: string
): DaySummary {
  let wakeTime: string | null = null
  let bedtime: string | null = null
  let napCount = 0
  let totalNapMinutes = 0
  let nightWakes = 0
  const notes: string[] = []

  let lastNapStart: string | null = null

  for (const e of events) {
    switch (e.event_type) {
      case 'wake':
        wakeTime = formatTime(e.event_time, timezone)
        break
      case 'bedtime':
        bedtime = formatTime(e.event_time, timezone)
        break
      case 'nap_start':
        lastNapStart = e.event_time
        break
      case 'nap_end':
        if (lastNapStart) {
          napCount++
          totalNapMinutes += calculateDurationMinutes(lastNapStart, e.event_time)
          lastNapStart = null
        }
        break
      case 'night_wake':
        nightWakes++
        break
    }
    if (e.notes) {
      notes.push(e.notes)
    }
  }

  return { day: dayKey, wakeTime, bedtime, napCount, totalNapMinutes, nightWakes, notes }
}

/**
 * Creates a tool that retrieves sleep history for up to 30 days.
 * Returns day-level summaries to keep token usage low.
 */
export function createGetSleepHistoryTool(context: ToolContext) {
  const { supabase, babyId, timezone } = context

  return tool({
    description: `Retrieve sleep history for up to 30 days. Returns per-day summaries (wake time, bedtime, nap count, total nap minutes, night wakes). Use this when the user asks about sleep patterns, trends, or needs data beyond today.

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
      const startDate = getStartOfDaysAgoForTimezone(timezone, days)

      const { data: historyEvents, error } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('event_time', startDate)
        .order('event_time', { ascending: true })

      if (error) {
        return { success: false, error: error.message }
      }

      // Group events by day
      const byDay = new Map<string, Array<{ event_type: string; event_time: string; end_time: string | null; notes: string | null }>>()
      for (const event of historyEvents || []) {
        const date = new Date(event.event_time)
        const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone })
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, [])
        }
        byDay.get(dayKey)!.push({
          event_type: event.event_type,
          event_time: event.event_time,
          end_time: event.end_time,
          notes: event.notes,
        })
      }

      const summaries = Array.from(byDay.entries()).map(([dayKey, dayEvents]) =>
        summariseDay(dayKey, dayEvents, timezone)
      )

      return {
        success: true,
        days_retrieved: days,
        total_events: historyEvents?.length || 0,
        summaries,
      }
    },
  })
}
