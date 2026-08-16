import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  condenseToolOutput,
  saveWithRetry,
  buildAssistantParts,
  READ_TOOL_NAMES,
} from '../chat-persistence'

// ---------------------------------------------------------------------------
// condenseToolOutput
// ---------------------------------------------------------------------------

describe('condenseToolOutput', () => {
  it('passes through outputs for write tools unchanged', () => {
    const output = { success: true, event: { id: 'e-1' }, message: 'done' }
    expect(condenseToolOutput('createSleepEvent', output)).toBe(output)
    expect(condenseToolOutput('updateSleepPlan', output)).toBe(output)
    expect(condenseToolOutput('updatePatternNotes', output)).toBe(output)
  })

  it('passes through outputs for unknown tool names', () => {
    const output = { foo: 'bar' }
    expect(condenseToolOutput('unknownTool', output)).toBe(output)
  })

  it('passes through null/nullish outputs', () => {
    expect(condenseToolOutput('getBabyProfile', null)).toBeNull()
    expect(condenseToolOutput('getTodayEvents', undefined)).toBeUndefined()
  })

  it('passes through non-object outputs (primitives)', () => {
    expect(condenseToolOutput('getBabyProfile', 'string')).toBe('string')
    expect(condenseToolOutput('getSleepHistory', 42)).toBe(42)
    expect(condenseToolOutput('getSleepHistory', true)).toBe(true)
  })

  describe('getBabyProfile', () => {
    it('condenses to success flag only', () => {
      const output = {
        success: true,
        baby: { name: 'Luna', age: '7 months', birthDate: '2025-12-01' },
      }
      expect(condenseToolOutput('getBabyProfile', output)).toEqual({
        success: true,
        _condensed: true,
      })
    })
  })

  describe('getTodayEvents', () => {
    it('condenses to summary with event count', () => {
      const output = {
        success: true,
        currentState: 'daytime_awake',
        events: [{ id: 'e1' }, { id: 'e2' }],
        summary: { napCount: 1, hasWake: true, lastEventType: 'wake' },
      }
      expect(condenseToolOutput('getTodayEvents', output)).toEqual({
        success: true,
        currentState: 'daytime_awake',
        eventCount: 2,
        summary: { napCount: 1, hasWake: true, lastEventType: 'wake' },
        _condensed: true,
      })
    })

    it('handles missing summary gracefully', () => {
      const output = { success: true, events: [{ id: 'e1' }] }
      const result = condenseToolOutput('getTodayEvents', output)
      expect(result).toHaveProperty('summary', {})
      expect(result).toHaveProperty('eventCount', 1)
      expect(result).toHaveProperty('_condensed', true)
    })

    it('handles non-array events', () => {
      const output = { success: true, events: 'not-an-array' }
      const result = condenseToolOutput('getTodayEvents', output)
      expect(result).toHaveProperty('eventCount', 0)
    })
  })

  describe('getSleepHistory', () => {
    it('condenses to days and total count', () => {
      const output = {
        success: true,
        days_retrieved: 30,
        total_events: 142,
        events: [{ id: 'e1' }],
      }
      expect(condenseToolOutput('getSleepHistory', output)).toEqual({
        success: true,
        days_retrieved: 30,
        total_events: 142,
        _condensed: true,
      })
    })
  })

  describe('getChatHistory', () => {
    it('condenses to days and message count', () => {
      const output = {
        success: true,
        days_retrieved: 7,
        message_count: 25,
        messages: [{ id: 'm1' }, { id: 'm2' }],
      }
      expect(condenseToolOutput('getChatHistory', output)).toEqual({
        success: true,
        days_retrieved: 7,
        message_count: 25,
        _condensed: true,
      })
    })
  })

  it('condenses all four read-tool names', () => {
    for (const name of READ_TOOL_NAMES) {
      const result = condenseToolOutput(name, { success: true, extra: 'data' })
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('_condensed', true)
    }
  })
})

// ---------------------------------------------------------------------------
// buildAssistantParts
// ---------------------------------------------------------------------------

describe('buildAssistantParts', () => {
  it('builds parts in order: reasoning → text → tool-call outputs', () => {
    const reasoning = [{ text: 'Thinking step 1' }, { text: 'Thinking step 2' }]
    const text = 'Here is my reply.'
    const toolCalls = [
      { toolCallId: 'call-1', toolName: 'getBabyProfile', input: {} },
    ]
    const toolResults = [
      {
        toolCallId: 'call-1',
        output: { success: true, baby: { name: 'Luna' } },
      },
    ]

    const parts = buildAssistantParts(reasoning, text, toolCalls, toolResults)

    expect(parts).toHaveLength(4)
    expect(parts[0]).toEqual({ type: 'reasoning', text: 'Thinking step 1' })
    expect(parts[1]).toEqual({ type: 'reasoning', text: 'Thinking step 2' })
    expect(parts[2]).toEqual({ type: 'text', text: 'Here is my reply.' })
    expect(parts[3]).toMatchObject({
      type: 'tool-getBabyProfile',
      state: 'output-available',
    })
    // Read-tool output should be condensed
    expect(parts[3].output).toEqual({ success: true, _condensed: true })
  })

  it('returns empty array when all inputs are empty/undefined', () => {
    expect(buildAssistantParts(undefined, undefined, [], [])).toEqual([])
    expect(buildAssistantParts([], '', [], [])).toEqual([])
  })

  it('skips empty reasoning blocks', () => {
    const reasoning = [{ text: 'valid' }, { text: undefined }, { text: '' }]
    const parts = buildAssistantParts(reasoning, 'reply', [], [])
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ type: 'reasoning', text: 'valid' })
    expect(parts[1]).toEqual({ type: 'text', text: 'reply' })
  })

  it('includes tool-call output even when no matching tool result exists', () => {
    const parts = buildAssistantParts(undefined, undefined, [
      { toolCallId: 'call-1', toolName: 'createSleepEvent', input: { event_type: 'wake' } },
    ], [])
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'tool-createSleepEvent',
      state: 'output-available',
    })
    expect(parts[0].output).toBeUndefined()
  })

  it('passes through write-tool output uncondensed', () => {
    const output = { success: true, event: { id: 'e-1' }, message: 'done' }
    const parts = buildAssistantParts(undefined, undefined, [
      { toolCallId: 'call-1', toolName: 'createSleepEvent', input: {} },
    ], [
      { toolCallId: 'call-1', output },
    ])
    expect(parts[0].output).toBe(output)
  })
})

// ---------------------------------------------------------------------------
// saveWithRetry
// ---------------------------------------------------------------------------

describe('saveWithRetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns true on first-successful save', async () => {
    const supabase = {
      rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 'msg-1' }, error: null })),
          })),
        })),
      })),
    }

    const result = await saveWithRetry(supabase as unknown as SupabaseClient, {
      baby_id: 'baby-1',
      message_id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
    })

    expect(result).toBe(true)
  })

  it('retries on error up to maxRetries then returns false', async () => {
    const mockError = new Error('DB timeout')
    let callCount = 0

    const supabase = {
      rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => {
              callCount++
              return Promise.resolve({ data: null, error: mockError })
            }),
          })),
        })),
      })),
    }

    const result = await saveWithRetry(supabase as unknown as SupabaseClient, {
      baby_id: 'baby-1',
      message_id: 'msg-1',
      role: 'assistant',
      parts: [],
    }, 3)

    expect(result).toBe(false)
    // 3 retries means 1 initial + 2 retries
    expect(callCount).toBe(3)
  })

  it('succeeds on retry after initial failure', async () => {
    let fail = true

    const supabase = {
      rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => {
              if (fail) {
                fail = false
                return Promise.resolve({ data: null, error: new Error('temp failure') })
              }
              return Promise.resolve({ data: { id: 'msg-2' }, error: null })
            }),
          })),
        })),
      })),
    }

    const result = await saveWithRetry(supabase as unknown as SupabaseClient, {
      baby_id: 'baby-1',
      message_id: 'msg-2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hello' }],
    })

    expect(result).toBe(true)
  })
})
