'use client'

import { ChevronRight } from 'lucide-react'
import { SleepEvent, SleepSession } from '@/types/database'
import { formatTime, formatDuration, calculateDurationMinutes, groupEventsIntoSessions } from '@/lib/sleep-utils'

interface TimelineProps {
  events: SleepEvent[]
  onSessionClick?: (session: SleepSession) => void
  onStandaloneEventClick?: (event: SleepEvent) => void
}

const standaloneConfig: Record<string, { icon: string; label: string }> = {
  wake: { icon: '☀️', label: 'Woke up' },
  night_wake: { icon: '👀', label: 'Night wake' },
  nap_end: { icon: '☀️', label: 'Nap ended' }, // Orphaned nap_end
}

export function Timeline({ events, onSessionClick, onStandaloneEventClick }: TimelineProps) {
  const items = groupEventsIntoSessions(events)

  return (
    <div className="space-y-2">
      {items.map((item) => {
        if (item.kind === 'session') {
          const { session } = item
          const isNap = session.type === 'nap'
          const isInProgress = session.endEvent === null
          const icon = isNap ? '😴' : '🌙'
          const label = isNap ? 'Nap' : 'Overnight'

          return (
            <div
              key={session.startEvent.id}
              className={`flex items-center gap-3 py-2 -mx-2 px-2 rounded-md ${
                onSessionClick
                  ? 'cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors'
                  : ''
              }`}
              onClick={() => onSessionClick?.(session)}
              role={onSessionClick ? 'button' : undefined}
              tabIndex={onSessionClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onSessionClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onSessionClick(session)
                }
              }}
            >
              <span className="text-xl w-8">{icon}</span>
              <span className="text-sm text-muted-foreground min-w-22">
                {formatTime(session.startEvent.event_time)}
                {' - '}
                {isInProgress ? '...' : formatTime(session.endEvent!.event_time)}
              </span>
              <span className="text-sm flex-1">
                {isInProgress ? `${label} in progress` : label}
                {session.durationMinutes !== null && (
                  <span className="text-muted-foreground ml-1">
                    ({formatDuration(session.durationMinutes)})
                  </span>
                )}
              </span>
              {session.startEvent.context && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  {session.startEvent.context}
                </span>
              )}
              {onSessionClick && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          )
        } else {
          // Standalone event
          const { event } = item
          const config = standaloneConfig[event.event_type] || { icon: '•', label: event.event_type }

          return (
            <div
              key={event.id}
              className={`flex items-center gap-3 py-2 -mx-2 px-2 rounded-md ${
                onStandaloneEventClick
                  ? 'cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors'
                  : ''
              }`}
              onClick={() => onStandaloneEventClick?.(event)}
              role={onStandaloneEventClick ? 'button' : undefined}
              tabIndex={onStandaloneEventClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onStandaloneEventClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onStandaloneEventClick(event)
                }
              }}
            >
              <span className="text-xl w-8">{config.icon}</span>
              <span className="text-sm text-muted-foreground min-w-16">
                {formatTime(event.event_time)}
                {event.event_type === 'night_wake' && event.end_time && (
                  <> - {formatTime(event.end_time)}</>
                )}
              </span>
              <span className="text-sm flex-1">
                {config.label}
                {event.event_type === 'night_wake' && event.end_time && (
                  <span className="text-muted-foreground ml-1">
                    ({formatDuration(calculateDurationMinutes(event.event_time, event.end_time))})
                  </span>
                )}
              </span>
              {event.context && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  {event.context}
                </span>
              )}
              {onStandaloneEventClick && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          )
        }
      })}
    </div>
  )
}
