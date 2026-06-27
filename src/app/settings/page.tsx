import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings-form'
import { getFamilyMembersForUser } from '@/lib/services/family-members'
import { getBabyById } from '@/lib/services/babies'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get user's baby
  const { data: familyMembers } = await getFamilyMembersForUser(supabase, user.id)

  if (!familyMembers || familyMembers.length === 0) {
    redirect('/onboarding')
  }

  const babyId = familyMembers[0].baby_id

  const { data: baby } = await getBabyById(supabase, babyId)

  if (!baby) {
    redirect('/onboarding')
  }

  return <SettingsForm baby={baby} />
}
