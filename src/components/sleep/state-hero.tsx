'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { CountdownRing } from './countdown-ring'
import { SubtitlePills } from './subtitle-pills'
import { SleepIcon } from './sleep-icons'
import type { Pill } from './subtitle-pills'

interface CountdownData {
  progress: number
  timeRemaining: string
  timeLabel: string
}

interface ExpectedLabel {
  icon: string
  text: string
  time: string
}

const accentMap = {
  lavender: {
    border: 'var(--lavender)',
    ringColor: 'var(--lavender)',
    iconColor: 'var(--lavender)',
    bgClass: 'bg-[var(--lavender-bg)]',
    elevatedBg: 'var(--lavender-bg)',
  },
  peach: {
    border: 'var(--peach)',
    ringColor: 'var(--peach)',
    iconColor: 'var(--peach)',
    bgClass: 'bg-[var(--peach-bg)]',
    elevatedBg: 'var(--peach-bg)',
  },
  mint: {
    border: 'var(--mint)',
    ringColor: 'var(--mint)',
    iconColor: 'var(--mint)',
    bgClass: 'bg-[var(--mint-bg)]',
    elevatedBg: 'var(--mint-bg)',
  },
  sunset: {
    border: 'var(--sunset)',
    ringColor: 'var(--sunset)',
    iconColor: 'var(--rose)',
    bgClass: 'bg-[var(--rose-bg)]',
    elevatedBg: 'var(--rose-bg)',
  },
}

interface StateHeroProps {
  accentColor: keyof typeof accentMap
  icon: string
  title: string
  pills: Pill[]
  countdown: CountdownData
  expectedLabel: ExpectedLabel
  /** AI-generated explanation for the expected time; when present, the label becomes tappable. */
  explanation?: string | null
  /** Source of the target / explanation. */
  source?: 'plan' | 'trends' | 'default'
  elevated?: boolean
  className?: string
  /** Called when a tappable pill is tapped */
  onPillTap?: (eventId: string) => void
  /** Show a subtle "Updating schedule…" indicator (background plan generation). */
  isPlanGenerating?: boolean
}

/** Small sleeping-moon mascot — the app's one playful "character moment". */
function HeroMascot() {
  return (
    <div className="hero-mascot pointer-events-none absolute right-3 top-2.5" aria-hidden="true">
      <svg width="46" height="46" viewBox="0 0 48 48" fill="none">
        <path
          d="M30.5 8.5c-7.8 1.2-13.6 7.9-13.6 15.9 0 8 5.8 14.7 13.6 15.9-3.4-3.2-5.5-7.7-5.5-12.7s2.1-9.5 5.5-12.7V8.5Z"
          fill="var(--lavender)"
        />
        <path
          d="M33 17.5l1.7 3.4 3.4 1.7-3.4 1.7-1.7 3.4-1.7-3.4-3.4-1.7 3.4-1.7 1.7-3.4Z"
          fill="var(--text-muted)"
        />
      </svg>
    </div>
  )
}

export function StateHero({
  accentColor,
  icon,
  title,
  pills,
  countdown,
  expectedLabel,
  explanation,
  source,
  elevated,
  className,
  onPillTap,
  isPlanGenerating,
}: StateHeroProps) {
  const a = accentMap[accentColor]
  const [isExplanationOpen, setIsExplanationOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isTablet = useMediaQuery('(min-width: 768px)')
  const ringSize = isDesktop ? 220 : isTablet ? 190 : 150
  const hasExplanation = explanation != null && explanation.length > 0

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] px-6 pb-6 pt-5 shadow-[var(--shadow-sm)]',
        className
      )}
      style={{
        background: elevated ? a.elevatedBg : a.bgClass,
        boxShadow: elevated
          ? '0 10px 28px -12px rgba(45,43,58,0.18), 0 2px 8px rgba(45,43,58,0.06)'
          : undefined,
      }}
    >
      <HeroMascot />

      {/* Top accent border */}
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: a.border }}
      />

      {/* Icon + Title row */}
      <div className="mb-3 flex items-center gap-3">
        <span
          className="hero-icon-pop flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--card-surface)]/70"
          style={{ color: a.iconColor }}
        >
          <SleepIcon name={icon} size={24} strokeWidth={2.25} />
        </span>
        <h2 className="font-display text-[22px] font-black leading-tight text-[var(--text)]">
          {title}
        </h2>
      </div>

      {/* Pills */}
      <SubtitlePills pills={pills} className="mb-4" onPillTap={onPillTap} />

      {/* Countdown ring */}
      <div className="flex justify-center py-2">
        <CountdownRing
          progress={countdown.progress}
          color={a.ringColor}
          timeRemaining={countdown.timeRemaining}
          timeLabel={countdown.timeLabel}
          size={ringSize}
          strokeWidth={ringSize >= 220 ? 21 : ringSize >= 190 ? 18 : 12}
        />
      </div>

      {/* Expected label */}
      {hasExplanation ? (
        <button
          type="button"
          onClick={() => setIsExplanationOpen((v) => !v)}
          aria-expanded={isExplanationOpen}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--card-surface)] px-4 py-2 text-center text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--lavender-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lavender)]"
        >
          <SleepIcon name={expectedLabel.icon} size={16} strokeWidth={2.25} />
          <span>{expectedLabel.text}</span>
          <span className="font-extrabold text-[var(--text)]">{expectedLabel.time}</span>
          <ChevronDown
            className={cn(
              'text-[var(--text-muted)] transition-transform duration-200',
              isExplanationOpen && 'rotate-180'
            )}
            size={14}
            strokeWidth={3}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--card-surface)] px-4 py-2 text-center text-sm font-bold text-[var(--text-secondary)]">
          <SleepIcon name={expectedLabel.icon} size={16} strokeWidth={2.25} />
          <span>{expectedLabel.text}</span>
          <span className="font-extrabold text-[var(--text)]">{expectedLabel.time}</span>
        </div>
      )}

      {/* Explanation panel */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isExplanationOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--line-soft)] bg-[var(--card-surface)] p-4 shadow-[var(--shadow-sm)]">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {explanation}
            </p>
            {source === 'plan' && (
              <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--line-soft)] bg-[var(--card-surface)] pt-3 text-[11px] font-bold text-[var(--text-muted)]">
                <Sparkles size={13} strokeWidth={2.5} aria-hidden="true" />
                <span>Based on today&apos;s AI sleep plan</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Background plan generation indicator */}
      {isPlanGenerating && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
          Updating schedule…
        </div>
      )}
    </div>
  )
}
