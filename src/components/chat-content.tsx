'use client'

import { useChat } from '@ai-sdk/react'
import { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Baby, SleepEvent, SleepSession, ChatMessage, EventType, Context } from '@/types/database'
import { isValidEvent } from '@/lib/state-machine'
import { mergeEvents } from '@/lib/merge-data'
import { useRealtimeSync } from '@/lib/hooks/use-realtime-sync'
import { useSleepEventCRUD } from '@/lib/hooks/use-sleep-event-crud'
import { useChatHistory, ChatMessageData } from '@/lib/hooks/use-chat-history'
import { useTimelineBuilder } from '@/lib/hooks/use-timeline-builder'
import { useSleepPlanSync } from '@/lib/hooks/use-sleep-plan-sync'
import { useBackgroundRefresh } from '@/lib/hooks/use-background-refresh'
import { useChatTransport } from '@/lib/hooks/use-chat-transport'
import { useToolOutputs } from '@/lib/hooks/use-tool-outputs'
import { useTodaySleepState } from '@/lib/hooks/use-today-sleep-state'
import { useEventDialogHandlers } from '@/lib/hooks/use-event-dialog-handlers'
import { AppHeader } from '@/components/app-header'
import { UnifiedEditDialog } from '@/components/unified-edit-dialog'
import { SleepDashboard } from '@/components/sleep/sleep-dashboard'
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import ReactMarkdown from 'react-markdown'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import type { SleepPlanRow } from '@/types/database'

interface ChatContentProps {
  baby: Baby
  initialMessages?: ChatMessageData[]
  initialSleepEvents?: SleepEvent[]
  initialSleepPlans?: SleepPlanRow[]
  initialCursor?: string | null
  hasMoreHistory?: boolean
}

export function ChatContent({
  baby,
  initialMessages = [],
  initialSleepEvents = [],
  initialSleepPlans = [],
  initialCursor = null,
  hasMoreHistory: initialHasMore = false
}: ChatContentProps) {
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SleepSession | SleepEvent | null>(null)

  // Event CRUD and history
  const {
    localEvents,
    deletedEventIds,
    createEvent,
    saveEvent,
    deleteEvent,
    saveSession,
    deleteSession,
    handleRealtimeEvent,
    addToolCreatedEvent,
    isEventTracked,
    mergeRefreshedEvents,
  } = useSleepEventCRUD({ babyId: baby.id })

  const {
    historyMessages,
    historySleepEvents,
    historySleepPlans,
    isLoadingHistory,
    hasMoreHistory,
    loadMoreHistory,
    addRealtimeMessage,
    mergeRefreshedMessages,
  } = useChatHistory({
    babyId: baby.id,
    initialCursor,
    initialHasMore,
  })

  // Sleep plan sync
  const {
    sleepPlan,
    localSleepPlans,
    addToolCreatedPlan,
    handleRealtimePlan,
  } = useSleepPlanSync({ initialPlans: initialSleepPlans })

  // Events for API context: local edits take precedence over stale server data
  const allEventsForContext = useMemo(() => {
    return mergeEvents(deletedEventIds, localEvents, initialSleepEvents)
  }, [initialSleepEvents, localEvents, deletedEventIds])

  // Chat transport and live messages
  const transport = useChatTransport({
    baby,
    timezone,
    events: allEventsForContext,
    initialMessages,
  })

  const { messages: liveMessages, sendMessage, status } = useChat({ transport })

  // Timeline data
  const { allMessages, allSleepEvents, allSleepPlans, timelineItems } = useTimelineBuilder({
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
  })
  const isLoading = status === 'streaming' || status === 'submitted'

  // Background refresh
  const refreshData = useBackgroundRefresh({
    babyId: baby.id,
    timezone,
    mergeRefreshedEvents,
    mergeRefreshedMessages,
    onPlansRefreshed: useCallback((plans: SleepPlanRow[]) => {
      const activePlan = plans.find(p => p.is_active)
      if (activePlan) {
        // Update quick actions via the existing plan handler
        handleRealtimePlan(activePlan, 'UPDATE')
      }
    }, [handleRealtimePlan]),
  })

  // Realtime sync
  const { broadcastDelete } = useRealtimeSync({
    babyId: baby.id,
    enabled: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true',
    onSleepEventChange: useCallback((event: SleepEvent, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (!isEventTracked(event.id)) {
        handleRealtimeEvent(event, changeType)
      }
    }, [isEventTracked, handleRealtimeEvent]),
    onChatMessageChange: useCallback((message: ChatMessage, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (liveMessages.some(m => m.id === message.message_id)) return
      if (changeType === 'INSERT') {
        addRealtimeMessage({
          id: message.message_id,
          role: message.role as 'user' | 'assistant',
          parts: message.parts,
          createdAt: message.created_at,
        })
      }
    }, [liveMessages, addRealtimeMessage]),
    onSleepPlanChange: useCallback((plan: SleepPlanRow, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      handleRealtimePlan(plan, changeType)
    }, [handleRealtimePlan]),
    onRefreshData: refreshData,
  })

  // Extract tool outputs from live messages
  useToolOutputs({
    liveMessages,
    onSleepEventCreated: addToolCreatedEvent,
    onSleepPlanUpdated: addToolCreatedPlan,
  })

  // Current sleep state for quick action buttons
  const currentState = useTodaySleepState(allSleepEvents, timezone)

  // Event dialog handlers
  const closeDialog = useCallback(() => {
    setEditDialogOpen(false)
    setSelectedItem(null)
  }, [])

  const {
    saveEvent: handleSaveEvent,
    deleteEvent: handleDeleteEvent,
    saveSession: handleSaveSession,
    deleteSession: handleDeleteSession,
  } = useEventDialogHandlers({
    selectedItem,
    allEvents: allSleepEvents,
    broadcastDelete,
    onClose: closeDialog,
    crud: { saveEvent, deleteEvent, saveSession, deleteSession },
  })

  // Handlers
  const handleSendMessage = useCallback(async (text: string) => {
    await sendMessage({ text })
  }, [sendMessage])

  const handleCreateEvent = useCallback(async (eventData: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => {
    // Validate the event against the current state to avoid inconsistent sequences
    if (!isValidEvent(currentState, eventData.event_type)) {
      console.warn(`Invalid event ${eventData.event_type} for state ${currentState}`)
      return
    }

    await createEvent({
      event_type: eventData.event_type,
      event_time: eventData.event_time,
      end_time: eventData.event_type === 'night_wake' ? (eventData.end_time ?? null) : null,
      context: eventData.context,
      notes: eventData.notes,
    })

    // Create paired end event when applicable
    if (eventData.end_time && eventData.event_type !== 'night_wake') {
      const endEventType = eventData.event_type === 'nap_start' ? 'nap_end' :
                           eventData.event_type === 'bedtime' ? 'wake' : null
      if (endEventType) {
        await createEvent({
          event_type: endEventType,
          event_time: eventData.end_time,
          context: eventData.context,
          notes: null,
        })
      }
    }
  }, [createEvent, currentState])

  // Update/delete handlers for SleepDashboard EventSheet
  const handleUpdateEvent = useCallback(async (id: string, data: Partial<SleepEvent>) => {
    // saveEvent requires the full SaveEventData shape — find existing event and merge
    const existing = allSleepEvents.find(e => e.id === id)
    if (!existing) return
    await saveEvent({
      id: existing.id,
      event_type: (data.event_type ?? existing.event_type) as EventType,
      event_time: (data.event_time ?? existing.event_time) as string,
      end_time: data.end_time !== undefined ? data.end_time : existing.end_time,
      context: (data.context !== undefined ? data.context : existing.context) as Context,
      notes: data.notes !== undefined ? data.notes : existing.notes,
    })
  }, [saveEvent, allSleepEvents])

  const handleDeleteEventById = useCallback(async (id: string) => {
    const event = allSleepEvents.find(e => e.id === id)
    if (event) {
      await deleteEvent(event)
    }
  }, [deleteEvent, allSleepEvents])

  // Map timeline items to the display format expected by SleepDashboard
  const timelineDisplayItems = useMemo(() => {
    return timelineItems
      .filter(item => item.kind === 'sleep_event')
      .map(item => {
        if (item.kind !== 'sleep_event') return null
        const e = item.event
        const config: Record<string, { icon: string; label: string }> = {
          wake: { icon: '🌅', label: 'Woke up' },
          nap_start: { icon: '😴', label: 'Nap started' },
          nap_end: { icon: '🌤️', label: 'Nap ended' },
          bedtime: { icon: '🌙', label: 'Bedtime' },
          night_wake: { icon: '👀', label: 'Night wake' },
        }
        const cfg = config[e.event_type] ?? { icon: '•', label: e.event_type }
        const d = new Date(e.event_time)
        return {
          id: e.id,
          eventType: e.event_type as EventType,
          label: cfg.label,
          icon: cfg.icon,
          time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
          detail: e.notes ?? undefined,
          isActive: false,
        }
      })
      .filter(Boolean) as Array<{
        id: string
        eventType: EventType
        label: string
        icon: string
        time: string
        detail?: string
        isActive?: boolean
      }>
  }, [timelineItems])

  const formatDayLabel = useCallback((date: Date) => {
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'EEEE, MMM d')
  }, [])

  const formatMessageTime = useCallback((date: Date) => {
    return format(date, 'h:mm a')
  }, [])

  const groupedMessages = useMemo(() => {
    const sorted = [...allMessages].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return aTime - bTime
    })

    const groups: { date: Date; label: string; messages: typeof sorted }[] = []
    for (const msg of sorted) {
      const date = msg.createdAt ? new Date(msg.createdAt) : new Date()
      const lastGroup = groups[groups.length - 1]
      if (!lastGroup || !isSameDay(lastGroup.date, date)) {
        groups.push({ date, label: formatDayLabel(date), messages: [msg] })
      } else {
        lastGroup.messages.push(msg)
      }
    }
    return groups
  }, [allMessages, formatDayLabel])

  // Render chat messages for the drawer
  const chatMessagesElement = useMemo(() => {
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    const lastMessage = lastGroup?.messages[lastGroup.messages.length - 1]
    const lastMessageHasToolCalls = lastMessage && lastMessage.role !== 'user' && getToolParts(lastMessage).length > 0

    if (groupedMessages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">💬</span>
          <p className="text-sm font-700 text-[var(--text-muted)]">No messages yet</p>
          <p className="text-xs font-600 text-[var(--text-muted)] mt-1">Ask about sleep advice or tips</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col">
        {groupedMessages.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-col">
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#F0EDF5]" />
              <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.5px] text-[var(--text-muted)]">
                {group.label}
              </span>
              <div className="h-px flex-1 bg-[#F0EDF5]" />
            </div>

            {group.messages.map((msg, msgIndex) => {
              const text = extractText(msg)
              const isUser = msg.role === 'user'
              const msgTime = msg.createdAt
                ? formatMessageTime(new Date(msg.createdAt))
                : ''
              const toolParts = isUser ? [] : getToolParts(msg)
              const hasToolCalls = toolParts.length > 0
              const hasText = text.trim().length > 0
              const isLastMessage = groupIndex === groupedMessages.length - 1 && msgIndex === group.messages.length - 1

              return (
                <div key={msg.id} className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
                  {hasToolCalls && (
                    <ToolCallCard parts={toolParts} isStreaming={status === 'streaming' && isLastMessage} />
                  )}
                  {hasText && (
                    <Message from={msg.role}>
                      <MessageContent
                        className={isUser
                          ? 'bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] !text-white shadow-sm'
                          : 'bg-[var(--lavender-bg)] text-[var(--text)] shadow-sm'
                        }
                      >
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="m-0 whitespace-pre-wrap text-sm">{children}</p>,
                            a: ({ children, href }) => <a href={href} className="underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
                            ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
                            li: ({ children }) => <li className="my-0.5">{children}</li>,
                            code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 text-xs">{children}</code>,
                          }}
                        >
                          {text}
                        </ReactMarkdown>
                      </MessageContent>
                    </Message>
                  )}
                  {msgTime && (
                    <span className={cn(
                      'mt-0.5 px-1 text-[0.65rem] font-bold text-[var(--text-muted)]',
                      isUser && 'text-right'
                    )}>
                      {msgTime}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {status === 'streaming' && !lastMessageHasToolCalls && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--lavender-bg)] px-4 py-2 text-xs font-extrabold text-[var(--text-secondary)]">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
              Thinking...
            </div>
          </div>
        )}
      </div>
    )
  }, [groupedMessages, status, formatMessageTime, lastMessageHasToolCalls])

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <AppHeader baby={baby} />

      <SleepDashboard
        baby={baby}
        currentState={currentState}
        sleepPlan={sleepPlan}
        timelineItems={timelineDisplayItems}
        allEvents={allSleepEvents}
        chatMessages={chatMessagesElement}
        isChatStreaming={isLoading}
        onCreateEvent={handleCreateEvent}
        onUpdateEvent={handleUpdateEvent}
        onDeleteEvent={handleDeleteEventById}
        onSendMessage={handleSendMessage}
      />

      <UnifiedEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={selectedItem}
        onSaveEvent={handleSaveEvent}
        onSaveSession={handleSaveSession}
        onDeleteEvent={handleDeleteEvent}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  )
}

/** Extract text content from a chat message */
function extractText(msg: ChatMessageData): string {
  const parts = msg.parts as Array<{ type: string; text?: string }> | undefined
  if (parts && parts.length > 0) {
    return parts
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text)
      .join(' ')
  }
  return ''
}

interface ToolPart {
  type: string
  state?: 'input-streaming' | 'input-available' | 'output-available' | string
}

const toolInfo: Record<string, { label: string }> = {
  getBabyProfile: { label: 'Getting baby profile' },
  getTodayEvents: { label: "Checking today's events" },
  getSleepHistory: { label: 'Analyzing sleep history' },
  getChatHistory: { label: 'Recalling past conversations' },
  createSleepEvent: { label: 'Recording sleep event' },
  updatePatternNotes: { label: 'Saving pattern notes' },
  updateSleepPlan: { label: 'Updating schedule' },
}

function getToolParts(msg: ChatMessageData): ToolPart[] {
  const parts = msg.parts as Array<{ type: string; state?: string }> | undefined
  if (!parts) return []
  return parts.filter(p => p.type.startsWith('tool-'))
}

function ToolCallCard({ parts, isStreaming }: { parts: ToolPart[]; isStreaming?: boolean }) {
  const [isOpen, setIsOpen] = useState(true)
  const hasPending = parts.some(p => p.state !== 'output-available')

  return (
    <div className="mb-2 max-w-[90%] rounded-2xl border-[1.5px] border-[var(--lavender-light)] bg-gradient-to-br from-white to-[var(--lavender-bg)] px-4 py-3 shadow-[0_2px_10px_rgba(124,77,255,0.06)]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-[var(--text)]">
          <span className="text-base">🧠</span>
          {isStreaming && hasPending ? 'Thinking' : `Used ${parts.length} tool${parts.length === 1 ? '' : 's'}`}
        </span>
        <span className={cn('text-lg text-[var(--text-muted)] transition-transform', isOpen && 'rotate-180')}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1">
          {parts.map((part, idx) => {
            const toolName = part.type.replace('tool-', '')
            const info = toolInfo[toolName]
            const isComplete = part.state === 'output-available'
            const isActive = !isComplete
            return (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-2 py-1 text-xs font-bold',
                  isComplete ? 'text-[var(--text-secondary)]' : 'text-[var(--lavender)]'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                    isComplete ? 'bg-[var(--mint)] text-white' : 'bg-[var(--lavender)] text-white'
                  )}
                >
                  {isComplete ? '✓' : (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                </span>
                {info?.label || toolName}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
