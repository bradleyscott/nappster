import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabaseClient, MockSupabaseClient } from '@/lib/__tests__/mocks/supabase'
import { getBabyById, createBaby } from '../babies'
import {
  getFamilyMembersForUser,
  checkBabyAccess,
  getFamilyMembersForBaby,
  getFamilyMembersForBabyWithIdentity,
  createFamilyMember,
  redeemInviteCode,
} from '../family-members'
import {
  getActiveSleepPlan,
  createSleepPlan,
  getRecentSleepPlans,
  getSleepPlansSinceCreatedAt,
  getSleepPlansByCreatedAtRange,
  deactivatePreviousSleepPlans,
} from '../sleep-plans'
import { createInviteCode } from '../invite-codes'
import {
  getTodaySleepEvents,
  createSleepEvent,
  getSleepEvents,
  getRecentSleepEvents,
  getSleepEventsSince,
  updateSleepEvent,
  deleteSleepEvent,
} from '../sleep-events'
import { getChatMessages, saveChatMessage } from '../chat-messages'

// Re-export so the function is accessible
import type { CreateFamilyMemberInput } from '../family-members'
import type { CreateSleepPlanInput } from '../sleep-plans'

describe('services', () => {
  let mockSupabase: MockSupabaseClient

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    mockSupabase._reset()
  })

  describe('babies', () => {
    it('getBabyById queries the babies table', async () => {
      mockSupabase._setSelectResponse({
        data: { id: 'baby-1', name: 'Luna', birth_date: '2023-06-15', pattern_notes: null, created_at: '2023-06-15', plan_generation_locked_until: null, last_plan_generated_at: null },
        error: null,
      })

      const { data, error } = await getBabyById(mockSupabase as unknown as Parameters<typeof getBabyById>[0], 'baby-1')

      expect(error).toBeNull()
      expect(data?.name).toBe('Luna')
      expect(mockSupabase._getFromCalls()).toContain('babies')
    })

    it('createBaby inserts into the babies table', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'baby-1', name: 'Luna', birth_date: '2023-06-15', pattern_notes: 'notes', plan_generation_locked_until: null, last_plan_generated_at: null },
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

    it('getFamilyMembersForBaby queries by baby_id', async () => {
      mockSupabase._setSelectResponse({
        data: [{ id: 'fm-1', user_id: 'user-1', baby_id: 'baby-1', role: 'parent', created_at: '2023-01-01' }],
        error: null,
      })

      const { data, error } = await getFamilyMembersForBaby(
        mockSupabase as unknown as Parameters<typeof getFamilyMembersForBaby>[0],
        'baby-1'
      )

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(mockSupabase._getFromCalls()).toContain('family_members')
    })

    it('createFamilyMember inserts a new member', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'fm-2', user_id: 'user-2', baby_id: 'baby-1', role: 'parent', created_at: '2023-01-01' },
        error: null,
      })

      const input: CreateFamilyMemberInput = {
        user_id: 'user-2',
        baby_id: 'baby-1',
        role: 'parent',
      }
      const { data, error } = await createFamilyMember(
        mockSupabase as unknown as Parameters<typeof createFamilyMember>[0],
        input
      )

      expect(error).toBeNull()
      expect(data?.user_id).toBe('user-2')
      expect(mockSupabase._getInsertCalls()).toHaveLength(1)
    })

    it('getFamilyMembersForBabyWithIdentity calls the enriched-list RPC', async () => {
      mockSupabase._setRpcResponse({
        data: [
          { id: 'fm-1', user_id: 'user-1', baby_id: 'baby-1', role: 'parent', created_at: '2023-01-01', email: 'dev@example.com', is_you: true },
          { id: 'fm-2', user_id: 'user-2', baby_id: 'baby-1', role: 'caregiver', created_at: '2023-01-02', email: 'dev2@example.com', is_you: false },
        ],
        error: null,
      })

      const { data, error } = await getFamilyMembersForBabyWithIdentity(
        mockSupabase as unknown as Parameters<typeof getFamilyMembersForBabyWithIdentity>[0],
        'baby-1'
      )

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      expect(data?.[0].email).toBe('dev@example.com')
      expect(data?.[1].is_you).toBe(false)
      expect(mockSupabase._getRpcCalls()).toContain('get_family_members_for_baby')
    })

    it('redeemInviteCode calls the RPC', async () => {
      mockSupabase._setRpcResponse({
        data: { success: true, baby_id: 'baby-1' },
        error: null,
      })

      const { data, error } = await redeemInviteCode(
        mockSupabase as unknown as Parameters<typeof redeemInviteCode>[0],
        '123456'
      )

      expect(error).toBeNull()
      expect(data?.baby_id).toBe('baby-1')
      expect(mockSupabase._getRpcCalls()).toContain('redeem_invite_code')
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

    it('getSleepEvents with date filters', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      const { data } = await getSleepEvents(
        mockSupabase as unknown as Parameters<typeof getSleepEvents>[0],
        {
          babyId: 'baby-1',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-02T00:00:00Z',
          order: { column: 'event_time', ascending: true },
          limit: 10,
        }
      )

      expect(data).toEqual([])
      expect(mockSupabase._getFromCalls()).toContain('sleep_events')
    })

    it('getRecentSleepEvents queries from yesterday', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getRecentSleepEvents(
        mockSupabase as unknown as Parameters<typeof getRecentSleepEvents>[0],
        'baby-1',
        'UTC'
      )

      expect(mockSupabase._getFromCalls()).toContain('sleep_events')
    })

    it('getSleepEventsSince queries from a start date', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getSleepEventsSince(
        mockSupabase as unknown as Parameters<typeof getSleepEventsSince>[0],
        'baby-1',
        '2024-01-01T00:00:00Z'
      )

      expect(mockSupabase._getFromCalls()).toContain('sleep_events')
    })

    it('updateSleepEvent updates an event', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'evt-1', event_type: 'nap_end', end_time: '2024-01-01T09:00:00Z' },
        error: null,
      })

      const { data, error } = await updateSleepEvent(
        mockSupabase as unknown as Parameters<typeof updateSleepEvent>[0],
        'evt-1',
        { end_time: '2024-01-01T09:00:00Z' }
      )

      expect(error).toBeNull()
      expect(data?.event_type).toBe('nap_end')
      expect(mockSupabase._getUpdateCalls()).toHaveLength(1)
    })

    it('deleteSleepEvent deletes an event', async () => {
      const { error } = await deleteSleepEvent(
        mockSupabase as unknown as Parameters<typeof deleteSleepEvent>[0],
        'evt-1'
      )

      expect(error).toBeNull()
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

    it('getActiveSleepPlan with planDate filter', async () => {
      mockSupabase._setSelectResponse({
        data: { id: 'plan-2', plan_date: '2024-06-01', is_active: true },
        error: null,
      })

      const { data } = await getActiveSleepPlan(
        mockSupabase as unknown as Parameters<typeof getActiveSleepPlan>[0],
        'baby-1',
        '2024-06-01'
      )

      expect(data?.plan_date).toBe('2024-06-01')
    })

    it('createSleepPlan inserts a plan', async () => {
      mockSupabase._setInsertResponse({
        data: { id: 'plan-1', baby_id: 'baby-1', current_state: 'daytime_awake', plan_date: '2024-01-01' },
        error: null,
      })

      const input: CreateSleepPlanInput = {
        baby_id: 'baby-1',
        current_state: 'daytime_awake',
        plan_date: '2024-01-01',
        schedule: { naps: [] },
        summary: 'Test plan',
        is_active: true,
      }
      const { data, error } = await createSleepPlan(
        mockSupabase as unknown as Parameters<typeof createSleepPlan>[0],
        input
      )

      expect(error).toBeNull()
      expect(data?.id).toBe('plan-1')
      expect(mockSupabase._getInsertCalls()).toHaveLength(1)
    })

    it('getRecentSleepPlans returns limited plans', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getRecentSleepPlans(
        mockSupabase as unknown as Parameters<typeof getRecentSleepPlans>[0],
        'baby-1',
        5
      )

      expect(mockSupabase._getFromCalls()).toContain('sleep_plans')
    })

    it('getSleepPlansSinceCreatedAt queries from date', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getSleepPlansSinceCreatedAt(
        mockSupabase as unknown as Parameters<typeof getSleepPlansSinceCreatedAt>[0],
        'baby-1',
        '2024-01-01T00:00:00Z'
      )

      expect(mockSupabase._getFromCalls()).toContain('sleep_plans')
    })

    it('getSleepPlansByCreatedAtRange queries with from and to', async () => {
      mockSupabase._setSelectResponse({ data: [], error: null })

      await getSleepPlansByCreatedAtRange(
        mockSupabase as unknown as Parameters<typeof getSleepPlansByCreatedAtRange>[0],
        'baby-1',
        '2024-01-01T00:00:00Z',
        '2024-01-02T00:00:00Z'
      )

      expect(mockSupabase._getFromCalls()).toContain('sleep_plans')
    })

    it('deactivatePreviousSleepPlans updates is_active', async () => {
      mockSupabase._setInsertResponse({ data: null, error: null })

      const { error } = await deactivatePreviousSleepPlans(
        mockSupabase as unknown as Parameters<typeof deactivatePreviousSleepPlans>[0],
        'baby-1',
        '2024-01-01'
      )

      expect(error).toBeNull()
      expect(mockSupabase._getUpdateCalls()).toHaveLength(1)
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
