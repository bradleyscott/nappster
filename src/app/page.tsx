import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardContent } from '@/components/dashboard-content'
import { getTodayBoundsForTimezone, getYesterdayBoundsForTimezone } from '@/lib/timezone'

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, show landing page
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="pb-2">
            <div className="flex justify-center mb-4">
              <Image
                src="/nappster.png"
                alt="Nappster Logo"
                width={120}
                height={120}
                priority
              />
            </div>
            <CardTitle className="text-3xl">Nappster</CardTitle>
            <CardDescription className="text-lg">
              Track your baby&apos;s sleep and get AI-powered recommendations
              for nap times and bedtime
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Replace your ChatGPT conversation with a purpose-built app for
              both parents to use.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild size="lg">
                <Link href="/auth/signup">Get Started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get user's baby (or babies)
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("baby_id")
    .eq("user_id", user.id);

  // If no baby setup, redirect to onboarding
  if (!familyMembers || familyMembers.length === 0) {
    redirect("/onboarding");
  }

  // Get the first baby (we can add multi-baby support later)
  const babyId = (familyMembers[0] as { baby_id: string }).baby_id;

  const { data: baby } = await supabase
    .from("babies")
    .select("*")
    .eq("id", babyId)
    .single();

  if (!baby) {
    redirect("/onboarding");
  }

  // Get today's events using user's timezone from cookie
  const cookieStore = await cookies()
  const timezone = cookieStore.get('timezone')?.value || 'UTC'
  const { start: todayStart, end: todayEnd } = getTodayBoundsForTimezone(timezone)
  const { start: yesterdayStart, end: yesterdayEnd } = getYesterdayBoundsForTimezone(timezone)

  // Fetch today's events
  const { data: todayEvents } = await supabase
    .from("sleep_events")
    .select("*")
    .eq("baby_id", babyId)
    .gte("event_time", todayStart)
    .lt("event_time", todayEnd)
    .order("event_time", { ascending: true });

  // Fetch yesterday's last bedtime/night_wake to show overnight sleep that ends today
  const { data: overnightStart } = await supabase
    .from("sleep_events")
    .select("*")
    .eq("baby_id", babyId)
    .gte("event_time", yesterdayStart)
    .lt("event_time", yesterdayEnd)
    .in("event_type", ["bedtime", "night_wake"])
    .order("event_time", { ascending: false })
    .limit(1);

  // Combine overnight start (if exists) with today's events
  const events = [
    ...(overnightStart || []),
    ...(todayEvents || [])
  ];

  return <DashboardContent baby={baby} initialEvents={events} />;
}
