'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SleepEvent, EventType, Context } from '@/types/database'

const eventTypeOptions: { type: EventType; icon: string; label: string }[] = [
  { type: 'wake', icon: '🌅', label: 'Wake Up' },
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
  hour: string
  minute: string
  ampm: 'AM' | 'PM'
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

function nowDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function nowTime(): { hour: string; minute: string; ampm: 'AM' | 'PM' } {
  const d = new Date()
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return {
    hour: String(h).padStart(2, '0'),
    minute: String(d.getMinutes()).padStart(2, '0'),
    ampm,
  }
}

function initFromEvent(
  event: SleepEvent | null | undefined,
  mode: 'add' | 'edit'
) {
  if (event && mode === 'edit') {
    const d = new Date(event.event_time)
    let h = d.getHours()
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return {
      eventType: event.event_type as EventType,
      date: d.toISOString().slice(0, 10),
      hour: String(h).padStart(2, '0'),
      minute: String(d.getMinutes()).padStart(2, '0'),
      ampm: ampm as 'AM' | 'PM',
      context: event.context as Context | null,
      notes: event.notes || '',
    }
  }
  const t = nowTime()
  return {
    eventType: 'wake' as EventType,
    date: nowDate(),
    hour: t.hour,
    minute: t.minute,
    ampm: t.ampm,
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
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(init.ampm)
  const [context, setContext] = useState<Context | null>(init.context)
  const [notes, setNotes] = useState(init.notes)

  const handleSave = () => {
    onSave({ eventType, date, hour, minute, ampm, context, notes })
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
        <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--lavender)]"
        />

        {/* Time */}
        <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
          Time
        </label>
        <div className="mb-4 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={12}
            value={hour}
            onChange={(e) => setHour(e.target.value.padStart(2, '0').slice(0, 2))}
            className="w-16 rounded-xl border-2 border-[#EEE] px-3 py-3 text-center text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--lavender)]"
          />
          <span className="text-lg font-bold text-[var(--text-secondary)]">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(e.target.value.padStart(2, '0').slice(0, 2))}
            className="w-16 rounded-xl border-2 border-[#EEE] px-3 py-3 text-center text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--lavender)]"
          />
          <div className="flex gap-1">
            <button
              onClick={() => setAmpm('AM')}
              className={cn(
                'rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-all duration-100',
                ampm === 'AM'
                  ? 'border-[var(--lavender)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                  : 'border-[#EEE] bg-white text-[var(--text-muted)]'
              )}
            >
              AM
            </button>
            <button
              onClick={() => setAmpm('PM')}
              className={cn(
                'rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-all duration-100',
                ampm === 'PM'
                  ? 'border-[var(--lavender)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                  : 'border-[#EEE] bg-white text-[var(--text-muted)]'
              )}
            >
              PM
            </button>
          </div>
        </div>

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
