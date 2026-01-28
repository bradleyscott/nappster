import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const babyId = searchParams.get('babyId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const before = searchParams.get('before') // ISO timestamp for cursor-based pagination

    if (!babyId) {
      return NextResponse.json({ error: 'babyId required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get current user and verify they have access to this baby
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: familyMember } = await supabase
      .from('family_members')
      .select('id')
      .eq('baby_id', babyId)
      .eq('user_id', user.id)
      .single()

    if (!familyMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    if (before && cursor) {
      // Get sleep events between cursor (oldest fetched) and before (previous cursor)
      const { data: events } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', babyId)
        .gte('event_time', cursor)
        .lt('event_time', before)
        .order('event_time', { ascending: true })

      sleepEvents = events || []
    }

    return NextResponse.json({
      messages: formattedMessages,
      sleepEvents,
      // Cursor for loading more (earliest message's timestamp from the fetched batch)
      cursor,
      hasMore: (messages?.length || 0) === limit,
    })
  } catch (error) {
    console.error('Error in chat messages API:', error)
    return NextResponse.json({ error: 'Error fetching messages' }, { status: 500 })
  }
}
