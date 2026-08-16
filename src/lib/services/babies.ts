import type { SupabaseClient } from '@supabase/supabase-js'
import type { Baby } from '@/types/database'
import { assertBabyAccess } from './auth'

export interface CreateBabyInput {
  id?: string
  name: string
  birth_date: string
  pattern_notes?: string | null
}

export interface UpdateBabyInput {
  name?: string
  birth_date?: string
  pattern_notes?: string | null
}

export async function getBabyById(
  supabase: SupabaseClient,
  babyId: string
): Promise<{ data: Baby | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('babies')
    .select('*')
    .eq('id', babyId)
    .single()

  return { data: data as Baby | null, error: error as Error | null }
}

export async function createBaby(
  supabase: SupabaseClient,
  input: CreateBabyInput
): Promise<{ data: Baby | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('babies')
    .insert({
      id: input.id,
      name: input.name,
      birth_date: input.birth_date,
      pattern_notes: input.pattern_notes ?? null,
    })
    .select()
    .single()

  return { data: data as Baby | null, error: error as Error | null }
}

export async function updateBaby(
  supabase: SupabaseClient,
  babyId: string,
  input: UpdateBabyInput
): Promise<{ data: Baby | null; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('babies')
    .update({
      name: input.name,
      birth_date: input.birth_date,
      pattern_notes: input.pattern_notes,
    })
    .eq('id', babyId)
    .select()
    .single()

  return { data: data as Baby | null, error: error as Error | null }
}

/**
 * Atomically acquire a short-lived lock for background plan generation.
 * Returns true if this caller acquired the lock, false if another process
 * already holds it.
 */
export async function acquirePlanGenerationLock(
  supabase: SupabaseClient,
  babyId: string,
  ttlSeconds = 120
): Promise<{ acquired: boolean; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const now = new Date()
  const lockUntil = new Date(now.getTime() + ttlSeconds * 1000).toISOString()
  const nowIso = now.toISOString()

  const { data, error } = await supabase
    .from('babies')
    .update({ plan_generation_locked_until: lockUntil })
    .eq('id', babyId)
    .or(`plan_generation_locked_until.is.null,plan_generation_locked_until.lt.${nowIso}`)
    .select('id')
    .single()

  if (error) {
    return { acquired: false, error: error as Error }
  }

  return { acquired: !!data, error: null }
}

/**
 * Release the plan generation lock and record when generation finished.
 */
export async function releasePlanGenerationLock(
  supabase: SupabaseClient,
  babyId: string
): Promise<{ error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { error } = await supabase
    .from('babies')
    .update({
      plan_generation_locked_until: null,
      last_plan_generated_at: new Date().toISOString(),
    })
    .eq('id', babyId)

  return { error: error as Error | null }
}

/**
 * Check whether we are still within the cooldown window since the last
 * successful background plan generation.
 */
export async function isPlanGenerationCooldownActive(
  supabase: SupabaseClient,
  babyId: string,
  cooldownSeconds = 60
): Promise<{ active: boolean; error: Error | null }> {
  await assertBabyAccess(supabase, babyId)

  const { data, error } = await supabase
    .from('babies')
    .select('last_plan_generated_at')
    .eq('id', babyId)
    .single()

  if (error) {
    return { active: false, error: error as Error }
  }

  if (!data?.last_plan_generated_at) {
    return { active: false, error: null }
  }

  const lastGenerated = new Date(data.last_plan_generated_at).getTime()
  const cooldownEnds = lastGenerated + cooldownSeconds * 1000
  return { active: Date.now() < cooldownEnds, error: null }
}
