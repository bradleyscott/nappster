'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface CountdownRingProps {
  /** Progress 0–1 */
  progress: number
  /** Gradient colors */
  gradient: { from: string; to: string }
  /** Large time text in center (e.g. "5h 12m") */
  timeRemaining: string
  /** Small label below time (e.g. "until wake") */
  timeLabel: string
  /** Diameter in px (default 150) */
  size?: number
  /** Stroke width of the ring (default 8) */
  strokeWidth?: number
  className?: string
}

export function CountdownRing({
  progress,
  gradient,
  timeRemaining,
  timeLabel,
  size = 150,
  strokeWidth = 8,
  className,
}: CountdownRingProps) {
  const id = useId()
  const stroke = strokeWidth
  const radius = (size - stroke) / 2 - 4
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, progress))
  const dashOffset = circumference * (1 - clamped)
  const center = size / 2
  const gradientId = `ring-grad-${id.replace(/:/g, '')}`
  // At the very end of the countdown (progress === 1) the arc spans the full circle.
  // `strokeLinecap: round` extends each end of the stroke by half the stroke width,
  // which leaves a visible notch/gap at the seam. Switch to a flat butt cap at full
  // so the ring reads as a complete, closed circle exactly when due.
  const lineCap: 'round' | 'butt' = clamped >= 1 ? 'butt' : 'round'

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient.from} />
            <stop offset="100%" stopColor={gradient.to} />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F0EDF5"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap={lineCap}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black leading-none tracking-tight" style={{ color: gradient.to }}>
          {timeRemaining}
        </span>
        <span className="text-[11px] font-bold text-[var(--text-secondary)] mt-0.5">
          {timeLabel}
        </span>
      </div>
    </div>
  )
}
