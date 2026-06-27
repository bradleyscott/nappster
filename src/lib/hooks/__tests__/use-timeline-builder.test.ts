import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTimelineBuilder, formatDateHeader, getDateKey, getTimelineItemTimestamp } from '../use-timeline-builder'
import type { ChatMessageData } from '../use-chat-history'
import type { SleepEvent, SleepPlanRow } from '@/types/database'
import type { TimelineItem } from '../use-timeline-builder'

function makeMsg(id: string, role: 'user' | 'assistant', ts: string): ChatMessageData {
  return { id, role, parts: [], createdAt: ts }
}

function makeEvent(id: string, event_time: string): SleepEvent {
  return {
    id,
    baby_id: 'baby-1',
    event_type: 'wake',
    event_time,
    end_time: null,
    context: 'home',
    notes: null,
    created_at: event_time,
  } as unknown as SleepEvent
}

function makePlan(id: string, created_at: string): SleepPlanRow {
  return {
    id,
    baby_id: 'baby-1',
    current_state: 'daytime_awake',
    plan_date: '2024-01-01',
    schedule: {},
    next_action: null,
    target_bedtime: null,
    summary: null,
    events_hash: null,
    is_active: true,
    created_by: null,
    created_at,
  } as unknown as SleepPlanRow
}



describe('useTimelineBuilder', () => {
  it('merges messages from all sources', () => {
    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [makeMsg('h-1', 'user', '2024-01-01T08:00:00Z')],
        initialMessages: [makeMsg('i-1', 'assistant', '2024-01-01T08:01:00Z')],
        liveMessages: [],
        historySleepEvents: [],
        initialSleepEvents: [],
        localEvents: [],
        deletedEventIds: new Set(),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    expect(result.current.allMessages).toHaveLength(2)
    expect(result.current.allMessages.map(m => m.id)).toEqual(['h-1', 'i-1'])
  })

  it('deduplicates messages by id', () => {
    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [makeMsg('m-1', 'user', '2024-01-01T08:00:00Z')],
        initialMessages: [makeMsg('m-1', 'user', '2024-01-01T08:00:00Z')],
        liveMessages: [],
        historySleepEvents: [],
        initialSleepEvents: [],
        localEvents: [],
        deletedEventIds: new Set(),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    expect(result.current.allMessages).toHaveLength(1)
  })

  it('filters out deleted events', () => {
    const evt = makeEvent('e-1', '2024-01-01T08:00:00Z')
    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [],
        initialMessages: [],
        liveMessages: [],
        historySleepEvents: [evt],
        initialSleepEvents: [evt],
        localEvents: [],
        deletedEventIds: new Set(['e-1']),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    expect(result.current.allSleepEvents).toHaveLength(0)
  })

  it('includes local events that override initial events', () => {
    const initial = makeEvent('e-1', '2024-01-01T08:00:00Z')
    const local = { ...initial, context: 'daycare' }
    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [],
        initialMessages: [],
        liveMessages: [],
        historySleepEvents: [],
        initialSleepEvents: [initial],
        localEvents: [local],
        deletedEventIds: new Set(),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    expect(result.current.allSleepEvents).toHaveLength(1)
    expect(result.current.allSleepEvents[0].context).toBe('daycare')
  })

  it('creates interleaved timeline sorted by timestamp', () => {
    const liveUiMsg = { id: 'm-2', role: 'user' as const, content: '', parts: [], createdAt: new Date('2024-01-01T10:00:00Z') }
    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [makeMsg('m-1', 'user', '2024-01-01T09:00:00Z')],
        initialMessages: [],
        liveMessages: [liveUiMsg],
        historySleepEvents: [makeEvent('e-1', '2024-01-01T08:00:00Z')],
        initialSleepEvents: [],
        localEvents: [],
        deletedEventIds: new Set(),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    const items = result.current.timelineItems
    expect(items).toHaveLength(3)
    expect(items[0].kind).toBe('sleep_event')   // 08:00
    expect(items[1].kind).toBe('message')        // 09:00 (history)
    expect(items[2].kind).toBe('message')        // 10:00 (live)
  })

  it('groups messages with events within 60s time window', () => {
    // Event at 08:00:30 and message at 08:00:45 — within 60s, so message first
    const msg = makeMsg('m-1', 'assistant', '2024-01-01T08:00:45Z')
    const evt = makeEvent('e-1', '2024-01-01T08:00:30Z')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgUi: any = { id: msg.id, role: 'assistant', content: '', parts: [], createdAt: new Date(msg.createdAt as string) }

    const { result } = renderHook(() =>
      useTimelineBuilder({
        historyMessages: [],
        initialMessages: [msg],
        liveMessages: [msgUi],
        historySleepEvents: [evt],
        initialSleepEvents: [],
        localEvents: [],
        deletedEventIds: new Set(),
        historySleepPlans: [],
        initialSleepPlans: [],
        localSleepPlans: [],
      })
    )

    const items = result.current.timelineItems
    expect(items).toHaveLength(2)
    expect(items[0].kind).toBe('message')
    expect(items[1].kind).toBe('sleep_event')
  })
})

describe('formatDateHeader', () => {
  it('returns "Today" for current date', () => {
    const today = new Date()
    expect(formatDateHeader(today.toISOString())).toBe('Today')
  })

  it('returns "Yesterday" for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatDateHeader(yesterday.toISOString())).toBe('Yesterday')
  })

  it('returns formatted date for this year', () => {
    const date = new Date('2026-01-15')
    const result = formatDateHeader(date.toISOString())
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('Thu')
  })

  it('includes year for previous year dates', () => {
    const date = new Date('2025-01-15')
    const result = formatDateHeader(date.toISOString())
    expect(result).toContain('2025')
  })
})

describe('getDateKey', () => {
  it('returns YYYY-MM-DD for an ISO string', () => {
    expect(getDateKey('2024-01-15T08:00:00Z')).toBe('2024-01-15')
  })

  it('returns YYYY-MM-DD for a Date', () => {
    expect(getDateKey(new Date('2024-06-01'))).toBe('2024-06-01')
  })
})

describe('getTimelineItemTimestamp', () => {
  it('returns message createdAt for messages', () => {
    const item: TimelineItem = { kind: 'message', message: { id: 'm-1', role: 'user', parts: [], createdAt: '2024-01-01T08:00:00Z' } }
    expect(getTimelineItemTimestamp(item)).toBe('2024-01-01T08:00:00Z')
  })

  it('returns event_time for sleep events', () => {
    const item: TimelineItem = { kind: 'sleep_event', event: makeEvent('e-1', '2024-01-01T08:00:00Z') }
    expect(getTimelineItemTimestamp(item)).toBe('2024-01-01T08:00:00Z')
  })

  it('returns created_at for plans', () => {
    const item: TimelineItem = { kind: 'sleep_plan', plan: makePlan('p-1', '2024-01-01T08:00:00Z') }
    expect(getTimelineItemTimestamp(item)).toBe('2024-01-01T08:00:00Z')
  })
})
