'use client'

import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { X } from 'lucide-react'
import { SleepIcon } from '@/components/sleep/sleep-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Context } from '@/types/database'
import { formatDuration, calculateDurationMinutes } from '@/lib/sleep-utils'

/** Serialise a Date to a local datetime-local input value (YYYY-MM-DDTHH:MM). */
export function toLocalDateTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// ---------------------------------------------------------------------------
// Location / context selector
// ---------------------------------------------------------------------------

const CONTEXT_OPTIONS: { value: Context; label: string; icon: string }[] = [
  { value: 'home', label: 'Home', icon: 'home' },
  { value: 'daycare', label: 'Daycare', icon: 'school' },
  { value: 'travel', label: 'Travel', icon: 'plane' },
]

export function ContextSelector({
  value,
  onChange,
}: {
  value: Context
  onChange: (v: Context) => void
}) {
  return (
    <div className="flex gap-2">
      {CONTEXT_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? 'default' : 'outline'}
          onClick={() => onChange(option.value)}
          className="flex-1 h-11"
        >
          <SleepIcon name={option.icon} size={16} strokeWidth={2.25} className="mr-1.5" />
          {option.label}
        </Button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared field inputs
// ---------------------------------------------------------------------------

export interface SleepEventFieldsProps {
  /** Label for the start-time input (e.g. "Nap Started", "Bedtime"). */
  startTimeLabel: string
  /** Label for the end-time input (e.g. "Nap Ended", "Woke Up"). */
  endTimeLabel: string
  /** Placeholder shown when end time is cleared. */
  endTimePlaceholder?: string
  /** Hint shown below end-time input when no end time is set. */
  endTimeHint?: string

  startTime: string
  onStartTimeChange: Dispatch<SetStateAction<string>>
  endTime: string
  onEndTimeChange: Dispatch<SetStateAction<string>>

  /** When true, show the location/context selector. */
  showContext?: boolean
  context?: Context
  onContextChange?: Dispatch<SetStateAction<Context>>

  notes: string
  onNotesChange: Dispatch<SetStateAction<string>>

  /** Text shown when the session is in-progress (endTime empty in edit mode). */
  inProgressText?: string
}

/**
 * Presentational form fields shared across nap, sleep, and night-wake forms.
 * Does not include submit/cancel/delete buttons — those belong in the calling form.
 */
export function SleepEventFields({
  startTimeLabel,
  endTimeLabel,
  endTimePlaceholder,
  endTimeHint,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  showContext = false,
  context,
  onContextChange,
  notes,
  onNotesChange,
  inProgressText,
}: SleepEventFieldsProps) {
  // Derived values
  const durationMinutes = useMemo(() => {
    if (!endTime || !startTime) return null
    return calculateDurationMinutes(
      new Date(startTime).toISOString(),
      new Date(endTime).toISOString(),
    )
  }, [startTime, endTime])

  const validationError = useMemo(() => {
    if (durationMinutes !== null && durationMinutes < 0) {
      return `End time must be after start time`
    }
    return null
  }, [durationMinutes])

  return (
    <div className="space-y-6">
      {/* Start Time */}
      <div className="space-y-2">
        <Label htmlFor="start-time" className="flex items-center gap-1">
          {startTimeLabel}
          <span className="text-destructive text-sm">*</span>
        </Label>
        <Input
          id="start-time"
          type="datetime-local"
          value={startTime}
          onChange={(e) => onStartTimeChange(e.target.value)}
          className="h-12"
        />
      </div>

      {/* End Time */}
      <div className="space-y-2">
        <Label htmlFor="end-time" className="text-muted-foreground">
          {endTimeLabel}
        </Label>
        <div className="relative">
          <Input
            id="end-time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
            className="h-12 pr-10"
            placeholder={endTimePlaceholder}
          />
          {endTime && (
            <button
              type="button"
              onClick={() => onEndTimeChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-md transition-colors"
              aria-label="Clear end time"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {!endTime && endTimeHint && (
          <p className="text-xs text-muted-foreground">{endTimeHint}</p>
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
        <div className="text-sm text-destructive">{validationError}</div>
      )}

      {/* In Progress Indicator */}
      {inProgressText && (
        <div className="text-sm">
          <span className="text-muted-foreground">{inProgressText}</span>
        </div>
      )}

      {/* Location */}
      {showContext && context !== undefined && onContextChange && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Location</Label>
          <ContextSelector value={context} onChange={onContextChange} />
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
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Any additional notes..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </div>
  )
}
