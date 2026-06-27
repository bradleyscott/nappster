'use client'

import { useMemo } from 'react'
import { SleepEvent, SleepPlanRow, Json } from '@/types/database'
import { mergeEvents, mergeMessages, mergeSleepPlans } from '@/lib/merge-data'
import type { ChatMessageData } from './use-chat-history'
import type { UIMessage } from '@ai-sdk/react'

// Timeline item types for interleaved display
export type TimelineItem =
  | { kind: 'message'; message: ChatMessageData }
  | { kind: 'sleep_event'; event: SleepEvent }
  | { kind: 'sleep_plan'; plan: SleepPlanRow }

// Helper to normalize timestamps to ISO strings for comparison
function normalizeTimestamp(ts: string | Date | undefined): string {
  if (!ts) return ''
  if (ts instanceof Date) return ts.toISOString()
  return ts
}

interface UseTimelineBuilderOptions {
  historyMessages: ChatMessageData[]
  initialMessages: ChatMessageData[]
  liveMessages: UIMessage[]
  historySleepEvents: SleepEvent[]
  initialSleepEvents: SleepEvent[]
  localEvents: SleepEvent[]
  deletedEventIds: Set<string>
  historySleepPlans: SleepPlanRow[]
  initialSleepPlans: SleepPlanRow[]
  localSleepPlans: SleepPlanRow[]
}

interface UseTimelineBuilderReturn {
  allMessages: ChatMessageData[]
  allSleepEvents: SleepEvent[]
  allSleepPlans: SleepPlanRow[]
  timelineItems: TimelineItem[]
}

export function useTimelineBuilder({
  historyMessages,
  initialMessages,
  liveMessages,
  historySleepEvents,
  initialSleepEvents,
  localEvents,
  deletedEventIds,
  historySleepPlans,
  initialSleepPlans,
  localSleepPlans,
}: UseTimelineBuilderOptions): UseTimelineBuilderReturn {
  // Convert live messages to ChatMessageData format and merge all sources
  const allMessages = useMemo(() => {
    const now = new Date().toISOString()
    const liveChatMessages: ChatMessageData[] = liveMessages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: msg.parts as Json,
      createdAt: now,
    }))
    return mergeMessages(historyMessages, initialMessages, liveChatMessages)
  }, [historyMessages, initialMessages, liveMessages])

  // Combine all sleep events. localEvents are first so edits take priority.
  const allSleepEvents = useMemo(() => {
    return mergeEvents(deletedEventIds, localEvents, initialSleepEvents, historySleepEvents)
  }, [historySleepEvents, initialSleepEvents, localEvents, deletedEventIds])

  // Combine all sleep plans (history + initial + local)
  const allSleepPlans = useMemo(() => {
    return mergeSleepPlans(historySleepPlans, initialSleepPlans, localSleepPlans)
  }, [historySleepPlans, initialSleepPlans, localSleepPlans])

  // Create interleaved timeline of messages, sleep events, and sleep plans
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []

    // Add all messages
    for (const msg of allMessages) {
      items.push({ kind: 'message', message: msg as ChatMessageData })
    }

    // Add all sleep events
    for (const event of allSleepEvents) {
      items.push({ kind: 'sleep_event', event })
    }

    // Add all sleep plans (historical, non-active)
    for (const plan of allSleepPlans) {
      items.push({ kind: 'sleep_plan', plan })
    }

    // Sort by timestamp, with kind-based ordering for items within a time window.
    // When items are within 60 seconds, sort: messages first, then sleep_events, then sleep_plans.
    // This groups AI responses with the events/plans they created.
    const TIME_WINDOW_MS = 60 * 1000

    const kindOrder: Record<TimelineItem['kind'], number> = {
      message: 0,
      sleep_event: 1,
      sleep_plan: 2,
    }

    items.sort((a, b) => {
      const getTimeMs = (item: TimelineItem): number => {
        if (item.kind === 'message') {
          const ts = normalizeTimestamp(item.message.createdAt)
          return ts ? new Date(ts).getTime() : 0
        }
        if (item.kind === 'sleep_event') return new Date(item.event.event_time).getTime()
        return new Date(item.plan.created_at).getTime()
      }

      const timeA = getTimeMs(a)
      const timeB = getTimeMs(b)

      // If times are within the window, sort by kind
      if (Math.abs(timeA - timeB) <= TIME_WINDOW_MS) {
        const kindCompare = kindOrder[a.kind] - kindOrder[b.kind]
        if (kindCompare !== 0) return kindCompare
      }

      // Otherwise (or if same kind), sort by timestamp
      return timeA - timeB
    })

    return items
  }, [allMessages, allSleepEvents, allSleepPlans])

  return {
    allMessages,
    allSleepEvents,
    allSleepPlans,
    timelineItems,
  }
}

// Utility functions for timeline display
export function formatDateHeader(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  // For dates within the same year, show "Mon, Jan 23"
  // For older dates, show "Mon, Jan 23, 2025"
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

// Get date key for grouping (YYYY-MM-DD)
export function getDateKey(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Helper to get timestamp from timeline item
export function getTimelineItemTimestamp(item: TimelineItem): string {
  if (item.kind === 'message') return normalizeTimestamp(item.message.createdAt)
  if (item.kind === 'sleep_event') return item.event.event_time
  return item.plan.created_at
}
