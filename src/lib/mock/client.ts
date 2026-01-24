import { mockAuth } from './auth'
import { createQueryBuilder } from './query-builder'

type TableName = 'babies' | 'family_members' | 'sleep_events' | 'chat_messages'

export function createMockClient() {
  return {
    auth: mockAuth,
    from: <T = unknown>(table: TableName) => createQueryBuilder<T>(table),
  }
}

// Type for the mock client to match Supabase client interface
export type MockClient = ReturnType<typeof createMockClient>
