'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { Baby, Json, SleepEvent } from '@/types/database'
import { formatAge, formatTime } from '@/lib/sleep-utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'

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

// Format time for message timestamps (9:45 am)
function formatMessageTime(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  // History state for loading older messages
  const [historyMessages, setHistoryMessages] = useState<ChatMessageData[]>([])
  const [historySleepEvents, setHistorySleepEvents] = useState<SleepEvent[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(initialCursor)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(initialHasMore)

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

  // Include initial messages in the combined messages
  // (useChat doesn't support initialMessages with DefaultChatTransport)

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
    // Live messages don't have createdAt, so we use the current time
    // They're always the newest, so this ensures correct ordering
    for (let i = 0; i < liveMessages.length; i++) {
      const msg = liveMessages[i]
      if (!seen.has(msg.id)) {
        seen.add(msg.id)
        combined.push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: msg.parts as Json,
          // Offset each message slightly to preserve order within live messages
          createdAt: new Date(Date.now() + i).toISOString(),
        })
      }
    }

    return combined
  }, [historyMessages, initialMessages, liveMessages])

  // Combine all sleep events (history + initial), deduplicating by id
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

    return combined
  }, [historySleepEvents, initialSleepEvents])

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

      // Items without timestamps sort to the end
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
        // Prepend older messages
        setHistoryMessages(prev => [...data.messages, ...prev])
        setHistoryCursor(data.cursor)
        setHasMoreHistory(data.hasMore)

        // Also prepend sleep events from this time range
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

  // Scroll handler for infinite scroll (load more when near top)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // Load more when scrolled near top (within 100px)
      if (container.scrollTop < 100 && hasMoreHistory && !isLoadingHistory) {
        const scrollHeight = container.scrollHeight
        loadMoreHistory().then(() => {
          // Restore scroll position after new content is added
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight - scrollHeight
            }
          })
        })
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [loadMoreHistory, hasMoreHistory, isLoadingHistory])

  // Scroll to bottom when new live messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveMessages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const message = input.trim()
    setInput('')
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await sendMessage({ text: message })
  }

  const handleSuggestionClick = (text: string) => {
    setInput(text)
  }

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
  const renderMessageParts = (message: { parts: unknown }) => {
    const parts = message.parts as Array<{ type: string; text?: string; [key: string]: unknown }> | undefined
    if (!parts || parts.length === 0) return null

    return parts.map((part, index) => {
      if (part.type === 'text') {
        return (
          <div key={index} className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
            <ReactMarkdown>{part.text}</ReactMarkdown>
          </div>
        )
      }

      // Handle tool-createSleepEvent parts (AI SDK v6 uses tool-{toolName} as type)
      if (part.type === 'tool-createSleepEvent') {
        const toolPart = part as unknown as { input?: { event_type?: string }; state?: string; output?: { success: boolean; message?: string; error?: string } }
        const input = toolPart.input
        const state = toolPart.state
        const output = toolPart.output

        if (state === 'input-streaming' || state === 'input-available') {
          return (
            <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <span className="animate-pulse">...</span>
              Logging {input?.event_type?.replace('_', ' ') || 'event'}...
            </div>
          )
        }

        if (state === 'output-available' && output) {
          if (output.success) {
            return (
              <div key={index} className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-950 rounded-md my-2">
                <span>✓</span>
                {output.message || 'Event logged'}
              </div>
            )
          } else {
            return (
              <div key={index} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2 px-3 bg-red-50 dark:bg-red-950 rounded-md my-2">
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">← Back</Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Sleep Consultant</h1>
            <p className="text-xs text-muted-foreground">{baby.name} · {formatAge(baby.birth_date)}</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        <div className="container max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Load more history indicator */}
          {isLoadingHistory && (
            <div className="text-center py-2">
              <span className="text-sm text-muted-foreground">Loading history...</span>
            </div>
          )}

          {/* Load more button (visible when there's more history) */}
          {hasMoreHistory && !isLoadingHistory && (
            <div className="text-center py-2">
              <Button variant="ghost" size="sm" onClick={loadMoreHistory}>
                Load earlier messages
              </Button>
            </div>
          )}

          {allMessages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Ask me anything about {baby.name}&apos;s sleep!
              </p>
              <div className="space-y-2">
                <SuggestionChip
                  text="She woke up at 7am this morning"
                  onClick={handleSuggestionClick}
                />
                <SuggestionChip
                  text="Just put her down for a nap"
                  onClick={handleSuggestionClick}
                />
                <SuggestionChip
                  text="What should bedtime be tonight?"
                  onClick={handleSuggestionClick}
                />
                <SuggestionChip
                  text="Is she ready for 1 nap?"
                  onClick={handleSuggestionClick}
                />
              </div>
            </div>
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
                <div key={`event-${event.id}`}>
                  {showDateHeader && (
                    <div className="flex justify-center my-4">
                      <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {formatDateHeader(currentTimestamp!)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border ${config.color}`}>
                      <span>{config.icon}</span>
                      <span className="font-medium">{config.label}</span>
                      <span className="text-muted-foreground">{formatTime(event.event_time)}</span>
                      {event.context && (
                        <span className="text-muted-foreground">· {event.context}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            const { message } = item
            const isLastItem = index === timelineItems.length - 1
            const isStreaming = isLastItem && status === 'streaming' && message.role === 'assistant'
            const text = getMessageText(message)
            const messageTime = message.createdAt ? formatMessageTime(message.createdAt) : null

            return (
              <div key={message.id}>
                {showDateHeader && (
                  <div className="flex justify-center my-4">
                    <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {formatDateHeader(currentTimestamp!)}
                    </span>
                  </div>
                )}
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <Card
                    className={`max-w-[85%] px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{text}</p>
                    ) : (
                      <div className="text-sm space-y-2">
                        {renderMessageParts(message)}
                        {isStreaming && <span className="animate-pulse">▊</span>}
                      </div>
                    )}
                  </Card>
                  {messageTime && (
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {messageTime}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {isLoading && (() => {
            const lastItem = timelineItems[timelineItems.length - 1]
            const showLoading = timelineItems.length === 0 ||
              lastItem?.kind === 'sleep_event' ||
              (lastItem?.kind === 'message' && lastItem.message.role !== 'assistant') ||
              (lastItem?.kind === 'message' && !getMessageText(lastItem.message))
            return showLoading
          })() && (
            <div className="flex justify-start">
              <Card className="max-w-[85%] px-4 py-3 bg-muted">
                <div className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                </div>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="sticky bottom-0 bg-background border-t">
        <form onSubmit={handleSubmit} className="container max-w-lg mx-auto px-4 py-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setInput(e.target.value)
                // Auto-resize: reset height to auto to get the correct scrollHeight
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                // Submit on Enter (without Shift), allow Shift+Enter for new lines
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (input.trim() && !isLoading) {
                    handleSubmit(e as unknown as React.FormEvent)
                  }
                }
              }}
              placeholder="Ask about sleep..."
              className="flex-1 min-h-9 max-h-[150px]"
              disabled={isLoading}
              rows={1}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SuggestionChip({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      className="block w-full text-left px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
    >
      {text}
    </button>
  )
}
