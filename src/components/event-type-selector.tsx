'use client'

import { EventType, Context } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/sleep-utils'

export type EventCategory = 'nap' | 'sleep' | 'night_wake'

export interface InProgressSession {
  type: 'nap' | 'bedtime'
  startEventId: string
  startTime: string
  context: Context
  notes: string | null
  durationMinutes: number
}

interface EventTypeSelectorProps {
  onSelectCategory: (category: EventCategory) => void
  onCompleteSession?: (session: InProgressSession) => void
  inProgressSession?: InProgressSession | null
}

export function EventTypeSelector({
  onSelectCategory,
  onCompleteSession,
  inProgressSession,
}: EventTypeSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Smart Suggestions */}
      {inProgressSession && onCompleteSession && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Quick Action</h3>
          <Card
            className="p-4 cursor-pointer hover:bg-accent transition-colors border-2 border-primary/20"
            onClick={() => onCompleteSession(inProgressSession)}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">
                {inProgressSession.type === 'nap' ? '😴' : '☀️'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {inProgressSession.type === 'nap' ? 'End current nap' : 'Log morning wake'}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Started {formatDuration(inProgressSession.durationMinutes)} ago
                  {inProgressSession.context && ` at ${inProgressSession.context}`}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Event Categories */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {inProgressSession ? 'Log Different Event' : 'Select Event Type'}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Nap Category */}
          <Card
            className="p-6 cursor-pointer hover:bg-accent transition-colors border-2 hover:border-primary/30"
            onClick={() => onSelectCategory('nap')}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-3xl">😴</span>
              <span className="font-medium">Nap</span>
            </div>
          </Card>

          {/* Sleep Category */}
          <Card
            className="p-6 cursor-pointer hover:bg-accent transition-colors border-2 hover:border-primary/30"
            onClick={() => onSelectCategory('sleep')}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-3xl">🌙</span>
              <span className="font-medium">Sleep</span>
            </div>
          </Card>
        </div>

        {/* Night Wake (full width) */}
        <Card
          className="p-4 cursor-pointer hover:bg-accent transition-colors border-2 hover:border-primary/30"
          onClick={() => onSelectCategory('night_wake')}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">👀</span>
            <span className="font-medium">Night Wake</span>
          </div>
        </Card>
      </div>
    </div>
  )
}
