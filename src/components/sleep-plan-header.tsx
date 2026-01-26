'use client'

import { useEffect, useState, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { Baby, SleepEvent, CURRENT_STATE_VALUES } from '@/types/database'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'

// Schema matching the API
const scheduleItemSchema = z.object({
  type: z.enum(['nap', 'bedtime']),
  label: z.string(),
  timeWindow: z.string(),
  status: z.enum(['completed', 'in_progress', 'upcoming', 'skipped']),
  notes: z.string(),
})

const sleepPlanSchema = z.object({
  currentState: z.enum(CURRENT_STATE_VALUES),
  nextAction: z.object({
    label: z.string(),
    timeWindow: z.string(),
    isUrgent: z.boolean(),
  }),
  schedule: z.array(scheduleItemSchema),
  targetBedtime: z.string(),
  summary: z.string(),
})

type SleepPlan = z.infer<typeof sleepPlanSchema>
type ScheduleItem = z.infer<typeof scheduleItemSchema>

interface SleepPlanHeaderProps {
  babyId: string
  events: SleepEvent[]
  baby: Baby
  refreshKey?: number
  onPlanChange?: (plan: SleepPlan | null) => void
}

// Generate a cache key based on events
function getEventsCacheKey(babyId: string, events: SleepEvent[]): string {
  const eventsHash = events
    .map((e) => `${e.id}:${e.event_time}:${e.event_type}`)
    .join('|')
  return `sleep-plan:${babyId}:${eventsHash}`
}

// Cache helpers
function getCachedPlan(key: string): SleepPlan | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = sessionStorage.getItem(key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function setCachedPlan(key: string, plan: SleepPlan): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(plan))
  } catch {
    // Ignore storage errors
  }
}

// Status icons and colors for schedule items
const statusConfig: Record<
  string,
  { icon: string; textClass: string; bgClass: string }
> = {
  completed: {
    icon: '✓',
    textClass: 'text-green-600 dark:text-green-400',
    bgClass: 'bg-green-50 dark:bg-green-950',
  },
  in_progress: {
    icon: '●',
    textClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-950',
  },
  upcoming: {
    icon: '○',
    textClass: 'text-muted-foreground',
    bgClass: '',
  },
  skipped: {
    icon: '–',
    textClass: 'text-muted-foreground line-through',
    bgClass: '',
  },
}

export function SleepPlanHeader({
  babyId,
  events,
  baby,
  refreshKey,
  onPlanChange,
}: SleepPlanHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { object, submit, isLoading, error } = useObject({
    api: '/api/sleep-plan',
    schema: sleepPlanSchema,
  })

  // Cache management
  const cacheKey = getEventsCacheKey(babyId, events)
  const lastCacheKeyRef = useRef<string>('')
  const lastRefreshKeyRef = useRef<number>(refreshKey ?? 0)
  const isSubmittingRef = useRef(false)
  const [cachedPlan, setCachedState] = useState<SleepPlan | null>(null)

  // Load cached plan after hydration
  useEffect(() => {
    const cached = getCachedPlan(cacheKey)
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with external sessionStorage
      setCachedState(cached)
      onPlanChange?.(cached)
    }
  }, [cacheKey, onPlanChange])

  // Request plan when events change
  useEffect(() => {
    if (events.length === 0) return
    if (isSubmittingRef.current) return

    const cached = getCachedPlan(cacheKey)
    const refreshKeyChanged =
      refreshKey !== undefined && refreshKey !== lastRefreshKeyRef.current

    if (cached && cacheKey === lastCacheKeyRef.current && !refreshKeyChanged) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with external sessionStorage
      setCachedState(cached)
      return
    }

    if (cached && lastCacheKeyRef.current === '' && !refreshKeyChanged) {
      lastCacheKeyRef.current = cacheKey
      setCachedState(cached)
      return
    }

    lastCacheKeyRef.current = cacheKey
    lastRefreshKeyRef.current = refreshKey ?? 0
    isSubmittingRef.current = true
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    submit({ babyId, events, baby, timezone })
  }, [cacheKey, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update cache when we get a result
  useEffect(() => {
    if (
      object?.currentState &&
      object?.nextAction &&
      object?.schedule &&
      object?.targetBedtime
    ) {
      const plan = object as SleepPlan
      setCachedPlan(cacheKey, plan)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing streaming result to local state
      setCachedState(plan)
      isSubmittingRef.current = false
      onPlanChange?.(plan)
    }
  }, [object, cacheKey, onPlanChange])

  // Reset submitting flag on error
  useEffect(() => {
    if (error) {
      isSubmittingRef.current = false
    }
  }, [error])

  // No events yet - show empty state
  if (events.length === 0) {
    return (
      <div className="border-b px-4 py-3 bg-muted/30">
        <p className="text-sm text-muted-foreground text-center">
          Log {baby.name}&apos;s wake time to see today&apos;s schedule
        </p>
      </div>
    )
  }

  const displayPlan = (
    object?.currentState && object?.nextAction && object?.schedule && object?.targetBedtime
      ? object
      : cachedPlan
  ) as SleepPlan | null

  // Loading state
  if ((isLoading || !displayPlan) && !cachedPlan) {
    return (
      <div className="border-b px-4 py-3">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !displayPlan) {
    return (
      <div className="border-b px-4 py-3">
        <p className="text-sm text-muted-foreground text-center">
          Unable to load schedule
        </p>
      </div>
    )
  }

  if (!displayPlan) return null

  const { nextAction, schedule, targetBedtime, summary } = displayPlan

  return (
    <div className="border-b">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4">
          <CollapsibleTrigger asChild>
            <button
              className="w-full py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors -mx-4 px-4"
              aria-label={isOpen ? 'Collapse schedule' : 'Expand schedule'}
            >
              <div className="flex-1 min-w-0">
                {/* Next action - always visible */}
                <div className="flex items-center gap-2">
                  <span
                    className={`text-lg font-semibold ${
                      nextAction.isUrgent
                        ? 'text-orange-600 dark:text-orange-400'
                        : ''
                    }`}
                  >
                    {nextAction.label}
                  </span>
                  <span className="text-muted-foreground">
                    {nextAction.timeWindow}
                  </span>
                  {nextAction.isUrgent && (
                    <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                  {isLoading && (
                    <span className="text-xs text-muted-foreground">
                      (updating...)
                    </span>
                  )}
                </div>
                {/* Subtitle - visible when collapsed */}
                {!isOpen && (
                  <p className="text-sm text-muted-foreground truncate">
                    {nextAction.label.toLowerCase().includes('bedtime')
                      ? summary
                      : `Bedtime: ${targetBedtime}`}
                  </p>
                )}
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="pb-3 space-y-3">
              {/* Summary */}
              <p className="text-sm text-muted-foreground">{summary}</p>

              {/* Full schedule */}
              <div className="space-y-1">
                {schedule.filter((item: ScheduleItem) => item.type !== 'bedtime').map((item: ScheduleItem, index: number) => {
                  const config = statusConfig[item.status] || statusConfig.upcoming
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded ${config.bgClass}`}
                    >
                      <span
                        className={`w-4 text-center text-sm ${config.textClass}`}
                      >
                        {config.icon}
                      </span>
                      <span
                        className={`flex-1 text-sm font-medium ${config.textClass}`}
                      >
                        {item.label}
                      </span>
                      <span className={`text-sm ${config.textClass}`}>
                        {item.timeWindow}
                      </span>
                    </div>
                  )
                })}

                {/* Bedtime row */}
                <div className="flex items-center gap-3 py-1.5 px-2 rounded bg-indigo-50 dark:bg-indigo-950">
                  <span className="w-4 text-center text-sm text-indigo-600 dark:text-indigo-400">
                    🌙
                  </span>
                  <span className="flex-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    Bedtime
                  </span>
                  <span className="text-sm text-indigo-600 dark:text-indigo-400">
                    {targetBedtime}
                  </span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
}
