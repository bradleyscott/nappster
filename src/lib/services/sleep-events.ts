import type { SupabaseClient } from '@supabase/supabase-js'
import type { SleepEvent, EventType, Context } from '@/types/database'
import { getTodayBoundsForTimezone, getYesterdayBoundsForTimezone } from '@/lib/timezone'
import { assertBabyAccess } from './auth'

export type SleepEventContext = Context | string | null

export interface CreateSleepEventInput {
  baby_id: string
  event_type: EventType
  event_time: string
  end_time?: string | null
  context?: SleepEventContext
  notes?: string | null
}

export interface UpdateSleepEventInput {
  event_type?: EventType
  event_time?: string
  end_time?: string | null
  context?: SleepEventContext
  notes?: string | null
}

export interface SleepEventsFilter {
  babyId: string
  from?: string
  to?: string
  dateColumn?: 'event_time' | 'created_at'
  order?: { column: string; ascending?: boolean }
  limit?: number
}

export async function getSleepEvents(
  supabase: SupabaseClient,
  filter: SleepEventsFilter
): Promise<{ data: SleepEvent[] | null; error: Error | null }> {
  await assertBabyAccess(supabase, filter.babyId)

  let query = supabase
    .from('sleep_events')
    .select('*')
    .eq('baby_id', filter.babyId)

  const dateColumn = filter.dateColumn ?? 'event_time'
  if (filter.from) {
    query = query.gte(dateColumn, filter.from)
  }
  if (filter.to) {
    query = query.lt(dateColumn, filter.to)
  }
  if (filter.order) {
    query = query.order(filter.order.column, { ascending: filter.order.ascending ?? true })
  }
  if (filter.limit) {
    query = query.limit(filter.limit)
  }

  const { data, error } = await query
  return { data: data as SleepEvent[] | null, error: error as Error | null }
}

export async function getTodaySleepEvents(
  supabase: SupabaseClient,
  babyId: string,
  timezone: string
): Promise<{ data: SleepEvent[] | null; error: Error | null }> {
  const { start, end } = getTodayBoundsForTimezone(timezone)
  return getSleepEvents(supabase, {
    babyId,
    from: start,
    to: end,
    order: { column: 'event_time', ascending: true },
  })
}

export async function getRecentSleepEvents(
  supabase: SupabaseClient,
  babyId: string,
  timezone: string
): Promise<{ data: SleepEvent[] | null; error: Error | null }> {
  const { start: yesterdayStart } = getYesterdayBoundsForTimezone(timezone)
  return getSleepEvents(supabase, {
    babyId,
    from: yesterdayStart,
    order: { column: 'event_time', ascending: true },
  })
}

export async function getSleepEventsSince(
  supabase: SupabaseClient,
  babyId: string,
  startDate: string
): Promise<{ data: SleepEvent[] | null; error: Error | null }> {
  return getSleepEvents(supabase, {
    babyId,
    from: startDate,
    order: { column: 'event_time', ascending: true },
  })
}

export async function createSleepEvent(
  supabase: SupabaseClient,
  input: CreateSleepEventInput
): Promise<{ data: SleepEvent | null; error: Error | null }> {
  await assertBabyAccess(supabase, input.baby_id)

  const { data, error } = await supabase
    .from('sleep_events')
    .insert({
      baby_id: input.baby_id,
      event_type: input.event_type,
      event_time: input.event_time,
      end_time: input.end_time ?? null,
      context: input.context ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  return { data: data as SleepEvent | null, error: error as Error | null }
}

export async function updateSleepEvent(
  supabase: SupabaseClient,
  id: string,
  input: UpdateSleepEventInput
): Promise<{ data: SleepEvent | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('sleep_events')
    .update({
      event_type: input.event_type,
      event_time: input.event_time,
      end_time: input.end_time,
      context: input.context,
      notes: input.notes,
    })
    .eq('id', id)
    .select()
    .single()

  return { data: data as SleepEvent | null, error: error as Error | null }
}

export async function deleteSleepEvent(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('sleep_events').delete().eq('id', id)
  return { error: error as Error | null }
}
