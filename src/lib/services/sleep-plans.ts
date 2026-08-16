import type { SupabaseClient } from '@supabase/supabase-js'
import type { SleepPlanRow } from '@/types/database'
import { assertBabyAccess } from './auth'

export interface CreateSleepPlanInput {
  baby_id: string
  current_state: string
  plan_date: string
  schedule: unknown
  next_action?: Record<string, unknown> | null
  target_bedtime?: string | null
  summary?: string | null
  events_hash?: string | null
  is_active?: boolean
  created_by?: string | null
}

export async function getActiveSleepPlan(
  supabase: SupabaseClient,
  babyId: string,
  planDate?: string
): Promise<{ data: SleepPlanRow | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  let query = supabase
    .from('sleep_plans')
    .select('*')
    .eq('baby_id', babyId)
    .eq('is_active', true)

  if (planDate) {
    query = query.eq('plan_date', planDate)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return { data: data as SleepPlanRow | null, error: error as Error | null }
}

export async function createSleepPlan(
  supabase: SupabaseClient,
  input: CreateSleepPlanInput
): Promise<{ data: SleepPlanRow | null; error: Error | null }> {
  await assertBabyAccess(supabase, input.baby_id)

  const { data, error } = await supabase
    .from('sleep_plans')
    .insert({
      baby_id: input.baby_id,
      current_state: input.current_state,
      plan_date: input.plan_date,
      schedule: input.schedule,
      next_action: input.next_action ?? null,
      target_bedtime: input.target_bedtime ?? null,
      summary: input.summary ?? null,
      events_hash: input.events_hash ?? null,
      is_active: input.is_active ?? true,
      created_by: input.created_by ?? null,
    })
    .select()
    .single()

  return { data: data as SleepPlanRow | null, error: error as Error | null }
}

export async function getRecentSleepPlans(
  supabase: SupabaseClient,
  babyId: string,
  limit: number
): Promise<{ data: SleepPlanRow[] | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('sleep_plans')
    .select('*')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data: data as SleepPlanRow[] | null, error: error as Error | null }
}

export async function getSleepPlansSinceCreatedAt(
  supabase: SupabaseClient,
  babyId: string,
  from: string
): Promise<{ data: SleepPlanRow[] | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('sleep_plans')
    .select('*')
    .eq('baby_id', babyId)
    .gte('created_at', from)
    .order('created_at', { ascending: true })
    .limit(50)

  return { data: data as SleepPlanRow[] | null, error: error as Error | null }
}

export async function getSleepPlansByCreatedAtRange(
  supabase: SupabaseClient,
  babyId: string,
  from: string,
  to: string
): Promise<{ data: SleepPlanRow[] | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('sleep_plans')
    .select('*')
    .eq('baby_id', babyId)
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: true })

  return { data: data as SleepPlanRow[] | null, error: error as Error | null }
}

export async function deactivatePreviousSleepPlans(
  supabase: SupabaseClient,
  babyId: string,
  planDate: string
): Promise<{ error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { error } = await supabase
    .from('sleep_plans')
    .update({ is_active: false })
    .eq('baby_id', babyId)
    .eq('plan_date', planDate)

  return { error: error as Error | null }
}
