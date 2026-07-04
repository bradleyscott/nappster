'use client'

import { useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

import type { SleepEvent, SleepPlanRow } from '@/types/database'
import type { ChatMessageData } from './use-chat-history'
import { getRecentSleepEvents } from '@/lib/services/sleep-events'
import { getChatMessages } from '@/lib/services/chat-messages'
import { getRecentSleepPlans } from '@/lib/services/sleep-plans'
import { logError } from '@/lib/error-reporting'

interface UseBackgroundRefreshOptions {
  babyId: string
  timezone: string
  mergeRefreshedEvents: (events: SleepEvent[]) => void
  mergeRefreshedMessages: (messages: ChatMessageData[]) => void
  onPlansRefreshed: (plans: SleepPlanRow[]) => void
}

export function useBackgroundRefresh({
  babyId,
  timezone,
  mergeRefreshedEvents,
  mergeRefreshedMessages,
  onPlansRefreshed,
}: UseBackgroundRefreshOptions) {
  const supabase = createClient()
  const lastRefreshRef = useRef<number>(0)

  const refreshData = useCallback(async () => {
    // Debounce: don't refresh more than once every 2 seconds
    const now = Date.now()
    if (now - lastRefreshRef.current < 2000) return
    lastRefreshRef.current = now

    try {
      const { data: recentEvents } = await getRecentSleepEvents(supabase, babyId, timezone)

      if (recentEvents && recentEvents.length > 0) {
        mergeRefreshedEvents(recentEvents)
      }

      const { data: recentMessages } = await getChatMessages(supabase, {
        babyId,
        limit: 50,
      })

      if (recentMessages && recentMessages.length > 0) {
        const formatted = [...recentMessages].reverse().map(msg => ({
          id: msg.message_id,
          role: msg.role as 'user' | 'assistant',
          parts: msg.parts,
          createdAt: msg.created_at,
        }))
        mergeRefreshedMessages(formatted)
      }

      const { data: recentPlans } = await getRecentSleepPlans(supabase, babyId, 10)

      if (recentPlans && recentPlans.length > 0) {
        onPlansRefreshed(recentPlans)
      }
    } catch (error) {
      logError('background-refresh', 'Error refreshing data:', error)
    }
  }, [babyId, supabase, timezone, mergeRefreshedEvents, mergeRefreshedMessages, onPlansRefreshed])

  return refreshData
}
