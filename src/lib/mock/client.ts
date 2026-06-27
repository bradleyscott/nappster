import { mockAuth, getActiveMockUser } from './auth'
import { createQueryBuilder } from './query-builder'
import { mockStore, insertRecord, MOCK_USER, MOCK_USER_2 } from './store'

type TableName = 'babies' | 'family_members' | 'sleep_events' | 'chat_messages' | 'sleep_plans' | 'invite_codes'

export function createMockClient() {
  return {
    auth: mockAuth,
    from: <T = unknown>(table: TableName) => createQueryBuilder<T>(table),
    rpc: async (fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'get_family_members_for_baby') {
        const babyId = params.baby_id_arg as string
        const activeUser = getActiveMockUser()

        // Resemble the real SECURITY DEFINER function: only members of the baby
        // get the (enriched) list back, including co-caregivers they don't own.
        const isMember = mockStore.family_members.some(
          (fm) => fm.baby_id === babyId && fm.user_id === activeUser.id
        )
        if (!isMember) {
          return { data: [], error: null }
        }

        const mockUsers = [MOCK_USER, MOCK_USER_2]
        const rows = mockStore.family_members
          .filter((fm) => fm.baby_id === babyId)
          .map((fm) => {
            const user = mockUsers.find((u) => u.id === fm.user_id)
            return {
              id: fm.id,
              user_id: fm.user_id,
              baby_id: fm.baby_id,
              role: fm.role,
              created_at: fm.created_at,
              email: user?.email ?? null,
              is_you: fm.user_id === activeUser.id,
            }
          })
          .sort((a, b) => (a.is_you === b.is_you ? 0 : a.is_you ? -1 : 1))

        return { data: rows, error: null }
      }

      if (fnName === 'redeem_invite_code') {
        const code = params.invite_code as string
        const activeUser = getActiveMockUser()
        const codeRecord = mockStore.invite_codes.find(
          (c) => c.code === code && !c.used_by && new Date(c.expires_at) > new Date()
        )

        if (!codeRecord) {
          return { data: { success: false, error: 'Invalid or expired invite code' }, error: null }
        }

        const alreadyMember = mockStore.family_members.some(
          (fm) => fm.user_id === activeUser.id && fm.baby_id === codeRecord.baby_id
        )
        if (alreadyMember) {
          return { data: { success: false, error: 'You are already linked to this baby' }, error: null }
        }

        insertRecord('family_members', {
          user_id: activeUser.id,
          baby_id: codeRecord.baby_id,
          role: 'parent',
        })

        codeRecord.used_by = activeUser.id
        codeRecord.used_at = new Date().toISOString()

        return { data: { success: true, baby_id: codeRecord.baby_id }, error: null }
      }

      return { data: null, error: { message: `Unknown RPC function: ${fnName}` } }
    },
  }
}

// Type for the mock client to match Supabase client interface
export type MockClient = ReturnType<typeof createMockClient>
