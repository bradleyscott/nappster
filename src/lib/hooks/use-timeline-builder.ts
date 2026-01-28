'use client'

import { useMemo } from 'react'
import { SleepEvent, Json } from '@/types/database'
import type { ChatMessageData } from './use-chat-history'
import type { UIMessage } from '@ai-sdk/react'

// Timeline item types for interleaved display
export type TimelineItem =
  | { kind: 'message'; message: ChatMessageData }
  | { kind: 'sleep_event'; event: SleepEvent }

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
}

interface UseTimelineBuilderReturn {
  allMessages: ChatMessageData[]
  allSleepEvents: SleepEvent[]
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
}: UseTimelineBuilderOptions): UseTimelineBuilderReturn {
  // Combine all messages (history, initial, live) deduplicating by id
  const allMessages = useMemo(() => {
    const seen = new Set<string>()
    const combined: ChatMessageData[] = []

    // Add history messages first (oldest loaded via scroll)
    for (const msg of historyMessages) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id)
        combined.push(msg)
      }
    }

    // Add initial messages (loaded on page mount)
    for (const msg of initialMessages) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id)
        combined.push(msg)
      }
    }

    // Add live messages (new messages from current session)
    for (let i = 0; i < liveMessages.length; i++) {
      const msg = liveMessages[i]
      if (!seen.has(msg.id)) {
        seen.add(msg.id)
        combined.push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: msg.parts as Json,
          createdAt: new Date(Date.now() + i).toISOString(),
        })
      }
    }

    return combined
  }, [historyMessages, initialMessages, liveMessages])

  // Combine all sleep events (history + initial + local), deduplicating by id
  const allSleepEvents = useMemo(() => {
    const seen = new Set<string>()
    const combined: SleepEvent[] = []

    for (const event of historySleepEvents) {
      if (!seen.has(event.id) && !deletedEventIds.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    for (const event of initialSleepEvents) {
      if (!seen.has(event.id) && !deletedEventIds.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    for (const event of localEvents) {
      if (!seen.has(event.id) && !deletedEventIds.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    // Sort by event_time
    return combined.sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
  }, [historySleepEvents, initialSleepEvents, localEvents, deletedEventIds])

  // Create interleaved timeline of messages and sleep events
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

    // Sort by timestamp
    items.sort((a, b) => {
      const timeA = a.kind === 'message'
        ? normalizeTimestamp(a.message.createdAt)
        : a.event.event_time
      const timeB = b.kind === 'message'
        ? normalizeTimestamp(b.message.createdAt)
        : b.event.event_time

      if (!timeA && !timeB) return 0
      if (!timeA) return 1
      if (!timeB) return -1

      return timeA.localeCompare(timeB)
    })

    return items
  }, [allMessages, allSleepEvents])

  return {
    allMessages,
    allSleepEvents,
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
  return item.kind === 'message'
    ? normalizeTimestamp(item.message.createdAt)
    : item.event.event_time
}
