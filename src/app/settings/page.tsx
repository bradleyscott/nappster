import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get user's baby
  const { data: familyMembers } = await supabase
    .from('family_members')
    .select('baby_id')
    .eq('user_id', user.id)

  if (!familyMembers || familyMembers.length === 0) {
    redirect('/onboarding')
  }

  const babyId = (familyMembers[0] as { baby_id: string }).baby_id

  const { data: baby } = await supabase
    .from('babies')
    .select('*')
    .eq('id', babyId)
    .single()

  if (!baby) {
    redirect('/onboarding')
  }

  return <SettingsForm baby={baby} />
}
