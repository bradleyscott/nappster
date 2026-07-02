'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { CountdownRing } from './countdown-ring'
import { SubtitlePills } from './subtitle-pills'
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
    border: 'linear-gradient(90deg, var(--lavender-light), var(--lavender))',
    gradient: { from: '#B48BFF', to: '#7C4DFF' },
    bgClass: 'bg-white',
    elevatedBg: 'linear-gradient(180deg, var(--lavender-bg) 0%, white 100%)',
  },
  peach: {
    border: 'linear-gradient(90deg, var(--peach-light), var(--peach))',
    gradient: { from: '#FFB07C', to: '#FF8F6B' },
    bgClass: 'bg-white',
    elevatedBg: 'linear-gradient(180deg, var(--peach-bg) 0%, white 100%)',
  },
  mint: {
    border: 'linear-gradient(90deg, var(--mint-light), var(--mint))',
    gradient: { from: '#6FCF97', to: '#4CAF74' },
    bgClass: 'bg-white',
    elevatedBg: 'linear-gradient(180deg, var(--mint-bg) 0%, white 100%)',
  },
  sunset: {
    border: 'linear-gradient(90deg, var(--sunset), var(--rose))',
    gradient: { from: '#FF8F6B', to: '#FF8FAB' },
    bgClass: 'bg-white',
    elevatedBg: 'linear-gradient(180deg, var(--rose-bg) 0%, white 100%)',
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
          ? '0 6px 24px rgba(255,143,107,0.12), 0 2px 8px rgba(45,43,58,0.06)'
          : undefined,
      }}
    >
      {/* Ambient gradient mesh */}
      <div
        className="hero-mesh"
        style={{
          '--mesh-1': a.gradient.from,
          '--mesh-2': a.gradient.to,
          '--mesh-3': elevated ? a.gradient.from : a.gradient.to,
        } as React.CSSProperties}
      />

      {/* Top accent border */}
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: a.border }}
      />

      {/* Icon + Title row */}
      <div className="mb-3 flex items-center gap-3">
        <span className="hero-icon-pop text-2xl">{icon}</span>
        <h2 className="text-[22px] font-black leading-tight text-[var(--text)]">
          {title}
        </h2>
      </div>

      {/* Pills */}
      <SubtitlePills pills={pills} className="mb-4" onPillTap={onPillTap} />

      {/* Countdown ring */}
      <div className="flex justify-center py-2">
        <CountdownRing
          progress={countdown.progress}
          gradient={a.gradient}
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
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#F0EDF5] bg-[var(--bg)] px-4 py-2 text-center text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--lavender-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lavender)]"
        >
          <span>{expectedLabel.icon}</span>
          <span>{expectedLabel.text}</span>
          <span className="font-extrabold text-[var(--text)]">{expectedLabel.time}</span>
          <span
            className={cn(
              'ml-0.5 text-[10px] text-[var(--text-muted)] transition-transform duration-200',
              isExplanationOpen && 'rotate-180'
            )}
            aria-hidden="true"
          >
            ▼
          </span>
        </button>
      ) : (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-[#F0EDF5] bg-[var(--bg)] px-4 py-2 text-center text-sm font-bold text-[var(--text-secondary)]">
          <span>{expectedLabel.icon}</span>
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
          <div className="mt-3 rounded-[var(--radius-md)] border border-[#F0EDF5] bg-white p-4 shadow-[var(--shadow-sm)]">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {explanation}
            </p>
            {source === 'plan' && (
              <div className="mt-3 flex items-center gap-1.5 border-t border-[#F0EDF5] pt-3 text-[11px] font-bold text-[var(--text-muted)]">
                <span>🤖</span>
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
