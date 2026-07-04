import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMockSupabaseClient } from '@/lib/__tests__/mocks/supabase'
import {
  createSleepEvent,
  getTodaySleepEvents,
  updateSleepEvent,
  deleteSleepEvent,
} from '../sleep-events'
import { createSleepPlan, getActiveSleepPlan } from '../sleep-plans'
import { saveChatMessage, getChatMessages } from '../chat-messages'

describe('Services integration against mock Supabase', () => {
  let supabase: SupabaseClient
  let mock: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    mock = createMockSupabaseClient()
    supabase = mock as unknown as SupabaseClient
    mock._reset()
  })

  describe('sleep-events', () => {
    it('creates, reads, updates, and deletes an event', async () => {
      const created = {
        id: 'evt-1',
        baby_id: 'baby-1',
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
        end_time: null,
        context: 'home',
        notes: null,
        created_at: '2024-06-15T07:00:00Z',
      }

      mock._setInsertResponse({ data: created, error: null })
      const { data: newEvent } = await createSleepEvent(supabase, {
        baby_id: 'baby-1',
        event_type: 'wake',
        event_time: '2024-06-15T07:00:00Z',
        context: 'home',
        notes: null,
      })
      expect(newEvent).toEqual(created)

      mock._setSelectResponse({
        data: [created],
        error: null,
      })
      const { data: todayEvents } = await getTodaySleepEvents(supabase, 'baby-1', 'UTC')
      expect(todayEvents).toHaveLength(1)
      expect(todayEvents?.[0].event_type).toBe('wake')

      const updated = { ...created, notes: 'updated note' }
      mock._setInsertResponse({ data: updated, error: null })
      const { data: updatedEvent } = await updateSleepEvent(supabase, 'evt-1', { notes: 'updated note' })
      expect(updatedEvent?.notes).toBe('updated note')

      const { error } = await deleteSleepEvent(supabase, 'evt-1')
      expect(error).toBeNull()
    })
  })

  describe('sleep-plans', () => {
    it('creates and reads an active plan', async () => {
      const plan = {
        id: 'plan-1',
        baby_id: 'baby-1',
        current_state: 'daytime_awake',
        next_action: { label: 'Nap 1', timeWindow: '9:00 - 10:30am' },
        schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00 - 10:30am', status: 'upcoming' }],
        target_bedtime: '7:00 - 7:30pm',
        summary: 'Test plan',
        events_hash: 'hash-1',
        plan_date: '2024-06-15',
        is_active: true,
        created_by: null,
        created_at: '2024-06-15T07:00:00Z',
      }

      mock._setInsertResponse({ data: plan, error: null })
      const { data: newPlan } = await createSleepPlan(supabase, {
        baby_id: 'baby-1',
        current_state: 'daytime_awake',
        next_action: plan.next_action,
        schedule: plan.schedule,
        target_bedtime: plan.target_bedtime,
        summary: plan.summary,
        events_hash: plan.events_hash,
        plan_date: plan.plan_date,
        is_active: true,
        created_by: null,
      })
      expect(newPlan).toEqual(plan)

      // .single() unwraps the array; the mock returns the set response directly.
      mock._setSelectResponse({ data: plan, error: null })
      const { data: activePlan } = await getActiveSleepPlan(supabase, 'baby-1', '2024-06-15')
      expect(activePlan?.id).toBe('plan-1')
    })
  })

  describe('chat-messages', () => {
    it('saves and retrieves messages', async () => {
      const message = {
        id: 'msg-1',
        baby_id: 'baby-1',
        message_id: 'msg-1',
        role: 'user',
        content: null,
        parts: [{ type: 'text', text: 'hello' }],
        created_at: '2024-06-15T07:00:00Z',
      }

      mock._setInsertResponse({ data: message, error: null })
      const { data: saved } = await saveChatMessage(supabase, {
        baby_id: 'baby-1',
        role: 'user',
        parts: message.parts as Record<string, unknown>[],
      })
      expect(saved?.message_id).toBe('msg-1')

      mock._setSelectResponse({ data: [message], error: null })
      const { data: messages } = await getChatMessages(supabase, { babyId: 'baby-1', limit: 10 })
      expect(messages).toHaveLength(1)
      expect(messages?.[0].role).toBe('user')
    })
  })
})
