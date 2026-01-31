import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { formatTime } from '@/lib/sleep-utils'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import { computeCurrentState, isValidEvent, VALID_EVENTS } from '@/lib/state-machine'
import type { SleepEvent, EventType } from '@/types/database'

/**
 * Creates a tool that logs sleep events to the database.
 * Use this when the user describes something that happened.
 */
export function createCreateSleepEventTool(context: ToolContext) {
  const { supabase, babyId, timezone } = context

  return tool({
    description: `Log a sleep event when the user describes something that happened.
Use this when the user mentions:
- Waking up (event_type: 'wake')
- Starting a nap or going down for a nap (event_type: 'nap_start')
- Ending a nap or waking from a nap (event_type: 'nap_end')
- Going to bed for the night (event_type: 'bedtime')
- Waking during the night (event_type: 'night_wake')

For night_wake events, if the user mentions when the baby went back to sleep, include the end_time.
Parse times like "at 2pm", "at 14:30", "just now", "30 minutes ago".
Infer context from mentions of "at daycare", "at home", "while traveling".
Do NOT use this tool for questions or hypothetical scenarios.`,
    inputSchema: z.object({
      event_type: z.enum(['wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake'])
        .describe('The type of sleep event'),
      event_time: z.string()
        .describe('ISO 8601 timestamp for when the event occurred'),
      end_time: z.string().optional()
        .describe('ISO 8601 timestamp for when a night_wake ended (when baby went back to sleep). Only applicable for night_wake events.'),
      context: z.enum(['home', 'daycare', 'travel']).optional()
        .describe('Where the event occurred, if mentioned'),
      notes: z.string().optional()
        .describe('Any additional details mentioned by the user'),
      force: z.boolean().optional()
        .describe('If true, log the event even if it seems inconsistent with current state. Use when correcting data or logging historical events.'),
    }),
    execute: async ({ event_type, event_time, end_time, context: eventContext, notes, force }) => {
      // Validate event against current state unless force is true
      if (!force) {
        const { start: todayStart, end: todayEnd } = getTodayBoundsForTimezone(timezone)

        const { data: existingEvents } = await supabase
          .from('sleep_events')
          .select('*')
          .eq('baby_id', babyId)
          .gte('event_time', todayStart)
          .lt('event_time', todayEnd)
          .order('event_time', { ascending: true })

        const currentState = computeCurrentState((existingEvents || []) as SleepEvent[])

        if (!isValidEvent(currentState, event_type as EventType)) {
          const validEvents = VALID_EVENTS[currentState]
          return {
            success: false,
            error: `Cannot log ${event_type.replace('_', ' ')} when baby is in state: ${currentState.replace('_', ' ')}`,
            currentState,
            validEvents,
            hint: validEvents.length > 0
              ? `Valid events for this state: ${validEvents.join(', ')}`
              : 'No quick events available. Use the dialog to edit existing events.',
          }
        }
      }

      const { data, error } = await supabase
        .from('sleep_events')
        .insert({
          baby_id: babyId,
          event_type,
          event_time,
          end_time: event_type === 'night_wake' ? (end_time ?? null) : null,
          context: eventContext ?? null,
          notes: notes ?? null,
        })
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      let message = `Logged ${event_type.replace('_', ' ')} at ${formatTime(event_time, timezone)}`
      if (event_type === 'night_wake' && end_time) {
        message += ` - ${formatTime(end_time, timezone)}`
      }
      if (eventContext) {
        message += ` (${eventContext})`
      }

      return {
        success: true,
        event: data,
        message
      }
    },
  })
}
