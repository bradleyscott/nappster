import { Baby, FamilyMember, SleepEvent, ChatMessage, SleepPlan } from '@/types/database'
import { computeEventsHash } from '@/lib/sleep-utils'

// Mock user matching Supabase auth user structure
export const MOCK_USER = {
  id: 'mock-user-123',
  email: 'dev@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const MOCK_USER_ID = MOCK_USER.id
export const MOCK_BABY_ID = 'mock-baby-456'

// Calculate birth date for a ~7 month old baby
const birthDate = new Date()
birthDate.setMonth(birthDate.getMonth() - 7)

// Mock data stores
export const mockStore = {
  babies: [
    {
      id: MOCK_BABY_ID,
      name: 'Luna',
      birth_date: birthDate.toISOString().split('T')[0],
      sleep_training_method: 'Taking Cara Babies',
      pattern_notes: 'Typically does 30-minute naps, prefers 3 naps per day. Usually wakes around 7am.',
      created_at: birthDate.toISOString(),
    },
  ] as Baby[],

  family_members: [
    {
      id: 'mock-fm-789',
      user_id: MOCK_USER_ID,
      baby_id: MOCK_BABY_ID,
      role: 'parent',
      created_at: birthDate.toISOString(),
    },
  ] as FamilyMember[],

  sleep_events: generateTodayEvents(),

  chat_messages: generateSampleChatHistory(),

  sleep_plans: [] as SleepPlan[],
}

// Generate initial sleep plan based on today's events
function generateInitialSleepPlan(): void {
  const events = mockStore.sleep_events
  if (events.length === 0) return

  const today = new Date().toISOString().split('T')[0]
  const eventsHash = computeEventsHash(events)

  const plan: SleepPlan = {
    id: 'mock-plan-001',
    baby_id: MOCK_BABY_ID,
    current_state: 'daytime_awake',
    next_action: {
      label: 'Nap 2',
      timeWindow: '1:00 - 1:30pm',
      isUrgent: false,
    },
    schedule: [
      {
        type: 'nap',
        label: 'Nap 1',
        timeWindow: '9:30am',
        status: 'completed',
        notes: 'First nap of the day',
      },
      {
        type: 'nap',
        label: 'Nap 2',
        timeWindow: '1:00 - 1:30pm',
        status: 'upcoming',
        notes: 'Aim for a longer nap',
      },
      {
        type: 'nap',
        label: 'Nap 3',
        timeWindow: '4:00 - 4:30pm',
        status: 'upcoming',
        notes: 'Short catnap if needed',
      },
      {
        type: 'bedtime',
        label: 'Bedtime',
        timeWindow: '7:00 - 7:30pm',
        status: 'upcoming',
        notes: 'Target bedtime',
      },
    ],
    target_bedtime: '7:00 - 7:30pm',
    summary: "Luna had a 30-minute morning nap. Aim for a longer afternoon nap around 1pm. If she takes a third nap, keep it short and before 5pm to protect bedtime.",
    events_hash: eventsHash,
    plan_date: today,
    is_active: true,
    created_by: MOCK_USER_ID,
    created_at: new Date().toISOString(),
  }

  mockStore.sleep_plans.push(plan)
}

// Initialize sleep plan after events are generated
generateInitialSleepPlan()

function generateSampleChatHistory(): ChatMessage[] {
  const messages: ChatMessage[] = []
  const now = new Date()

  // Sample conversation from "yesterday" - use relative offsets from now
  // This ensures consistent behavior regardless of server timezone
  const yesterdayMorning = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
  yesterdayMorning.setUTCHours(15, 0, 0, 0) // 10am EST / 3pm UTC - morning chat time

  messages.push({
    id: 'chat-1',
    baby_id: MOCK_BABY_ID,
    message_id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Luna woke up at 7am this morning' }],
    created_at: yesterdayMorning.toISOString(),
  })

  const yesterdayMorningReply = new Date(yesterdayMorning.getTime() + 60 * 1000) // 1 minute later
  messages.push({
    id: 'chat-2',
    baby_id: MOCK_BABY_ID,
    message_id: 'msg-2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-createSleepEvent',
        state: 'output-available',
        input: { event_type: 'wake', event_time: yesterdayMorning.toISOString() },
        output: { success: true, message: 'Logged wake at 7:00am' }
      },
      { type: 'text', text: "Great! I've logged Luna's wake time at 7am. Based on her age, she should be ready for her first nap around 9:30-10am." }
    ],
    created_at: yesterdayMorningReply.toISOString(),
  })

  const yesterdayAfternoon = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  yesterdayAfternoon.setUTCHours(19, 0, 0, 0) // 2pm EST / 7pm UTC - afternoon chat time

  messages.push({
    id: 'chat-3',
    baby_id: MOCK_BABY_ID,
    message_id: 'msg-3',
    role: 'user',
    parts: [{ type: 'text', text: 'What time should bedtime be tonight?' }],
    created_at: yesterdayAfternoon.toISOString(),
  })

  const yesterdayAfternoonReply = new Date(yesterdayAfternoon.getTime() + 60 * 1000) // 1 minute later
  messages.push({
    id: 'chat-4',
    baby_id: MOCK_BABY_ID,
    message_id: 'msg-4',
    role: 'assistant',
    parts: [
      { type: 'text', text: "Based on Luna's typical schedule and wake windows for a 7-month-old, I'd recommend bedtime around 7:00-7:30pm tonight. This gives her about 3-3.5 hours of awake time after her last nap, which is appropriate for her age." }
    ],
    created_at: yesterdayAfternoonReply.toISOString(),
  })

  return messages
}

function generateTodayEvents(): SleepEvent[] {
  const now = new Date()
  const events: SleepEvent[] = []

  // Create a realistic day based on current time
  // Use UTC hours to ensure consistent behavior across server environments
  // Times are set to approximate US Eastern timezone (UTC-5) for realistic simulation
  const wakeTime = new Date(now)
  wakeTime.setUTCHours(12, 0, 0, 0) // 7am EST = 12pm UTC

  // Only add events that have "happened" (before current time)
  if (now >= wakeTime) {
    events.push({
      id: 'event-1',
      baby_id: MOCK_BABY_ID,
      event_type: 'wake',
      event_time: wakeTime.toISOString(),
      end_time: null,
      context: 'home',
      notes: 'Woke up happy',
      created_at: wakeTime.toISOString(),
    })
  }

  // First nap: 9:30am - 10:00am EST = 2:30pm - 3:00pm UTC
  const nap1Start = new Date(now)
  nap1Start.setUTCHours(14, 30, 0, 0)
  if (now >= nap1Start) {
    events.push({
      id: 'event-2',
      baby_id: MOCK_BABY_ID,
      event_type: 'nap_start',
      event_time: nap1Start.toISOString(),
      end_time: null,
      context: 'home',
      notes: null,
      created_at: nap1Start.toISOString(),
    })
  }

  const nap1End = new Date(now)
  nap1End.setUTCHours(15, 0, 0, 0) // 10am EST = 3pm UTC
  if (now >= nap1End) {
    events.push({
      id: 'event-3',
      baby_id: MOCK_BABY_ID,
      event_type: 'nap_end',
      event_time: nap1End.toISOString(),
      end_time: null,
      context: 'home',
      notes: '30 min nap',
      created_at: nap1End.toISOString(),
    })
  }

  // Second nap: 1:00pm - 2:30pm EST = 6:00pm - 7:30pm UTC
  const nap2Start = new Date(now)
  nap2Start.setUTCHours(18, 0, 0, 0) // 1pm EST = 6pm UTC
  if (now >= nap2Start) {
    events.push({
      id: 'event-4',
      baby_id: MOCK_BABY_ID,
      event_type: 'nap_start',
      event_time: nap2Start.toISOString(),
      end_time: null,
      context: 'home',
      notes: null,
      created_at: nap2Start.toISOString(),
    })
  }

  const nap2End = new Date(now)
  nap2End.setUTCHours(19, 30, 0, 0) // 2:30pm EST = 7:30pm UTC
  if (now >= nap2End) {
    events.push({
      id: 'event-5',
      baby_id: MOCK_BABY_ID,
      event_type: 'nap_end',
      event_time: nap2End.toISOString(),
      end_time: null,
      context: 'home',
      notes: 'Good long nap!',
      created_at: nap2End.toISOString(),
    })
  }

  return events
}

// CRUD helpers
let eventIdCounter = 100

export function insertRecord<T>(
  table: 'babies' | 'family_members' | 'sleep_events' | 'chat_messages' | 'sleep_plans',
  record: Record<string, unknown>
): T {
  const newRecord = {
    ...record,
    id: (record.id as string) || `mock-${table}-${++eventIdCounter}`,
    created_at: (record.created_at as string) || new Date().toISOString(),
  } as T

  ;(mockStore[table] as T[]).push(newRecord)
  return newRecord
}

export function updateRecord<T>(
  table: 'babies' | 'family_members' | 'sleep_events' | 'chat_messages' | 'sleep_plans',
  filter: Record<string, unknown>,
  updates: Record<string, unknown>
): T[] {
  const records = mockStore[table] as Record<string, unknown>[]
  const updated: T[] = []

  for (const record of records) {
    let matches = true
    for (const [key, value] of Object.entries(filter)) {
      if (record[key] !== value) {
        matches = false
        break
      }
    }
    if (matches) {
      Object.assign(record, updates)
      updated.push(record as T)
    }
  }

  return updated
}
