'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SleepIcon } from '@/components/sleep/sleep-icons'

const variantStyles = {
  purple: 'action-btn--lavender',
  green: 'action-btn--mint',
  sunset: 'action-btn--sunset',
  rosepeach: 'action-btn--rose',
}

interface PrimaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Semantic icon key (see sleep-icons). */
  icon: string
  label: string
  subtitle?: string
  timeBadge?: string
  variant?: keyof typeof variantStyles
}

export const PrimaryActionButton = forwardRef<HTMLButtonElement, PrimaryActionButtonProps>(
  ({ icon, label, subtitle, timeBadge, variant = 'purple', className, ...props }, ref) => {
    const cls = variantStyles[variant]
    return (
      <button
        ref={ref}
        className={cn('action-entrance action-btn', cls, className)}
        {...props}
      >
        <span className="action-btn__icon">
          <SleepIcon name={icon} size={24} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="action-btn__label">{label}</div>
          {subtitle && <div className="action-btn__sub">{subtitle}</div>}
        </div>
        {timeBadge && <span className="action-btn__badge">{timeBadge}</span>}
        <ArrowRight className="action-btn__arrow shrink-0" size={20} strokeWidth={3} />
      </button>
    )
  }
)
PrimaryActionButton.displayName = 'PrimaryActionButton'

interface SecondaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Semantic icon key (see sleep-icons). */
  icon: string
  label: string
  subtitle?: string
}

export const SecondaryActionButton = forwardRef<HTMLButtonElement, SecondaryActionButtonProps>(
  ({ icon, label, subtitle, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn('action-entrance action-btn action-btn--secondary', className)}
        {...props}
      >
        <span className="action-btn__icon">
          <SleepIcon name={icon} size={24} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="action-btn__label">{label}</div>
          {subtitle && <div className="action-btn__sub">{subtitle}</div>}
        </div>
        <ArrowRight className="action-btn__arrow shrink-0" size={20} strokeWidth={3} />
      </button>
    )
  }
)
SecondaryActionButton.displayName = 'SecondaryActionButton'
