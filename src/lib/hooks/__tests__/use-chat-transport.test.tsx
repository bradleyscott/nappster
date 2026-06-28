import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatTransport } from '../use-chat-transport'
import type { Baby, SleepEvent } from '@/types/database'
import type { ChatMessageData } from '../use-chat-history'

const makeBaby = (): Baby => ({
  id: 'baby-1',
  name: 'Luna',
  birth_date: '2023-06-15',
  pattern_notes: null,
  created_at: '2023-06-15T00:00:00Z',
  plan_generation_locked_until: null,
  last_plan_generated_at: null,
})

describe('useChatTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a transport object', () => {
    const baby = makeBaby()
    const events: SleepEvent[] = []
    const messages: ChatMessageData[] = []

    const { result } = renderHook(() =>
      useChatTransport({
        baby,
        timezone: 'UTC',
        events,
        initialMessages: messages,
      })
    )

    expect(result.current).toBeDefined()
  })

  it('includes today events and baby profile in transport body', () => {
    const baby = makeBaby()
    const now = new Date().toISOString()
    const events: SleepEvent[] = [
      {
        id: 'evt-1',
        baby_id: 'baby-1',
        event_type: 'wake',
        event_time: now,
        end_time: null,
        context: 'home',
        notes: null,
        created_at: now,
      },
    ]

    const { result } = renderHook(() =>
      useChatTransport({
        baby,
        timezone: 'UTC',
        events,
        initialMessages: [],
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (result.current as any).body as Record<string, unknown>
    expect(body.babyId).toBe('baby-1')
    expect(body.timezone).toBe('UTC')
    expect((body.todayEvents as unknown[]).length).toBe(1)
    expect((body.babyProfile as Record<string, unknown>).name).toBe('Luna')
  })
})
