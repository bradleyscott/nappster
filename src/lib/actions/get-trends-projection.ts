'use server'

import { createClient } from '@/lib/supabase/server'
import { getSleepEvents } from '@/lib/services/sleep-events'
import { getStartOfDaysAgoForTimezone } from '@/lib/timezone'
import {
  projectExpectedSchedule,
  buildDayRows,
  computeExpectedDays,
} from '@/lib/sleep-chart-blocks'
import type { SleepEvent } from '@/types/database'

export interface TrendsProjection {
  trendsNextNapHours: number[]
  trendsBedtimeHour: number | null
  trendsWakeHour: number | null
}

/**
 * Server action: fetch 30 days of sleep events and derive the trends-based
 * "typical day" projection used by the dashboard hero as a FALLBACK countdown
 * target when the AI sleep plan is stale or absent.
 *
 * This is the same computation that was previously done during SSR in page.tsx,
 * moved here so the heavy 500-event DB query + synchronous aggregation does not
 * block the initial HTML response.
 */
export async function getTrendsProjection(
  babyId: string,
  timezone: string
): Promise<TrendsProjection> {
  const supabase = await createClient()

  const trendsSince = getStartOfDaysAgoForTimezone(timezone, 30)
  const { data: trendsEvents } = await getSleepEvents(supabase, {
    babyId,
    from: trendsSince,
    order: { column: 'event_time', ascending: true },
    limit: 500,
  })

  const events = (trendsEvents ?? []) as SleepEvent[]

  // Compute typical nap hours and bedtime from median-day projection
  const trendsProjection = projectExpectedSchedule(events, timezone, 14)
  const trendsNextNapHours = trendsProjection.napStartHours
  const trendsBedtimeHour = trendsProjection.bedtimeHour

  // Derive a trends-based expected wake hour, choosing the daycare or home
  // typical day based on whether today's logged events include a daycare context.
  const trendsRows = buildDayRows(events, timezone, 30)
  const expectedDays = computeExpectedDays(trendsRows)
  const todayStart = getStartOfDaysAgoForTimezone(timezone, 0)
  const todayHasDaycare = events.some(
    (e) => e.event_time >= todayStart && e.context === 'daycare'
  )
  const wakeBlock = (
    todayHasDaycare ? expectedDays.daycare : expectedDays.home
  )?.blocks.find((b) => b.type === 'wake')
  const trendsWakeHour = wakeBlock ? wakeBlock.endHour : null

  return { trendsNextNapHours, trendsBedtimeHour, trendsWakeHour }
}
