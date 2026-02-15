'use client'

import { useState, useMemo } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDuration, calculateDurationMinutes } from '@/lib/sleep-utils'

interface NightWakeFormProps {
  mode: 'create' | 'edit'
  eventId?: string
  initialStartTime?: string
  initialEndTime?: string | null
  initialNotes?: string | null
  onSave: (data: {
    eventId?: string
    startTime: string
    endTime: string | null
    notes: string | null
  }) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onCancel: () => void
}

function toLocalDateTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function NightWakeForm({
  mode,
  eventId,
  initialStartTime,
  initialEndTime,
  initialNotes,
  onSave,
  onDelete,
  onCancel,
}: NightWakeFormProps) {
  const [startTime, setStartTime] = useState(
    initialStartTime ? toLocalDateTimeString(new Date(initialStartTime)) : toLocalDateTimeString(new Date())
  )
  const [endTime, setEndTime] = useState(
    initialEndTime ? toLocalDateTimeString(new Date(initialEndTime)) : ''
  )
  const [notes, setNotes] = useState(initialNotes || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isLoading = isSaving || isDeleting

  // Calculate duration
  const durationMinutes = useMemo(() => {
    if (!endTime || !startTime) return null
    return calculateDurationMinutes(
      new Date(startTime).toISOString(),
      new Date(endTime).toISOString()
    )
  }, [startTime, endTime])

  const validationError = useMemo(() => {
    if (durationMinutes !== null && durationMinutes < 0) {
      return 'End time must be after start time'
    }
    return null
  }, [durationMinutes])

  const handleSave = async () => {
    if (validationError) return

    setIsSaving(true)
    try {
      await onSave({
        eventId,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        notes: notes || null,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Start Time */}
      <div className="space-y-2">
        <Label htmlFor="start-time" className="flex items-center gap-1">
          Start Time
          <span className="text-destructive text-sm">*</span>
        </Label>
        <Input
          id="start-time"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="h-12"
        />
      </div>

      {/* End Time */}
      <div className="space-y-2">
        <Label htmlFor="end-time" className="text-muted-foreground">
          End Time
        </Label>
        <div className="relative">
          <Input
            id="end-time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-12 pr-10"
            placeholder="When baby went back to sleep..."
          />
          {endTime && (
            <button
              type="button"
              onClick={() => setEndTime('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-md transition-colors"
              aria-label="Clear end time"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          💡 When baby went back to sleep
        </p>
      </div>

      {/* Duration Display */}
      {durationMinutes !== null && durationMinutes >= 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Duration: </span>
          <span className="font-medium">{formatDuration(durationMinutes)}</span>
        </div>
      )}

      {/* Validation Error */}
      {validationError && (
        <div className="text-sm text-destructive">
          {validationError}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-muted-foreground">
          Notes
        </Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Fed, diaper change, etc..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {mode === 'edit' && onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            className="w-full"
            disabled={isLoading}
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              '🗑️ Delete Event'
            )}
          </Button>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="flex-1"
            disabled={!!validationError || isLoading}
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              mode === 'edit' ? 'Save Changes' : 'Save Event'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
