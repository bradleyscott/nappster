'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { Baby, SleepEvent, CURRENT_STATE_VALUES } from '@/types/database'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Loader2 } from 'lucide-react'
import { computeEventsHash } from '@/lib/sleep-utils'

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
  const [persistedPlan, setPersistedPlan] = useState<SleepPlan | null>(null)
  const [isFetching, setIsFetching] = useState(true)

  const { object, submit, isLoading, error } = useObject({
    api: '/api/sleep-plan',
    schema: sleepPlanSchema,
  })

  // Track refs for change detection
  const lastEventsHashRef = useRef<string>('')
  const lastRefreshKeyRef = useRef<number>(refreshKey ?? 0)
  const isRegeneratingRef = useRef(false)

  // Compute current events hash
  const currentEventsHash = computeEventsHash(events)

  // Trigger regeneration
  const triggerRegeneration = useCallback(() => {
    if (isRegeneratingRef.current) return
    isRegeneratingRef.current = true
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    submit({ babyId, events, baby, timezone })
  }, [babyId, events, baby, submit])

  // Fetch persisted plan from database
  useEffect(() => {
    if (events.length === 0) {
      setIsFetching(false)
      return
    }

    const refreshKeyChanged =
      refreshKey !== undefined && refreshKey !== lastRefreshKeyRef.current
    const eventsChanged = currentEventsHash !== lastEventsHashRef.current

    // Update refs
    lastEventsHashRef.current = currentEventsHash
    lastRefreshKeyRef.current = refreshKey ?? 0

    // If refresh was manually triggered, skip fetching and regenerate
    if (refreshKeyChanged) {
      triggerRegeneration()
      return
    }

    // Fetch the persisted plan
    async function fetchPlan() {
      try {
        setIsFetching(true)
        const res = await fetch(`/api/sleep-plan/${babyId}`)

        if (!res.ok) {
          // No persisted plan, need to generate
          triggerRegeneration()
          return
        }

        const data = await res.json()

        if (!data.plan || data.stale) {
          // Plan doesn't exist or is stale, regenerate
          triggerRegeneration()
          return
        }

        // We have a valid, fresh plan from the database
        setPersistedPlan(data.plan)
        onPlanChange?.(data.plan)
        isRegeneratingRef.current = false
      } catch (err) {
        console.error('Error fetching persisted plan:', err)
        // On error, try to regenerate
        triggerRegeneration()
      } finally {
        setIsFetching(false)
      }
    }

    // Only fetch if events changed or we don't have a plan yet
    if (eventsChanged || !persistedPlan) {
      fetchPlan()
    }
  }, [babyId, currentEventsHash, refreshKey, events.length, triggerRegeneration, onPlanChange, persistedPlan])

  // Update state when streaming completes
  useEffect(() => {
    if (
      object?.currentState &&
      object?.nextAction &&
      object?.schedule &&
      object?.targetBedtime
    ) {
      const plan = object as SleepPlan
      setPersistedPlan(plan)
      isRegeneratingRef.current = false
      onPlanChange?.(plan)
    }
  }, [object, onPlanChange])

  // Reset regenerating flag on error
  useEffect(() => {
    if (error) {
      isRegeneratingRef.current = false
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

  // Determine what to display: streaming object takes priority, then persisted plan
  const displayPlan = (
    object?.currentState && object?.nextAction && object?.schedule && object?.targetBedtime
      ? object
      : persistedPlan
  ) as SleepPlan | null

  // Loading state
  if ((isFetching || isLoading || !displayPlan) && !persistedPlan) {
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

  if (!displayPlan || !displayPlan.nextAction) return null

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
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
