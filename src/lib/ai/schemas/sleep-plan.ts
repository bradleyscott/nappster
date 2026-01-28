import { z } from 'zod'
import { CURRENT_STATE_VALUES } from '@/types/database'

/**
 * Schema for individual schedule items in a sleep plan.
 */
export const scheduleItemSchema = z.object({
  type: z.enum(['nap', 'bedtime']).describe('Type of sleep event'),
  label: z.string().describe('Display label, e.g., "Nap 1", "Nap 2", "Bedtime"'),
  timeWindow: z
    .string()
    .describe(
      'Actual time of event or recommended time window (if in the future), e.g., "9:30 - 10:00am" or "7:00 - 7:30pm"'
    ),
  status: z
    .enum(['completed', 'in_progress', 'upcoming', 'skipped'])
    .describe('Whether this item is completed, in progress, upcoming, or should be skipped'),
  notes: z
    .string()
    .describe('Notes describing the rationale for this timing of this schedule item and any special instructions'),
})

/**
 * Main sleep plan schema used for AI-generated sleep schedules.
 */
export const sleepPlanSchema = z.object({
  currentState: z.enum(CURRENT_STATE_VALUES).describe("Current state of the baby's day"),
  nextAction: z.object({
    label: z.string().describe('What should happen next, e.g., "Nap 1", "Bedtime", "Wake up"'),
    timeWindow: z
      .string()
      .describe('When it should happen e.g., "9:30 - 10:00am" or "Nap in progress and should end 2:45pm"'),
    isUrgent: z.boolean().describe('True if the recommended time is within 30 minutes'),
  }),
  schedule: z.array(scheduleItemSchema).describe('Full schedule of naps and bedtime for today'),
  targetBedtime: z
    .string()
    .describe('Target bedtime window, e.g., "7:00 - 7:30pm". Or actual bedtime start if already asleep'),
  summary: z.string().describe("Brief paragraph summarising the day's plan"),
})

export type SleepPlan = z.infer<typeof sleepPlanSchema>
export type ScheduleItem = z.infer<typeof scheduleItemSchema>
