import { SupabaseClient, User } from '@supabase/supabase-js'
import { checkBabyAccess } from '@/lib/services/family-members'
import { logError } from '@/lib/error-reporting'

export type AuthResult =
  | { success: true; user: User }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INTERNAL_ERROR' }

/**
 * Verify that a user is authenticated and has access to a specific baby.
 * Checks both authentication status and family_members membership.
 */
export async function requireBabyAccess(
  supabase: SupabaseClient,
  babyId: string
): Promise<AuthResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' }
  }

  const { data: membership, error } = await checkBabyAccess(supabase, babyId, user.id)

  if (error) {
    // PGRST116 = no rows returned (not a member)
    if ((error as { code?: string }).code === 'PGRST116') {
      return { success: false, error: 'FORBIDDEN' }
    }
    // Other errors (network, multiple rows, etc.) should be logged
    logError('auth', 'Error checking membership:', error)
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  if (!membership) {
    return { success: false, error: 'FORBIDDEN' }
  }

  return { success: true, user }
}
