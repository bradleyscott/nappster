'use client'

import { useState, useSyncExternalStore } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Calendar, Share2, Check } from 'lucide-react'
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

// Empty subscription for useSyncExternalStore - never triggers updates
const emptySubscribe = () => () => {}

function formatPlanForSharing(plan: SleepPlanRow, schedule: ScheduleItem[]): string {
  const lines: string[] = []

  // Header
  lines.push('📅 Sleep Plan')
  lines.push('')

  // Summary
  lines.push(plan.summary)
  lines.push('')

  // Schedule
  lines.push('Schedule:')
  for (const item of schedule) {
    if (item.type === 'bedtime') continue
    const statusIcon = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'
    lines.push(`  ${statusIcon} ${item.label}: ${item.timeWindow}`)
  }
  lines.push(`  🌙 Bedtime: ${plan.target_bedtime}`)

  return lines.join('\n')
}

export function SleepPlanCard({ plan, defaultOpen = false }: SleepPlanCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)
  // Defer rendering Collapsible until after hydration to avoid Radix ID mismatch
  // useSyncExternalStore is the React 18+ way to handle client-only rendering
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,  // Client: mounted
    () => false  // Server: not mounted
  )

  const schedule = plan.schedule as unknown as ScheduleItem[]
  const nextAction = plan.next_action as unknown as NextAction
  const planTime = formatTime(plan.created_at)

  const handleShare = async () => {
    const text = formatPlanForSharing(plan, schedule)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }


  // Show placeholder during SSR to avoid hydration mismatch with Radix IDs
  if (!mounted) {
    return (
      <div className="flex justify-center min-w-0 w-full">
        <div className="w-full max-w-lg border rounded-lg bg-card shadow-sm overflow-hidden">
          <div className="w-full px-4 py-3 flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 shrink-0">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium shrink-0">Sleep Plan</span>
                <span className="text-xs text-muted-foreground shrink-0">{planTime}</span>
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
    <div
      className="flex justify-center min-w-0 w-full animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="min-w-0 w-full max-w-lg">
        <div className="w-full border rounded-lg bg-card shadow-sm overflow-hidden">
          <CollapsibleTrigger asChild>
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors rounded-lg min-w-0"
              aria-label={isOpen ? 'Collapse sleep plan' : 'Expand sleep plan'}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 shrink-0">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium shrink-0">
                    Sleep Plan
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
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
            <div className="px-4 pb-4 space-y-3 min-w-0">
              {/* Summary */}
              <p className="text-sm text-muted-foreground wrap-break-word">{plan.summary}</p>

              {/* Full schedule */}
              <div className="space-y-1 min-w-0">
                {schedule
                  .filter((item) => item.type !== 'bedtime')
                  .map((item, index) => {
                    const config = statusConfig[item.status] || statusConfig.upcoming
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-3 py-1.5 px-2 rounded text-sm min-w-0 ${config.bgClass}`}
                      >
                        <span
                          className={`w-4 text-center shrink-0 ${config.textClass}`}
                        >
                          {config.icon}
                        </span>
                        <span
                          className={`flex-1 font-medium min-w-0 truncate ${config.textClass}`}
                        >
                          {item.label}
                        </span>
                        <span className={`shrink-0 ${config.textClass}`}>
                          {item.timeWindow}
                        </span>
                      </div>
                    )
                  })}

                {/* Bedtime row */}
                <div className="flex items-center gap-3 py-1.5 px-2 rounded bg-indigo-50 dark:bg-indigo-950 text-sm min-w-0">
                  <span className="w-4 text-center shrink-0 text-indigo-600 dark:text-indigo-400">
                    🌙
                  </span>
                  <span className="flex-1 font-medium min-w-0 text-indigo-600 dark:text-indigo-400">
                    Bedtime
                  </span>
                  <span className="shrink-0 text-indigo-600 dark:text-indigo-400">
                    {plan.target_bedtime}
                  </span>
                </div>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-2 w-full py-2 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors min-w-0"
                aria-label="Copy sleep plan to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">Copied to clipboard</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    <span>Share plan</span>
                  </>
                )}
              </button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
}
