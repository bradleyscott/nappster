import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, SleepEvent } from '@/types/database'
import {
  formatEventsContext,
  type ChatContext,
  type BabyProfileContext,
} from '@/lib/ai/format-context'
import { buildChatSystemPrompt } from '@/lib/ai/prompts'
import {
  getStartOfDaysAgoForTimezone,
  getTodayBoundsForTimezone,
  validateTimezone,
} from '@/lib/timezone'
import { computeSleepTrends, formatSleepTrends } from '@/lib/sleep-stats'
import { computeEventsHash, formatAge } from '@/lib/sleep-utils'
import { getSleepEventsSince } from '@/lib/services/sleep-events'
import { getBabyById } from '@/lib/services/babies'
import type { ToolContext } from '@/lib/ai/tools'
import { logError } from '@/lib/error-reporting'

export interface SleepHistoryContext {
  historyEvents: SleepEvent[]
  todayEvents: SleepEvent[]
  eventsHash: string
  sleepTrendsFormatted: string | null
}

export interface PlanGenerationContext extends SleepHistoryContext {
  chatContext: ChatContext
  systemPrompt: string
  toolContext: ToolContext
  babyProfile: BabyProfileContext
}

/**
 * Fetch up to 30 days of sleep history, extract today's events, compute the
 * events hash, and format sleep trends. Used by both the chat route and the
 * background plan generation route so both have the same authoritative view
 * of recent sleep data.
 */
export async function buildSleepHistoryContext(
  supabase: SupabaseClient<Database>,
  babyId: string,
  timezoneInput: string | undefined
): Promise<SleepHistoryContext> {
  const timezone = validateTimezone(timezoneInput ?? 'UTC')

  const startDate = getStartOfDaysAgoForTimezone(timezone, 30)
  const { data: historyEvents, error: historyError } = await getSleepEventsSince(
    supabase,
    babyId,
    startDate
  )

  if (historyError) {
    logError('build-plan-context', 'Error fetching sleep history:', historyError)
  }

  const { start: todayStart, end: todayEnd } = getTodayBoundsForTimezone(timezone)
  const todayEvents = (historyEvents ?? [])
    .filter((e) => e.event_time >= todayStart && e.event_time < todayEnd)
    .sort(
      (a, b) =>
        new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    ) as SleepEvent[]

  const eventsHash = computeEventsHash(todayEvents)

  let sleepTrendsFormatted: string | null = null
  if (historyEvents && historyEvents.length > 0) {
    const trends = computeSleepTrends(historyEvents as SleepEvent[], timezone)
    sleepTrendsFormatted = formatSleepTrends(trends)
  }

  return {
    historyEvents: (historyEvents ?? []) as SleepEvent[],
    todayEvents,
    eventsHash,
    sleepTrendsFormatted,
  }
}

/**
 * Build the full AI context needed to generate a fresh sleep plan for today.
 *
 * This deliberately mirrors the context assembly in `src/app/api/chat/route.ts`
 * so a background plan generation has the same information a user would see
 * when asking the assistant "what should the rest of today look like?".
 */
export async function buildPlanGenerationContext(
  supabase: SupabaseClient<Database>,
  babyId: string,
  timezoneInput: string | undefined
): Promise<PlanGenerationContext> {
  const timezone = validateTimezone(timezoneInput ?? 'UTC')

  const { data: baby, error: babyError } = await getBabyById(supabase, babyId)
  if (babyError || !baby) {
    throw new Error(
      `Failed to load baby profile: ${babyError?.message ?? 'not found'}`
    )
  }

  const babyProfile: BabyProfileContext = {
    name: baby.name,
    age: formatAge(baby.birth_date),
    birthDate: baby.birth_date,
    sleepTrainingMethod: null,
    patternNotes: baby.pattern_notes,
  }

  const historyContext = await buildSleepHistoryContext(supabase, babyId, timezone)

  const chatContext: ChatContext = {
    babyProfile,
    todayEvents: historyContext.todayEvents.length > 0
      ? formatEventsContext(historyContext.todayEvents, timezone).formattedEvents
      : undefined,
    currentState: historyContext.todayEvents.length > 0
      ? formatEventsContext(historyContext.todayEvents, timezone).currentState
      : 'awaiting_morning_wake',
    eventSummary: historyContext.todayEvents.length > 0
      ? formatEventsContext(historyContext.todayEvents, timezone).eventSummary
      : undefined,
    sleepTrends: historyContext.sleepTrendsFormatted,
  }

  const systemPrompt = buildChatSystemPrompt(timezone, chatContext)
  const toolContext: ToolContext = { supabase, babyId, timezone }

  return {
    ...historyContext,
    chatContext,
    systemPrompt,
    toolContext,
    babyProfile,
  }
}
