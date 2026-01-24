'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SleepSession, Context } from '@/types/database'
import { formatDuration, calculateDurationMinutes } from '@/lib/sleep-utils'

interface SleepSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: SleepSession | null
  onSave: (sessionData: {
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
  }) => void
  onDelete: (startId: string, endId: string | null) => void
}

const contextOptions: { value: Context; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'home', label: 'Home' },
  { value: 'daycare', label: 'Daycare' },
  { value: 'travel', label: 'Travel' },
]

function toLocalDateTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

interface SessionFormProps {
  session: SleepSession
  onSave: SleepSessionDialogProps['onSave']
  onDelete: SleepSessionDialogProps['onDelete']
  onClose: () => void
}

function SessionForm({ session, onSave, onDelete, onClose }: SessionFormProps) {
  const isNap = session.type === 'nap'
  const isInProgress = session.endEvent === null

  const [startTime, setStartTime] = useState(
    toLocalDateTimeString(new Date(session.startEvent.event_time))
  )
  const [endTime, setEndTime] = useState(
    session.endEvent
      ? toLocalDateTimeString(new Date(session.endEvent.event_time))
      : ''
  )
  const [context, setContext] = useState<Context>(
    (session.startEvent.context as Context) || null
  )
  const [notes, setNotes] = useState(session.startEvent.notes || '')

  // Calculate duration for display
  const durationMinutes = useMemo(() => {
    if (!endTime || !startTime) return null
    return calculateDurationMinutes(
      new Date(startTime).toISOString(),
      new Date(endTime).toISOString()
    )
  }, [startTime, endTime])

  // Derive validation error from duration
  const validationError = useMemo(() => {
    if (durationMinutes !== null && durationMinutes < 0) {
      return 'End time must be after start time'
    }
    return null
  }, [durationMinutes])

  const handleSave = () => {
    if (validationError) return

    const startEventTime = new Date(startTime).toISOString()

    const saveData: Parameters<typeof onSave>[0] = {
      startEvent: {
        id: session.startEvent.id,
        event_time: startEventTime,
        context,
        notes: notes || null,
      }
    }

    if (session.endEvent && endTime) {
      const endEventTime = new Date(endTime).toISOString()
      saveData.endEvent = {
        id: session.endEvent.id,
        event_time: endEventTime,
        context,
        notes: null, // Notes only on start event
      }
    }

    onSave(saveData)
    onClose()
  }

  const handleDelete = () => {
    onDelete(session.startEvent.id, session.endEvent?.id || null)
  }

  const title = isNap ? 'Edit Nap' : 'Edit Overnight Sleep'
  const icon = isNap ? '😴' : '🌙'

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span>{icon}</span>
          {title}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Start Time */}
        <div className="space-y-2">
          <Label htmlFor="start-time">
            {isNap ? 'Nap Started' : 'Bedtime'}
          </Label>
          <Input
            id="start-time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-12"
          />
        </div>

        {/* End Time - hidden if in progress */}
        {!isInProgress && (
          <div className="space-y-2">
            <Label htmlFor="end-time">
              {isNap ? 'Nap Ended' : 'Woke Up'}
            </Label>
            <Input
              id="end-time"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-12"
            />
          </div>
        )}

        {isInProgress && (
          <div className="text-sm text-muted-foreground italic">
            {isNap ? 'Nap is still in progress' : 'Currently sleeping'}
          </div>
        )}

        {/* Duration display */}
        {durationMinutes !== null && durationMinutes >= 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-medium">{formatDuration(durationMinutes)}</span>
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <div className="text-sm text-destructive">
            {validationError}
          </div>
        )}

        {/* Context Selector */}
        <div className="space-y-2">
          <Label htmlFor="context">Location (optional)</Label>
          <select
            id="context"
            value={context || ''}
            onChange={(e) => setContext((e.target.value || null) as Context)}
            className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {contextOptions.map((opt) => (
              <option key={opt.label} value={opt.value || ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-col">
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          className="w-full"
        >
          Delete {isNap ? 'Nap' : 'Overnight Sleep'}
        </Button>
        <div className="flex gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="flex-1"
            disabled={!!validationError}
          >
            Save Changes
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function SleepSessionDialog({
  open,
  onOpenChange,
  session,
  onSave,
  onDelete,
}: SleepSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open && session && (
          <SessionForm
            key={session.startEvent.id}
            session={session}
            onSave={onSave}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
