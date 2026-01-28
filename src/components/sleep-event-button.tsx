'use client'

import { Button } from '@/components/ui/button'
import { EventType } from '@/types/database'
import { cn } from '@/lib/utils'

interface SleepEventButtonProps {
  eventType: EventType
  label: string
  icon: string
  onClick: () => void
  disabled?: boolean
  className?: string
  size?: 'default' | 'compact'
}

export function SleepEventButton({
  label,
  icon,
  onClick,
  disabled,
  className,
  size = 'default',
}: SleepEventButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        "flex font-medium",
        size === 'default' && "h-20 flex-col gap-1 text-base",
        size === 'compact' && "h-8 flex-row gap-1.5 text-sm px-2.5",
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={cn(
        size === 'default' && "text-2xl",
        size === 'compact' && "text-base"
      )}>{icon}</span>
      <span>{label}</span>
    </Button>
  )
}
