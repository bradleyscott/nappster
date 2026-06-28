import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventSheet, type EventSheetData } from '../event-sheet'
import type { SleepEvent } from '@/types/database'

function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

describe('EventSheet', () => {
  const baseProps = {
    open: true,
    mode: 'add' as const,
    onSave: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders native time input', () => {
    render(<EventSheet {...baseProps} />)
    expect(screen.getByLabelText(/time/i)).toHaveAttribute('type', 'time')
  })

  it('calls onSave with time in HH:MM format', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EventSheet {...baseProps} onSave={onSave} />)

    const timeInput = screen.getByLabelText(/time/i) as HTMLInputElement
    await user.clear(timeInput)
    await user.type(timeInput, '14:30')

    await user.click(screen.getByRole('button', { name: /log event/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'wake',
        time: '14:30',
      } as Partial<EventSheetData>)
    )
  })

  it('defaults to Today chip in add mode', () => {
    render(<EventSheet {...baseProps} />)
    expect(screen.getByRole('button', { name: /today/i })).toHaveClass('border-[var(--lavender)]')
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument()
  })

  it('sets date to yesterday when Yesterday chip is selected', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EventSheet {...baseProps} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: /yesterday/i }))

    await user.click(screen.getByRole('button', { name: /log event/i }))

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const expectedDate = formatLocalDateTime(yesterday).slice(0, 10)

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: expectedDate,
      } as Partial<EventSheetData>)
    )
  })

  it('reveals native date input and saves custom date', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EventSheet {...baseProps} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: /custom/i }))

    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement
    expect(dateInput).toHaveAttribute('type', 'date')

    await user.clear(dateInput)
    await user.type(dateInput, '2026-06-25')

    await user.click(screen.getByRole('button', { name: /log event/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-25',
      } as Partial<EventSheetData>)
    )
  })

  it('selects Custom chip when editing an older event', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 2)
    const olderDate = formatLocalDateTime(yesterday).slice(0, 10)

    const event: SleepEvent = {
      id: 'evt-1',
      baby_id: 'baby-1',
      event_type: 'wake',
      event_time: new Date(`${olderDate}T10:00:00`).toISOString(),
      end_time: null,
      context: 'home',
      notes: '',
      created_at: new Date().toISOString(),
    }

    render(<EventSheet {...baseProps} mode="edit" event={event} />)

    expect(screen.getByRole('button', { name: /custom/i })).toHaveClass('border-[var(--lavender)]')
    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement
    expect(dateInput.value).toBe(olderDate)
  })

  it('initializes time from an existing event', () => {
    const event: SleepEvent = {
      id: 'evt-1',
      baby_id: 'baby-1',
      event_type: 'nap_start',
      event_time: new Date('2026-06-28T15:45:00').toISOString(),
      end_time: null,
      context: 'home',
      notes: '',
      created_at: new Date().toISOString(),
    }

    render(<EventSheet {...baseProps} mode="edit" event={event} />)

    const timeInput = screen.getByLabelText(/time/i) as HTMLInputElement
    // Native time input uses the user's local timezone hour/minute.
    const expected = formatLocalDateTime(new Date(event.event_time)).slice(11, 16)
    expect(timeInput.value).toBe(expected)
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<EventSheet {...baseProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onDelete when delete is clicked in edit mode', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const event: SleepEvent = {
      id: 'evt-1',
      baby_id: 'baby-1',
      event_type: 'wake',
      event_time: new Date().toISOString(),
      end_time: null,
      context: 'home',
      notes: '',
      created_at: new Date().toISOString(),
    }

    render(<EventSheet {...baseProps} mode="edit" event={event} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalled()
  })
})
