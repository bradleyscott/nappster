'use client'

import { useState, useMemo } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { calculateDurationMinutes } from '@/lib/sleep-utils'
import { SleepEventFields, toLocalDateTimeString } from '@/components/sleep-event-fields'

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

  const durationMinutes = useMemo(() => {
    if (!endTime || !startTime) return null
    return calculateDurationMinutes(
      new Date(startTime).toISOString(),
      new Date(endTime).toISOString()
    )
  }, [startTime, endTime])

  const validationError =
    durationMinutes !== null && durationMinutes < 0
      ? 'End time must be after start time'
      : null

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
      <SleepEventFields
        startTimeLabel="Start Time"
        endTimeLabel="End Time"
        endTimePlaceholder="When baby went back to sleep..."
        endTimeHint="💡 When baby went back to sleep"
        startTime={startTime}
        onStartTimeChange={setStartTime}
        endTime={endTime}
        onEndTimeChange={setEndTime}
        notes={notes}
        onNotesChange={setNotes}
      />

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
              <><Loader2 className="size-4 animate-spin mr-2" />Deleting...</>
            ) : (
              <><Trash2 className="size-4 mr-2" />Delete Event</>
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
              <><Loader2 className="size-4 animate-spin mr-2" />Saving...</>
            ) : (
              mode === 'edit' ? 'Save Changes' : 'Save Event'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
