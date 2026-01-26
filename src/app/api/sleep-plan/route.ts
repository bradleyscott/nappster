import { openai } from "@ai-sdk/openai";
import { streamText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createReadOnlyTools } from "@/lib/ai/tools";
import { formatTime } from "@/lib/sleep-utils";
import { CURRENT_STATE_VALUES } from "@/types/database";

// Schema for individual schedule items
const scheduleItemSchema = z.object({
  type: z.enum(["nap", "bedtime"]).describe("Type of sleep event"),
  label: z
    .string()
    .describe('Display label, e.g., "Nap 1", "Nap 2", "Bedtime"'),
  timeWindow: z
    .string()
    .describe(
      'Recommended time window, e.g., "9:30 - 10:00am" or "7:00 - 7:30pm"',
    ),
  status: z
    .enum(["completed", "in_progress", "upcoming", "skipped"])
    .describe(
      "Whether this item is completed, in progress, upcoming, or should be skipped",
    ),
  notes: z
    .string()
    .describe(
      "Notes describing the rationale for this timing of this schedule item and any special instructions",
    ),
});

// Main sleep plan schema
const sleepPlanSchema = z.object({
  currentState: z
    .enum(CURRENT_STATE_VALUES)
    .describe("Current state of the baby's day"),
  nextAction: z.object({
    label: z
      .string()
      .describe('What should happen next, e.g., "Nap 1", "Bedtime", "Wake up"'),
    timeWindow: z
      .string()
      .describe(
        'When it should happen, e.g., "9:30 - 10:00am" or "Nap in progress"',
      ),
    isUrgent: z
      .boolean()
      .describe("True if the recommended time is within 30 minutes"),
  }),
  schedule: z
    .array(scheduleItemSchema)
    .describe("Full schedule of naps and bedtime for today"),
  targetBedtime: z
    .string()
    .describe('Target bedtime window, e.g., "7:00 - 7:30pm"'),
  summary: z.string().describe("Brief paragraph summarising the day's plan"),
});

export type SleepPlan = z.infer<typeof sleepPlanSchema>;
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;

/**
 * Build a system prompt that instructs the AI to use tools before generating the plan.
 */
function buildToolBasedSystemPrompt(timezone: string): string {
  return `You are an expert baby sleep consultant. Your task is to create a detailed sleep plan for today.

## IMPORTANT: Tool Usage Required

Before generating the sleep plan, you MUST call these tools to get context:
1. **getBabyProfile** - Call this FIRST to learn the baby's name, age, and known patterns
2. **getTodayEvents** - Call this to see what has happened today

Optionally, you may also call:
- **getSleepHistory** - Get up to 30 days of history for trend analysis (7 days by default)

After gathering the data, generate a complete sleep plan for the day.

## Guidelines for the Sleep Plan
- Base wake window recommendations on the baby's age
- Use 12-hour format for all times (e.g., "9:30am", "7:15pm")
- Try to keep suggested time windows within 30 minutes, but ideally within 15 minutes
- If it's too late for a scheduled nap mark that nap as "skipped"

Current time: ${new Date().toISOString()}
User timezone: ${timezone}
Local time for user: ${formatTime(new Date(), timezone)}
`;
}

export async function POST(req: Request) {
  try {
    const { babyId, timezone = "UTC" } = (await req.json()) as {
      babyId: string;
      timezone?: string;
    };

    const supabase = await createClient();

    // Create tool context - no upfront data fetching, AI will use tools
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildToolBasedSystemPrompt(timezone);

    const result = streamText({
      model: openai("gpt-5.2"),
      output: Output.object({ schema: sleepPlanSchema }),
      system: systemPrompt,
      prompt:
        "Please gather the baby's profile and today's events, then create a complete sleep plan for today.",
      tools: createReadOnlyTools(toolContext),
      stopWhen: stepCountIs(4), // Allow tool calls before generating structured output
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in sleep-plan API:", error);
    return new Response("Error generating sleep plan", { status: 500 });
  }
}
