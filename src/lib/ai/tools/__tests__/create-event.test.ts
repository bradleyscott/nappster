import { describe, it, expect, beforeEach } from 'vitest'
import { createCreateSleepEventTool } from '../create-event'
import { createMockSupabaseClient, MockSupabaseClient } from '@/lib/__tests__/mocks/supabase'
import { ToolContext } from '../types'

describe('createCreateSleepEventTool', () => {
  let mockSupabase: MockSupabaseClient
  let context: ToolContext

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    context = {
      supabase: mockSupabase as unknown as ToolContext['supabase'],
      babyId: 'test-baby-123',
      timezone: 'America/New_York',
    }
  })

  it('inserts event with correct baby_id', async () => {
    mockSupabase._setInsertResponse({
      data: {
        id: 'new-event-id',
        baby_id: 'test-baby-123',
        event_type: 'wake',
        event_time: '2024-01-15T12:00:00Z',
      },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'wake',
      event_time: '2024-01-15T12:00:00Z',
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('sleep_events')
    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        baby_id: 'test-baby-123',
        event_type: 'wake',
        event_time: '2024-01-15T12:00:00Z',
      })
    )
  })

  it('includes end_time only for night_wake events', async () => {
    mockSupabase._setInsertResponse({
      data: {
        id: 'new-event-id',
        event_type: 'night_wake',
        event_time: '2024-01-15T03:00:00Z',
        end_time: '2024-01-15T03:45:00Z',
      },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'night_wake',
      event_time: '2024-01-15T03:00:00Z',
      end_time: '2024-01-15T03:45:00Z',
      force: true, // Bypass state validation for insert behavior testing
    })

    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        end_time: '2024-01-15T03:45:00Z',
      })
    )
  })

  it('sets end_time to null for non-night_wake events even if provided', async () => {
    mockSupabase._setInsertResponse({
      data: {
        id: 'new-event-id',
        event_type: 'nap_start',
        event_time: '2024-01-15T09:30:00Z',
      },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'nap_start',
      event_time: '2024-01-15T09:30:00Z',
      end_time: '2024-01-15T10:00:00Z', // Should be ignored
      force: true, // Bypass state validation for insert behavior testing
    })

    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        end_time: null,
      })
    )
  })

  it('returns success: false on database error', async () => {
    mockSupabase._setInsertResponse({
      data: null,
      error: { message: 'Database connection failed' },
    })

    const tool = createCreateSleepEventTool(context)
    const result = await tool.execute({
      event_type: 'wake',
      event_time: '2024-01-15T12:00:00Z',
    })

    expect(result).toEqual({
      success: false,
      error: 'Database connection failed',
    })
  })

  it('returns success: true with event data on success', async () => {
    const mockEvent = {
      id: 'new-event-id',
      baby_id: 'test-baby-123',
      event_type: 'nap_end',
      event_time: '2024-01-15T14:00:00Z',
    }
    mockSupabase._setInsertResponse({
      data: mockEvent,
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    const result = await tool.execute({
      event_type: 'nap_end',
      event_time: '2024-01-15T14:00:00Z',
      force: true, // Bypass state validation for insert behavior testing
    })

    expect(result.success).toBe(true)
    expect(result.event).toEqual(mockEvent)
    expect(result.message).toContain('nap end')
  })

  it('includes context when provided', async () => {
    mockSupabase._setInsertResponse({
      data: { id: 'new-event-id', event_type: 'nap_end' },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'nap_end',
      event_time: '2024-01-15T14:00:00Z',
      context: 'daycare',
      force: true, // Bypass state validation for insert behavior testing
    })

    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        context: 'daycare',
      })
    )
  })

  it('includes notes when provided', async () => {
    mockSupabase._setInsertResponse({
      data: { id: 'new-event-id', event_type: 'bedtime' },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'bedtime',
      event_time: '2024-01-15T19:00:00Z',
      notes: 'Seemed tired, fell asleep quickly',
      force: true, // Bypass state validation for insert behavior testing
    })

    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        notes: 'Seemed tired, fell asleep quickly',
      })
    )
  })

  it('sets context to null when not provided', async () => {
    mockSupabase._setInsertResponse({
      data: { id: 'new-event-id', event_type: 'wake' },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    await tool.execute({
      event_type: 'wake',
      event_time: '2024-01-15T07:00:00Z',
    })

    const insertCalls = mockSupabase._getInsertCalls()
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        context: null,
        notes: null,
      })
    )
  })

  it('formats message correctly for night_wake with end_time', async () => {
    mockSupabase._setInsertResponse({
      data: {
        id: 'new-event-id',
        event_type: 'night_wake',
        event_time: '2024-01-15T03:00:00Z',
        end_time: '2024-01-15T03:30:00Z',
      },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    const result = await tool.execute({
      event_type: 'night_wake',
      event_time: '2024-01-15T03:00:00Z',
      end_time: '2024-01-15T03:30:00Z',
      force: true, // Bypass state validation for insert behavior testing
    })

    // Message should include both start and end times for night_wake
    expect(result.message).toContain('night wake')
    expect(result.message).toMatch(/\d+:\d+.*-.*\d+:\d+/) // Contains time range
  })

  it('includes context in message when provided', async () => {
    mockSupabase._setInsertResponse({
      data: { id: 'new-event-id', event_type: 'nap_start' },
      error: null,
    })

    const tool = createCreateSleepEventTool(context)
    const result = await tool.execute({
      event_type: 'nap_start',
      event_time: '2024-01-15T09:30:00Z',
      context: 'daycare',
      force: true, // Bypass state validation for insert behavior testing
    })

    expect(result.message).toContain('(daycare)')
  })

  describe('all event types', () => {
    const eventTypes = ['wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake'] as const

    it.each(eventTypes)('handles %s event type', async (eventType) => {
      mockSupabase._setInsertResponse({
        data: { id: 'new-event-id', event_type: eventType },
        error: null,
      })

      const tool = createCreateSleepEventTool(context)
      const result = await tool.execute({
        event_type: eventType,
        event_time: '2024-01-15T12:00:00Z',
        force: true, // Bypass state validation for insert behavior testing
      })

      expect(result.success).toBe(true)
      const insertCalls = mockSupabase._getInsertCalls()
      expect(insertCalls[insertCalls.length - 1]).toEqual(
        expect.objectContaining({
          event_type: eventType,
        })
      )
    })
  })
})
