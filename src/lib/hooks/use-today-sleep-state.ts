'use client'

import { useMemo } from 'react'
import { computeCurrentState, type SleepState } from '@/lib/state-machine'
import { getTodayBoundsForTimezone } from '@/lib/timezone'
import type { SleepEvent } from '@/types/database'

export function useTodaySleepState(events: SleepEvent[], timezone: string): SleepState {
  return useMemo(() => {
    const { start, end } = getTodayBoundsForTimezone(timezone)
    const todayEvents = events
      .filter(e => e.event_time >= start && e.event_time < end)
      .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
    return computeCurrentState(todayEvents)
  }, [events, timezone])
}
