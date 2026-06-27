import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from '@/types/database'

export interface SaveChatMessageInput {
  baby_id: string | null
  role: 'user' | 'assistant' | 'system'
  content?: string | null
  parts?: Record<string, unknown>[] | null
  created_at?: string
}

export async function getChatMessages(
  supabase: SupabaseClient,
  filter: {
    babyId: string | null
    limit?: number
    before?: string
    from?: string
    ascending?: boolean
  }
): Promise<{ data: ChatMessage[] | null; error: Error | null }> {
  let query = supabase.from('chat_messages').select('*')

  if (filter.babyId) {
    query = query.eq('baby_id', filter.babyId)
  } else {
    query = query.is('baby_id', null)
  }

  query = query.order('created_at', { ascending: filter.ascending ?? false })

  if (filter.limit) {
    query = query.limit(filter.limit)
  }

  if (filter.before) {
    query = query.lt('created_at', filter.before)
  }

  if (filter.from) {
    query = query.gte('created_at', filter.from)
  }

  const { data, error } = await query
  return { data: data as ChatMessage[] | null, error: error as Error | null }
}

export async function getChatMessagesSince(
  supabase: SupabaseClient,
  babyId: string,
  startDate: string,
  limit: number
): Promise<{ data: ChatMessage[] | null; error: Error | null }> {
  return getChatMessages(supabase, {
    babyId,
    from: startDate,
    limit,
    ascending: true,
  })
}

export async function saveChatMessage(
  supabase: SupabaseClient,
  input: SaveChatMessageInput
): Promise<{ data: ChatMessage | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      baby_id: input.baby_id,
      role: input.role,
      content: input.content ?? null,
      parts: input.parts ?? null,
      created_at: input.created_at,
    })
    .select()
    .single()

  return { data: data as ChatMessage | null, error: error as Error | null }
}
