'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Baby, SleepEvent, SleepSession, SleepPlanRow, ChatMessage, EventType, Context } from '@/types/database'
import { findSessionForEvent, formatAge } from '@/lib/sleep-utils'
import { computeCurrentState, type SleepState } from '@/lib/state-machine'
import { getTodayBoundsForTimezone, getYesterdayBoundsForTimezone } from '@/lib/timezone'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeSync } from '@/lib/hooks/use-realtime-sync'
import { useSleepEventCRUD, type SaveEventData, type SaveSessionData } from '@/lib/hooks/use-sleep-event-crud'
import { useChatHistory, ChatMessageData } from '@/lib/hooks/use-chat-history'
import { useTimelineBuilder } from '@/lib/hooks/use-timeline-builder'
import { AppHeader } from '@/components/app-header'
import { ChatInput } from '@/components/chat-input'
import { UnifiedEditDialog } from '@/components/unified-edit-dialog'
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
  const [selectedItem, setSelectedItem] = useState<SleepSession | SleepEvent | null>(null)

  // Sleep plan state for ChatInput quick actions
  const [sleepPlan, setSleepPlan] = useState<SleepPlan | null>(null)

  // Local sleep plans for timeline display (tool-created + realtime)
  const [localSleepPlans, setLocalSleepPlans] = useState<SleepPlanRow[]>([])

  // Track which tool-created sleep plans we've already processed (by plan ID)
  const processedSleepPlanIds = useRef(new Set<string>())

  // Get user's timezone for the AI to correctly parse times
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  // Sleep event CRUD hook (placed early so localEvents/deletedEventIds
  // are available for building the API context sent with each chat message)
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

  // Combine all sleep events for context (initial + local, excluding deleted)
  // This runs before useTimelineBuilder to provide context for API calls.
  // localEvents is iterated first so that edited/updated versions of events
  // take precedence over the stale initialSleepEvents versions.
  const allEventsForContext = useMemo(() => {
    const seen = new Set<string>()
    const combined: SleepEvent[] = []
    for (const event of [...localEvents, ...initialSleepEvents]) {
      if (!seen.has(event.id) && !deletedEventIds.has(event.id)) {
        seen.add(event.id)
        combined.push(event)
      }
    }
    return combined.sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
  }, [initialSleepEvents, localEvents, deletedEventIds])

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

  // Build baby profile for API context (avoids a getBabyProfile tool call each turn)
  const babyProfileForApi = useMemo(() => ({
    name: baby.name,
    age: formatAge(baby.birth_date),
    birthDate: baby.birth_date,
    sleepTrainingMethod: baby.sleep_training_method,
    patternNotes: baby.pattern_notes,
  }), [baby.name, baby.birth_date, baby.sleep_training_method, baby.pattern_notes])

  // Create transport with API endpoint and body including pre-injected context
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

  // Handle creating events (from ChatInput quick actions and add dialog)
  const handleCreateEvent = useCallback(async (eventData: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => {
    // Create start event
    // For night_wake, end_time is stored on the single event record
    await createEvent({
      event_type: eventData.event_type as EventType,
      event_time: eventData.event_time,
      end_time: eventData.event_type === 'night_wake' ? (eventData.end_time ?? null) : null,
      context: eventData.context as Context,
      notes: eventData.notes,
    })

    // If end_time is provided, create the corresponding end event (for paired event types)
    if (eventData.end_time && eventData.event_type !== 'night_wake') {
      const endEventType: EventType | null = eventData.event_type === 'nap_start' ? 'nap_end' :
                           eventData.event_type === 'bedtime' ? 'wake' : null

      if (endEventType) {
        await createEvent({
          event_type: endEventType,
          event_time: eventData.end_time,
          context: eventData.context as Context,
          notes: null, // End events don't have notes
        })
      }
    }
  }, [createEvent])

  // Handle saving events (edit from dialog)
  const handleSaveEvent = useCallback(async (eventData: SaveEventData) => {
    const success = await saveEvent(eventData)
    if (success) {
      setEditDialogOpen(false)
      setSelectedItem(null)
    }
  }, [saveEvent])

  // Handle deleting events
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedItem || !('event_type' in selectedItem)) return
    const success = await deleteEvent(selectedItem)
    if (success) {
      // Broadcast delete to other family members
      await broadcastDelete('sleep_events', selectedItem)
      setEditDialogOpen(false)
      setSelectedItem(null)
    }
  }, [selectedItem, deleteEvent, broadcastDelete])

  // Handle saving session (paired events)
  const handleSaveSession = useCallback(async (sessionData: SaveSessionData) => {
    const success = await saveSession(sessionData)
    if (success) {
      setEditDialogOpen(false)
      setSelectedItem(null)
    }
  }, [saveSession])

  // Handle deleting session
  const handleDeleteSession = useCallback(async (startId: string, endId: string | null) => {
    const success = await deleteSession(startId, endId, allSleepEvents)
    if (success) {
      setEditDialogOpen(false)
      setSelectedItem(null)
    }
  }, [deleteSession, allSleepEvents])

  // Handle clicking on a sleep event in the timeline
  const handleEventClick = useCallback((event: SleepEvent) => {
    const session = findSessionForEvent(event, allSleepEvents)
    if (session) {
      setSelectedItem(session)
    } else {
      setSelectedItem(event)
    }
    setEditDialogOpen(true)
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

      {/* Edit Dialog */}
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
