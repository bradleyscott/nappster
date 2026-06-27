'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { StateHero } from './state-hero'
import { PrimaryActionButton, SecondaryActionButton } from './action-buttons'
import { TimelineSection } from './timeline-section'
import { EventSheet, type EventSheetData } from './event-sheet'
import { ChatDrawer } from './chat-drawer'
import type { SleepState } from '@/lib/state-machine'
import type { Baby, SleepEvent, EventType, Context } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

/** Derived timeline item shape from existing TimelineItem */
interface TimelineItemDisplay {
  id: string
  eventType: EventType
  label: string
  icon: string
  time: string
  detail?: string
  isActive?: boolean
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
  }) => Promise<void> | void
  /** Called when an event is updated */
  onUpdateEvent: (id: string, data: Partial<SleepEvent>) => Promise<void> | void
  /** Called when an event is deleted */
  onDeleteEvent: (id: string) => Promise<void> | void
  /** Called when a chat message is sent */
  onSendMessage: (text: string) => void
  className?: string
}

function getTimeBadgeForEvent(allEvents: SleepEvent[], eventType: EventType, time: Date): string | undefined {
  // No time badge needed for async logging
  return undefined
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
    // Build ISO time from form fields
    let hour = parseInt(data.hour, 10)
    if (data.ampm === 'PM' && hour !== 12) hour += 12
    if (data.ampm === 'AM' && hour === 12) hour = 0
    const eventTime = new Date(`${data.date}T${String(hour).padStart(2, '0')}:${data.minute}:00`)

    if (eventSheetMode === 'add') {
      await onCreateEvent({
        event_type: data.eventType,
        event_time: eventTime.toISOString(),
        context: data.context ?? 'home',
        notes: data.notes || null,
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

  // Derive UI from state
  const stateConfig = getStateConfig(currentState, baby.name, sleepPlan, allEvents)

  return (
    <div className={cn('mx-auto flex max-w-md flex-col gap-4 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2', className)}>
      {/* State Hero */}
      <StateHero
        accentColor={stateConfig.accent}
        icon={stateConfig.icon}
        title={stateConfig.title}
        pills={stateConfig.pills}
        countdown={stateConfig.countdown}
        expectedLabel={stateConfig.expectedLabel}
        elevated={stateConfig.elevated}
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

// ---- State configuration ----

interface ButtonConfig {
  icon: string
  label: string
  subtitle?: string
  timeBadge?: string
  accent?: string
  variant?: 'primary' | 'secondary'
  eventType?: EventType
}

interface StateConfig {
  accent: 'lavender' | 'peach' | 'mint' | 'sunset'
  icon: string
  title: string
  elevated: boolean
  pills: Array<{ icon?: string; label: string; dot?: boolean; color?: 'lavender' | 'peach' | 'mint' | 'rose' }>
  countdown: { progress: number; timeRemaining: string; timeLabel: string }
  expectedLabel: { icon: string; text: string; time: string }
  buttons: ButtonConfig[]
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getLastEventTime(events: SleepEvent[], type: EventType): string {
  const match = [...events].reverse().find(e => e.event_type === type)
  if (!match) return ''
  const d = new Date(match.event_time)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function getDurationSince(events: SleepEvent[], type: EventType): string {
  const match = [...events].reverse().find(e => e.event_type === type)
  if (!match) return ''
  return formatDuration(Date.now() - new Date(match.event_time).getTime())
}

function getStateConfig(
  state: SleepState,
  _babyName: string,
  sleepPlan: SleepPlan | null,
  events: SleepEvent[]
): StateConfig {
  const now = new Date()

  switch (state) {
    case 'overnight_sleep': {
      const bedtimeTime = getLastEventTime(events, 'bedtime')
      const sleepingFor = getDurationSince(events, 'bedtime')
      const nightWakeCount = events.filter(e => e.event_type === 'night_wake').length
      return {
        accent: 'lavender',
        icon: '🌙',
        title: 'Sleeping Soundly',
        elevated: false,
        pills: [
          { icon: '🌙', label: `Bedtime ${bedtimeTime}`, color: 'lavender' },
          { dot: true, label: `Sleeping for ${sleepingFor}`, color: 'lavender' },
        ],
        countdown: {
          progress: 0.55,
          timeRemaining: '6h 12m',
          timeLabel: 'until wake',
        },
        expectedLabel: { icon: '🌅', text: 'Expected wake', time: '6:48am' },
        buttons: [
          { icon: '☀️', label: 'Log Wake Up', eventType: 'wake', accent: 'purple' as const },
          { icon: '👀', label: 'Night Wake', subtitle: nightWakeCount > 0 ? `${nightWakeCount} already` : undefined, eventType: 'night_wake', variant: 'secondary' as const },
        ],
      }
    }

    case 'daytime_awake': {
      // Check if bedtime should be shown (next is bedtime, not nap)
      const bedtimeNext = sleepPlan ? true : false // simplified — real logic uses shouldShowBedtime
      if (bedtimeNext) {
        const napEndTime = getLastEventTime(events, 'nap_end') || getLastEventTime(events, 'wake')
        const awakeFor = getDurationSince(events, 'nap_end') || getDurationSince(events, 'wake')
        return {
          accent: 'sunset',
          icon: '🌆',
          title: 'Awake & Ready',
          elevated: true,
          pills: [
            { icon: '🌤️', label: napEndTime ? `Nap ended ${napEndTime}` : 'Awake', color: 'peach' },
            { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
          ],
          countdown: {
            progress: 0.7,
            timeRemaining: '1h 20m',
            timeLabel: 'until bedtime',
          },
          expectedLabel: { icon: '🌙', text: 'Target bedtime', time: '7:00pm' },
          buttons: [
            { icon: '🌙', label: 'Start Bedtime!', subtitle: 'Nighttime sleep', eventType: 'bedtime', accent: 'sunset' as const },
          ],
        }
      }

      // Naps still coming
      const wakeTime = getLastEventTime(events, 'wake')
      const awakeFor = getDurationSince(events, 'wake')
      return {
        accent: 'peach',
        icon: '☀️',
        title: 'Awake & Playing',
        elevated: false,
        pills: [
          { icon: '🌅', label: wakeTime ? `Woke at ${wakeTime}` : 'Awake', color: 'peach' },
          { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
        ],
        countdown: {
          progress: 0.4,
          timeRemaining: '2h 10m',
          timeLabel: 'until next nap',
        },
        expectedLabel: { icon: '😴', text: 'Next nap', time: '9:00am' },
        buttons: [
          { icon: '😴', label: 'Start Nap', subtitle: 'First nap of the day', eventType: 'nap_start', accent: 'green' as const },
        ],
      }
    }

    case 'daytime_napping': {
      const napStartTime = getLastEventTime(events, 'nap_start')
      const nappingFor = getDurationSince(events, 'nap_start')
      return {
        accent: 'mint',
        icon: '😴',
        title: 'Taking a Nap',
        elevated: false,
        pills: [
          { icon: '😴', label: napStartTime ? `Started ${napStartTime}` : 'Napping', color: 'mint' },
          { dot: true, label: `Napping for ${nappingFor}`, color: 'mint' },
        ],
        countdown: {
          progress: 0.3,
          timeRemaining: '35m',
          timeLabel: 'remaining',
        },
        expectedLabel: { icon: '🌤️', text: 'Expected end', time: '10:00am' },
        buttons: [
          { icon: '🌤️', label: 'Wake Up', subtitle: 'End this nap', eventType: 'nap_end', accent: 'green' as const },
        ],
      }
    }

    case 'awaiting_morning_wake': {
      return {
        accent: 'lavender',
        icon: '🌙',
        title: 'Good Morning!',
        elevated: false,
        pills: [],
        countdown: {
          progress: 0.85,
          timeRemaining: '6:48am',
          timeLabel: 'time to wake',
        },
        expectedLabel: { icon: '☀️', text: 'Log wake-up to start the day', time: '' },
        buttons: [
          { icon: '☀️', label: 'Morning Wake', subtitle: 'Start the day', eventType: 'wake', accent: 'purple' as const },
        ],
      }
    }

    default:
      return {
        accent: 'lavender',
        icon: '👋',
        title: 'Welcome',
        elevated: false,
        pills: [],
        countdown: { progress: 0, timeRemaining: '--', timeLabel: 'start' },
        expectedLabel: { icon: '✨', text: 'Log your first event to begin', time: '' },
        buttons: [],
      }
  }
}
