/**
 * @deprecated This component has been replaced by the unified chat experience in chat-content.tsx.
 * The dashboard functionality has been merged into the main chat interface with SleepPlanHeader.
 * This file is kept for reference only and will be removed in a future release.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { Baby as BabyIcon, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Baby, SleepEvent, SleepSession, EventType, Context } from '@/types/database'
import { formatAge, countNaps } from '@/lib/sleep-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SleepEventButton } from '@/components/sleep-event-button'
import { Timeline } from '@/components/timeline'
import { RecommendationCard } from '@/components/recommendation-card'
import { SleepEventDialog } from '@/components/sleep-event-dialog'
import { SleepSessionDialog } from '@/components/sleep-session-dialog'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'

interface DashboardContentProps {
  baby: Baby
  initialEvents: SleepEvent[]
}

export function DashboardContent({ baby, initialEvents }: DashboardContentProps) {
  const [events, setEvents] = useState<SleepEvent[]>(initialEvents)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<SleepEvent | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SleepSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  // Determine which buttons to show based on current state
  const lastEvent = events[events.length - 1]
  const isNapInProgress = lastEvent?.event_type === 'nap_start'
  const isBedtimeInProgress = lastEvent?.event_type === 'bedtime' || lastEvent?.event_type === 'night_wake'
  const napCount = countNaps(events)
  const hasWoken = events.some(e => e.event_type === 'wake')

  const handleLogEvent = async (eventType: EventType, notes?: string) => {
    setLoading(true)

    const { data, error } = await supabase
      .from('sleep_events')
      .insert({
        baby_id: baby.id,
        event_type: eventType,
        event_time: new Date().toISOString(),
        context: 'home',
        notes,
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging event:', error)
      setLoading(false)
      return
    }

    // Update local state
    setEvents([...events, data])
    setLoading(false)
  }

  const handleOpenAddDialog = () => {
    setSelectedEvent(null)
    setDialogOpen(true)
  }

  const handleOpenEditDialog = (event: SleepEvent) => {
    setSelectedEvent(event)
    setDialogOpen(true)
  }

  const handleOpenSessionDialog = (session: SleepSession) => {
    setSelectedSession(session)
    setSessionDialogOpen(true)
  }

  const handleSaveSession = async (sessionData: {
    startEvent: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
    endEvent?: {
      id: string
      event_time: string
      context: Context
      notes: string | null
    }
  }) => {
    setLoading(true)

    try {
      // Update start event
      const { data: startData, error: startError } = await supabase
        .from('sleep_events')
        .update({
          event_time: sessionData.startEvent.event_time,
          context: sessionData.startEvent.context,
          notes: sessionData.startEvent.notes,
        })
        .eq('id', sessionData.startEvent.id)
        .select()
        .single()

      if (startError) {
        console.error('Error updating start event:', startError)
        setLoading(false)
        return
      }

      let updatedEvents = events.map((e) =>
        e.id === startData.id ? startData : e
      )

      // Update end event if present
      if (sessionData.endEvent) {
        const { data: endData, error: endError } = await supabase
          .from('sleep_events')
          .update({
            event_time: sessionData.endEvent.event_time,
            context: sessionData.endEvent.context,
            notes: sessionData.endEvent.notes,
          })
          .eq('id', sessionData.endEvent.id)
          .select()
          .single()

        if (endError) {
          console.error('Error updating end event:', endError)
          setLoading(false)
          return
        }

        updatedEvents = updatedEvents.map((e) =>
          e.id === endData.id ? endData : e
        )
      }

      // Sort and update state
      setEvents(
        updatedEvents.sort(
          (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
        )
      )
      setRefreshKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = async (startId: string, endId: string | null) => {
    setLoading(true)

    try {
      // Delete start event
      const { error: startError } = await supabase
        .from('sleep_events')
        .delete()
        .eq('id', startId)

      if (startError) {
        console.error('Error deleting start event:', startError)
        return
      }

      // Delete end event if present
      if (endId) {
        const { error: endError } = await supabase
          .from('sleep_events')
          .delete()
          .eq('id', endId)

        if (endError) {
          console.error('Error deleting end event:', endError)
        }
      }

      // Update local state
      setEvents(events.filter((e) => e.id !== startId && e.id !== endId))
      setRefreshKey((k) => k + 1)
      setSessionDialogOpen(false)
      setSelectedSession(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveEvent = async (eventData: {
    id?: string
    event_type: EventType
    event_time: string
    context: Context
    notes: string | null
  }) => {
    setLoading(true)

    if (eventData.id) {
      // Update existing event
      const { data, error } = await supabase
        .from('sleep_events')
        .update({
          event_type: eventData.event_type,
          event_time: eventData.event_time,
          context: eventData.context,
          notes: eventData.notes,
        })
        .eq('id', eventData.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating event:', error)
        setLoading(false)
        return
      }

      // Update local state and re-sort
      setEvents(
        events
          .map((e) => (e.id === data.id ? data : e))
          .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
      )
    } else {
      // Insert new event
      const { data, error } = await supabase
        .from('sleep_events')
        .insert({
          baby_id: baby.id,
          event_type: eventData.event_type,
          event_time: eventData.event_time,
          context: eventData.context,
          notes: eventData.notes,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding event:', error)
        setLoading(false)
        return
      }

      // Add to local state and sort
      setEvents(
        [...events, data].sort(
          (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
        )
      )
    }

    setRefreshKey((k) => k + 1)
    setLoading(false)
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return

    setLoading(true)

    const { error } = await supabase
      .from('sleep_events')
      .delete()
      .eq('id', selectedEvent.id)

    if (error) {
      console.error('Error deleting event:', error)
      setLoading(false)
      return
    }

    // Remove from local state
    setEvents(events.filter((e) => e.id !== selectedEvent.id))
    setRefreshKey((k) => k + 1)
    setDeleteDialogOpen(false)
    setDialogOpen(false)
    setSelectedEvent(null)
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container max-w-lg mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image
              src="/nappster.png"
              alt="Nappster"
              width={40}
              height={40}
              className="rounded-full"
            />
            <div>
              <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
              <h1 className="text-lg font-semibold">{baby.name} · {formatAge(baby.birth_date)}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/chat">Ask AI</Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/settings">
                <BabyIcon className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* AI Recommendation */}
        <RecommendationCard babyId={baby.id} events={events} baby={baby} refreshKey={refreshKey} />

        {/* Today's Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today&apos;s Sleep</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events logged yet today.</p>
            ) : (
              <Timeline
                events={events}
                onSessionClick={handleOpenSessionDialog}
                onStandaloneEventClick={handleOpenEditDialog}
              />
            )}
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={handleOpenAddDialog}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Past Event
            </Button>
          </CardContent>
        </Card>

        {/* Quick Entry Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {!hasWoken && !isBedtimeInProgress && (
            <SleepEventButton
              eventType="wake"
              label="Woke Up"
              icon="☀️"
              onClick={() => handleLogEvent('wake')}
              disabled={loading}
              className="col-span-2"
            />
          )}

          {hasWoken && !isNapInProgress && !isBedtimeInProgress && (
            <>
              <SleepEventButton
                eventType="nap_start"
                label="Nap Started"
                icon="😴"
                onClick={() => handleLogEvent('nap_start')}
                disabled={loading}
              />
              <SleepEventButton
                eventType="bedtime"
                label="Bedtime"
                icon="🌙"
                onClick={() => handleLogEvent('bedtime')}
                disabled={loading}
              />
            </>
          )}

          {isBedtimeInProgress && (
            <>
              <SleepEventButton
                eventType="night_wake"
                label="Night Wake"
                icon="👀"
                onClick={() => handleLogEvent('night_wake')}
                disabled={loading}
              />
              <SleepEventButton
                eventType="wake"
                label="Woke Up"
                icon="☀️"
                onClick={() => handleLogEvent('wake')}
                disabled={loading}
              />
            </>
          )}

          {isNapInProgress && (
            <SleepEventButton
              eventType="nap_end"
              label="Nap Ended"
              icon="☀️"
              onClick={() => handleLogEvent('nap_end')}
              disabled={loading}
              className="col-span-2"
            />
          )}
        </div>

        {/* Nap count indicator */}
        {napCount > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {napCount} nap{napCount > 1 ? 's' : ''} completed today
          </p>
        )}
      </main>

      {/* Bottom navigation / Chat FAB */}
      <div className="fixed bottom-6 right-6">
        <Button size="lg" className="rounded-full shadow-lg h-14 w-14" asChild>
          <Link href="/chat">
            <span className="text-xl">💬</span>
          </Link>
        </Button>
      </div>

      {/* Sleep Event Dialog */}
      <SleepEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        babyId={baby.id}
        event={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteEvent}
      />

      {/* Sleep Session Dialog (for editing naps/overnight as paired events) */}
      <SleepSessionDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        session={selectedSession}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
      />
    </div>
  )
}
