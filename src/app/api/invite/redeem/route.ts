import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiSuccess, validateRequest } from '@/lib/api'

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

  const { data, error } = await supabase.rpc('redeem_invite_code', {
    invite_code: validation.data.code,
  })

  if (error) {
    console.error('Error redeeming invite code:', error)
    return apiError('Failed to redeem invite code', 500)
  }

  const result = data as unknown as { success: boolean; error?: string; baby_id?: string }

  if (!result.success) {
    return apiError(result.error || 'Failed to redeem invite code', 400)
  }

  return apiSuccess({ babyId: result.baby_id })
}
