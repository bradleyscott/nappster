import { openai } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/sleep-utils";
import { getTodayBoundsForTimezone } from "@/lib/timezone";
import { Baby, SleepEvent } from "@/types/database";

const recommendationSchema = z.object({
  type: z
    .enum(["next_nap", "bedtime", "waiting"])
    .describe(
      "Type of recommendation: next_nap if recommending when the next nap should be, bedtime if recommending bedtime, waiting if a nap is in progress",
    ),
  timeWindow: z
    .string()
    .describe(
      'The recommended time window, e.g., "2:30 - 3:00pm" or "7:00 - 7:15pm" or "Nap in progress"',
    ),
  explanation: z
    .string()
    .describe(
      'Brief explanation of why this time is recommended, e.g., "3h wake window after last nap" or "Short naps today, earlier bedtime helps"',
    ),
});

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

    const systemPrompt = buildSystemPrompt(baby, events, recentHistory || [], undefined, timezone);

    // Determine what to ask for based on current state
    const lastEvent = events[events.length - 1];
    const isNapInProgress = lastEvent?.event_type === "nap_start";

    let userPrompt: string;

    if (isNapInProgress) {
      userPrompt =
        'A nap is currently in progress. Return type "waiting" with timeWindow "Nap in progress" and a brief reassuring message with guidance about when the nap should end to prevent interrupting todays bedtime schedule';
    } else if (lastEvent?.event_type === "bedtime") {
      userPrompt =
        'Bedtime has been logged. Return type "waiting" with timeWindow "Day complete" and a brief goodnight message. Give any final tips if relevant from the context';
    } else {
      const napCount = events.filter((e) => e.event_type === "nap_end").length;

      if (napCount >= 2) {
        userPrompt = `Based on today's events, calculate the ideal bedtime window.`;
      } else {
        userPrompt = `Based on today's and recent events please recommend today's nap and bedtime schedule.`;
      }
    }

    const result = streamObject({
      model: openai("gpt-5.2"),
      schema: recommendationSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in recommend API:", error);
    return new Response("Error generating recommendation", { status: 500 });
  }
}
