'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SleepEvent, EventType, Context } from '@/types/database'

const eventTypeOptions: { type: EventType; icon: string; label: string }[] = [
  { type: 'wake', icon: '☀️', label: 'Wake Up' },
  { type: 'nap_start', icon: '😴', label: 'Nap Start' },
  { type: 'nap_end', icon: '🌤️', label: 'Nap End' },
  { type: 'bedtime', icon: '🌙', label: 'Bedtime' },
  { type: 'night_wake', icon: '👀', label: 'Night Wake' },
]

const contextOptions: { value: Context; icon: string; label: string }[] = [
  { value: 'home', icon: '🏠', label: 'Home' },
  { value: 'daycare', icon: '🏫', label: 'Daycare' },
  { value: 'travel', icon: '✈️', label: 'Travel' },
]

export interface EventSheetData {
  eventType: EventType
  date: string
  time: string
  context: Context | null
  notes: string
}

interface EventSheetProps {
  open: boolean
  mode: 'add' | 'edit'
  event?: SleepEvent | null
  onSave: (data: EventSheetData) => void
  onDelete?: () => void
  onClose: () => void
}

function localDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localToday(): string {
  return localDateString(new Date())
}

function localYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

function nowDate(): string {
  return localToday()
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type DateMode = 'today' | 'yesterday' | 'custom'

function dateModeFromDate(date: string): DateMode {
  if (date === localToday()) return 'today'
  if (date === localYesterday()) return 'yesterday'
  return 'custom'
}

function initFromEvent(
  event: SleepEvent | null | undefined,
  mode: 'add' | 'edit'
) {
  if (event && mode === 'edit') {
    const d = new Date(event.event_time)
    return {
      eventType: event.event_type as EventType,
      date: localDateString(d),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      context: event.context as Context | null,
      notes: event.notes || '',
    }
  }
  return {
    eventType: 'wake' as EventType,
    date: nowDate(),
    time: nowTime(),
    context: null as Context | null,
    notes: '',
  }
}

export function EventSheet({ open, mode, event, onSave, onDelete, onClose }: EventSheetProps) {
  // Use mode+eventId as key so React remounts cleanly when switching events
  const formKey = `${mode}-${event?.id ?? 'new'}-${open ? 'open' : 'closed'}`
  return open ? <EventSheetInner key={formKey} {...{ mode, event, onSave, onDelete, onClose }} /> : null
}

function EventSheetInner({ mode, event, onSave, onDelete, onClose }: Omit<EventSheetProps, 'open'>) {
  const init = initFromEvent(event, mode)
  const [eventType, setEventType] = useState<EventType>(init.eventType)
  const [date, setDate] = useState(init.date)
  const [dateMode, setDateMode] = useState<DateMode>(() => dateModeFromDate(init.date))
  const [customDate, setCustomDate] = useState(init.date)
  const [time, setTime] = useState(init.time)
  const [context, setContext] = useState<Context | null>(init.context)
  const [notes, setNotes] = useState(init.notes)

  const handleDateModeChange = (mode: DateMode) => {
    setDateMode(mode)
    if (mode === 'today') {
      setDate(localToday())
    } else if (mode === 'yesterday') {
      setDate(localYesterday())
    } else {
      setDate(customDate)
    }
  }

  const handleCustomDateChange = (value: string) => {
    setCustomDate(value)
    setDate(value)
  }

  const handleSave = () => {
    onSave({ eventType, date, time, context, notes })
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-20 bg-black/20 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-30 max-h-[80vh] overflow-y-auto rounded-t-[var(--radius-xl)] bg-white px-5 pb-8 pt-3 shadow-[0_-8px_40px_rgba(45,43,58,0.15)]">
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 shrink-0 rounded-full bg-[#DDD]" />

        {/* Title */}
        <h3 className="mb-5 text-center text-lg font-extrabold text-[var(--text)]">
          {mode === 'add' ? 'Log Past Event' : 'Edit Event'}
        </h3>

        {/* Event type selector */}
        <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Event type
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {eventTypeOptions.map((opt) => (
            <button
              key={opt.type}
              onClick={() => setEventType(opt.type)}
              className={cn(
                'rounded-full border-2 px-4 py-2 text-sm font-bold transition-all duration-100 active:scale-95',
                eventType === opt.type
                  ? 'border-[var(--lavender)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                  : 'border-[#EEE] bg-white text-[var(--text-muted)]'
              )}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        {/* Date */}
        <label htmlFor="event-date" className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Date
        </label>
        <div className="mb-4">
          <div className="mb-2 flex gap-2">
            {(['today', 'yesterday', 'custom'] as DateMode[]).map((modeOption) => (
              <button
                key={modeOption}
                onClick={() => handleDateModeChange(modeOption)}
                className={cn(
                  'rounded-full border-2 px-4 py-2 text-sm font-bold transition-all duration-100 active:scale-95',
                  dateMode === modeOption
                    ? 'border-[var(--lavender)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                    : 'border-[#EEE] bg-white text-[var(--text-muted)]'
                )}
              >
                {modeOption === 'today' && 'Today'}
                {modeOption === 'yesterday' && 'Yesterday'}
                {modeOption === 'custom' && 'Custom'}
              </button>
            ))}
          </div>
          {dateMode === 'custom' && (
            <input
              id="event-date"
              type="date"
              value={customDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              className="date-input w-full rounded-xl border-2 border-[#EEE] bg-white px-4 py-3 text-lg font-bold text-[var(--text)] outline-none focus:border-[var(--lavender)]"
            />
          )}
        </div>

        {/* Time */}
        <label htmlFor="event-time" className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Time
        </label>
        <input
          id="event-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="time-input mb-4 w-full rounded-xl border-2 border-[#EEE] bg-white px-4 py-3 text-lg font-bold text-[var(--text)] outline-none focus:border-[var(--lavender)]"
        />

        {/* Context */}
        <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Context
        </label>
        <div className="mb-4 flex gap-2">
          {contextOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setContext(opt.value === context ? null : opt.value)}
              className={cn(
                'rounded-full border-2 px-4 py-2 text-sm font-bold transition-all duration-100 active:scale-95',
                context === opt.value
                  ? 'border-[var(--mint)] bg-[var(--mint-bg)] text-[var(--mint)]'
                  : 'border-[#EEE] bg-white text-[var(--text-muted)]'
              )}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        {/* Notes */}
        <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          className="mb-6 w-full resize-none rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
        />

        {/* Footer */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-[#EEE] bg-white py-3.5 text-sm font-bold text-[var(--text-secondary)] active:bg-[#F8F5FF] transition-colors duration-100"
          >
            Cancel
          </button>
          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-2xl border-2 border-[var(--rose-light)] bg-white px-6 py-3.5 text-sm font-bold text-[var(--rose)] active:bg-[var(--rose-bg)] transition-colors duration-100"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex-1 rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(124,77,255,0.2)] active:scale-[0.97] transition-all duration-100"
          >
            {mode === 'add' ? 'Log Event' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}
