import { mockAuth, getActiveMockUser } from './auth'
import { createQueryBuilder } from './query-builder'
import { mockStore, insertRecord, MOCK_USER, MOCK_USER_2 } from './store'
import type { Baby, FamilyMember, SleepPlan } from '@/types/database'

type TableName = 'babies' | 'family_members' | 'sleep_events' | 'chat_messages' | 'sleep_plans' | 'invite_codes'

export function createMockClient() {
  return {
    auth: mockAuth,
    from: <T = unknown>(table: TableName) => createQueryBuilder<T>(table),
    rpc: async (fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'check_baby_access') {
        const babyId = params.p_baby_id as string
        const activeUser = getActiveMockUser()
        const isMember = mockStore.family_members.some(
          (fm) => fm.baby_id === babyId && fm.user_id === activeUser.id
        )
        return { data: isMember, error: null }
      }

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

      if (fnName === 'upsert_sleep_plan') {
        const babyId = params.p_baby_id as string
        const activeUser = getActiveMockUser()

        const isMember = mockStore.family_members.some(
          (fm) => fm.baby_id === babyId && fm.user_id === activeUser.id
        )
        if (!isMember) {
          return { data: null, error: { message: 'Not authorized' } }
        }

        // Deactivate existing active plans for this baby/date
        mockStore.sleep_plans
          .filter((p) => p.baby_id === babyId && p.plan_date === params.p_plan_date && p.is_active)
          .forEach((p) => { p.is_active = false })

        const newPlan = insertRecord<SleepPlan>('sleep_plans', {
          baby_id: babyId,
          current_state: params.p_current_state,
          plan_date: params.p_plan_date,
          next_action: params.p_next_action,
          schedule: params.p_schedule,
          target_bedtime: params.p_target_bedtime,
          summary: params.p_summary,
          events_hash: params.p_events_hash,
          is_active: true,
          created_by: params.p_created_by,
        })

        return { data: newPlan, error: null }
      }

      if (fnName === 'create_baby_profile') {
        const activeUser = getActiveMockUser()

        const baby = insertRecord<Baby>('babies', {
          name: params.p_name,
          birth_date: params.p_birth_date,
          pattern_notes: params.p_pattern_notes ?? null,
        })

        insertRecord<FamilyMember>('family_members', {
          user_id: activeUser.id,
          baby_id: baby.id,
          role: 'parent',
        })

        return { data: baby, error: null }
      }

      return { data: null, error: { message: `Unknown RPC function: ${fnName}` } }
    },
  }
}

// Type for the mock client to match Supabase client interface
export type MockClient = ReturnType<typeof createMockClient>
