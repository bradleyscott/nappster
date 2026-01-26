'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import Image from 'next/image'
import { Baby, Json, SleepEvent, SleepSession, EventType, Context } from '@/types/database'
import { formatTime, calculateDurationMinutes, findSessionForEvent } from '@/lib/sleep-utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import { SleepPlanHeader } from '@/components/sleep-plan-header'
import { ChatInput } from '@/components/chat-input'
import { SleepEventDialog } from '@/components/sleep-event-dialog'
import { SleepSessionDialog } from '@/components/sleep-session-dialog'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { Loader } from '@/components/ai-elements/loader'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import type { SleepPlan } from '@/app/api/sleep-plan/route'

// Message type for chat history (compatible with useChat messages)
interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  parts: Json
  createdAt?: string | Date
}

// Helper to normalize timestamps to ISO strings for comparison
function normalizeTimestamp(ts: string | Date | undefined): string {
  if (!ts) return ''
  if (ts instanceof Date) return ts.toISOString()
  return ts
}

// Format date for date separator headers (Today, Yesterday, or date)
function formatDateHeader(dateStr: string | Date): string {
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
function getDateKey(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Timeline item types for interleaved display
type TimelineItemType =
  | { kind: 'message'; message: ChatMessageData }
  | { kind: 'sleep_event'; event: SleepEvent }

interface ChatContentProps {
  baby: Baby
  initialMessages?: ChatMessageData[]
  initialSleepEvents?: SleepEvent[]
  initialCursor?: string | null
  hasMoreHistory?: boolean
}

// Event display configuration
const eventConfig: Record<string, { icon: string; label: string; color: string }> = {
  wake: { icon: '☀️', label: 'Woke up', color: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800' },
  nap_start: { icon: '😴', label: 'Nap started', color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' },
  nap_end: { icon: '🌤️', label: 'Nap ended', color: 'bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-800' },
  bedtime: { icon: '🌙', label: 'Bedtime', color: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800' },
  night_wake: { icon: '👀', label: 'Night wake', color: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' },
}


export function ChatContent({
  baby,
  initialMessages = [],
  initialSleepEvents = [],
  initialCursor = null,
  hasMoreHistory: initialHasMore = false
}: ChatContentProps) {
  const router = useRouter()
  const supabase = createClient()

  // Local events state for realtime updates
  const [localEvents, setLocalEvents] = useState<SleepEvent[]>([])

  // History state for loading older messages
  const [historyMessages, setHistoryMessages] = useState<ChatMessageData[]>([])
  const [historySleepEvents, setHistorySleepEvents] = useState<SleepEvent[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(initialCursor)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(initialHasMore)

  // Event editing state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<SleepEvent | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SleepSession | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Sleep plan state for ChatInput quick actions
  const [sleepPlan, setSleepPlan] = useState<SleepPlan | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Get user's timezone for the AI to correctly parse times
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  // Create transport with API endpoint and body
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: { babyId: baby.id, timezone },
  }), [baby.id, timezone])

  const { messages: liveMessages, sendMessage, status } = useChat({
    transport,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

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
      if (!seen.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    for (const event of initialSleepEvents) {
      if (!seen.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    for (const event of localEvents) {
      if (!seen.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }

    // Sort by event_time
    return combined.sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
  }, [historySleepEvents, initialSleepEvents, localEvents])

  // Create interleaved timeline of messages and sleep events
  const timelineItems = useMemo(() => {
    const items: TimelineItemType[] = []

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

  // Load more history when user scrolls to top or clicks button
  const loadMoreHistory = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory || !historyCursor) return

    setIsLoadingHistory(true)
    try {
      const res = await fetch(
        `/api/chat/messages?babyId=${baby.id}&limit=50&before=${encodeURIComponent(historyCursor)}`
      )
      const data = await res.json()

      if (data.messages && data.messages.length > 0) {
        setHistoryMessages(prev => [...data.messages, ...prev])
        setHistoryCursor(data.cursor)
        setHasMoreHistory(data.hasMore)

        if (data.sleepEvents && data.sleepEvents.length > 0) {
          setHistorySleepEvents(prev => [...data.sleepEvents, ...prev])
        }
      } else {
        setHasMoreHistory(false)
      }
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [baby.id, historyCursor, hasMoreHistory, isLoadingHistory])


  // Handle sending chat messages
  const handleSendMessage = useCallback(async (text: string) => {
    await sendMessage({ text })
  }, [sendMessage])

  // Handle creating events (from ChatInput quick actions or dialog)
  const handleCreateEvent = useCallback(async (eventData: {
    event_type: EventType
    event_time: string
    context: Context
    notes: string | null
  }) => {
    const { data, error } = await supabase
      .from('sleep_events')
      .insert({
        baby_id: baby.id,
        event_type: eventData.event_type,
        event_time: eventData.event_time,
        context: eventData.context,
        notes: eventData.notes,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      return
    }

    setLocalEvents(prev => [...prev, data])
    setRefreshKey(k => k + 1)
  }, [baby.id, supabase])

  // Handle saving events (edit from dialog)
  const handleSaveEvent = useCallback(async (eventData: {
    id?: string
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => {
    if (eventData.id) {
      // Update existing event
      const { data, error } = await supabase
        .from('sleep_events')
        .update({
          event_type: eventData.event_type,
          event_time: eventData.event_time,
          end_time: eventData.end_time,
          context: eventData.context,
          notes: eventData.notes,
        })
        .eq('id', eventData.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating event:', error)
        return
      }

      // Update in local state
      setLocalEvents(prev => {
        const existing = prev.find(e => e.id === data.id)
        if (existing) {
          return prev.map(e => e.id === data.id ? data : e)
        }
        return [...prev, data]
      })
    } else {
      // Create new event
      await handleCreateEvent(eventData)
    }

    setRefreshKey(k => k + 1)
    setEditDialogOpen(false)
    setSelectedEvent(null)
  }, [supabase, handleCreateEvent])

  // Handle deleting events
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return

    const { error } = await supabase
      .from('sleep_events')
      .delete()
      .eq('id', selectedEvent.id)

    if (error) {
      console.error('Error deleting event:', error)
      return
    }

    setLocalEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
    setRefreshKey(k => k + 1)
    setDeleteDialogOpen(false)
    setEditDialogOpen(false)
    setSelectedEvent(null)
  }, [selectedEvent, supabase])

  // Handle saving session (paired events)
  const handleSaveSession = useCallback(async (sessionData: {
    startEvent: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
    endEvent?: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
  }) => {
    // Update start event
    const { data: startData, error: startError } = await supabase
      .from('sleep_events')
      .update({
        event_time: sessionData.startEvent.event_time,
        context: sessionData.startEvent.context,
        notes: sessionData.startEvent.notes,
      })
      .eq('id', sessionData.startEvent.id)
      .select()
      .single()

    if (startError) {
      console.error('Error updating start event:', startError)
      return
    }

    setLocalEvents(prev => {
      const updated = prev.filter(e => e.id !== startData.id)
      return [...updated, startData]
    })

    // Update end event if present
    if (sessionData.endEvent) {
      const { data: endData, error: endError } = await supabase
        .from('sleep_events')
        .update({
          event_time: sessionData.endEvent.event_time,
          context: sessionData.endEvent.context,
          notes: sessionData.endEvent.notes,
        })
        .eq('id', sessionData.endEvent.id)
        .select()
        .single()

      if (endError) {
        console.error('Error updating end event:', endError)
        return
      }

      setLocalEvents(prev => {
        const updated = prev.filter(e => e.id !== endData.id)
        return [...updated, endData]
      })
    }

    setRefreshKey(k => k + 1)
    setSessionDialogOpen(false)
    setSelectedSession(null)
  }, [supabase])

  // Handle deleting session
  const handleDeleteSession = useCallback(async (startId: string, endId: string | null) => {
    const { error: startError } = await supabase
      .from('sleep_events')
      .delete()
      .eq('id', startId)

    if (startError) {
      console.error('Error deleting start event:', startError)
      return
    }

    if (endId) {
      const { error: endError } = await supabase
        .from('sleep_events')
        .delete()
        .eq('id', endId)

      if (endError) {
        console.error('Error deleting end event:', endError)
      }
    }

    setLocalEvents(prev => prev.filter(e => e.id !== startId && e.id !== endId))
    setRefreshKey(k => k + 1)
    setSessionDialogOpen(false)
    setSelectedSession(null)
  }, [supabase])

  // Handle clicking on a sleep event in the timeline
  const handleEventClick = useCallback((event: SleepEvent) => {
    // Check if this event is part of a session (nap_start, nap_end, bedtime)
    const session = findSessionForEvent(event, allSleepEvents)
    if (session) {
      setSelectedSession(session)
      setSessionDialogOpen(true)
    } else {
      // Standalone event (wake, night_wake without pairing)
      setSelectedEvent(event)
      setEditDialogOpen(true)
    }
  }, [allSleepEvents])

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }, [supabase, router])

  // Extract text content from message parts
  const getMessageText = (message: { parts: unknown }) => {
    const parts = message.parts as Array<{ type: string; text?: string }> | undefined
    if (parts && parts.length > 0) {
      return parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('')
    }
    return ''
  }

  // Render all message parts including tool invocations
  const renderMessageParts = (message: { parts: unknown }, isStreaming: boolean) => {
    const parts = message.parts as Array<{ type: string; text?: string; [key: string]: unknown }> | undefined
    if (!parts || parts.length === 0) return null

    return parts.map((part, index) => {
      if (part.type === 'text') {
        return (
          <div key={index}>
            <MessageResponse>{part.text || ''}</MessageResponse>
            {isStreaming && index === parts.length - 1 && <span className="animate-pulse ml-0.5">▊</span>}
          </div>
        )
      }

      // Handle tool-createSleepEvent parts
      if (part.type === 'tool-createSleepEvent') {
        const toolPart = part as unknown as {
          input?: { event_type?: string }
          state?: string
          output?: { success: boolean; message?: string; error?: string }
        }
        const toolInput = toolPart.input
        const state = toolPart.state
        const output = toolPart.output

        if (state === 'input-streaming' || state === 'input-available') {
          return (
            <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader size={14} />
              <span>Logging {toolInput?.event_type?.replace('_', ' ') || 'event'}...</span>
            </div>
          )
        }

        if (state === 'output-available' && output) {
          if (output.success) {
            return (
              <div key={index} className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-950 rounded-lg my-2">
                <span>✓</span>
                {output.message || 'Event logged'}
              </div>
            )
          } else {
            return (
              <div key={index} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2 px-3 bg-red-50 dark:bg-red-950 rounded-lg my-2">
                <span>✗</span>
                Failed to log event: {output.error}
              </div>
            )
          }
        }
      }

      return null
    })
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        {/* Main Header */}
        <AppHeader baby={baby} onSignOut={handleSignOut} />

        {/* Sleep Plan Header */}
        <SleepPlanHeader
          babyId={baby.id}
          events={allSleepEvents}
          baby={baby}
          refreshKey={refreshKey}
          onPlanChange={setSleepPlan}
        />
      </div>

      {/* Messages */}
      <Conversation className="flex-1">
        <ConversationContent className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-6 gap-4">
          {/* Load more history indicator */}
          {isLoadingHistory && (
            <div className="text-center py-2">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader size={14} />
                <span>Loading history...</span>
              </div>
            </div>
          )}

          {/* Load more button */}
          {hasMoreHistory && !isLoadingHistory && (
            <div className="text-center py-2">
              <Button variant="ghost" size="sm" onClick={loadMoreHistory}>
                Load earlier messages
              </Button>
            </div>
          )}

          {/* Empty state */}
          {allMessages.length === 0 && allSleepEvents.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <Image
                src="/nappster.png"
                alt="Nappster"
                width={64}
                height={64}
                className="rounded-full mb-4 shadow-md"
              />
              <h2 className="text-lg font-semibold mb-1">Hi there!</h2>
              <p className="text-muted-foreground mb-6">
                Log {baby.name}&apos;s sleep or ask me anything
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                <Suggestions className="flex-wrap justify-center">
                  <Suggestion
                    suggestion="She woke up at 7am this morning"
                    onClick={handleSendMessage}
                    className="whitespace-normal h-auto py-2"
                  />
                  <Suggestion
                    suggestion="Just put her down for a nap"
                    onClick={handleSendMessage}
                    className="whitespace-normal h-auto py-2"
                  />
                  <Suggestion
                    suggestion="What should bedtime be tonight?"
                    onClick={handleSendMessage}
                    className="whitespace-normal h-auto py-2"
                  />
                </Suggestions>
              </div>
            </motion.div>
          )}

          {timelineItems.map((item, index) => {
            // Determine if we need a date separator before this item
            const currentTimestamp = item.kind === 'message'
              ? normalizeTimestamp(item.message.createdAt)
              : item.event.event_time
            const prevItem = index > 0 ? timelineItems[index - 1] : null
            const prevTimestamp = prevItem
              ? (prevItem.kind === 'message'
                  ? normalizeTimestamp(prevItem.message.createdAt)
                  : prevItem.event.event_time)
              : null

            const currentDateKey = currentTimestamp ? getDateKey(currentTimestamp) : null
            const prevDateKey = prevTimestamp ? getDateKey(prevTimestamp) : null
            const showDateHeader = currentDateKey && currentDateKey !== prevDateKey

            if (item.kind === 'sleep_event') {
              const { event } = item
              const config = eventConfig[event.event_type] || {
                icon: '•',
                label: event.event_type,
                color: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
              }

              return (
                <motion.div
                  key={`event-${event.id}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {showDateHeader && (
                    <div className="flex items-center gap-3 my-6">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">
                        {formatDateHeader(currentTimestamp!)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleEventClick(event)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs border shadow-sm ${config.color} hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer`}
                    >
                      <span className="text-base">{config.icon}</span>
                      <span className="font-medium">{config.label}</span>
                      <span className="text-muted-foreground">
                        {formatTime(event.event_time)}
                        {event.event_type === 'night_wake' && event.end_time && (
                          <> - {formatTime(event.end_time)}</>
                        )}
                      </span>
                      {event.event_type === 'night_wake' && event.end_time && (
                        <span className="text-muted-foreground">
                          ({Math.round(calculateDurationMinutes(event.event_time, event.end_time))}m)
                        </span>
                      )}
                      {event.context && (
                        <span className="text-muted-foreground">· {event.context}</span>
                      )}
                    </button>
                  </div>
                </motion.div>
              )
            }

            const { message } = item
            const isLastItem = index === timelineItems.length - 1
            const isStreaming = isLastItem && status === 'streaming' && message.role === 'assistant'
            const text = getMessageText(message)
            const messageTime = message.createdAt ? formatTime(message.createdAt) : null

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {showDateHeader && (
                  <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">
                      {formatDateHeader(currentTimestamp!)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <Message from={message.role}>
                  <MessageContent
                    className={message.role === 'user' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'}
                  >
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{text}</p>
                    ) : (
                      <div className="space-y-2">
                        {renderMessageParts(message, isStreaming)}
                      </div>
                    )}
                  </MessageContent>
                  {messageTime && (
                    <span className="text-[10px] text-muted-foreground px-1 group-[.is-user]:self-end">
                      {messageTime}
                    </span>
                  )}
                </Message>
              </motion.div>
            )
          })}

          {/* Loading indicator */}
          {isLoading && (() => {
            const lastItem = timelineItems[timelineItems.length - 1]
            const showLoading = timelineItems.length === 0 ||
              lastItem?.kind === 'sleep_event' ||
              (lastItem?.kind === 'message' && lastItem.message.role !== 'assistant') ||
              (lastItem?.kind === 'message' && !getMessageText(lastItem.message))
            return showLoading
          })() && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <Message from="assistant">
                <MessageContent className="bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm">
                  <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
                    <Loader size={16} />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </MessageContent>
              </Message>
            </motion.div>
          )}
        </ConversationContent>
        <ConversationScrollButton className="shadow-lg" />
      </Conversation>

      {/* Chat Input */}
      <div className="sticky bottom-0 border-t py-1 sm:py-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 chat-input-container">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <ChatInput
            babyId={baby.id}
            onSendMessage={handleSendMessage}
            onCreateEvent={handleCreateEvent}
            status={status}
            sleepPlan={sleepPlan}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Edit Event Dialog */}
      <SleepEventDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        babyId={baby.id}
        event={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteEvent}
      />

      {/* Session Edit Dialog */}
      <SleepSessionDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        session={selectedSession}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
      />
    </div>
  )
}
