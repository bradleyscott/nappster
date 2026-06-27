'use client'

import { useChat } from '@ai-sdk/react'
import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Baby, SleepEvent, SleepSession, ChatMessage, EventType, Context } from '@/types/database'
import { findSessionForEvent } from '@/lib/sleep-utils'
import { isValidEvent } from '@/lib/state-machine'
import { mergeEvents } from '@/lib/merge-data'
import { createClient } from '@/lib/supabase/client'
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
import { ChatInput } from '@/components/chat-input'
import { UnifiedEditDialog } from '@/components/unified-edit-dialog'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { TimelineRenderer } from '@/components/timeline-renderer'
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
  const router = useRouter()
  const supabase = createClient()
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

  const handleEventClick = useCallback((event: SleepEvent) => {
    const session = findSessionForEvent(event, allSleepEvents)
    setSelectedItem(session ?? event)
    setEditDialogOpen(true)
  }, [allSleepEvents])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }, [supabase, router])

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <AppHeader baby={baby} onSignOut={handleSignOut} />
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-6 gap-4">
          <TimelineRenderer
            timelineItems={timelineItems}
            allMessages={allMessages}
            allSleepEvents={allSleepEvents}
            allSleepPlans={allSleepPlans}
            baby={baby}
            status={status}
            isLoadingHistory={isLoadingHistory}
            hasMoreHistory={hasMoreHistory}
            onLoadMoreHistory={loadMoreHistory}
            onSendMessage={handleSendMessage}
            onEventClick={handleEventClick}
          />
        </ConversationContent>
        <ConversationScrollButton className="shadow-lg" />
      </Conversation>

      <div className="sticky bottom-0 border-t py-1 sm:py-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 chat-input-container">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <ChatInput
            babyId={baby.id}
            babyName={baby.name}
            allEvents={allSleepEvents}
            onSendMessage={handleSendMessage}
            onCreateEvent={handleCreateEvent}
            status={status}
            sleepPlan={sleepPlan}
            currentState={currentState}
            disabled={isLoading}
          />
        </div>
      </div>

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
