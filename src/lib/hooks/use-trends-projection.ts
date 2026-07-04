import { useState, useEffect } from 'react'
import { getTrendsProjection } from '@/lib/actions/get-trends-projection'

export interface UseTrendsProjectionOptions {
  babyId: string
  timezone: string
  enabled?: boolean
}

export interface UseTrendsProjectionReturn {
  trendsNextNapHours: number[]
  trendsBedtimeHour: number | null
  trendsWakeHour: number | null
  isLoading: boolean
}

/**
 * Client-side hook that lazily fetches the trends-based typical-day
 * projection from the server action, used by the dashboard hero as a
 * fallback countdown target when the AI sleep plan is stale or absent.
 *
 * Returns empty/null defaults initially so the dashboard can render
 * immediately with age-based heuristics while the data loads.
 */
export function useTrendsProjection({
  babyId,
  timezone,
  enabled = true,
}: UseTrendsProjectionOptions): UseTrendsProjectionReturn {
  const [data, setData] = useState<UseTrendsProjectionReturn>({
    trendsNextNapHours: [],
    trendsBedtimeHour: null,
    trendsWakeHour: null,
    isLoading: true,
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    getTrendsProjection(babyId, timezone).then((result) => {
      if (!cancelled) {
        setData({ ...result, isLoading: false })
      }
    })

    return () => {
      cancelled = true
    }
  }, [babyId, timezone, enabled])

  return data
}
