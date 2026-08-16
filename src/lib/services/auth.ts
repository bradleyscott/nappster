import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/error-reporting'

export class ServiceAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' = 'FORBIDDEN',
  ) {
    super(message)
    this.name = 'ServiceAuthError'
  }
}

/**
 * Defense-in-depth authorization check for service functions.
 *
 * Verifies that the authenticated user is a member of the given baby before
 * the service performs any data operation. This protects against callers that
 * bypass or forget to call requireBabyAccess(), and against future reuse of
 * services in contexts where RLS may be disabled (e.g., service-role clients).
 *
 * Uses a dedicated RPC so tests can mock the authorization response separately
 * from the query response.
 */
export async function assertBabyAccess(
  supabase: SupabaseClient,
  babyId: string,
): Promise<void> {
  const { data: hasAccess, error } = await supabase.rpc('check_baby_access', {
    p_baby_id: babyId,
  })

  if (error) {
    logError('services/auth', 'Error checking baby access:', error)
    throw new ServiceAuthError('Failed to verify baby access', 'FORBIDDEN')
  }

  if (!hasAccess) {
    throw new ServiceAuthError('Not authorized to access this baby', 'FORBIDDEN')
  }
}
