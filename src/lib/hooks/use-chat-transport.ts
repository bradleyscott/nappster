'use client'

import { useMemo } from 'react'
import { DefaultChatTransport } from 'ai'
import { formatAge } from '@/lib/sleep-utils'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import type { Baby, SleepEvent } from '@/types/database'
import type { ChatMessageData } from './use-chat-history'

interface UseChatTransportOptions {
  baby: Baby
  timezone: string
  events: SleepEvent[]
  initialMessages: ChatMessageData[]
}

export function useChatTransport({ baby, timezone, events, initialMessages }: UseChatTransportOptions) {
  const todayEventsForApi = useMemo(() => {
    const { start, end } = getTodayBoundsForTimezone(timezone)
    return events
      .filter(e => e.event_time >= start && e.event_time < end)
      .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
  }, [events, timezone])

  const recentMessagesForApi = useMemo(() => {
    return [...initialMessages]
      .filter(m => m.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 5)
      .reverse()
      .map(m => ({ role: m.role, parts: m.parts }))
  }, [initialMessages])

  const babyProfileForApi = useMemo(() => ({
    name: baby.name,
    age: formatAge(baby.birth_date),
    birthDate: baby.birth_date,
    sleepTrainingMethod: baby.sleep_training_method,
    patternNotes: baby.pattern_notes,
  }), [baby.name, baby.birth_date, baby.sleep_training_method, baby.pattern_notes])

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: {
      babyId: baby.id,
      timezone,
      babyProfile: babyProfileForApi,
      todayEvents: todayEventsForApi,
      recentMessages: recentMessagesForApi,
    },
  }), [baby.id, timezone, babyProfileForApi, todayEventsForApi, recentMessagesForApi])

  return transport
}
