import { describe, it, expect } from 'vitest'
import {
  formatEventForPrompt,
  extractTextFromParts,
  buildSessionRecap,
  formatEventsContext,
} from '../ai/format-context'
import type { SleepEvent, EventType } from '@/types/database'

const makeEvent = (overrides: Partial<SleepEvent> & { event_type: EventType; event_time: string }): SleepEvent => ({
  id: `evt-${overrides.event_time}-${overrides.event_type}`,
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

describe('formatEventForPrompt', () => {
  it('formats a basic event', () => {
    const event = makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' })
    const formatted = formatEventForPrompt(event, 'UTC')
    expect(formatted.description).toBe('7:00 am: wake')
    expect(formatted.type).toBe('wake')
    expect(formatted.time).toBe('7:00 am')
  })

  it('includes context when present', () => {
    const event = makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z', context: 'daycare' })
    const formatted = formatEventForPrompt(event, 'UTC')
    expect(formatted.description).toBe('9:00 am: nap start (daycare)')
  })

  it('includes notes when present', () => {
    const event = makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z', notes: 'Short nap' })
    const formatted = formatEventForPrompt(event, 'UTC')
    expect(formatted.description).toBe('10:00 am: nap end - Short nap')
  })

  it('formats night_wake with end_time', () => {
    const event = makeEvent({
      event_type: 'night_wake',
      event_time: '2024-01-15T02:00:00Z',
      end_time: '2024-01-15T02:30:00Z',
    })
    const formatted = formatEventForPrompt(event, 'UTC')
    expect(formatted.description).toBe('2:00 am: night wake -> back to sleep 2:30 am (30m awake)')
  })

  it('respects timezone for display', () => {
    const event = makeEvent({ event_type: 'wake', event_time: '2024-01-15T14:00:00Z' })
    const formatted = formatEventForPrompt(event, 'America/New_York')
    expect(formatted.time).toBe('9:00 am')
  })
})

describe('extractTextFromParts', () => {
  it('extracts text from message parts', () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'tool-createSleepEvent', state: 'output-available' },
      { type: 'text', text: 'world' },
    ]
    expect(extractTextFromParts(parts)).toBe('Hello world')
  })

  it('returns empty string for non-array inputs', () => {
    expect(extractTextFromParts(null)).toBe('')
    expect(extractTextFromParts('text')).toBe('')
    expect(extractTextFromParts(undefined)).toBe('')
  })

  it('skips parts without text', () => {
    const parts = [{ type: 'reasoning' }, { type: 'text', text: 'Hi' }]
    expect(extractTextFromParts(parts)).toBe('Hi')
  })
})

describe('buildSessionRecap', () => {
  it('truncates long messages', () => {
    const messages = [{ role: 'user' as const, text: 'a'.repeat(200) }]
    const recap = buildSessionRecap(messages, 1, 50)
    expect(recap).toBe(`Parent: ${'a'.repeat(50)}…`)
  })

  it('limits the number of messages', () => {
    const messages = [
      { role: 'user' as const, text: 'first' },
      { role: 'assistant' as const, text: 'second' },
      { role: 'user' as const, text: 'third' },
    ]
    const recap = buildSessionRecap(messages, 2, 150)
    expect(recap).toContain('second')
    expect(recap).toContain('third')
    expect(recap).not.toContain('first')
  })
})

describe('formatEventsContext', () => {
  it('formats events and computes summary', () => {
    const events = [
      makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' }),
      makeEvent({ event_type: 'nap_start', event_time: '2024-01-15T09:00:00Z' }),
      makeEvent({ event_type: 'nap_end', event_time: '2024-01-15T10:00:00Z' }),
    ]
    const context = formatEventsContext(events, 'UTC')
    expect(context.formattedEvents).toHaveLength(3)
    expect(context.currentState).toBe('daytime_awake')
    expect(context.eventSummary.hasWake).toBe(true)
    expect(context.eventSummary.napCount).toBe(1)
    expect(context.eventSummary.lastEventType).toBe('nap_end')
  })

  it('returns awaiting_morning_wake for empty events', () => {
    const context = formatEventsContext([], 'UTC')
    expect(context.formattedEvents).toHaveLength(0)
    expect(context.currentState).toBe('awaiting_morning_wake')
    expect(context.eventSummary.hasWake).toBe(false)
  })
})
