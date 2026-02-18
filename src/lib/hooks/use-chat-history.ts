'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { SleepEvent, SleepPlanRow, Json } from '@/types/database'

// Message type for chat history (compatible with useChat messages)
export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  parts: Json
  createdAt?: string | Date
}

interface UseChatHistoryOptions {
  babyId: string
  initialMessages?: ChatMessageData[]
  initialCursor?: string | null
  initialHasMore?: boolean
}

interface UseChatHistoryReturn {
  historyMessages: ChatMessageData[]
  historySleepEvents: SleepEvent[]
  historySleepPlans: SleepPlanRow[]
  historyCursor: string | null
  isLoadingHistory: boolean
  hasMoreHistory: boolean
  loadMoreHistory: () => Promise<void>
  addRealtimeMessage: (message: ChatMessageData) => void
  // Merge refreshed messages (from visibility change refresh)
  mergeRefreshedMessages: (messages: ChatMessageData[]) => void
}

export function useChatHistory({
  babyId,
  initialCursor = null,
  initialHasMore = false,
}: UseChatHistoryOptions): UseChatHistoryReturn {
  // History state for loading older messages
  const [historyMessages, setHistoryMessages] = useState<ChatMessageData[]>([])
  const [historySleepEvents, setHistorySleepEvents] = useState<SleepEvent[]>([])
  const [historySleepPlans, setHistorySleepPlans] = useState<SleepPlanRow[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(initialCursor)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(initialHasMore)

  // Use ref for synchronous loading guard to prevent race conditions
  const isLoadingRef = useRef(false)
  // AbortController ref for cancelling in-flight fetch on unmount
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Load more history when user scrolls to top or clicks button
  const loadMoreHistory = useCallback(async () => {
    // Check ref synchronously to prevent duplicate requests from rapid calls
    if (isLoadingRef.current || !hasMoreHistory || !historyCursor) return

    isLoadingRef.current = true
    setIsLoadingHistory(true)

    // Abort any previous in-flight request
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch(
        `/api/chat/messages?babyId=${babyId}&limit=50&before=${encodeURIComponent(historyCursor)}`,
        { signal: controller.signal }
      )

      // Check response status before parsing JSON
      if (!res.ok) {
        console.error(`Failed to load history: ${res.status}`)
        setHasMoreHistory(false)
        return
      }

      const data = await res.json()

      if (data.messages && data.messages.length > 0) {
        setHistoryMessages(prev => [...data.messages, ...prev])
        setHistoryCursor(data.cursor)
        setHasMoreHistory(data.hasMore)

        if (data.sleepEvents && data.sleepEvents.length > 0) {
          setHistorySleepEvents(prev => [...data.sleepEvents, ...prev])
        }

        if (data.sleepPlans && data.sleepPlans.length > 0) {
          setHistorySleepPlans(prev => [...data.sleepPlans, ...prev])
        }
      } else {
        setHasMoreHistory(false)
      }
    } catch (error) {
      // Don't log abort errors — they're expected on cleanup
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error loading history:', error)
      setHasMoreHistory(false)
    } finally {
      isLoadingRef.current = false
      setIsLoadingHistory(false)
    }
  }, [babyId, historyCursor, hasMoreHistory])

  // Add a message from realtime sync (from other family members)
  const addRealtimeMessage = useCallback((message: ChatMessageData) => {
    setHistoryMessages(prev => {
      if (prev.some(m => m.id === message.id)) return prev
      return [...prev, message]
    })
  }, [])

  // Merge refreshed messages from background refresh (visibility change, reconnect)
  const mergeRefreshedMessages = useCallback((messages: ChatMessageData[]) => {
    setHistoryMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      const newMessages = messages.filter(m => !existingIds.has(m.id))
      if (newMessages.length === 0) return prev
      return [...prev, ...newMessages]
    })
  }, [])

  return {
    historyMessages,
    historySleepEvents,
    historySleepPlans,
    historyCursor,
    isLoadingHistory,
    hasMoreHistory,
    loadMoreHistory,
    addRealtimeMessage,
    mergeRefreshedMessages,
  }
}
