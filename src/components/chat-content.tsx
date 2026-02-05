'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Baby, SleepEvent, SleepSession, SleepPlanRow, ChatMessage } from '@/types/database'
import { findSessionForEvent } from '@/lib/sleep-utils'
import { computeCurrentState, type SleepState } from '@/lib/state-machine'
import { getTodayBoundsForTimezone, getYesterdayBoundsForTimezone } from '@/lib/timezone'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeSync } from '@/lib/hooks/use-realtime-sync'
import { useSleepEventCRUD, type SaveEventData, type SaveSessionData } from '@/lib/hooks/use-sleep-event-crud'
import { useChatHistory, ChatMessageData } from '@/lib/hooks/use-chat-history'
import { useTimelineBuilder } from '@/lib/hooks/use-timeline-builder'
import { AppHeader } from '@/components/app-header'
import { ChatInput } from '@/components/chat-input'
import { SleepEventDialog } from '@/components/sleep-event-dialog'
import { SleepSessionDialog } from '@/components/sleep-session-dialog'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { TimelineRenderer } from '@/components/timeline-renderer'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

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

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<SleepEvent | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SleepSession | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Sleep plan state for ChatInput quick actions
  const [sleepPlan, setSleepPlan] = useState<SleepPlan | null>(null)

  // Local sleep plans for timeline display (tool-created + realtime)
  const [localSleepPlans, setLocalSleepPlans] = useState<SleepPlanRow[]>([])

  // Track which tool-created sleep plans we've already processed (by plan ID)
  const processedSleepPlanIds = useRef(new Set<string>())

  // Get user's timezone for the AI to correctly parse times
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  // Combine all sleep events for context (initial + local, excluding deleted)
  // This runs before useTimelineBuilder to provide context for API calls
  const allEventsForContext = useMemo(() => {
    const seen = new Set<string>()
    const combined: SleepEvent[] = []
    for (const event of initialSleepEvents) {
      if (!seen.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }
    return combined.sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
  }, [initialSleepEvents])

  // Filter to today's events for API context
  const todayEventsForApi = useMemo(() => {
    const { start, end } = getTodayBoundsForTimezone(timezone)
    return allEventsForContext
      .filter(e => e.event_time >= start && e.event_time < end)
      .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
  }, [allEventsForContext, timezone])

  // Get last 5 messages for API context (from initial messages only, to avoid hydration issues)
  const recentMessagesForApi = useMemo(() => {
    return [...initialMessages]
      .filter(m => m.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 5)
      .reverse()
      .map(m => ({ role: m.role, parts: m.parts }))
  }, [initialMessages])

  // Create transport with API endpoint and body including pre-injected context
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: {
      babyId: baby.id,
      timezone,
      todayEvents: todayEventsForApi,
      recentMessages: recentMessagesForApi,
    },
  }), [baby.id, timezone, todayEventsForApi, recentMessagesForApi])

  const { messages: liveMessages, sendMessage, status } = useChat({
    transport,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Chat history hook
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

  // Sleep event CRUD hook
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
  } = useSleepEventCRUD({
    babyId: baby.id,
  })

  // Add a sleep plan created by AI tools to local state
  const addToolCreatedPlan = useCallback((plan: SleepPlanRow) => {
    if (!processedSleepPlanIds.current.has(plan.id)) {
      processedSleepPlanIds.current.add(plan.id)
      setLocalSleepPlans(prev => {
        if (prev.some(p => p.id === plan.id)) return prev
        return [...prev, plan]
      })
    }
  }, [])

  // Refresh data when tab becomes visible or connection is restored
  // This catches updates that were missed while the app was backgrounded
  const lastRefreshRef = useRef<number>(0)
  const refreshData = useCallback(async () => {
    // Debounce: don't refresh more than once every 2 seconds
    const now = Date.now()
    if (now - lastRefreshRef.current < 2000) return
    lastRefreshRef.current = now

    const { start: yesterdayStart } = getYesterdayBoundsForTimezone(timezone)

    try {
      // Fetch recent sleep events (from yesterday to catch overnight sleep)
      const { data: recentEvents } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('baby_id', baby.id)
        .gte('event_time', yesterdayStart)
        .order('event_time', { ascending: true })

      if (recentEvents && recentEvents.length > 0) {
        mergeRefreshedEvents(recentEvents)
      }

      // Fetch recent chat messages (last 50)
      const { data: recentMessages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('baby_id', baby.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (recentMessages && recentMessages.length > 0) {
        const formatted = recentMessages.reverse().map(msg => ({
          id: msg.message_id,
          role: msg.role as 'user' | 'assistant',
          parts: msg.parts,
          createdAt: msg.created_at,
        }))
        mergeRefreshedMessages(formatted)
      }

      // Fetch recent sleep plans
      const { data: recentPlans } = await supabase
        .from('sleep_plans')
        .select('*')
        .eq('baby_id', baby.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (recentPlans && recentPlans.length > 0) {
        // Merge into local sleep plans
        setLocalSleepPlans(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const newPlans = recentPlans.filter(p => !existingIds.has(p.id))
          if (newPlans.length === 0) return prev
          return [...prev, ...newPlans]
        })

        // Update the active plan for quick actions
        const activePlan = recentPlans.find(p => p.is_active)
        if (activePlan) {
          setSleepPlan({
            currentState: activePlan.current_state as SleepPlan['currentState'],
            nextAction: activePlan.next_action as SleepPlan['nextAction'],
            schedule: activePlan.schedule as SleepPlan['schedule'],
            targetBedtime: activePlan.target_bedtime,
            summary: activePlan.summary,
          })
        }
      }
    } catch (error) {
      console.error('Error refreshing data:', error)
    }
  }, [baby.id, supabase, timezone, mergeRefreshedEvents, mergeRefreshedMessages])

  // Realtime sync for multi-family member updates
  const { broadcastDelete } = useRealtimeSync({
    babyId: baby.id,
    enabled: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true',
    onSleepEventChange: useCallback((event: SleepEvent, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (!isEventTracked(event.id)) {
        handleRealtimeEvent(event, changeType)
      }
    }, [isEventTracked, handleRealtimeEvent]),
    onChatMessageChange: useCallback((message: ChatMessage, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (liveMessages.some(m => m.id === message.message_id)) {
        return
      }
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
      // Skip plans we created ourselves via tool
      if (processedSleepPlanIds.current.has(plan.id)) return

      if (changeType === 'DELETE') {
        setSleepPlan(null)
        setLocalSleepPlans(prev => prev.filter(p => p.id !== plan.id))
      } else {
        // Update ChatInput quick actions if this is the active plan
        if (plan.is_active) {
          setSleepPlan({
            currentState: plan.current_state as SleepPlan['currentState'],
            nextAction: plan.next_action as SleepPlan['nextAction'],
            schedule: plan.schedule as SleepPlan['schedule'],
            targetBedtime: plan.target_bedtime,
            summary: plan.summary,
          })
        }
        // Add to timeline (for plans from other family members)
        setLocalSleepPlans(prev => {
          if (changeType === 'INSERT') {
            if (prev.some(p => p.id === plan.id)) return prev
            return [...prev, plan]
          } else {
            // UPDATE
            return prev.map(p => p.id === plan.id ? plan : p)
          }
        })
      }
    }, []),
    onRefreshData: refreshData,
  })

  // Type guard helpers for message parts
  const isToolPart = (part: unknown): part is { type: string; state?: string; output?: unknown } => {
    return (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      typeof (part as { type: unknown }).type === 'string'
    )
  }

  const hasToolOutput = (part: { output?: unknown }): part is { output: Record<string, unknown> } => {
    return typeof part.output === 'object' && part.output !== null
  }

  // Extract events created by AI tools and add them to localEvents
  // Also handle sleep plan updates from the updateSleepPlan tool
  useEffect(() => {
    for (const msg of liveMessages) {
      if (msg.role !== 'assistant') continue
      const parts = msg.parts
      if (!Array.isArray(parts)) continue

      for (const part of parts) {
        if (!isToolPart(part)) continue

        if (
          part.type === 'tool-createSleepEvent' &&
          part.state === 'output-available' &&
          hasToolOutput(part) &&
          part.output.success === true &&
          part.output.event
        ) {
          addToolCreatedEvent(part.output.event as SleepEvent)
        }

        if (
          part.type === 'tool-updateSleepPlan' &&
          part.state === 'output-available' &&
          hasToolOutput(part) &&
          part.output.success === true &&
          part.output.plan
        ) {
          const planData = part.output.plan as SleepPlanRow
          // Only process each plan once
          if (!processedSleepPlanIds.current.has(planData.id)) {
            // Update ChatInput quick actions state
            setSleepPlan({
              currentState: planData.current_state as SleepPlan['currentState'],
              nextAction: planData.next_action as SleepPlan['nextAction'],
              schedule: planData.schedule as SleepPlan['schedule'],
              targetBedtime: planData.target_bedtime,
              summary: planData.summary,
            })
            // Add to timeline
            addToolCreatedPlan(planData)
          }
        }
      }
    }
  }, [liveMessages, addToolCreatedEvent, addToolCreatedPlan])

  // Timeline builder hook
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

  // Compute current state from today's events for quick action buttons
  // We use state + effect to avoid hydration mismatch from Date.now() differences
  // Uses timezone-aware date bounds to correctly filter events for the user's local "today"
  const [currentState, setCurrentState] = useState<SleepState>('awaiting_morning_wake')
  useEffect(() => {
    const { start, end } = getTodayBoundsForTimezone(timezone)
    const todayEvents = allSleepEvents
      .filter(e => e.event_time >= start && e.event_time < end)
      .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
    setCurrentState(computeCurrentState(todayEvents))
  }, [allSleepEvents, timezone])

  // Handle sending chat messages
  const handleSendMessage = useCallback(async (text: string) => {
    await sendMessage({ text })
  }, [sendMessage])

  // Handle creating events (from ChatInput quick actions)
  const handleCreateEvent = useCallback(async (eventData: {
    event_type: SleepEvent['event_type']
    event_time: string
    context: SleepEvent['context']
    notes: string | null
  }) => {
    await createEvent(eventData as Parameters<typeof createEvent>[0])
  }, [createEvent])

  // Handle saving events (edit from dialog)
  const handleSaveEvent = useCallback(async (eventData: SaveEventData) => {
    const success = await saveEvent(eventData)
    if (success) {
      setEditDialogOpen(false)
      setSelectedEvent(null)
    }
  }, [saveEvent])

  // Handle deleting events
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return
    const success = await deleteEvent(selectedEvent)
    if (success) {
      // Broadcast delete to other family members
      await broadcastDelete('sleep_events', selectedEvent)
      setDeleteDialogOpen(false)
      setEditDialogOpen(false)
      setSelectedEvent(null)
    }
  }, [selectedEvent, deleteEvent, broadcastDelete])

  // Handle saving session (paired events)
  const handleSaveSession = useCallback(async (sessionData: SaveSessionData) => {
    const success = await saveSession(sessionData)
    if (success) {
      setSessionDialogOpen(false)
      setSelectedSession(null)
    }
  }, [saveSession])

  // Handle deleting session
  const handleDeleteSession = useCallback(async (startId: string, endId: string | null) => {
    const success = await deleteSession(startId, endId, allSleepEvents)
    if (success) {
      setSessionDialogOpen(false)
      setSelectedSession(null)
    }
  }, [deleteSession, allSleepEvents])

  // Handle clicking on a sleep event in the timeline
  const handleEventClick = useCallback((event: SleepEvent) => {
    const session = findSessionForEvent(event, allSleepEvents)
    if (session) {
      setSelectedSession(session)
      setSessionDialogOpen(true)
    } else {
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

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <AppHeader
          baby={baby}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Messages */}
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

      {/* Chat Input */}
      <div className="sticky bottom-0 border-t py-1 sm:py-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 chat-input-container">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <ChatInput
            babyId={baby.id}
            babyName={baby.name}
            onSendMessage={handleSendMessage}
            onCreateEvent={handleCreateEvent}
            status={status}
            sleepPlan={sleepPlan}
            currentState={currentState}
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
