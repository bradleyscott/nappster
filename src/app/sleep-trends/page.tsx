import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import { BackButton } from '@/components/back-button'
import { getStartOfDaysAgoForTimezone } from '@/lib/timezone'
import { SleepTrendsChart } from '@/components/sleep-trends-chart'

export default async function SleepTrendsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

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

  const cookieStore = await cookies()
  const timezone = cookieStore.get('timezone')?.value || 'UTC'

  // Fetch 16 days of events (14 days + buffer for overnight sessions spanning day boundaries)
  const startDate = getStartOfDaysAgoForTimezone(timezone, 16)

  const { data: sleepEvents } = await supabase
    .from('sleep_events')
    .select('*')
    .eq('baby_id', babyId)
    .gte('event_time', startDate)
    .order('event_time', { ascending: true })

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
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
          <BackButton />
        </div>
      </header>

      <main className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-2">
        <SleepTrendsChart
          events={sleepEvents ?? []}
          timezone={timezone}
        />
      </main>
    </div>
  )
}
