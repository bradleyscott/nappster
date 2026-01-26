import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { CURRENT_STATE_VALUES } from '@/types/database'

const scheduleItemSchema = z.object({
  type: z.enum(['nap', 'bedtime']),
  label: z.string().describe('Display label (e.g., "Nap 1", "Bedtime")'),
  timeWindow: z.string().describe('Time range in 12-hour format (e.g., "9:30 - 10:00am")'),
  status: z.enum(['completed', 'in_progress', 'upcoming', 'skipped']),
  notes: z.string().describe('Brief rationale for this timing'),
})

const sleepPlanSchema = z.object({
  currentState: z.enum(CURRENT_STATE_VALUES)
    .describe("Current state of the baby's day"),
  nextAction: z.object({
    label: z.string().describe('What should happen next (e.g., "Nap 1", "Bedtime")'),
    timeWindow: z.string().describe('When it should happen (e.g., "9:30 - 10:00am")'),
    isUrgent: z.boolean().describe('True if within 30 minutes'),
  }),
  schedule: z.array(scheduleItemSchema).describe('Full schedule for the rest of the day'),
  targetBedtime: z.string().describe('Target bedtime (e.g., "7:00 - 7:30pm")'),
  summary: z.string().describe('Brief summary of the recommended plan'),
})

/**
 * Creates a tool that updates the displayed sleep plan.
 * Use this when the AI recommends a different schedule than what's currently shown.
 */
export function createUpdateSleepPlanTool(context: ToolContext) {
  // context is available but not needed for this tool since it doesn't access the database
  void context

  return tool({
    description: `Update the displayed sleep plan when recommending a different schedule than what the baby currently has.

Use this tool when:
- You recommend adjusting nap times or wake windows
- You suggest a different bedtime than currently planned
- You're creating a modified schedule based on how the day has gone
- The parent asks what the rest of the day should look like

The plan you provide will replace the currently displayed schedule in the app.
Use 12-hour format for all times (e.g., "9:30am", "7:15pm").
Set isUrgent to true if the next action should happen within 30 minutes.
Mark completed naps/events with status "completed", current activity as "in_progress", future items as "upcoming".`,
    inputSchema: sleepPlanSchema,
    execute: async (plan) => {
      return {
        success: true,
        plan,
        message: `Updated schedule: ${plan.nextAction.label} at ${plan.nextAction.timeWindow}`,
      }
    },
  })
}
