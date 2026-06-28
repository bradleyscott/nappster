'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a `Date` that re-renders the calling component on a fixed interval.
 *
 * Used by the dashboard hero so the countdown ring ticks live (the ring's text
 * and arc are derived from `now` vs. a target time). Default interval is 30s,
 * which is smooth enough for an "Xh Ym" countdown without burning battery.
 *
 * The initial state already reads `new Date()` at mount, and the interval
 * callback (not the effect body) drives subsequent updates — so there is no
 * synchronous setState-in-effect race.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}