import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { streamText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { createClient } from '@/lib/supabase/server'
import { buildPlanGenerationContext } from '@/lib/ai/build-plan-context'
import { createPlanGenerationTools } from '@/lib/ai/tools'
import { getActiveSleepPlan } from '@/lib/services/sleep-plans'
import {
  acquirePlanGenerationLock,
  releasePlanGenerationLock,
  isPlanGenerationCooldownActive,
} from '@/lib/services/babies'
import {
  requireBabyAccess,
  apiError,
  apiValidationError,
  authErrorResponse,
} from '@/lib/api'
import { validateEnv } from '@/lib/env'

const requestSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().optional(),
})

const MAX_TOOL_STEPS = 4

/**
 * POST /api/sleep-plan/generate
 *
 * Generates (or regenerates) today's sleep plan in the background.
 *
 * - Returns the existing active plan if its events_hash already matches today's
 *   events (idempotent no-op).
 * - Otherwise calls the AI with a synthetic prompt, lets it invoke updateSleepPlan,
 *   and returns the freshly persisted plan.
 */
export async function POST(req: NextRequest) {
  try {
    validateEnv()

    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten())
    }

    const { babyId, timezone: timezoneInput } = parsed.data
    const supabase = await createClient()

    const auth = await requireBabyAccess(supabase, babyId)
    if (!auth.success) {
      return authErrorResponse(auth)
    }

    const { systemPrompt, toolContext, todayEvents, eventsHash } =
      await buildPlanGenerationContext(supabase, babyId, timezoneInput)

    const timezone = toolContext.timezone
    const planDate = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd')

    // Idempotency: if an active plan already exists for today's events hash,
    // there is nothing to do.
    const { data: activePlan, error: activePlanError } = await getActiveSleepPlan(
      supabase,
      babyId,
      planDate
    )

    if (activePlan && activePlan.events_hash === eventsHash) {
      return NextResponse.json({
        plan: activePlan,
        regenerated: false,
        reason: 'active_plan_matches_current_events',
      })
    }

    if (activePlanError) {
      console.error('Error fetching active plan for generation:', activePlanError)
    }

    // No events today and no active plan: there's nothing meaningful to schedule.
    if (todayEvents.length === 0 && !activePlan) {
      return NextResponse.json({
        plan: null,
        regenerated: false,
        reason: 'no_events_today',
      })
    }

    // Rate-limit: skip if we already generated a plan recently (unless events changed,
    // the hash check above would have caught that — this is a safety net).
    const { active: cooldownActive, error: cooldownError } =
      await isPlanGenerationCooldownActive(supabase, babyId, 60)
    if (cooldownError) {
      console.error('Error checking plan generation cooldown:', cooldownError)
    }
    if (cooldownActive) {
      return NextResponse.json({
        plan: activePlan ?? null,
        regenerated: false,
        reason: 'cooldown_active',
      })
    }

    // Acquire a short-lived lock so concurrent requests don't both call OpenAI.
    const { acquired, error: lockError } = await acquirePlanGenerationLock(supabase, babyId, 120)
    if (lockError) {
      console.error('Error acquiring plan generation lock:', lockError)
    }
    if (!acquired) {
      return NextResponse.json({
        plan: activePlan ?? null,
        regenerated: false,
        reason: 'generation_in_progress',
      })
    }

    try {
      const result = streamText({
      model: openai('gpt-5.2'),
      system: `${systemPrompt}\n\n## Task\nGenerate today's sleep plan and call the updateSleepPlan tool. Do not ask clarifying questions — use the provided context to produce the best schedule.`,
      messages: [
        {
          role: 'user',
          content:
            "Please generate today's sleep schedule (naps and bedtime) based on the baby's profile, recent trends, and today's events so far. Call updateSleepPlan when ready.",
        },
      ],
      tools: createPlanGenerationTools(toolContext),
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
        },
      },
    })

    // Consume the stream so tool executions (including updateSleepPlan) complete.
    // We don't stream the response back to the client; we just need the plan saved.
    await result.consumeStream()

    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    const updatePlanCall = toolCalls.find((c) => c.toolName === 'updateSleepPlan')
    const updatePlanResult = updatePlanCall
      ? toolResults.find((r) => r.toolCallId === updatePlanCall.toolCallId)
      : undefined

    // Re-fetch the active plan for today. The updateSleepPlan tool deactivates
    // previous plans and inserts a new active row, so the most recent active plan
    // is the one we just generated.
    const { data: generatedPlan, error: generatedPlanError } = await getActiveSleepPlan(
      supabase,
      babyId,
      planDate
    )

    if (generatedPlanError || !generatedPlan) {
      console.error('Error fetching generated plan:', generatedPlanError)
      return apiError('Plan generation completed but the saved plan could not be retrieved', 500)
    }

    if (!updatePlanCall) {
      // The model didn't call updateSleepPlan. Return the existing active plan
      // (which may be stale) so the client can fall back to trends.
      return NextResponse.json({
        plan: generatedPlan,
        regenerated: false,
        reason: 'model_did_not_update_plan',
      })
    }

    const resultOutput =
      updatePlanResult && 'output' in updatePlanResult
        ? (updatePlanResult.output as { persisted?: boolean; success?: boolean; error?: string })
        : undefined

      if (resultOutput && !resultOutput.persisted && !resultOutput.success) {
        console.error('updateSleepPlan tool failed during background generation:', resultOutput.error)
        return apiError(
          `Plan generation failed: ${resultOutput.error ?? 'updateSleepPlan did not persist'}`,
          500
        )
      }

      return NextResponse.json({
        plan: generatedPlan,
        regenerated: true,
      })
    } finally {
      // Always release the lock and record the generation timestamp.
      const { error: releaseError } = await releasePlanGenerationLock(supabase, babyId)
      if (releaseError) {
        console.error('Error releasing plan generation lock:', releaseError)
      }
    }
  } catch (error) {
    console.error('Error in sleep-plan generate API:', error)
    return apiError('Error generating sleep plan', 500)
  }
}
