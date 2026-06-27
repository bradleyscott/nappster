'use client'

import { cn } from '@/lib/utils'
import { NappsterLogo } from '@/components/nappster-logo'

interface PageHeaderProps {
  title: string
  subtitle?: string
  onBack?: React.MouseEventHandler<HTMLButtonElement>
  isNavigatingBack?: boolean
  rightActions?: React.ReactNode
  className?: string
}

/**
 * Shared page header with the same white-pill treatment as the dashboard.
 * Back button floats left, title is centered, optional right actions.
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  isNavigatingBack,
  rightActions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('relative px-4 pt-3 pb-1', className)}>
      {/* Back button */}
      {onBack && (
        <div className="absolute left-8 top-1/2 z-10 -translate-y-1/2">
          <button
            onClick={onBack}
            disabled={isNavigatingBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--text-secondary)] shadow-[var(--shadow-sm)] active:scale-90 transition-transform disabled:opacity-60"
            aria-label="Go back"
          >
            {isNavigatingBack ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
            ) : (
              <span>←</span>
            )}
          </button>
        </div>
      )}

      {/* Right actions */}
      {rightActions && (
        <div className="absolute right-8 top-1/2 z-10 flex -translate-y-1/2 gap-2">
          {rightActions}
        </div>
      )}

      {/* Rounded card header */}
      <div
        className={cn(
          'flex w-full min-h-[84px] items-center justify-center gap-3.5 rounded-[22px] bg-white px-14 py-3 text-center shadow-[var(--shadow-sm)]',
          (!onBack && !rightActions) && 'px-5'
        )}
      >
        <NappsterLogo size={60} />
        <div className="flex flex-col items-start">
          <span className="text-lg font-black leading-tight text-[var(--text)]">{title}</span>
          {subtitle && (
            <span className="mt-0.5 text-[10px] font-extrabold text-[var(--text-muted)]">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
