import { tool } from 'ai'
import { ToolContext } from './types'
import { computeEventsHash } from '@/lib/sleep-utils'
import { computeCurrentState } from '@/lib/state-machine'
import { sleepPlanSchema } from '@/lib/ai/schemas/sleep-plan'
import type { SleepEvent } from '@/types/database'

/**
 * Creates a tool that updates the displayed sleep plan and persists it to the database.
 * Use this when the AI recommends a different schedule than what's currently shown.
 */
export function createUpdateSleepPlanTool(context: ToolContext) {
  const { supabase, babyId } = context

  return tool({
    description: `Update the displayed sleep plan when recommending a different schedule than what the baby currently has.

Use this tool when:
- You recommend adjusting nap times or wake windows
- You suggest a different bedtime than currently planned
- You're creating a modified schedule based on how the day has gone
- The parent asks what the rest of the day should look like

The plan you provide will replace the currently displayed schedule in the app and be shared with all family members.
Use 12-hour format for all times (e.g., "9:30am", "7:15pm").
Set isUrgent to true if the next action should happen within 30 minutes.
Mark completed naps/events with status "completed", current activity as "in_progress", future items as "upcoming".`,
    inputSchema: sleepPlanSchema,
    execute: async (plan) => {
      try {
        const today = new Date().toISOString().split('T')[0]

        // Get today's events to compute hash and current state
        const { data: events } = await supabase
          .from('sleep_events')
          .select('*')
          .eq('baby_id', babyId)
          .gte('event_time', `${today}T00:00:00`)
          .order('event_time', { ascending: true })

        const eventsHash = computeEventsHash(events || [])
        // Compute state deterministically from events, don't trust LLM's value
        const currentState = computeCurrentState((events || []) as SleepEvent[])

        // Get current user for created_by field
        const { data: { user } } = await supabase.auth.getUser()

        // Mark existing active plans as inactive
        await supabase
          .from('sleep_plans')
          .update({ is_active: false })
          .eq('baby_id', babyId)
          .eq('is_active', true)

        // Insert the new plan
        const { data: savedPlan, error } = await supabase
          .from('sleep_plans')
          .insert({
            baby_id: babyId,
            current_state: currentState,
            next_action: plan.nextAction,
            schedule: plan.schedule,
            target_bedtime: plan.targetBedtime,
            summary: plan.summary,
            events_hash: eventsHash,
            plan_date: today,
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select()
          .single()

        if (error) {
          console.error('Error persisting sleep plan from chat:', error)
          // Return the plan anyway for UI update, even if persistence failed
          return {
            success: true,
            plan,
            persisted: false,
            message: `Updated schedule: ${plan.nextAction.label} at ${plan.nextAction.timeWindow}`,
          }
        }

        return {
          success: true,
          plan: savedPlan,
          persisted: true,
          message: `Updated schedule: ${plan.nextAction.label} at ${plan.nextAction.timeWindow}`,
        }
      } catch (err) {
        console.error('Error in updateSleepPlan tool:', err)
        // Return the plan for UI update even if persistence failed
        return {
          success: true,
          plan,
          persisted: false,
          message: `Updated schedule: ${plan.nextAction.label} at ${plan.nextAction.timeWindow}`,
        }
      }
    },
  })
}
