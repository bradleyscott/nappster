import type { SupabaseClient } from '@supabase/supabase-js'
import type { Baby } from '@/types/database'

export interface CreateBabyInput {
  id?: string
  name: string
  birth_date: string
  sleep_training_method?: string | null
  pattern_notes?: string | null
}

export interface UpdateBabyInput {
  name?: string
  birth_date?: string
  sleep_training_method?: string | null
  pattern_notes?: string | null
}

export async function getBabyById(
  supabase: SupabaseClient,
  babyId: string
): Promise<{ data: Baby | null; error: Error | null }> {
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
      sleep_training_method: input.sleep_training_method ?? null,
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
  const { data, error } = await supabase
    .from('babies')
    .update({
      name: input.name,
      birth_date: input.birth_date,
      sleep_training_method: input.sleep_training_method,
      pattern_notes: input.pattern_notes,
    })
    .eq('id', babyId)
    .select()
    .single()

  return { data: data as Baby | null, error: error as Error | null }
}
