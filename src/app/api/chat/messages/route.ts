import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import {
  requireBabyAccess,
  apiError,
  apiSuccess,
  authErrorResponse,
} from '@/lib/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const babyId = searchParams.get('babyId')
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100)
    const before = searchParams.get('before') // ISO timestamp for cursor-based pagination

    if (!babyId || !UUID_RE.test(babyId)) {
      return apiError('Valid babyId (UUID) required', 400)
    }

    const supabase = await createClient()

    // Get current user and verify they have access to this baby
    const auth = await requireBabyAccess(supabase, babyId)
    if (!auth.success) {
      return authErrorResponse(auth)
    }

    // Build query - fetch in descending order, then reverse for chronological
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Support cursor-based pagination for loading older messages
    if (before) {
      query = query.lt('created_at', before)
    }

    const { data: messages, error } = await query

    if (error) {
      console.error('Error fetching chat messages:', error)
      return apiError('Failed to fetch messages', 500)
    }

    // Reverse to get chronological order (oldest first)
    const chronological = (messages || []).reverse()

    // Transform to Vercel AI SDK message format
    const formattedMessages = chronological.map(msg => ({
      id: msg.message_id,
      role: msg.role as 'user' | 'assistant',
      parts: msg.parts as Array<{ type: string; text?: string; [key: string]: unknown }>,
      createdAt: msg.created_at,
    }))

    // Calculate cursor for loading more
    const cursor = chronological.length > 0 ? chronological[0].created_at : null

    // Fetch sleep events that fall within this time range
    let sleepEvents: Array<{
      id: string
      baby_id: string
      event_type: string
      event_time: string
      context: string | null
      notes: string | null
      created_at: string
    }> = []

    // Fetch sleep plans that fall within this time range
    let sleepPlans: Array<{
      id: string
      baby_id: string
      current_state: string
      next_action: unknown
      schedule: unknown
      target_bedtime: string
      summary: string
      events_hash: string
      plan_date: string
      is_active: boolean
      created_by: string | null
      created_at: string
    }> = []

    if (before && cursor) {
      // Get sleep events logged between cursor (oldest fetched) and before (previous cursor)
      // Use created_at (when logged) not event_time (when occurred) to align with chat message pagination
      const { data: events, error: eventsError } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('created_at', cursor)
        .lt('created_at', before)
        .order('event_time', { ascending: true })

      if (eventsError) {
        console.error('Error fetching sleep events for history:', eventsError)
      }
      sleepEvents = events || []

      // Get sleep plans between cursor (oldest fetched) and before (previous cursor)
      const { data: plans, error: plansError } = await supabase
        .from('sleep_plans')
        .select('*')
        .eq('baby_id', babyId)
        .gte('created_at', cursor)
        .lt('created_at', before)
        .order('created_at', { ascending: true })

      if (plansError) {
        console.error('Error fetching sleep plans for history:', plansError)
      }
      sleepPlans = plans || []
    }

    return apiSuccess({
      messages: formattedMessages,
      sleepEvents,
      sleepPlans,
      // Cursor for loading more (earliest message's timestamp from the fetched batch)
      cursor,
      hasMore: (messages?.length || 0) === limit,
    })
  } catch (error) {
    console.error('Error in chat messages API:', error)
    return apiError('Error fetching messages', 500)
  }
}
