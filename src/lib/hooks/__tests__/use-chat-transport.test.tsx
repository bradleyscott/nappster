import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatTransport } from '../use-chat-transport'
import type { Baby, SleepEvent } from '@/types/database'
import type { ChatMessageData } from '../use-chat-history'

const makeBaby = (): Baby => ({
  id: 'baby-1',
  name: 'Luna',
  birth_date: '2023-06-15',
  sleep_training_method: null,
  pattern_notes: null,
  created_at: '2023-06-15T00:00:00Z',
})

describe('useChatTransport', () => {
  it('returns a transport configured with baby context', () => {
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
    expect(result.current.api).toBe('/api/chat')
  })

  it('includes today events in transport body', () => {
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
    const body = (result.current as any).body
    expect(body.babyId).toBe('baby-1')
    expect(body.timezone).toBe('UTC')
    expect(body.todayEvents).toHaveLength(1)
    expect(body.babyProfile.name).toBe('Luna')
  })
})
