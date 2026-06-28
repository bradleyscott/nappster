import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as generatePlan } from '../sleep-plan/generate/route'
import { mockStore, MOCK_USER_ID, insertRecord } from '@/lib/mock/store'
import { streamText } from 'ai'

const TEST_BABY_ID = 'a76d050c-6a1c-4115-af41-46f3d34a4dd4'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn(),
    stepCountIs: vi.fn((n: number) => n),
  }
})

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({})),
}))

vi.mock('@/lib/ai/build-plan-context', () => ({
  buildPlanGenerationContext: vi.fn(),
}))

vi.mock('@/lib/services/sleep-plans', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/sleep-plans')>('@/lib/services/sleep-plans')
  return {
    ...actual,
    getActiveSleepPlan: vi.fn(),
  }
})

vi.mock('@/lib/services/babies', () => ({
  acquirePlanGenerationLock: vi.fn().mockResolvedValue({ acquired: true, error: null }),
  releasePlanGenerationLock: vi.fn().mockResolvedValue({ error: null }),
  isPlanGenerationCooldownActive: vi.fn().mockResolvedValue({ active: false, error: null }),
}))

import { buildPlanGenerationContext } from '@/lib/ai/build-plan-context'
import { getActiveSleepPlan } from '@/lib/services/sleep-plans'
import {
  acquirePlanGenerationLock,
  releasePlanGenerationLock,
  isPlanGenerationCooldownActive,
} from '@/lib/services/babies'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sleep-plan/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function mockContext(todayEvents: unknown[] = []) {
  vi.mocked(buildPlanGenerationContext).mockResolvedValue({
    todayEvents: todayEvents as never,
    eventsHash: 'test-hash',
    systemPrompt: 'You are a sleep consultant.',
    chatContext: {},
    toolContext: { supabase: {} as never, babyId: TEST_BABY_ID, timezone: 'UTC' },
    babyProfile: { name: 'Test Baby', age: '1 year', birthDate: '2023-06-15', sleepTrainingMethod: null, patternNotes: null },
    historyEvents: [],
    sleepTrendsFormatted: null,
  })
}

function mockStreamWithPlan() {
  vi.mocked(streamText).mockReturnValue({
    consumeStream: vi.fn().mockResolvedValue(undefined),
    toolCalls: Promise.resolve([
      { toolName: 'updateSleepPlan', toolCallId: 'call-1' },
    ] as never[]),
    toolResults: Promise.resolve([
      { toolCallId: 'call-1', output: { persisted: true, success: true } },
    ] as never[]),
  } as never)
}

describe('POST /api/sleep-plan/generate', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'

    mockStore.sleep_plans.length = 0
    if (!mockStore.babies.some(b => b.id === TEST_BABY_ID)) {
      insertRecord('babies', {
        id: TEST_BABY_ID,
        name: 'Test Baby',
        birth_date: '2023-06-15',
      })
      insertRecord('family_members', {
        user_id: MOCK_USER_ID,
        baby_id: TEST_BABY_ID,
        role: 'parent',
      })
    }

    vi.clearAllMocks()
    vi.mocked(getActiveSleepPlan).mockReset()
    vi.mocked(streamText).mockReset()
    vi.mocked(buildPlanGenerationContext).mockReset()

    // Reset guard mocks to their default "allow" state.
    vi.mocked(acquirePlanGenerationLock).mockReset().mockResolvedValue({ acquired: true, error: null })
    vi.mocked(releasePlanGenerationLock).mockReset().mockResolvedValue({ error: null })
    vi.mocked(isPlanGenerationCooldownActive).mockReset().mockResolvedValue({ active: false, error: null })
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
  })

  it('returns regenerated:false when the active plan already matches current events', async () => {
    mockContext([])
    vi.mocked(getActiveSleepPlan).mockResolvedValue({
      data: {
        id: 'plan-1',
        baby_id: TEST_BABY_ID,
        events_hash: 'test-hash',
        plan_date: new Date().toISOString().split('T')[0],
        is_active: true,
      } as never,
      error: null,
    })

    const response = await generatePlan(makeRequest({ babyId: TEST_BABY_ID, timezone: 'UTC' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regenerated).toBe(false)
    expect(body.plan.id).toBe('plan-1')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('generates a new plan when no active plan exists', async () => {
    mockContext([
      { id: 'evt-1', event_type: 'wake', event_time: new Date().toISOString() },
    ])
    vi.mocked(getActiveSleepPlan)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'plan-2',
          baby_id: TEST_BABY_ID,
          events_hash: 'test-hash',
          plan_date: new Date().toISOString().split('T')[0],
          is_active: true,
        } as never,
        error: null,
      })

    mockStreamWithPlan()

    const response = await generatePlan(makeRequest({ babyId: TEST_BABY_ID, timezone: 'UTC' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regenerated).toBe(true)
    expect(body.plan.id).toBe('plan-2')
    expect(streamText).toHaveBeenCalled()
  })

  it('returns no_events_today when there are no events and no active plan', async () => {
    mockContext([])
    vi.mocked(getActiveSleepPlan).mockResolvedValue({ data: null, error: null })

    const response = await generatePlan(makeRequest({ babyId: TEST_BABY_ID, timezone: 'UTC' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regenerated).toBe(false)
    expect(body.reason).toBe('no_events_today')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('returns cooldown_active when a recent generation already happened', async () => {
    mockContext([
      { id: 'evt-1', event_type: 'wake', event_time: new Date().toISOString() },
    ])
    vi.mocked(getActiveSleepPlan).mockResolvedValue({ data: null, error: null })
    vi.mocked(isPlanGenerationCooldownActive).mockResolvedValue({ active: true, error: null })

    const response = await generatePlan(makeRequest({ babyId: TEST_BABY_ID, timezone: 'UTC' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regenerated).toBe(false)
    expect(body.reason).toBe('cooldown_active')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('returns generation_in_progress when another request holds the lock', async () => {
    mockContext([
      { id: 'evt-1', event_type: 'wake', event_time: new Date().toISOString() },
    ])
    vi.mocked(getActiveSleepPlan).mockResolvedValue({ data: null, error: null })
    vi.mocked(acquirePlanGenerationLock).mockResolvedValue({ acquired: false, error: null })

    const response = await generatePlan(makeRequest({ babyId: TEST_BABY_ID, timezone: 'UTC' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regenerated).toBe(false)
    expect(body.reason).toBe('generation_in_progress')
    expect(streamText).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid babyId', async () => {
    const response = await generatePlan(makeRequest({ babyId: 'not-a-uuid' }))
    expect(response.status).toBe(400)
  })
})
