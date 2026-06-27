import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatHistory } from '../use-chat-history'
import type { ChatMessageData } from '../use-chat-history'

function makeMsg(id: string, role: 'user' | 'assistant' = 'user', ts?: string): ChatMessageData {
  return { id, role, parts: [], createdAt: ts ?? new Date().toISOString() }
}

describe('useChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty history', () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      expect(result.current.historyMessages).toEqual([])
      expect(result.current.historySleepEvents).toEqual([])
      expect(result.current.historySleepPlans).toEqual([])
      expect(result.current.historyCursor).toBeNull()
      expect(result.current.isLoadingHistory).toBe(false)
      expect(result.current.hasMoreHistory).toBe(false)
    })

    it('accepts initial cursor and hasMore', () => {
      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialCursor: 'cursor-1',
          initialHasMore: true,
        })
      )

      expect(result.current.historyCursor).toBe('cursor-1')
      expect(result.current.hasMoreHistory).toBe(true)
    })
  })

  describe('addRealtimeMessage', () => {
    it('adds a realtime message', () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      act(() => {
        result.current.addRealtimeMessage(makeMsg('rt-1'))
      })

      expect(result.current.historyMessages).toHaveLength(1)
      expect(result.current.historyMessages[0].id).toBe('rt-1')
    })

    it('deduplicates messages by id', () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      const msg = makeMsg('rt-1')
      act(() => {
        result.current.addRealtimeMessage(msg)
      })

      act(() => {
        result.current.addRealtimeMessage(msg)
      })

      expect(result.current.historyMessages).toHaveLength(1)
    })
  })

  describe('mergeRefreshedMessages', () => {
    it('adds new messages', () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      act(() => {
        result.current.mergeRefreshedMessages([makeMsg('m-1'), makeMsg('m-2')])
      })

      expect(result.current.historyMessages).toHaveLength(2)
    })

    it('deduplicates when merging', () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      act(() => {
        result.current.addRealtimeMessage(makeMsg('existing'))
      })

      act(() => {
        result.current.mergeRefreshedMessages([
          makeMsg('existing'),
          makeMsg('new'),
        ])
      })

      expect(result.current.historyMessages).toHaveLength(2)
    })
  })

  describe('loadMoreHistory', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    it('does not fetch when hasMoreHistory is false', async () => {
      const { result } = renderHook(() =>
        useChatHistory({ babyId: 'baby-1' })
      )

      await act(async () => {
        await result.current.loadMoreHistory()
      })

      expect(fetch).not.toHaveBeenCalled()
    })

    it('does not fetch when historyCursor is null', async () => {
      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialHasMore: true,
          initialCursor: null,
        })
      )

      await act(async () => {
        await result.current.loadMoreHistory()
      })

      expect(fetch).not.toHaveBeenCalled()
    })

    it('fetches more messages and updates state', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [makeMsg('older-2'), makeMsg('older-1')],
            cursor: 'cursor-older',
            hasMore: true,
            sleepEvents: [{ id: 'evt-old', event_type: 'wake' }],
            sleepPlans: [{ id: 'plan-old' }],
          }),
      } as Response)

      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialCursor: 'cursor-1',
          initialHasMore: true,
        })
      )

      await act(async () => {
        await result.current.loadMoreHistory()
      })

      expect(result.current.isLoadingHistory).toBe(false)
      expect(result.current.historyMessages).toHaveLength(2)
      expect(result.current.historyCursor).toBe('cursor-older')
      expect(result.current.hasMoreHistory).toBe(true)
      expect(result.current.historySleepEvents).toHaveLength(1)
      expect(result.current.historySleepPlans).toHaveLength(1)
    })

    it('handles fetch errors gracefully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response)

      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialCursor: 'cursor-1',
          initialHasMore: true,
        })
      )

      await act(async () => {
        await result.current.loadMoreHistory()
      })

      expect(result.current.isLoadingHistory).toBe(false)
      expect(result.current.hasMoreHistory).toBe(false)
    })

    it('handles network errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialCursor: 'cursor-1',
          initialHasMore: true,
        })
      )

      await act(async () => {
        await result.current.loadMoreHistory()
      })

      expect(result.current.isLoadingHistory).toBe(false)
    })

    it('does not crash on rapid duplicate calls', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [], cursor: null, hasMore: false }),
      } as Response)

      const { result } = renderHook(() =>
        useChatHistory({
          babyId: 'baby-1',
          initialCursor: 'cursor-1',
          initialHasMore: true,
        })
      )

      // Call loadMoreHistory twice in quick succession
      await act(async () => {
        await Promise.all([
          result.current.loadMoreHistory(),
          result.current.loadMoreHistory(),
        ])
      })

      expect(result.current.isLoadingHistory).toBe(false)
    })
  })
})
