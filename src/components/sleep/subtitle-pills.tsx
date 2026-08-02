'use client'

import { cn } from '@/lib/utils'
import { SleepIcon } from './sleep-icons'

const colorMap = {
  lavender: { bg: 'bg-[var(--lavender-bg)]', text: 'text-[var(--lavender)]', border: 'border-[var(--lavender)]/20' },
  peach: { bg: 'bg-[var(--peach-bg)]', text: 'text-[var(--peach)]', border: 'border-[var(--peach)]/20' },
  mint: { bg: 'bg-[var(--mint-bg)]', text: 'text-[var(--mint)]', border: 'border-[var(--mint)]/20' },
  rose: { bg: 'bg-[var(--rose-bg)]', text: 'text-[var(--rose)]', border: 'border-[var(--rose)]/20' },
}

export interface Pill {
  icon?: string
  label: string
  dot?: boolean
  color?: keyof typeof colorMap
  /** Event ID this pill relates to — when set the pill becomes tappable */
  eventId?: string
}

interface SubtitlePillsProps {
  pills: Pill[]
  className?: string
  /** Called when a pill with an eventId is tapped */
  onPillTap?: (eventId: string) => void
}

export function SubtitlePills({ pills, className, onPillTap }: SubtitlePillsProps) {
  if (!pills.length) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {pills.map((pill, i) => {
        const c = colorMap[pill.color ?? 'lavender']
        const isTappable = !!(pill.eventId && onPillTap)
        const Tag = isTappable ? 'button' : 'span'
        return (
          <Tag
            key={i}
            onClick={isTappable ? () => onPillTap(pill.eventId!) : undefined}
            className={cn(
              'subtitle-pill-animated inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-bold leading-tight',
              c.bg, c.text, c.border,
              isTappable && 'cursor-pointer active:opacity-70 transition-opacity duration-100'
            )}
          >
            {pill.dot && (
              <span className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                c.text.replace('text-', 'bg-')
              )} />
            )}
            {pill.icon && <SleepIcon name={pill.icon} size={15} strokeWidth={2.5} />}
            {pill.label}
          </Tag>
        )
      })}
    </div>
  )
}
