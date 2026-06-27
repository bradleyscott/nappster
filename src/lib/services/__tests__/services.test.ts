import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabaseClient, MockSupabaseClient } from '@/lib/__tests__/mocks/supabase'
import { getBabyById, createBaby } from '../babies'
import { getFamilyMembersForUser, checkBabyAccess } from '../family-members'
import { getActiveSleepPlan } from '../sleep-plans'
import { createInviteCode } from '../invite-codes'
import { getTodaySleepEvents, createSleepEvent } from '../sleep-events'
import { getChatMessages, saveChatMessage } from '../chat-messages'

describe('services', () => {
  let mockSupabase: MockSupabaseClient

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    mockSupabase._reset()
  })

  describe('babies', () => {
    it('getBabyById queries the babies table', async () => {
      mockSupabase._setSelectResponse({
        data: { id: 'baby-1', name: 'Luna', birth_date: '2023-06-15', pattern_notes: null, created_at: '2023-06-15' },
        error: null,
      })

      const { data, error } = await getBabyById(mockSupabase as unknown as Parameters<typeof getBabyById>[0], 'baby-1')

      expect(error).toBeNull()
      expect(data?.name).toBe('Luna')
      expect(mockSupabase._getFromCalls()).toContain('babies')
    })

    it('createBaby inserts into the babies table', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'baby-1', name: 'Luna', birth_date: '2023-06-15', pattern_notes: 'notes' },
        error: null,
      })

      const { data, error } = await createBaby(mockSupabase as unknown as Parameters<typeof createBaby>[0], {
        name: 'Luna',
        birth_date: '2023-06-15',
        pattern_notes: 'notes',
      })

      expect(error).toBeNull()
      expect(data?.name).toBe('Luna')
      expect(mockSupabase._getInsertCalls()).toHaveLength(1)
    })
  })

  describe('family-members', () => {
    it('getFamilyMembersForUser queries family_members', async () => {
      mockSupabase._setSelectResponse({
        data: [{ id: 'fm-1', user_id: 'user-1', baby_id: 'baby-1', role: 'parent', created_at: '2023-01-01' }],
        error: null,
      })

      const { data } = await getFamilyMembersForUser(mockSupabase as unknown as Parameters<typeof getFamilyMembersForUser>[0], 'user-1')

      expect(data).toHaveLength(1)
      expect(mockSupabase._getFromCalls()).toContain('family_members')
    })

    it('checkBabyAccess returns membership', async () => {
      mockSupabase._setSelectResponse({ data: { id: 'fm-1' }, error: null })

      const { data, error } = await checkBabyAccess(mockSupabase as unknown as Parameters<typeof checkBabyAccess>[0], 'baby-1', 'user-1')

      expect(error).toBeNull()
      expect(data?.id).toBe('fm-1')
    })
  })

  describe('sleep-events', () => {
    it('getTodaySleepEvents queries sleep_events for today', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getTodaySleepEvents(mockSupabase as unknown as Parameters<typeof getTodaySleepEvents>[0], 'baby-1', 'UTC')

      expect(mockSupabase._getFromCalls()).toContain('sleep_events')
    })

    it('createSleepEvent inserts into sleep_events', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'evt-1', baby_id: 'baby-1', event_type: 'wake', event_time: '2024-01-01T08:00:00Z' },
        error: null,
      })

      const { data, error } = await createSleepEvent(mockSupabase as unknown as Parameters<typeof createSleepEvent>[0], {
        baby_id: 'baby-1',
        event_type: 'wake',
        event_time: '2024-01-01T08:00:00Z',
      })

      expect(error).toBeNull()
      expect(data?.event_type).toBe('wake')
    })
  })

  describe('chat-messages', () => {
    it('getChatMessages queries chat_messages', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getChatMessages(mockSupabase as unknown as Parameters<typeof getChatMessages>[0], { babyId: 'baby-1', limit: 50 })

      expect(mockSupabase._getFromCalls()).toContain('chat_messages')
    })

    it('saveChatMessage inserts into chat_messages', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'msg-1', baby_id: 'baby-1', role: 'user', parts: [], created_at: '2024-01-01' },
        error: null,
      })

      const { data, error } = await saveChatMessage(mockSupabase as unknown as Parameters<typeof saveChatMessage>[0], {
        baby_id: 'baby-1',
        role: 'user',
        parts: [],
      })

      expect(error).toBeNull()
      expect(data?.role).toBe('user')
    })
  })

  describe('sleep-plans', () => {
    it('getActiveSleepPlan queries sleep_plans', async () => {
      mockSupabase._setSelectResponse({
        data: { id: 'plan-1', baby_id: 'baby-1', current_state: 'daytime_awake', plan_date: '2024-01-01', is_active: true, created_at: '2024-01-01' },
        error: null,
      })

      const { data, error } = await getActiveSleepPlan(mockSupabase as unknown as Parameters<typeof getActiveSleepPlan>[0], 'baby-1')

      expect(error).toBeNull()
      expect(data?.id).toBe('plan-1')
      expect(mockSupabase._getFromCalls()).toContain('sleep_plans')
    })
  })

  describe('invite-codes', () => {
    it('createInviteCode inserts into invite_codes', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'code-1', baby_id: 'baby-1', code: '123456', created_by: 'user-1', expires_at: '2024-01-02', created_at: '2024-01-01' },
        error: null,
      })

      const { data, error } = await createInviteCode(mockSupabase as unknown as Parameters<typeof createInviteCode>[0], {
        baby_id: 'baby-1',
        code: '123456',
        created_by: 'user-1',
        expires_at: '2024-01-02',
      })

      expect(error).toBeNull()
      expect(data?.code).toBe('123456')
    })
  })
})
