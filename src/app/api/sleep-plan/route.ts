import { openai } from "@ai-sdk/openai";
import { streamText, Output, stepCountIs } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createReadOnlyTools } from "@/lib/ai/tools";
import { computeEventsHash } from "@/lib/sleep-utils";
import { sleepPlanSchema } from "@/lib/ai/schemas/sleep-plan";
import { buildSleepPlanSystemPrompt } from "@/lib/ai/prompts";
import {
  requireBabyAccess,
  apiError,
  apiValidationError,
  authErrorResponse,
} from "@/lib/api";

export type { SleepPlan, ScheduleItem } from "@/lib/ai/schemas/sleep-plan";

// Schema for sleep plan request validation
const sleepPlanRequestSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().default("UTC"),
});

export async function POST(req: Request) {
  try {
    const parseResult = sleepPlanRequestSchema.safeParse(await req.json());
    if (!parseResult.success) {
      return apiValidationError(parseResult.error.flatten());
    }

    const { babyId, timezone } = parseResult.data;

    const supabase = await createClient();

    // Verify user has access to this baby
    const auth = await requireBabyAccess(supabase, babyId);
    if (!auth.success) {
      return authErrorResponse(auth);
    }
    const user = auth.user;

    // Create tool context - no upfront data fetching, AI will use tools
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildSleepPlanSystemPrompt(timezone);

    const result = streamText({
      model: openai("gpt-5.2"),
      output: Output.object({ schema: sleepPlanSchema }),
      system: systemPrompt,
      prompt:
        "Please gather the baby's profile and today's events, then create a complete sleep plan for today.",
      tools: createReadOnlyTools(toolContext),
      stopWhen: stepCountIs(4), // Allow tool calls before generating structured output
    });

    // Persist the plan after streaming completes
    after(async () => {
      try {
        const plan = await result.output;
        if (!plan) return;

        const today = new Date().toISOString().split("T")[0];

        // Get today's events to compute hash
        const { data: events } = await supabase
          .from("sleep_events")
          .select("id, event_time, event_type")
          .eq("baby_id", babyId)
          .gte("event_time", `${today}T00:00:00`)
          .order("event_time", { ascending: true });

        const eventsHash = computeEventsHash(events || []);

        // Mark existing active plans as inactive
        await supabase
          .from("sleep_plans")
          .update({ is_active: false })
          .eq("baby_id", babyId)
          .eq("is_active", true);

        // Insert the new plan
        await supabase.from("sleep_plans").insert({
          baby_id: babyId,
          current_state: plan.currentState,
          next_action: plan.nextAction,
          schedule: plan.schedule,
          target_bedtime: plan.targetBedtime,
          summary: plan.summary,
          events_hash: eventsHash,
          plan_date: today,
          is_active: true,
          created_by: user?.id ?? null,
        });
      } catch (saveError) {
        console.error("Error persisting sleep plan:", saveError);
        // Don't throw - saving is best-effort, don't break the stream
      }
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in sleep-plan API:", error);
    return apiError("Error generating sleep plan", 500);
  }
}
