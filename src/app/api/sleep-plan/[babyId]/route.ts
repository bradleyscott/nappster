import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { computeEventsHash } from '@/lib/sleep-utils'
import { SleepPlanRow } from '@/types/database'
import { CURRENT_STATE_VALUES } from '@/types/database'
import { sleepPlanSchema } from '@/lib/ai/schemas/sleep-plan'
import { requireBabyAccess, authErrorResponse, apiError } from '@/lib/api'
import { getActiveSleepPlan } from '@/lib/services/sleep-plans'
import { getTodaySleepEvents } from '@/lib/services/sleep-events'

// Schemas for validating JSON fields from database
const nextActionSchema = sleepPlanSchema.shape.nextAction
const scheduleSchema = sleepPlanSchema.shape.schedule
const currentStateSchema = z.enum(CURRENT_STATE_VALUES)

type RouteParams = Promise<{ babyId: string }>

/**
 * Convert database row to client-friendly camelCase format.
 * Uses Zod validation for JSON fields to ensure type safety.
 */
function rowToClientPlan(row: SleepPlanRow) {
  const currentState = currentStateSchema.parse(row.current_state)
  const nextAction = nextActionSchema.parse(row.next_action)
  const schedule = scheduleSchema.parse(row.schedule)

  return {
    currentState,
    nextAction,
    schedule,
    targetBedtime: row.target_bedtime,
    summary: row.summary,
    eventsHash: row.events_hash,
  }
}

/**
 * GET /api/sleep-plan/[babyId]
 *
 * Fetches the current active sleep plan for a baby.
 * Returns the plan along with staleness information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { babyId } = await params
    const supabase = await createClient()

    // Verify user has access to this baby
    const auth = await requireBabyAccess(supabase, babyId)
    if (!auth.success) {
      return authErrorResponse(auth)
    }

    // Get today's date in UTC for plan_date filtering
    const today = new Date().toISOString().split('T')[0]

    // Fetch the active plan for this baby (most recent for today)
    const { data: planRow, error: planError } = await getActiveSleepPlan(supabase, babyId, today)

    if (planError && (planError as { code?: string }).code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error('Error fetching sleep plan:', planError)
      return NextResponse.json(
        { error: 'Failed to fetch sleep plan' },
        { status: 500 }
      )
    }

    // Compute current events hash for staleness check
    const { data: events, error: eventsError } = await getTodaySleepEvents(supabase, babyId, 'UTC')

    if (eventsError) {
      console.error('Error fetching events for hash:', eventsError)
      return apiError('Failed to compute events hash', 500)
    }

    const currentEventsHash = computeEventsHash(events || [])

    if (!planRow) {
      return NextResponse.json({
        plan: null,
        stale: true,
        eventsHash: currentEventsHash,
      })
    }

    const clientPlan = rowToClientPlan(planRow)
    const isStale = planRow.events_hash !== currentEventsHash

    return NextResponse.json({
      plan: clientPlan,
      stale: isStale,
      eventsHash: currentEventsHash,
    })
  } catch (error) {
    console.error('Error in GET /api/sleep-plan/[babyId]:', error)
    return apiError('Internal server error', 500)
  }
}
