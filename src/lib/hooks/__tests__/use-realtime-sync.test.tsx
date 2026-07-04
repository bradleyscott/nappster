import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRealtimeSync } from '../use-realtime-sync'
import type { SleepEvent } from '@/types/database'

const wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>

describe('useRealtimeSync', () => {
  it('returns the initial connecting state when disabled', () => {
    const { result } = renderHook(
      () => useRealtimeSync({ babyId: 'baby-1', enabled: false }),
      { wrapper }
    )

    expect(result.current.connectionStatus).toBe('connecting')
    expect(result.current.lastError).toBeNull()
    expect(typeof result.current.broadcastDelete).toBe('function')
  })

  it('exposes broadcastDelete as a callable function', () => {
    const { result } = renderHook(
      () => useRealtimeSync({ babyId: 'baby-1', enabled: false }),
      { wrapper }
    )

    // Should be a no-op when disabled but must not throw.
    expect(() =>
      result.current.broadcastDelete('sleep_events', {
        id: 'evt-1',
        baby_id: 'baby-1',
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
        end_time: null,
        context: null,
        notes: null,
        created_at: '2024-06-15T07:00:00Z',
      } as unknown as SleepEvent)
    ).not.toThrow()
  })

  it('accepts optional callbacks without crashing', () => {
    const { result } = renderHook(
      () =>
        useRealtimeSync({
          babyId: 'baby-1',
          enabled: false,
          onSleepEventChange: vi.fn(),
          onChatMessageChange: vi.fn(),
          onSleepPlanChange: vi.fn(),
          onConnectionChange: vi.fn(),
          onRefreshData: vi.fn(),
        }),
      { wrapper }
    )

    expect(result.current.connectionStatus).toBe('connecting')
  })
})
