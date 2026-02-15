'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UnifiedNapForm } from '@/components/unified-nap-form'
import { UnifiedSleepForm } from '@/components/unified-sleep-form'
import { NightWakeForm } from '@/components/night-wake-form'
import { SleepEvent, SleepSession, Context, EventType } from '@/types/database'

interface UnifiedEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: SleepSession | SleepEvent | null
  onSaveEvent?: (eventData: {
    id?: string
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => void | Promise<void>
  onSaveSession?: (sessionData: {
    startEvent: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
    endEvent?: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
  }) => void | Promise<void>
  onDeleteEvent?: () => void | Promise<void>
  onDeleteSession?: (startId: string, endId: string | null) => void | Promise<void>
}

function isSession(item: SleepSession | SleepEvent | null): item is SleepSession {
  return item !== null && 'type' in item && 'startEvent' in item
}

export function UnifiedEditDialog({
  open,
  onOpenChange,
  item,
  onSaveEvent,
  onSaveSession,
  onDeleteEvent,
  onDeleteSession,
}: UnifiedEditDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleSaveNap = useCallback(async (data: {
    startEventId?: string
    startTime: string
    endTime: string | null
    context: Context
    notes: string | null
  }) => {
    if (!item || !isSession(item)) return

    const sessionData = {
      startEvent: {
        id: item.startEvent.id,
        event_time: data.startTime,
        context: data.context,
        notes: data.notes,
      },
      ...(item.endEvent && data.endTime ? {
        endEvent: {
          id: item.endEvent.id,
          event_time: data.endTime,
          context: data.context,
          notes: null,
        }
      } : {})
    }

    await onSaveSession?.(sessionData)
    onOpenChange(false)
  }, [item, onSaveSession, onOpenChange])

  const handleSaveSleep = useCallback(async (data: {
    startEventId?: string
    startTime: string
    endTime: string | null
    context: Context
    notes: string | null
  }) => {
    if (!item || !isSession(item)) return

    const sessionData = {
      startEvent: {
        id: item.startEvent.id,
        event_time: data.startTime,
        context: data.context,
        notes: data.notes,
      },
      ...(item.endEvent && data.endTime ? {
        endEvent: {
          id: item.endEvent.id,
          event_time: data.endTime,
          context: data.context,
          notes: null,
        }
      } : {})
    }

    await onSaveSession?.(sessionData)
    onOpenChange(false)
  }, [item, onSaveSession, onOpenChange])

  const handleSaveNightWake = useCallback(async (data: {
    eventId?: string
    startTime: string
    endTime: string | null
    notes: string | null
  }) => {
    if (!item || isSession(item)) return

    await onSaveEvent?.({
      id: item.id,
      event_type: item.event_type as EventType,
      event_time: data.startTime,
      end_time: data.endTime,
      context: item.context as Context,
      notes: data.notes,
    })
    onOpenChange(false)
  }, [item, onSaveEvent, onOpenChange])

  const handleDeleteSession = useCallback(async () => {
    if (!item || !isSession(item)) return
    setIsDeleting(true)
    try {
      await onDeleteSession?.(item.startEvent.id, item.endEvent?.id || null)
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }, [item, onDeleteSession, onOpenChange])

  const handleDeleteEvent = useCallback(async () => {
    setIsDeleting(true)
    try {
      await onDeleteEvent?.()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }, [onDeleteEvent, onOpenChange])

  const handleCancel = () => {
    onOpenChange(false)
  }

  // Determine dialog title and content
  const getDialogTitle = () => {
    if (!item) return 'Edit Event'
    if (isSession(item)) {
      return item.type === 'nap' ? '😴 Edit Nap' : '🌙 Edit Overnight Sleep'
    }
    return '👀 Edit Night Wake'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {item && isSession(item) && item.type === 'nap' && (
            <UnifiedNapForm
              mode="edit"
              startEventId={item.startEvent.id}
              initialStartTime={item.startEvent.event_time}
              initialEndTime={item.endEvent?.event_time || null}
              initialContext={item.startEvent.context as Context}
              initialNotes={item.startEvent.notes}
              onSave={handleSaveNap}
              onDelete={handleDeleteSession}
              onCancel={handleCancel}
            />
          )}

          {item && isSession(item) && item.type === 'overnight' && (
            <UnifiedSleepForm
              mode="edit"
              startEventId={item.startEvent.id}
              initialStartTime={item.startEvent.event_time}
              initialEndTime={item.endEvent?.event_time || null}
              initialContext={item.startEvent.context as Context}
              initialNotes={item.startEvent.notes}
              onSave={handleSaveSleep}
              onDelete={handleDeleteSession}
              onCancel={handleCancel}
            />
          )}

          {item && !isSession(item) && item.event_type === 'night_wake' && (
            <NightWakeForm
              mode="edit"
              eventId={item.id}
              initialStartTime={item.event_time}
              initialEndTime={item.end_time}
              initialNotes={item.notes}
              onSave={handleSaveNightWake}
              onDelete={handleDeleteEvent}
              onCancel={handleCancel}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
