'use client'

import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Context } from '@/types/database'
import { formatDuration, calculateDurationMinutes } from '@/lib/sleep-utils'
import { SleepEventFields, toLocalDateTimeString } from '@/components/sleep-event-fields'

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

  const durationMinutes = useMemo(() => {
    if (!endTime || !startTime) return null
    return calculateDurationMinutes(
      new Date(startTime).toISOString(),
      new Date(endTime).toISOString()
    )
  }, [startTime, endTime])

  const validationError =
    durationMinutes !== null && durationMinutes < 0
      ? 'Wake time must be after bedtime'
      : null

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

  return (
    <div className="space-y-6">
      <SleepEventFields
        startTimeLabel="Bedtime"
        endTimeLabel="Woke Up"
        endTimePlaceholder="Tap to set wake time..."
        endTimeHint="💡 Leave blank if still sleeping"
        startTime={startTime}
        onStartTimeChange={setStartTime}
        endTime={endTime}
        onEndTimeChange={setEndTime}
        showContext
        context={context}
        onContextChange={setContext}
        notes={notes}
        onNotesChange={setNotes}
        inProgressText={
          mode === 'edit' && !endTime && initialStartTime
            ? `⏱️ Currently sleeping for ${formatDuration(calculateDurationMinutes(initialStartTime, new Date().toISOString()))}`
            : undefined
        }
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
              <><Loader2 className="size-4 animate-spin mr-2" />Saving...</>
            ) : (
              mode === 'edit' ? 'Save Changes' : 'Save Sleep'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
