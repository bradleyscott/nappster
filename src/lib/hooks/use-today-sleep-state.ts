'use client'

import { useMemo } from 'react'
import { computeCurrentState, type SleepState } from '@/lib/state-machine'
import type { SleepEvent } from '@/types/database'

/**
 * Derive the current sleep state from all loaded events.
 *
 * IMPORTANT: We deliberately do NOT filter events to "today" in the user's timezone.
 * Overnight sleep must persist continuously from a `bedtime` event (often logged the
 * previous evening) until the morning `wake` event — even when the clock crosses
 * midnight. Filtering to today's bounds would drop yesterday's bedtime after midnight,
 * causing the state machine to fall back to `awaiting_morning_wake` ("Good Morning"),
 * which is incorrect overnight.
 *
 * The events passed in are already scoped (server-side) to a recent window that
 * includes at least yesterday, so any bedtime within the current overnight stretch is
 * present here. We only need to ensure chronological ordering for computeCurrentState.
 */
export function useTodaySleepState(events: SleepEvent[]): SleepState {
  return useMemo(() => {
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
    )
    return computeCurrentState(sortedEvents)
  }, [events])
}
