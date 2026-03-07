import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChatContent } from '@/components/chat-content'
import { getYesterdayBoundsForTimezone } from '@/lib/timezone'

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

  // Get timezone from cookie
  const cookieStore = await cookies()
  const timezone = cookieStore.get('timezone')?.value || 'UTC'
  const { start: yesterdayStart } = getYesterdayBoundsForTimezone(timezone)

  // Fetch initial chat messages (most recent 50, newest first)
  const { data: chatMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Get cursor for loading more history (oldest message's timestamp)
  // Must access before .reverse() mutates the array
  const oldestTimestamp = chatMessages && chatMessages.length > 0
    ? chatMessages[chatMessages.length - 1].created_at
    : null

  // Convert to AI SDK format and reverse for chronological order
  const initialMessages = (chatMessages || [])
    .reverse()
    .map(msg => ({
      id: msg.message_id,
      role: msg.role as 'user' | 'assistant',
      parts: msg.parts,
      createdAt: msg.created_at,
    }))

  // Fetch events from the earlier of yesterdayStart or oldest message timestamp
  // This ensures overnight sleep is included, and goes further back if messages do
  const eventStartTime = oldestTimestamp && new Date(oldestTimestamp) < new Date(yesterdayStart)
    ? oldestTimestamp
    : yesterdayStart

  // Run sleep events and sleep plans queries in parallel
  const [{ data: sleepEvents }, { data: sleepPlans }] = await Promise.all([
    supabase
      .from("sleep_events")
      .select("*")
      .eq("baby_id", babyId)
      .gte("event_time", eventStartTime)
      .order("event_time", { ascending: true })
      .limit(200),

    // Fetch recent sleep plans that align with the loaded messages window
    // When no messages exist, only fetch the most recent plans instead of all since epoch
    supabase
      .from('sleep_plans')
      .select('*')
      .eq('baby_id', babyId)
      .gte('created_at', oldestTimestamp || yesterdayStart)
      .order('created_at', { ascending: true })
      .limit(50),
  ])

  const initialSleepPlans = sleepPlans || []

  return (
    <ChatContent
      baby={baby}
      initialMessages={initialMessages}
      initialSleepEvents={sleepEvents ?? undefined}
      initialSleepPlans={initialSleepPlans}
      initialCursor={oldestTimestamp}
      hasMoreHistory={chatMessages?.length === 50}
    />
  );
}
