import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatContent } from '@/components/chat-content'

export default async function ChatPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get user's baby
  const { data: familyMembers } = await supabase
    .from('family_members')
    .select('baby_id')
    .eq('user_id', user.id)

  if (!familyMembers || familyMembers.length === 0) {
    redirect('/onboarding')
  }

  const babyId = (familyMembers[0] as { baby_id: string }).baby_id

  const { data: baby } = await supabase
    .from('babies')
    .select('*')
    .eq('id', babyId)
    .single()

  if (!baby) {
    redirect('/onboarding')
  }

  // Fetch initial chat messages (most recent 50)
  const { data: chatMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch sleep events that fall within the chat message time range
  // Only filter by time if we have messages, otherwise get recent events
  let sleepEventsQuery = supabase
    .from('sleep_events')
    .select('*')
    .eq('baby_id', babyId)
    .order('event_time', { ascending: true })

  if (chatMessages && chatMessages.length > 0) {
    sleepEventsQuery = sleepEventsQuery.gte(
      'event_time',
      chatMessages[chatMessages.length - 1].created_at
    )
  } else {
    // No messages, limit to most recent 50 events
    sleepEventsQuery = sleepEventsQuery.limit(50)
  }

  const { data: sleepEvents } = await sleepEventsQuery

  // Convert to AI SDK format and reverse for chronological order
  // We cast the parts since our stored format is compatible at runtime
  const initialMessages = (chatMessages || [])
    .reverse()
    .map(msg => ({
      id: msg.message_id,
      role: msg.role as 'user' | 'assistant',
      parts: msg.parts,
      createdAt: msg.created_at,
    }))

  // Get cursor for loading more history (oldest message's timestamp)
  const oldestTimestamp = chatMessages && chatMessages.length > 0
    ? chatMessages[chatMessages.length - 1].created_at
    : null

  return (
    <ChatContent
      baby={baby}
      initialMessages={initialMessages}
      initialSleepEvents={sleepEvents || []}
      initialCursor={oldestTimestamp}
      hasMoreHistory={chatMessages?.length === 50}
    />
  )
}
