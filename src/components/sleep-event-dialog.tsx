'use client'

import { useState } from 'react'
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
import { SleepEvent, EventType, Context } from '@/types/database'
import { cn } from '@/lib/utils'

interface SleepEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  babyId: string
  event?: SleepEvent | null
  onSave: (eventData: {
    id?: string
    event_type: EventType
    event_time: string
    context: Context
    notes: string | null
  }) => void
  onDelete?: (eventId: string) => void
}

const eventTypes: { type: EventType; icon: string; label: string }[] = [
  { type: 'wake', icon: '☀️', label: 'Woke Up' },
  { type: 'nap_start', icon: '😴', label: 'Nap Started' },
  { type: 'nap_end', icon: '☀️', label: 'Nap Ended' },
  { type: 'bedtime', icon: '🌙', label: 'Bedtime' },
  { type: 'night_wake', icon: '👀', label: 'Night Wake' },
]

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

interface SleepEventFormProps {
  event?: SleepEvent | null
  onSave: SleepEventDialogProps['onSave']
  onDelete?: (eventId: string) => void
  onClose: () => void
}

function SleepEventForm({ event, onSave, onDelete, onClose }: SleepEventFormProps) {
  const isEditMode = !!event

  // Initialize state from event or defaults
  const [eventType, setEventType] = useState<EventType>(
    (event?.event_type as EventType) || 'wake'
  )
  const [dateTime, setDateTime] = useState(
    event ? toLocalDateTimeString(new Date(event.event_time)) : toLocalDateTimeString(new Date())
  )
  const [context, setContext] = useState<Context>(
    event ? (event.context as Context) : 'home'
  )
  const [notes, setNotes] = useState(event?.notes || '')

  const handleSave = () => {
    const eventTime = new Date(dateTime).toISOString()
    onSave({
      id: event?.id,
      event_type: eventType,
      event_time: eventTime,
      context,
      notes: notes || null,
    })
    onClose()
  }

  const handleDelete = () => {
    if (event && onDelete) {
      onDelete(event.id)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditMode ? 'Edit Event' : 'Add Past Event'}</DialogTitle>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Event Type Selector */}
        <div className="space-y-2">
          <Label>Event Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {eventTypes.map((et) => (
              <Button
                key={et.type}
                type="button"
                variant={eventType === et.type ? 'default' : 'outline'}
                className={cn(
                  'h-16 flex flex-col gap-1',
                  et.type === 'night_wake' && 'col-span-2'
                )}
                onClick={() => setEventType(et.type)}
              >
                <span className="text-xl">{et.icon}</span>
                <span className="text-sm">{et.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Date/Time Picker */}
        <div className="space-y-2">
          <Label htmlFor="datetime">Date & Time</Label>
          <Input
            id="datetime"
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            className="h-12"
          />
        </div>

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
        {isEditMode && onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            className="w-full"
          >
            Delete Event
          </Button>
        )}
        <div className="flex gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} className="flex-1">
            {isEditMode ? 'Save Changes' : 'Add Event'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function SleepEventDialog({
  open,
  onOpenChange,
  event,
  onSave,
  onDelete,
}: SleepEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open && (
          <SleepEventForm
            key={event?.id || 'new'}
            event={event}
            onSave={onSave}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
