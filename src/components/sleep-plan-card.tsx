'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Calendar } from 'lucide-react'
import { formatTime } from '@/lib/sleep-utils'
import type { SleepPlanRow, ScheduleItem, NextAction } from '@/types/database'

interface SleepPlanCardProps {
  plan: SleepPlanRow
  defaultOpen?: boolean
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

export function SleepPlanCard({ plan, defaultOpen = false }: SleepPlanCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Defer rendering Collapsible until after hydration to avoid Radix ID mismatch
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const schedule = plan.schedule as unknown as ScheduleItem[]
  const nextAction = plan.next_action as unknown as NextAction
  const planTime = formatTime(plan.created_at)

  // Format the plan date for display
  const planDate = new Date(plan.plan_date)
  const dateStr = planDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Show placeholder during SSR to avoid hydration mismatch with Radix IDs
  if (!mounted) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-lg border rounded-lg bg-card shadow-sm">
          <div className="w-full px-4 py-3 flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sleep Plan</span>
                <span className="text-xs text-muted-foreground">{planTime}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {nextAction.label} · Bedtime {plan.target_bedtime}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-center"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="w-full max-w-lg border rounded-lg bg-card shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
              aria-label={isOpen ? 'Collapse sleep plan' : 'Expand sleep plan'}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Sleep Plan
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {planTime}
                  </span>
                </div>
                {!isOpen && (
                  <p className="text-xs text-muted-foreground truncate">
                    {nextAction.label} · Bedtime {plan.target_bedtime}
                  </p>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              {/* Summary */}
              <p className="text-sm text-muted-foreground">{plan.summary}</p>

              {/* Full schedule */}
              <div className="space-y-1">
                {schedule
                  .filter((item) => item.type !== 'bedtime')
                  .map((item, index) => {
                    const config = statusConfig[item.status] || statusConfig.upcoming
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-3 py-1.5 px-2 rounded text-sm ${config.bgClass}`}
                      >
                        <span
                          className={`w-4 text-center ${config.textClass}`}
                        >
                          {config.icon}
                        </span>
                        <span
                          className={`flex-1 font-medium ${config.textClass}`}
                        >
                          {item.label}
                        </span>
                        <span className={config.textClass}>
                          {item.timeWindow}
                        </span>
                      </div>
                    )
                  })}

                {/* Bedtime row */}
                <div className="flex items-center gap-3 py-1.5 px-2 rounded bg-indigo-50 dark:bg-indigo-950 text-sm">
                  <span className="w-4 text-center text-indigo-600 dark:text-indigo-400">
                    🌙
                  </span>
                  <span className="flex-1 font-medium text-indigo-600 dark:text-indigo-400">
                    Bedtime
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {plan.target_bedtime}
                  </span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </motion.div>
  )
}
