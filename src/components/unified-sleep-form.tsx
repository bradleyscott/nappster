'use client'

import { useState, useMemo } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Context } from '@/types/database'
import { formatDuration, calculateDurationMinutes } from '@/lib/sleep-utils'

interface UnifiedSleepFormProps {
  mode: 'create' | 'edit' | 'complete'
  startEventId?: string
  initialStartTime?: string
  initialEndTime?: string | null
  initialContext?: Context
  initialNotes?: string | null
  onSave: (data: {
    startEventId?: string
    startTime: string
    endTime: string | null
    context: Context
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

export function UnifiedSleepForm({
  mode,
  startEventId,
  initialStartTime,
  initialEndTime,
  initialContext,
  initialNotes,
  onSave,
  onDelete,
  onCancel,
}: UnifiedSleepFormProps) {
  const [startTime, setStartTime] = useState(
    initialStartTime ? toLocalDateTimeString(new Date(initialStartTime)) : toLocalDateTimeString(new Date())
  )
  const [endTime, setEndTime] = useState(
    initialEndTime ? toLocalDateTimeString(new Date(initialEndTime)) : ''
  )
  const [context, setContext] = useState<Context>(initialContext ?? 'home')
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
      return 'Wake time must be after bedtime'
    }
    return null
  }, [durationMinutes])

  const handleSave = async () => {
    if (validationError) return

    setIsSaving(true)
    try {
      await onSave({
        startEventId,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        context,
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

  const contextOptions: { value: Context; label: string; emoji: string }[] = [
    { value: 'home', label: 'Home', emoji: '🏠' },
    { value: 'daycare', label: 'Daycare', emoji: '🏫' },
    { value: 'travel', label: 'Travel', emoji: '✈️' },
  ]

  return (
    <div className="space-y-6">
      {/* Bedtime */}
      <div className="space-y-2">
        <Label htmlFor="start-time" className="flex items-center gap-1">
          Bedtime
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

      {/* Woke Up */}
      <div className="space-y-2">
        <Label htmlFor="end-time" className="text-muted-foreground">
          Woke Up
        </Label>
        <div className="relative">
          <Input
            id="end-time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-12 pr-10"
            placeholder="Tap to set wake time..."
          />
          {endTime && (
            <button
              type="button"
              onClick={() => setEndTime('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-md transition-colors"
              aria-label="Clear wake time"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {!endTime && mode !== 'complete' && (
          <p className="text-xs text-muted-foreground">
            💡 Leave blank if still sleeping
          </p>
        )}
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

      {/* In Progress Indicator */}
      {mode === 'edit' && !endTime && initialStartTime && (
        <div className="text-sm">
          <span className="text-muted-foreground">⏱️ Currently sleeping for </span>
          <span className="font-medium">
            {formatDuration(calculateDurationMinutes(initialStartTime, new Date().toISOString()))}
          </span>
        </div>
      )}

      {/* Location */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Location</Label>
        <div className="flex gap-2">
          {contextOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={context === option.value ? 'default' : 'outline'}
              onClick={() => setContext(option.value)}
              className="flex-1 h-11"
            >
              <span className="mr-1.5">{option.emoji}</span>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-muted-foreground">
          Notes
        </Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes..."
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
              '🗑️ Delete Sleep'
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
              mode === 'edit' ? 'Save Changes' : 'Save Sleep'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
