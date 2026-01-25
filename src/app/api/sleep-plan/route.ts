import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt, calculateAgeInMonths } from "@/lib/sleep-utils";
import { getTodayBoundsForTimezone } from "@/lib/timezone";
import { Baby, SleepEvent } from "@/types/database";

// Schema for individual schedule items
const scheduleItemSchema = z.object({
  type: z.enum(["nap", "bedtime"]).describe("Type of sleep event"),
  label: z.string().describe('Display label, e.g., "Nap 1", "Nap 2", "Bedtime"'),
  timeWindow: z
    .string()
    .describe('Recommended time window, e.g., "9:30 - 10:00am" or "7:00 - 7:30pm"'),
  status: z
    .enum(["completed", "in_progress", "upcoming", "skipped"])
    .describe("Whether this item is completed, in progress, upcoming, or should be skipped"),
  notes: z
    .string()
    .describe("Notes about this schedule item, or empty string if none"),
});

// Main sleep plan schema
const sleepPlanSchema = z.object({
  currentState: z
    .enum([
      "not_awake_yet",
      "awake",
      "nap_in_progress",
      "day_complete",
      "overnight",
    ])
    .describe("Current state of the baby's day"),
  nextAction: z.object({
    label: z
      .string()
      .describe('What should happen next, e.g., "Nap 1", "Bedtime", "Wake up"'),
    timeWindow: z
      .string()
      .describe('When it should happen, e.g., "9:30 - 10:00am" or "Nap in progress"'),
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
  summary: z
    .string()
    .describe(
      "Brief 1-2 sentence summary of the day's plan, including total expected naps"
    ),
});

export type SleepPlan = z.infer<typeof sleepPlanSchema>;
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;

export async function POST(req: Request) {
  try {
    const {
      events,
      baby,
      babyId,
      timezone = "UTC",
    } = (await req.json()) as {
      babyId: string;
      events: SleepEvent[];
      baby: Baby;
      timezone?: string;
    };

    // Fetch recent history (last 7 days before today) for context
    const supabase = await createClient();
    const { start: todayStart } = getTodayBoundsForTimezone(timezone);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentHistory } = await supabase
      .from("sleep_events")
      .select("*")
      .eq("baby_id", babyId)
      .gte("event_time", weekAgo.toISOString())
      .lt("event_time", todayStart)
      .order("event_time", { ascending: false })
      .limit(50);

    const systemPrompt = buildSystemPrompt(baby, events, recentHistory || []);

    // Calculate baby's age for nap count guidance
    const ageMonths = calculateAgeInMonths(baby.birth_date);

    // Determine expected nap count based on age
    let expectedNaps: string;
    if (ageMonths < 4) {
      expectedNaps = "4-5 naps (newborn schedule)";
    } else if (ageMonths < 6) {
      expectedNaps = "3-4 naps";
    } else if (ageMonths < 9) {
      expectedNaps = "2-3 naps";
    } else if (ageMonths < 15) {
      expectedNaps = "2 naps";
    } else if (ageMonths < 18) {
      expectedNaps = "1-2 naps (may be transitioning)";
    } else {
      expectedNaps = "1 nap";
    }

    // Build prompt based on current state
    const lastEvent = events[events.length - 1];
    const isNapInProgress = lastEvent?.event_type === "nap_start";
    const hasWake = events.some((e) => e.event_type === "wake");
    const napCount = events.filter((e) => e.event_type === "nap_end").length;

    let userPrompt = `Create a sleep plan for today. Age-appropriate nap count: ${expectedNaps}.

Guidelines:
- Use 12-hour format for all times (e.g., "9:30am", "7:15pm")
- Time windows should be 15-30 minutes wide
- Mark completed naps as "completed", current nap as "in_progress"
- If it's too late for more naps, mark remaining as "skipped"
- Set isUrgent=true if the next action should happen within 30 minutes
`;

    if (!hasWake) {
      userPrompt += `
Current state: Baby hasn't woken for the day yet.
Set currentState to "not_awake_yet" and nextAction to waiting for wake.`;
    } else if (lastEvent?.event_type === "bedtime") {
      userPrompt += `
Current state: Bedtime has been logged - day is complete.
Set currentState to "day_complete" and nextAction to indicate the day is done.`;
    } else if (isNapInProgress) {
      userPrompt += `
Current state: A nap is in progress.
Set currentState to "nap_in_progress" and nextAction to when the nap should end.`;
    } else {
      userPrompt += `
Current state: Baby is awake. ${napCount} nap(s) completed today.
Set currentState to "awake" and recommend the next nap or bedtime based on wake windows.`;
    }

    const result = streamObject({
      model: openai("gpt-5.2"),
      schema: sleepPlanSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in sleep-plan API:", error);
    return new Response("Error generating sleep plan", { status: 500 });
  }
}
