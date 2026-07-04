'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { StateHero } from './state-hero'
import { PrimaryActionButton, SecondaryActionButton } from './action-buttons'
import { TimelineSection } from './timeline-section'
import { EventSheet, type EventSheetData } from './event-sheet'
import { ChatDrawer } from './chat-drawer'
import type { SleepState } from '@/lib/state-machine'
import { useNow } from '@/lib/hooks/use-now'
import type { Baby, SleepEvent, EventType, Context } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'
import { getDashboardStateConfig } from '@/lib/dashboard-state-config'

/** Derived timeline item shape from existing TimelineItem */
interface TimelineItemDisplay {
  id: string
  eventType: EventType
  label: string
  icon: string
  time: string
  detail?: string
  isActive?: boolean
  /** Local date key (YYYY-MM-DD) in the user's timezone for grouping. */
  dateKey: string
  /** Human-readable day label, e.g. "Today", "Yesterday", "Mon, Jan 23". */
  dateLabel: string
  /** Short weekday abbreviation shown inside the rail pill, e.g. "SUN". */
  dateShort: string
}

interface SleepDashboardProps {
  baby: Baby
  currentState: SleepState
  sleepPlan: SleepPlan | null
  timelineItems: TimelineItemDisplay[]
  /** Raw events for the EventSheet create/edit */
  allEvents: SleepEvent[]
  /** Chat messages */
  chatMessages: React.ReactNode
  /** Chat streaming status */
  isChatStreaming?: boolean
  /** Called when a new event is created (from EventSheet or action buttons) */
  onCreateEvent: (data: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
    force?: boolean
  }) => Promise<void> | void
  /** Called when an event is updated */
  onUpdateEvent: (id: string, data: Partial<SleepEvent>) => Promise<void> | void
  /** Called when an event is deleted */
  onDeleteEvent: (id: string) => Promise<void> | void
  /** Called when a chat message is sent */
  onSendMessage: (text: string) => void
  className?: string
  /** IANA timezone (server-passed); used to scope "today" for staleness checks. */
  timezone?: string
  /** Trends-derived typical-day nap start hours (24h decimal), ascending. */
  trendsNextNapHours?: number[]
  /** Trends-derived typical-day bedtime start hour (24h decimal), or null. */
  trendsBedtimeHour?: number | null
  /** Trends-derived typical morning wake hour (24h decimal), or null. */
  trendsWakeHour?: number | null
  /** True while a fresh AI sleep plan is being generated in the background. */
  isPlanGenerating?: boolean
}

export function SleepDashboard({
  baby,
  currentState,
  sleepPlan,
  timelineItems,
  allEvents,
  chatMessages,
  isChatStreaming,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onSendMessage,
  className,
  timezone,
  trendsNextNapHours = [],
  trendsBedtimeHour = null,
  trendsWakeHour = null,
  isPlanGenerating = false,
}: SleepDashboardProps) {
  // Event sheet state
  const [showEventSheet, setShowEventSheet] = useState(false)
  const [eventSheetMode, setEventSheetMode] = useState<'add' | 'edit'>('add')
  const [editingEvent, setEditingEvent] = useState<SleepEvent | null>(null)

  const openAddSheet = useCallback(() => {
    setEditingEvent(null)
    setEventSheetMode('add')
    setShowEventSheet(true)
  }, [])

  const openEditSheet = useCallback((item: { id: string }) => {
    const event = allEvents.find((e) => e.id === item.id)
    if (event) {
      setEditingEvent(event)
      setEventSheetMode('edit')
      setShowEventSheet(true)
    }
  }, [allEvents])

  const closeSheet = useCallback(() => {
    setShowEventSheet(false)
    setEditingEvent(null)
  }, [])

  const handleSheetSave = useCallback(async (data: EventSheetData) => {
    // Build ISO time from form fields (time is already in local 24h HH:MM)
    const eventTime = new Date(`${data.date}T${data.time}:00`)

    if (eventSheetMode === 'add') {
      await onCreateEvent({
        event_type: data.eventType,
        event_time: eventTime.toISOString(),
        context: data.context ?? 'home',
        notes: data.notes || null,
        force: true, // EventSheet is for backfilling past events — skip state validation
      })
    } else if (editingEvent) {
      await onUpdateEvent(editingEvent.id, {
        event_type: data.eventType,
        event_time: eventTime.toISOString(),
        context: data.context,
        notes: data.notes || null,
      })
    }
    closeSheet()
  }, [eventSheetMode, editingEvent, onCreateEvent, onUpdateEvent, closeSheet])

  const handleSheetDelete = useCallback(async () => {
    if (editingEvent) {
      await onDeleteEvent(editingEvent.id)
    }
    closeSheet()
  }, [editingEvent, onDeleteEvent, closeSheet])

  // Quick-action: log an event immediately (no sheet)
  const handleQuickAction = useCallback(async (eventType: EventType) => {
    await onCreateEvent({
      event_type: eventType,
      event_time: new Date().toISOString(),
      context: 'home',
      notes: null,
    })
  }, [onCreateEvent])

  // Live `now` so the countdown ring ticks (every 30s).
  const now = useNow(30_000)

  // Derive UI from state. Pass the timezone + trends projection so the
  // countdown can detect a stale AI plan and fall back to the trends-derived
  // "typical day" schedule (keeping the dashboard consistent with /sleep-trends).
  const stateConfig = getDashboardStateConfig(currentState, baby, sleepPlan, allEvents, now, {
    timezone,
    trendsNextNapHours,
    trendsBedtimeHour,
    trendsWakeHour,
  })

  return (
    <div className={cn('mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 md:max-w-xl lg:max-w-2xl', className)}>
      {/* State Hero */}
      <StateHero
        accentColor={stateConfig.accent}
        icon={stateConfig.icon}
        title={stateConfig.title}
        pills={stateConfig.pills}
        countdown={stateConfig.countdown}
        expectedLabel={stateConfig.expectedLabel}
        explanation={stateConfig.explanation}
        source={stateConfig.source}
        elevated={stateConfig.elevated}
        onPillTap={(eventId) => openEditSheet({ id: eventId })}
        isPlanGenerating={isPlanGenerating}
      />

      {/* Action Buttons */}
      {stateConfig.buttons.length > 0 && (
        <div className="flex flex-col gap-2">
          {stateConfig.buttons.map((btn, i) => (
            btn.variant === 'primary' || !btn.variant ? (
              <PrimaryActionButton
                key={i}
                icon={btn.icon}
                label={btn.label}
                subtitle={btn.subtitle}
                timeBadge={btn.timeBadge}
                variant={btn.accent as 'purple' | 'green' | 'sunset' | 'rosepeach' | undefined}
                onClick={() => btn.eventType && handleQuickAction(btn.eventType)}
              />
            ) : (
              <SecondaryActionButton
                key={i}
                icon={btn.icon}
                label={btn.label}
                subtitle={btn.subtitle}
                onClick={() => btn.eventType && handleQuickAction(btn.eventType)}
              />
            )
          ))}
        </div>
      )}

      {/* Timeline */}
      <TimelineSection
        items={timelineItems}
        onAddEvent={openAddSheet}
        onEditEvent={openEditSheet}
      />

      {/* Event Sheet */}
      <EventSheet
        open={showEventSheet}
        mode={eventSheetMode}
        event={editingEvent}
        onSave={handleSheetSave}
        onDelete={eventSheetMode === 'edit' ? handleSheetDelete : undefined}
        onClose={closeSheet}
      />

      {/* Chat Drawer */}
      <ChatDrawer
        onSendMessage={onSendMessage}
        isStreaming={isChatStreaming}
      >
        {chatMessages}
      </ChatDrawer>
    </div>
  )
}
