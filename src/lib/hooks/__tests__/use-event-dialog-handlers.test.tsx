import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEventDialogHandlers } from '../use-event-dialog-handlers'
import type { SleepEvent, SleepSession } from '@/types/database'

const makeEvent = (overrides: Partial<SleepEvent> = {}): SleepEvent => ({
  id: 'evt-1',
  baby_id: 'baby-1',
  event_type: 'wake',
  event_time: '2024-01-15T07:00:00Z',
  end_time: null,
  context: null,
  notes: null,
  created_at: '2024-01-15T07:00:00Z',
  ...overrides,
})

describe('useEventDialogHandlers', () => {
  const crud = {
    saveEvent: vi.fn(() => Promise.resolve(true)),
    deleteEvent: vi.fn(() => Promise.resolve(true)),
    saveSession: vi.fn(() => Promise.resolve(true)),
    deleteSession: vi.fn(() => Promise.resolve(true)),
  }
  const broadcastDelete = vi.fn(() => Promise.resolve())
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves an event and closes the dialog', async () => {
    const { result } = renderHook(() =>
      useEventDialogHandlers({
        selectedItem: null,
        allEvents: [],
        broadcastDelete,
        onClose,
        crud,
      })
    )

    const eventData = {
      id: 'evt-1',
      event_type: 'wake' as const,
      event_time: '2024-01-15T07:00:00Z',
      context: 'home' as const,
      notes: null,
    }

    await act(async () => {
      await result.current.saveEvent(eventData)
    })

    expect(crud.saveEvent).toHaveBeenCalledWith(eventData)
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes an event, broadcasts, and closes', async () => {
    const event = makeEvent()
    const { result } = renderHook(() =>
      useEventDialogHandlers({
        selectedItem: event,
        allEvents: [event],
        broadcastDelete,
        onClose,
        crud,
      })
    )

    await act(async () => {
      await result.current.deleteEvent()
    })

    expect(crud.deleteEvent).toHaveBeenCalledWith(event)
    expect(broadcastDelete).toHaveBeenCalledWith('sleep_events', event)
    expect(onClose).toHaveBeenCalled()
  })

  it('does nothing when deleting a session-shaped item', async () => {
    const session = {
      startEvent: makeEvent(),
      endEvent: null,
    } as unknown as SleepSession

    const { result } = renderHook(() =>
      useEventDialogHandlers({
        selectedItem: session,
        allEvents: [],
        broadcastDelete,
        onClose,
        crud,
      })
    )

    await act(async () => {
      await result.current.deleteEvent()
    })

    expect(crud.deleteEvent).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves a session and closes', async () => {
    const { result } = renderHook(() =>
      useEventDialogHandlers({
        selectedItem: null,
        allEvents: [],
        broadcastDelete,
        onClose,
        crud,
      })
    )

    const sessionData = {
      startEvent: {
        id: 'evt-1',
        event_time: '2024-01-15T07:00:00Z',
        context: 'home' as const,
        notes: null,
      },
    }

    await act(async () => {
      await result.current.saveSession(sessionData)
    })

    expect(crud.saveSession).toHaveBeenCalledWith(sessionData)
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes a session and closes', async () => {
    const { result } = renderHook(() =>
      useEventDialogHandlers({
        selectedItem: null,
        allEvents: [],
        broadcastDelete,
        onClose,
        crud,
      })
    )

    await act(async () => {
      await result.current.deleteSession('evt-1', 'evt-2')
    })

    expect(crud.deleteSession).toHaveBeenCalledWith('evt-1', 'evt-2', [])
    expect(onClose).toHaveBeenCalled()
  })
})
