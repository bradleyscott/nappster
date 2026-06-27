import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiSuccess, validateRequest } from '@/lib/api'
import { redeemInviteCode } from '@/lib/services/family-members'

const redeemCodeSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const validation = validateRequest(body, redeemCodeSchema)
  if (!validation.valid) return validation.response

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await redeemInviteCode(supabase, validation.data.code)

  if (error) {
    console.error('Error redeeming invite code:', error)
    return apiError('Failed to redeem invite code', 500)
  }

  if (!data || !data.success) {
    return apiError(data?.error || 'Failed to redeem invite code', 400)
  }

  return apiSuccess({ babyId: data.baby_id })
}
