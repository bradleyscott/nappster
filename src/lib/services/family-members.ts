import type { SupabaseClient } from '@supabase/supabase-js'
import type { FamilyMember, FamilyMemberWithIdentity } from '@/types/database'

export interface CreateFamilyMemberInput {
  id?: string
  user_id: string
  baby_id: string
  role: string
}

export async function getFamilyMembersForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: FamilyMember[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId)

  return { data: data as FamilyMember[] | null, error: error as Error | null }
}

export async function checkBabyAccess(
  supabase: SupabaseClient,
  babyId: string,
  userId: string
): Promise<{ data: Pick<FamilyMember, 'id'> | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id')
    .eq('baby_id', babyId)
    .eq('user_id', userId)
    .single()

  return { data: data as Pick<FamilyMember, 'id'> | null, error: error as Error | null }
}

export async function getFamilyMembersForBaby(
  supabase: SupabaseClient,
  babyId: string
): Promise<{ data: FamilyMember[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('baby_id', babyId)

  return { data: data as FamilyMember[] | null, error: error as Error | null }
}

/**
 * Fetch all family members for a baby, enriched with email + is_you via the
 * get_family_members_for_baby SQL function. Uses SECURITY DEFINER server-side
 * to bypass RLS so co-caregivers (rows the caller doesn't own) are visible.
 * Access is verified inside the function: only baby members see the list.
 */
export async function getFamilyMembersForBabyWithIdentity(
  supabase: SupabaseClient,
  babyId: string
): Promise<{ data: FamilyMemberWithIdentity[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_family_members_for_baby', {
    baby_id_arg: babyId,
  })

  return {
    data: data as FamilyMemberWithIdentity[] | null,
    error: error as Error | null,
  }
}

export async function createFamilyMember(
  supabase: SupabaseClient,
  input: CreateFamilyMemberInput
): Promise<{ data: FamilyMember | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('family_members')
    .insert({
      id: input.id,
      user_id: input.user_id,
      baby_id: input.baby_id,
      role: input.role,
    })
    .select()
    .single()

  return { data: data as FamilyMember | null, error: error as Error | null }
}

export async function redeemInviteCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ data: { success: boolean; error?: string; baby_id?: string } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('redeem_invite_code', {
    invite_code: code,
  })

  return { data: data as { success: boolean; error?: string; baby_id?: string } | null, error: error as Error | null }
}
