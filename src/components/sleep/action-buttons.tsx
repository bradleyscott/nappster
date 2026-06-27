'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variantStyles = {
  purple: {
    gradient: 'linear-gradient(135deg, var(--lavender), #7C4DFF)',
    shadow: '0 4px 16px rgba(124,77,255,0.25)',
  },
  green: {
    gradient: 'linear-gradient(135deg, var(--mint), #4CAF74)',
    shadow: '0 4px 16px rgba(111,207,151,0.25)',
  },
  sunset: {
    gradient: 'linear-gradient(135deg, var(--sunset), var(--rose))',
    shadow: '0 4px 16px rgba(255,143,107,0.25)',
  },
  rosepeach: {
    gradient: 'linear-gradient(135deg, var(--rose), var(--peach))',
    shadow: '0 4px 16px rgba(255,143,171,0.25)',
  },
}

interface PrimaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  label: string
  subtitle?: string
  timeBadge?: string
  variant?: keyof typeof variantStyles
}

export const PrimaryActionButton = forwardRef<HTMLButtonElement, PrimaryActionButtonProps>(
  ({ icon, label, subtitle, timeBadge, variant = 'purple', className, ...props }, ref) => {
    const v = variantStyles[variant]
    return (
      <button
        ref={ref}
        className={cn(
          'group relative flex w-full items-center gap-4 rounded-[22px] px-5 py-5 text-left text-white active:scale-[0.97] active:shadow-lg transition-all duration-150',
          className
        )}
        style={{ background: v.gradient, boxShadow: v.shadow }}
        {...props}
      >
        {/* Shine overlay */}
        <span className="pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-b from-white/15 to-transparent" />
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-800 leading-tight">{label}</div>
          {subtitle && (
            <div className="mt-0.5 text-sm font-600 text-white/70">{subtitle}</div>
          )}
        </div>
        {timeBadge && (
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-sm font-700 backdrop-blur-sm">
            {timeBadge}
          </span>
        )}
        <span className="shrink-0 text-lg font-700 transition-transform duration-150 group-hover:translate-x-0.5">
          →
        </span>
      </button>
    )
  }
)
PrimaryActionButton.displayName = 'PrimaryActionButton'

interface SecondaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  label: string
  subtitle?: string
}

export const SecondaryActionButton = forwardRef<HTMLButtonElement, SecondaryActionButtonProps>(
  ({ icon, label, subtitle, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'flex w-full items-center gap-4 rounded-[20px] border-2 border-[var(--lavender-light)] bg-white px-5 py-4 text-left text-[var(--text)] active:bg-[var(--lavender-bg)] active:scale-[0.97] transition-all duration-150',
          className
        )}
        {...props}
      >
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-800 leading-tight">{label}</div>
          {subtitle && (
            <div className="mt-0.5 text-xs font-600 text-[var(--text-muted)]">{subtitle}</div>
          )}
        </div>
        <span className="shrink-0 text-sm font-700 text-[var(--text-muted)]">→</span>
      </button>
    )
  }
)
SecondaryActionButton.displayName = 'SecondaryActionButton'
