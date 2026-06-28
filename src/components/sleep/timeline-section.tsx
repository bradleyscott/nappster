'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { EventType } from '@/types/database'

interface TimelineItemBase {
  id: string
  eventType: EventType
  label: string
  icon: string
  time: string
  detail?: string
  isActive?: boolean
  /** Local date key (YYYY-MM-DD) for grouping items into day sections. */
  dateKey: string
  /** Human-readable day label, e.g. "Today", "Yesterday", "Mon, Jan 23". */
  dateLabel: string
  /** Short weekday abbreviation shown inside the rail pill, e.g. "SUN". */
  dateShort: string
}

interface TimelineSectionProps {
  items: TimelineItemBase[]
  onAddEvent: () => void
  onEditEvent: (event: { id: string; eventType: EventType }) => void
  className?: string
}

const dotColorMap: Record<EventType, string> = {
  bedtime: 'bg-[var(--lavender)]',
  nap_start: 'bg-[var(--mint)]',
  nap_end: 'bg-[var(--mint)]',
  wake: 'bg-[var(--peach)]',
  night_wake: 'bg-[var(--rose)]',
}

const glowMap: Record<EventType, string> = {
  bedtime: 'shadow-[0_0_0_4px_var(--lavender-light)]',
  nap_start: 'shadow-[0_0_0_4px_var(--mint-light)]',
  nap_end: 'shadow-[0_0_0_4px_var(--mint-light)]',
  wake: 'shadow-[0_0_0_4px_var(--peach-light)]',
  night_wake: 'shadow-[0_0_0_4px_var(--rose-light)]',
}

export function TimelineSection({ items, onAddEvent, onEditEvent, className }: TimelineSectionProps) {
  const groups = useMemo(() => {
    const result: {
      dateKey: string
      dateLabel: string
      dateShort: string
      items: TimelineItemBase[]
    }[] = []
    for (const item of items) {
      const last = result[result.length - 1]
      if (!last || last.dateKey !== item.dateKey) {
        result.push({
          dateKey: item.dateKey,
          dateLabel: item.dateLabel,
          dateShort: item.dateShort,
          items: [item],
        })
      } else {
        last.items.push(item)
      }
    }
    return result
  }, [items])

  return (
    <section className={cn('', className)}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-extrabold text-[var(--text)]">Timeline</h3>
        <button
          onClick={onAddEvent}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lavender-light)] bg-white px-4 py-1.5 text-sm font-bold text-[var(--lavender)] active:bg-[var(--lavender-bg)] active:scale-95 transition-all duration-100"
        >
          <span className="text-base leading-none">+</span>
          Log past event
        </button>
      </div>

      {/* Timeline */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#F0EDF5] py-10 text-center">
          <span className="text-2xl">📋</span>
          <p className="text-sm font-bold text-[var(--text-muted)]">No events yet today</p>
          <p className="text-xs font-semibold text-[var(--text-muted)]">Tap above to log a past event</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {groups.map((group, groupIndex) => (
            <div key={group.dateKey} className="flex flex-col">
              {/* Date break pill */}
              <div className="flex items-center py-1">
                <div className="flex w-6 shrink-0 justify-center">
                  <span className="w-11 rounded-full bg-[var(--lavender-bg)] px-1.5 py-1 text-center text-[0.55rem] font-extrabold uppercase tracking-[0.3px] text-[var(--lavender)]">
                    {group.dateShort}
                  </span>
                </div>
                <span className="pl-3 text-xs font-bold text-[var(--text-secondary)]">
                  {group.dateLabel}
                </span>
              </div>

              {group.items.map((item, itemIndex) => {
                const isLast = groupIndex === groups.length - 1 && itemIndex === group.items.length - 1
                return (
                  <button
                    key={item.id}
                    onClick={() => onEditEvent({ id: item.id, eventType: item.eventType })}
                    className="group relative flex w-full items-stretch gap-3 rounded-xl px-2 py-2 text-left active:bg-[var(--lavender-bg)] transition-colors duration-100"
                  >
                    {/* Vertical line + dot */}
                    <div className="flex w-6 shrink-0 flex-col items-center">
                      <div
                        className={cn(
                          'z-10 mt-1.5 h-3 w-3 rounded-full',
                          dotColorMap[item.eventType],
                          item.isActive && glowMap[item.eventType]
                        )}
                      />
                      {!isLast && (
                        <div className="mt-[-2px] w-0.5 flex-1 rounded-full bg-[#E8E5F0]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex min-w-0 flex-1 items-center gap-2 pb-4 group-last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{item.icon}</span>
                          <span className="truncate text-sm font-bold text-[var(--text)]">
                            {item.label}
                          </span>
                          <span className="ml-auto shrink-0 text-xs font-bold text-[var(--text-muted)]">
                            {item.time}
                          </span>
                        </div>
                        {item.detail && (
                          <div className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)] pl-[1.6rem]">
                            {item.detail}
                          </div>
                        )}
                      </div>
                      {/* Edit hint — subtle chevrons */}
                      <span className="shrink-0 text-xs font-bold text-[var(--text-muted)] opacity-0 transition-opacity duration-100 group-hover:opacity-40">
                        ››
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
