'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { StateHero } from './state-hero'
import { PrimaryActionButton, SecondaryActionButton } from './action-buttons'
import { TimelineSection } from './timeline-section'
import { EventSheet, type EventSheetData } from './event-sheet'
import { ChatDrawer } from './chat-drawer'
import type { SleepState } from '@/lib/state-machine'
import { getCountdownContext } from '@/lib/state-machine'
import { useNow } from '@/lib/hooks/use-now'
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
  const stateConfig = getStateConfig(currentState, baby, sleepPlan, allEvents, now, {
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
  pills: Array<{ icon?: string; label: string; dot?: boolean; color?: 'lavender' | 'peach' | 'mint' | 'rose'; eventId?: string }>
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

function getDurationSince(events: SleepEvent[], type: EventType, now: Date = new Date()): string {
  const match = [...events].reverse().find(e => e.event_type === type)
  if (!match) return ''
  return formatDuration(now.getTime() - new Date(match.event_time).getTime())
}

function getStateConfig(
  state: SleepState,
  baby: Baby,
  sleepPlan: SleepPlan | null,
  events: SleepEvent[],
  now: Date,
  opts: {
    timezone?: string
    trendsNextNapHours?: number[]
    trendsBedtimeHour?: number | null
    trendsWakeHour?: number | null
  } = {}
): StateConfig {
  // Single source of truth for the live countdown arc + expected label block.
  const ctx = getCountdownContext(state, events, sleepPlan, baby.birth_date, now, opts)
  const countdown = {
    progress: ctx.progress,
    timeRemaining: ctx.timeRemaining,
    timeLabel: ctx.timeLabel,
  }
  const expectedLabel = {
    icon: ctx.expectedIcon,
    text: ctx.expectedText,
    time: ctx.expectedTime,
  }

  switch (state) {
    case 'overnight_sleep': {
      const bedtimeTime = getLastEventTime(events, 'bedtime')
      const sleepingFor = getDurationSince(events, 'bedtime', now)
      const bedtimeEvent = [...events].reverse().find(e => e.event_type === 'bedtime')
      const nightWakeCount = bedtimeEvent
        ? events.filter(
            e =>
              e.event_type === 'night_wake' &&
              new Date(e.event_time) > new Date(bedtimeEvent.event_time)
          ).length
        : events.filter(e => e.event_type === 'night_wake').length
      return {
        accent: 'lavender',
        icon: '🌙',
        title: 'Sleeping Soundly',
        elevated: false,
        pills: [
          { icon: '🌙', label: `Bedtime ${bedtimeTime}`, color: 'lavender', eventId: bedtimeEvent?.id },
          { dot: true, label: `Sleeping for ${sleepingFor}`, color: 'lavender' },
        ],
        countdown,
        expectedLabel,
        buttons: [
          { icon: '☀️', label: 'Log Wake Up', eventType: 'wake', accent: 'purple' as const },
          { icon: '👀', label: 'Night Wake', subtitle: nightWakeCount > 0 ? `${nightWakeCount} already` : undefined, eventType: 'night_wake', variant: 'secondary' as const },
        ],
      }
    }

    case 'daytime_awake': {
      // Branch off the schedule: bedtime is "next" only when every nap on the
      // plan is completed or skipped. Otherwise we're counting down to the
      // next nap (a baby waking in the morning is almost certainly expecting a
      // nap later, not bedtime).
      if (ctx.mode === 'bedtime') {
        const napEndTime = getLastEventTime(events, 'nap_end') || getLastEventTime(events, 'wake')
        const awakeFor = getDurationSince(events, 'nap_end', now) || getDurationSince(events, 'wake', now)
        const napEndEvent = [...events].reverse().find(e => e.event_type === 'nap_end')
        const wakeEvent = [...events].reverse().find(e => e.event_type === 'wake')
        return {
          accent: 'sunset',
          icon: '🌆',
          title: 'Awake & Ready',
          elevated: true,
          pills: [
            { icon: '🌤️', label: napEndTime ? `Nap ended ${napEndTime}` : 'Awake', color: 'peach', eventId: napEndEvent?.id ?? wakeEvent?.id },
            { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
          ],
          countdown,
          expectedLabel,
          buttons: [
            { icon: '🌙', label: 'Start Bedtime', subtitle: 'Nighttime sleep', eventType: 'bedtime', accent: 'sunset' as const },
          ],
        }
      }

      // Default (nap next): use last wake as the anchor event for the pills.
      const wakeTime = getLastEventTime(events, 'wake')
      const napEndEvent = [...events].reverse().find(e => e.event_type === 'nap_end')
      const wakeEvent = [...events].reverse().find(e => e.event_type === 'wake')
      const pillAnchor = wakeEvent ?? napEndEvent
      const pillAnchorType = wakeEvent ? 'wake' : 'nap_end'
      const pillLabel = wakeTime
        ? `Woke at ${wakeTime}`
        : pillAnchorType === 'nap_end' ? `Nap ended ${getLastEventTime(events, 'nap_end')}` : 'Awake'
      const awakeFor = getDurationSince(events, pillAnchorType, now)
      return {
        accent: 'peach',
        icon: '☀️',
        title: 'Awake & Playing',
        elevated: false,
        pills: [
          { icon: '☀️', label: pillLabel, color: 'peach', eventId: pillAnchor?.id },
          { dot: true, label: `Awake for ${awakeFor}`, color: 'peach' },
        ],
        countdown,
        expectedLabel,
        buttons: [
          { icon: '😴', label: 'Log Nap', subtitle: 'Start a nap', eventType: 'nap_start', accent: 'green' as const },
        ],
      }
    }

    case 'daytime_napping': {
      const napStartTime = getLastEventTime(events, 'nap_start')
      const nappingFor = getDurationSince(events, 'nap_start', now)
      const napStartEvent = [...events].reverse().find(e => e.event_type === 'nap_start')
      return {
        accent: 'mint',
        icon: '😴',
        title: 'Taking a Nap',
        elevated: false,
        pills: [
          { icon: '😴', label: napStartTime ? `Nap started ${napStartTime}` : 'Napping', color: 'mint', eventId: napStartEvent?.id },
          { dot: true, label: `Napping for ${nappingFor}`, color: 'mint' },
        ],
        countdown,
        expectedLabel,
        buttons: [
          { icon: '🌤️', label: 'End Nap', subtitle: 'Wake baby up', eventType: 'nap_end', accent: 'green' as const },
        ],
      }
    }

    case 'awaiting_morning_wake':
    default: {
      // Zero-events / freshly-onboarded state. Per spec there is no "Good
      // Morning" steady-state card — instead we welcome the user and prompt
      // them to log the baby's current overnight sleep (the most common first
      // event after setup). Logging `bedtime` transitions straight to
      // overnight_sleep.
      return {
        accent: 'lavender',
        icon: '👋',
        title: `Welcome, ${baby.name}`,
        elevated: false,
        pills: [],
        countdown,
        expectedLabel,
        buttons: [
          { icon: '🌙', label: 'Log Bedtime', subtitle: 'Start overnight sleep', eventType: 'bedtime', accent: 'purple' as const },
        ],
      }
    }
  }
}
