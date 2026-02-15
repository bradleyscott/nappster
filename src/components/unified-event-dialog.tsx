'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EventTypeSelector, type EventCategory, type InProgressSession } from '@/components/event-type-selector'
import { UnifiedNapForm } from '@/components/unified-nap-form'
import { UnifiedSleepForm } from '@/components/unified-sleep-form'
import { NightWakeForm } from '@/components/night-wake-form'
import { EventType, Context, SleepEvent } from '@/types/database'
import { calculateDurationMinutes } from '@/lib/sleep-utils'

interface UnifiedEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  babyId: string
  allEvents: SleepEvent[]
  onSave: (eventData: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => void | Promise<void>
}

export function UnifiedEventDialog({
  open,
  onOpenChange,
  allEvents,
  onSave,
}: UnifiedEventDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null)
  const [completingSession, setCompletingSession] = useState<Omit<InProgressSession, 'durationMinutes'> | null>(null)

  // Detect in-progress session
  const inProgressSession = useMemo(() => {
    // Sort events by time
    const sortedEvents = [...allEvents].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )

    // Look for unpaired nap_start
    for (let i = sortedEvents.length - 1; i >= 0; i--) {
      const event = sortedEvents[i]
      if (event.event_type === 'nap_start') {
        // Check if there's a nap_end after it
        const hasEnd = sortedEvents.some(
          (e, idx) => idx > i && e.event_type === 'nap_end'
        )
        if (!hasEnd) {
          const durationMinutes = calculateDurationMinutes(
            event.event_time,
            new Date().toISOString()
          )
          return {
            type: 'nap' as const,
            startEventId: event.id,
            startTime: event.event_time,
            context: event.context as Context,
            notes: event.notes,
            durationMinutes,
          }
        }
      }
      if (event.event_type === 'bedtime') {
        // Check if there's a wake after it
        const hasWake = sortedEvents.some(
          (e, idx) => idx > i && e.event_type === 'wake'
        )
        if (!hasWake) {
          const durationMinutes = calculateDurationMinutes(
            event.event_time,
            new Date().toISOString()
          )
          return {
            type: 'bedtime' as const,
            startEventId: event.id,
            startTime: event.event_time,
            context: event.context as Context,
            notes: event.notes,
            durationMinutes,
          }
        }
      }
    }
    return null
  }, [allEvents])

  const handleCompleteSession = useCallback((session: InProgressSession) => {
    setCompletingSession({
      type: session.type,
      startEventId: session.startEventId,
      startTime: session.startTime,
      context: session.context,
      notes: session.notes,
    })
    setSelectedCategory(session.type === 'nap' ? 'nap' : 'sleep')
  }, [])

  const handleSaveNap = async (data: {
    startEventId?: string
    startTime: string
    endTime: string | null
    context: Context
    notes: string | null
  }) => {
    if (data.endTime) {
      // Create both nap_start and nap_end
      await onSave({
        event_type: 'nap_start',
        event_time: data.startTime,
        end_time: data.endTime,
        context: data.context,
        notes: data.notes,
      })
    } else {
      // Create only nap_start
      await onSave({
        event_type: 'nap_start',
        event_time: data.startTime,
        context: data.context,
        notes: data.notes,
      })
    }
    onOpenChange(false)
    resetDialog()
  }

  const handleSaveSleep = async (data: {
    startEventId?: string
    startTime: string
    endTime: string | null
    context: Context
    notes: string | null
  }) => {
    if (data.endTime) {
      // Create both bedtime and wake
      await onSave({
        event_type: 'bedtime',
        event_time: data.startTime,
        end_time: data.endTime,
        context: data.context,
        notes: data.notes,
      })
    } else {
      // Create only bedtime
      await onSave({
        event_type: 'bedtime',
        event_time: data.startTime,
        context: data.context,
        notes: data.notes,
      })
    }
    onOpenChange(false)
    resetDialog()
  }

  const handleSaveNightWake = async (data: {
    eventId?: string
    startTime: string
    endTime: string | null
    notes: string | null
  }) => {
    await onSave({
      event_type: 'night_wake',
      event_time: data.startTime,
      end_time: data.endTime,
      context: null,
      notes: data.notes,
    })
    onOpenChange(false)
    resetDialog()
  }

  const resetDialog = () => {
    setSelectedCategory(null)
    setCompletingSession(null)
  }

  const handleCancel = () => {
    if (selectedCategory) {
      setSelectedCategory(null)
      setCompletingSession(null)
    } else {
      onOpenChange(false)
    }
  }

  // Determine dialog title
  const getDialogTitle = () => {
    if (completingSession) {
      return completingSession.type === 'nap' ? '😴 Complete Nap' : '☀️ Log Morning Wake'
    }
    if (selectedCategory === 'nap') return '😴 Log Nap'
    if (selectedCategory === 'sleep') return '🌙 Log Overnight Sleep'
    if (selectedCategory === 'night_wake') return '👀 Log Night Wake'
    return 'Add Sleep Event'
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen)
      if (!isOpen) resetDialog()
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {!selectedCategory && (
            <EventTypeSelector
              onSelectCategory={setSelectedCategory}
              onCompleteSession={handleCompleteSession}
              inProgressSession={inProgressSession}
            />
          )}

          {selectedCategory === 'nap' && (
            <UnifiedNapForm
              mode={completingSession ? 'complete' : 'create'}
              startEventId={completingSession?.startEventId}
              initialStartTime={completingSession?.startTime}
              initialEndTime={completingSession ? new Date().toISOString() : null}
              initialContext={completingSession?.context}
              initialNotes={completingSession?.notes}
              onSave={handleSaveNap}
              onCancel={handleCancel}
            />
          )}

          {selectedCategory === 'sleep' && (
            <UnifiedSleepForm
              mode={completingSession ? 'complete' : 'create'}
              startEventId={completingSession?.startEventId}
              initialStartTime={completingSession?.startTime}
              initialEndTime={completingSession ? new Date().toISOString() : null}
              initialContext={completingSession?.context}
              initialNotes={completingSession?.notes}
              onSave={handleSaveSleep}
              onCancel={handleCancel}
            />
          )}

          {selectedCategory === 'night_wake' && (
            <NightWakeForm
              mode="create"
              onSave={handleSaveNightWake}
              onCancel={handleCancel}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
