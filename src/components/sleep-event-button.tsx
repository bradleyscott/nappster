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
}

export function SleepEventButton({
  eventType,
  label,
  icon,
  onClick,
  disabled,
  className,
}: SleepEventButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-20 flex flex-col gap-1 text-base font-medium",
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="text-2xl">{icon}</span>
      <span>{label}</span>
    </Button>
  )
}
