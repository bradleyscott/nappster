import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import { BackButton } from '@/components/back-button'
import { getStartOfDaysAgoForTimezone } from '@/lib/timezone'
import { SleepTrendsChart } from '@/components/sleep-trends-chart'
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
    <div className="h-dvh flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b">
        <div className="container max-w-lg md:max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton />
          <Image
            src="/nappster.png"
            alt="Nappster"
            width={40}
            height={40}
            className="rounded-full"
          />
          <div>
            <p className="text-sm text-muted-foreground">Sleep Trends · Last 14 days</p>
            <h1 className="text-lg font-semibold">{baby.name}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 container max-w-lg md:max-w-2xl mx-auto px-4">
        <SleepTrendsChart
          events={sleepEvents ?? []}
          timezone={timezone}
          babyName={baby.name}
        />
      </main>
    </div>
  )
}
