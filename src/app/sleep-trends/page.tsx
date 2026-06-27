import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getStartOfDaysAgoForTimezone } from '@/lib/timezone'
import { TrendsView } from '@/components/sleep/trends-view'
import { getFamilyMembersForUser } from '@/lib/services/family-members'
import { getBabyById } from '@/lib/services/babies'
import { getSleepEventsSince } from '@/lib/services/sleep-events'

export default async function SleepTrendsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: familyMembers } = await getFamilyMembersForUser(supabase, user.id)

  if (!familyMembers || familyMembers.length === 0) {
    redirect('/onboarding')
  }

  const babyId = familyMembers[0].baby_id

  const { data: baby } = await getBabyById(supabase, babyId)

  if (!baby) {
    redirect('/onboarding')
  }

  const cookieStore = await cookies()
  const timezone = cookieStore.get('timezone')?.value || 'UTC'

  // Fetch 16 days of events (14 days + buffer for overnight sessions spanning day boundaries)
  const startDate = getStartOfDaysAgoForTimezone(timezone, 16)

  const { data: sleepEvents } = await getSleepEventsSince(supabase, babyId, startDate)

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <TrendsView
        events={sleepEvents ?? []}
        timezone={timezone}
        babyName={baby.name}
      />
    </div>
  )
}
