import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateInviteCodeInput {
  baby_id: string
  code: string
  created_by: string
  expires_at: string
}

export interface InviteCodeRow {
  id: string
  baby_id: string
  code: string
  created_by: string
  expires_at: string
  created_at: string
}

export async function createInviteCode(
  supabase: SupabaseClient,
  input: CreateInviteCodeInput
): Promise<{ data: InviteCodeRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('invite_codes')
    .insert({
      baby_id: input.baby_id,
      code: input.code,
      created_by: input.created_by,
      expires_at: input.expires_at,
    })
    .select()
    .single()

  return { data: data as InviteCodeRow | null, error: error as Error | null }
}
