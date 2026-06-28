import { describe, it, expect, beforeEach } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import { createGetBabyProfileTool } from '../get-baby-profile'
import { createGetTodayEventsTool } from '../get-today-events'
import { createGetSleepHistoryTool } from '../get-sleep-history'
import { createGetChatHistoryTool } from '../get-chat-history'
import { createUpdatePatternNotesTool } from '../update-notes'
import { createUpdateSleepPlanTool } from '../update-sleep-plan'
import { createMockSupabaseClient, MockSupabaseClient } from '@/lib/__tests__/mocks/supabase'
import { ToolContext } from '../types'

async function executeTool<TInput, TOutput>(
  tool: { execute?: (input: TInput, options: ToolExecutionOptions) => AsyncIterable<TOutput> | PromiseLike<TOutput> | TOutput },
  input: TInput
): Promise<TOutput> {
  if (!tool.execute) throw new Error('Tool execute is undefined')
  const options: ToolExecutionOptions = { toolCallId: 'test-call-id', messages: [] }
  const result = await tool.execute(input, options)
  return result as TOutput
}

describe('AI tools', () => {
  let mockSupabase: MockSupabaseClient
  let context: ToolContext

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    context = {
      supabase: mockSupabase as unknown as ToolContext['supabase'],
      babyId: 'test-baby-123',
      timezone: 'America/New_York',
    }
    mockSupabase._reset()
  })

  describe('getBabyProfile', () => {
    it('returns baby profile', async () => {
      mockSupabase._setSelectResponse({
        data: {
          id: 'test-baby-123',
          name: 'Luna',
          birth_date: '2023-06-15',
          pattern_notes: 'Short naps',
          created_at: '2023-06-15T00:00:00Z',
          plan_generation_locked_until: null,
          last_plan_generated_at: null,
        },
        error: null,
      })

      const tool = createGetBabyProfileTool(context)
      const result = await executeTool(tool, {})

      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.baby.name).toBe('Luna')
      expect(result.baby.age).toMatch(/\d+ months?|newborn/)
    })

    it('returns error when baby not found', async () => {
      mockSupabase._setSelectResponse({ data: null, error: null })

      const tool = createGetBabyProfileTool(context)
      const result = await executeTool(tool, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Baby not found')
    })
  })

  describe('getTodayEvents', () => {
    it('returns today events and state', async () => {
      mockSupabase._setSelectResponse({
        data: [
          {
            id: 'evt-1',
            baby_id: 'test-baby-123',
            event_type: 'wake',
            event_time: new Date().toISOString(),
            end_time: null,
            context: 'home',
            notes: null,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const tool = createGetTodayEventsTool(context)
      const result = await executeTool(tool, {})

      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.events).toHaveLength(1)
      expect(result.currentState).toBe('daytime_awake')
      expect(result.summary.hasWake).toBe(true)
    })

    it('returns default state when no events', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      const tool = createGetTodayEventsTool(context)
      const result = await executeTool(tool, {})

      expect(result.success).toBe(true)
      expect(result.events).toHaveLength(0)
      expect(result.currentState).toBe('awaiting_morning_wake')
    })
  })

  describe('getSleepHistory', () => {
    it('returns day summaries', async () => {
      // Build events at UTC noon and UTC midnight so both land on the same
      // calendar day in America/Chicago (CDT = UTC-5).
      const todayUtc = new Date()
      const wakeUtc = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate(), 12, 0, 0))
      const bedtimeUtc = new Date(wakeUtc.getTime() + 12 * 60 * 60 * 1000)

      mockSupabase._setSelectResponse({
        data: [
          {
            id: 'evt-1',
            baby_id: 'test-baby-123',
            event_type: 'wake',
            event_time: wakeUtc.toISOString(),
            end_time: null,
            context: 'home',
            notes: null,
            created_at: wakeUtc.toISOString(),
          },
          {
            id: 'evt-2',
            baby_id: 'test-baby-123',
            event_type: 'bedtime',
            event_time: bedtimeUtc.toISOString(),
            end_time: null,
            context: 'home',
            notes: null,
            created_at: bedtimeUtc.toISOString(),
          },
        ],
        error: null,
      })

      const tool = createGetSleepHistoryTool(context)
      const result = await executeTool(tool, { days: 7 })

      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.total_events).toBe(2)
      expect(result.summaries).toHaveLength(1)
      expect(result.summaries[0].wakeTime).not.toBeNull()
    })
  })

  describe('getChatHistory', () => {
    it('returns formatted chat messages', async () => {
      mockSupabase._setSelectResponse({
        data: [
          {
            message_id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }],
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      })

      const tool = createGetChatHistoryTool(context)
      const result = await executeTool(tool, { days: 7, limit: 50 })

      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].text).toBe('Hello')
    })
  })

  describe('updatePatternNotes', () => {
    it('appends new pattern notes', async () => {
      mockSupabase._setSelectResponse({
        data: {
          id: 'test-baby-123',
          pattern_notes: 'Existing note',
        },
        error: null,
      })

      const tool = createUpdatePatternNotesTool(context)
      const result = await executeTool(tool, { pattern_info: 'New pattern' })

      expect(result.success).toBe(true)
      expect(result.current_notes).toContain('Existing note')
      expect(result.current_notes).toContain('New pattern')
      expect(mockSupabase._getUpdateCalls()).toHaveLength(1)
    })

    it('returns error when notes exceed max length', async () => {
      mockSupabase._setSelectResponse({
        data: { id: 'test-baby-123', pattern_notes: 'a'.repeat(1900) },
        error: null,
      })

      const tool = createUpdatePatternNotesTool(context)
      const result = await executeTool(tool, { pattern_info: 'b'.repeat(200) })

      expect(result.success).toBe(false)
      expect(result.error).toContain('too long')
    })
  })

  describe('updateSleepPlan', () => {
    it('persists a sleep plan', async () => {
      mockSupabase._setSelectResponse({
        data: [],
        error: null,
      })
      mockSupabase._setInsertResponse({
        data: {
          id: 'plan-1',
          baby_id: 'test-baby-123',
          current_state: 'daytime_awake',
          next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
          schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'upcoming', notes: '' }],
          target_bedtime: '7:00pm',
          summary: 'Plan summary',
          events_hash: 'abc123',
          plan_date: '2024-01-15',
          is_active: true,
          created_by: null,
          created_at: new Date().toISOString(),
        },
        error: null,
      })

      const tool = createUpdateSleepPlanTool(context)
      const result = await executeTool(tool, {
        currentState: 'daytime_awake',
        nextAction: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
        schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'upcoming', notes: '' }],
        targetBedtime: '7:00pm',
        summary: 'Plan summary',
      })

      expect(result.success).toBe(true)
      expect(result.persisted).toBe(true)
      expect(mockSupabase._getInsertCalls()).toHaveLength(1)
    })

    it('returns error when events fetch fails', async () => {
      mockSupabase._setSelectResponse({
        data: null,
        error: new Error('DB connection failed'),
      })

      const tool = createUpdateSleepPlanTool(context)
      const result = await executeTool(tool, {
        currentState: 'daytime_awake',
        nextAction: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
        schedule: [],
        targetBedtime: '7:00pm',
        summary: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toContain("today's events")
    })

    it('returns error when plan creation fails', async () => {
      mockSupabase._setSelectResponse({
        data: [],
        error: null,
      })
      mockSupabase._setInsertResponse({
        data: null,
        error: new Error('Insert constraint violation'),
      })

      const tool = createUpdateSleepPlanTool(context)
      const result = await executeTool(tool, {
        currentState: 'daytime_awake',
        nextAction: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
        schedule: [],
        targetBedtime: '7:00pm',
        summary: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toContain('save')
    })

    it('returns error when plan data is null without error', async () => {
      mockSupabase._setSelectResponse({
        data: [],
        error: null,
      })
      mockSupabase._setInsertResponse({
        data: null,
        error: null,
      })

      const tool = createUpdateSleepPlanTool(context)
      const result = await executeTool(tool, {
        currentState: 'daytime_awake',
        nextAction: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
        schedule: [],
        targetBedtime: '7:00pm',
        summary: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toContain('save')
    })
  })
})
