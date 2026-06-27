import { describe, it, expect } from 'vitest'
import { mergeEvents, mergeMessages, mergeSleepPlans } from '../merge-data'
import type { SleepEvent, SleepPlanRow } from '@/types/database'
import type { ChatMessageData } from '../hooks/use-chat-history'

const makeEvent = (id: string, time: string): SleepEvent => ({
  id,
  baby_id: 'baby-1',
  event_type: 'wake',
  event_time: time,
  end_time: null,
  context: null,
  notes: null,
  created_at: time,
})

describe('mergeEvents', () => {
  it('merges sources with precedence for earlier sources', () => {
    const local = [makeEvent('1', '2024-01-15T08:00:00Z')]
    const initial = [makeEvent('1', '2024-01-15T07:00:00Z'), makeEvent('2', '2024-01-15T09:00:00Z')]

    const merged = mergeEvents(new Set(), local, initial)
    expect(merged).toHaveLength(2)
    // local version takes precedence
    expect(merged[0].event_time).toBe('2024-01-15T08:00:00Z')
    expect(merged[1].id).toBe('2')
  })

  it('excludes deleted events', () => {
    const events = [makeEvent('1', '2024-01-15T08:00:00Z'), makeEvent('2', '2024-01-15T09:00:00Z')]
    const merged = mergeEvents(new Set(['1']), events)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('2')
  })

  it('sorts by event_time', () => {
    const events = [makeEvent('2', '2024-01-15T10:00:00Z'), makeEvent('1', '2024-01-15T08:00:00Z')]
    const merged = mergeEvents(new Set(), events)
    expect(merged[0].id).toBe('1')
    expect(merged[1].id).toBe('2')
  })
})

describe('mergeMessages', () => {
  it('deduplicates by id with precedence for earlier sources', () => {
    const live: ChatMessageData[] = [{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'live' }] }]
    const initial: ChatMessageData[] = [{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'initial' }] }]

    const merged = mergeMessages(live, initial)
    expect(merged).toHaveLength(1)
    const parts = merged[0].parts as Array<{ type: string; text?: string }> | undefined
    expect(parts?.[0].text).toBe('live')
  })
})

describe('mergeSleepPlans', () => {
  it('deduplicates and sorts by created_at', () => {
    const plans = [
      { id: '2', created_at: '2024-01-15T10:00:00Z' },
      { id: '1', created_at: '2024-01-15T08:00:00Z' },
    ] as SleepPlanRow[]

    const merged = mergeSleepPlans(plans)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('1')
    expect(merged[1].id).toBe('2')
  })
})
