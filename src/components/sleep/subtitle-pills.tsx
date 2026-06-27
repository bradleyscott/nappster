'use client'

import { cn } from '@/lib/utils'

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
}

interface SubtitlePillsProps {
  pills: Pill[]
  className?: string
}

export function SubtitlePills({ pills, className }: SubtitlePillsProps) {
  if (!pills.length) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {pills.map((pill, i) => {
        const c = colorMap[pill.color ?? 'lavender']
        return (
          <span
            key={i}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-700 leading-tight',
              c.bg, c.text, c.border
            )}
          >
            {pill.dot && (
              <span className="relative flex h-2 w-2">
                <span className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
                  c.text.replace('text-', 'bg-')
                )} />
                <span className={cn(
                  'relative inline-flex h-2 w-2 rounded-full',
                  c.text.replace('text-', 'bg-')
                )} />
              </span>
            )}
            {pill.icon && <span>{pill.icon}</span>}
            {pill.label}
          </span>
        )
      })}
    </div>
  )
}
