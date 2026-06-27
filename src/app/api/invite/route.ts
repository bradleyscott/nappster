import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireBabyAccess, authErrorResponse, apiError, apiSuccess, validateRequest } from '@/lib/api'
import { createInviteCode } from '@/lib/services/invite-codes'

const generateCodeSchema = z.object({
  babyId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const validation = validateRequest(body, generateCodeSchema)
  if (!validation.valid) return validation.response

  const { babyId } = validation.data
  const supabase = await createClient()

  const auth = await requireBabyAccess(supabase, babyId)
  if (!auth.success) return authErrorResponse(auth)

  // Generate 6-digit numeric code
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // Set expiry to 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await createInviteCode(supabase, {
    baby_id: babyId,
    code,
    created_by: auth.user.id,
    expires_at: expiresAt,
  })

  if (error) {
    // Handle unique constraint violation (code collision — extremely rare)
    if ((error as { code?: string }).code === '23505') {
      const retryCode = String(Math.floor(100000 + Math.random() * 900000))
      const { data: retryData, error: retryError } = await createInviteCode(supabase, {
        baby_id: babyId,
        code: retryCode,
        created_by: auth.user.id,
        expires_at: expiresAt,
      })

      if (retryError || !retryData) return apiError('Failed to generate invite code', 500)
      return apiSuccess({ code: retryData.code, expiresAt: retryData.expires_at })
    }
    return apiError('Failed to generate invite code', 500)
  }

  if (!data) return apiError('Failed to generate invite code', 500)

  return apiSuccess({ code: data.code, expiresAt: data.expires_at })
}
