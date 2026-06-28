import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as redeemInvite } from '../invite/redeem/route'
import { GET as getSleepPlan } from '../sleep-plan/[babyId]/route'
import { GET as getChatMessages } from '../chat/messages/route'
import { mockStore, MOCK_USER_ID } from '@/lib/mock/store'
import { insertRecord } from '@/lib/mock/store'

const TEST_BABY_ID = 'a76d050c-6a1c-4115-af41-46f3d34a4dd4'

describe('API routes', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    // Clear dynamic mock data that tests mutate
    mockStore.sleep_plans.length = 0
    mockStore.invite_codes.length = 0
    mockStore.chat_messages.length = 0
    // Ensure a valid-UUID baby exists for tests that validate UUIDs
    if (!mockStore.babies.some(b => b.id === TEST_BABY_ID)) {
      insertRecord('babies', {
        id: TEST_BABY_ID,
        name: 'Test Baby',
        birth_date: '2023-06-15',
        plan_generation_locked_until: null,
        last_plan_generated_at: null,
      })
      insertRecord('family_members', {
        user_id: MOCK_USER_ID,
        baby_id: TEST_BABY_ID,
        role: 'parent',
      })
    }
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
  })

  describe('POST /api/invite/redeem', () => {
    it('redeems a valid invite code', async () => {
      const otherBabyId = 'b76d050c-6a1c-4115-af41-46f3d34a4dd4'
      insertRecord('invite_codes', {
        baby_id: otherBabyId,
        code: '123456',
        created_by: MOCK_USER_ID,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      const request = new NextRequest('http://localhost/api/invite/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      })

      const response = await redeemInvite(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.babyId).toBe(otherBabyId)
    })

    it('rejects an invalid code', async () => {
      const request = new NextRequest('http://localhost/api/invite/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: '000000' }),
      })

      const response = await redeemInvite(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBeDefined()
    })
  })

  describe('GET /api/sleep-plan/[babyId]', () => {
    it('returns an active plan when one exists', async () => {
      const today = new Date().toISOString().split('T')[0]
      insertRecord('sleep_plans', {
        baby_id: TEST_BABY_ID,
        current_state: 'daytime_awake',
        next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
        schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'upcoming', notes: '' }],
        target_bedtime: '7:00pm',
        summary: 'Test plan',
        events_hash: 'unknown',
        plan_date: today,
        is_active: true,
        created_by: MOCK_USER_ID,
      })

      const request = new NextRequest(`http://localhost/api/sleep-plan/${TEST_BABY_ID}`)
      const response = await getSleepPlan(request, { params: Promise.resolve({ babyId: TEST_BABY_ID }) })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.plan).not.toBeNull()
      expect(body.plan.summary).toBe('Test plan')
      expect(body.stale).toBe(true) // hash won't match empty events
    })

    it('returns null plan when none exists', async () => {
      const request = new NextRequest(`http://localhost/api/sleep-plan/${TEST_BABY_ID}`)
      const response = await getSleepPlan(request, { params: Promise.resolve({ babyId: TEST_BABY_ID }) })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.plan).toBeNull()
      expect(body.stale).toBe(true)
    })
  })

  describe('GET /api/chat/messages', () => {
    it('returns paginated messages', async () => {
      const baseTime = new Date().toISOString()
      insertRecord('chat_messages', {
        baby_id: TEST_BABY_ID,
        message_id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        created_at: baseTime,
      })

      const request = new NextRequest(`http://localhost/api/chat/messages?babyId=${TEST_BABY_ID}&limit=50`)
      const response = await getChatMessages(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].id).toBe('msg-1')
      expect(body.hasMore).toBe(false)
    })

    it('returns 400 for invalid babyId', async () => {
      const request = new NextRequest('http://localhost/api/chat/messages?babyId=not-a-uuid')
      const response = await getChatMessages(request)

      expect(response.status).toBe(400)
    })
  })
})
