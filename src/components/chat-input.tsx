'use client'

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import type { ChatStatus } from 'ai'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'
import { SleepEventButton } from '@/components/sleep-event-button'
import { SleepEventDialog } from '@/components/sleep-event-dialog'
import { EventType, Context, } from '@/types/database'
import type { SleepPlan } from '@/app/api/sleep-plan/route'

interface ChatInputProps {
  babyId: string
  onSendMessage: (text: string) => void | Promise<void>
  onCreateEvent: (eventData: {
    event_type: EventType
    event_time: string
    context: Context
    notes: string | null
  }) => void | Promise<void>
  status: ChatStatus
  sleepPlan?: SleepPlan | null
  disabled?: boolean
}

export function ChatInput({
  babyId,
  onSendMessage,
  onCreateEvent,
  status,
  sleepPlan,
  disabled = false,
}: ChatInputProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim()) return
    await onSendMessage(text.trim())
  }

  const handleQuickAction = async (eventType: EventType) => {
    await onCreateEvent({
      event_type: eventType,
      event_time: new Date().toISOString(),
      context: 'home',
      notes: null,
    })
  }

  const handleDialogSave = async (eventData: {
    id?: string
    event_type: EventType
    event_time: string
    context: Context
    notes: string | null
  }) => {
    await onCreateEvent({
      event_type: eventData.event_type,
      event_time: eventData.event_time,
      context: eventData.context,
      notes: eventData.notes,
    })
    setDialogOpen(false)
  }

  // Determine which quick action buttons to show based on current state
  // See requirements.md "Quick Entry Buttons" section for logic
  const getQuickActions = () => {
    const currentState = sleepPlan?.currentState

    switch (currentState) {
      case 'overnight_sleep':
        // Nighttime sleep is in progress - show buttons for ending night or recording night wake
        return [
          { eventType: 'wake' as EventType, label: 'End Night', icon: '☀️' },
          { eventType: 'night_wake' as EventType, label: 'Night Wake', icon: '👀' },
        ]

      case 'nighttime_wake':
        // Baby is awake during the night - no quick actions, use dialog to set end_time on night_wake
        return []

      case 'daytime_napping':
        // Nap is in progress - show button for ending the nap
        return [
          { eventType: 'nap_end' as EventType, label: 'End Nap', icon: '🌤️' },
        ]

      case 'daytime_awake':
      default:
        // Baby is awake during the day - show nap or bedtime based on sleep plan recommendation
        const nextLabel = sleepPlan?.nextAction?.label?.toLowerCase() || ''
        if (nextLabel.includes('bedtime') || nextLabel.includes('bed')) {
          return [
            { eventType: 'bedtime' as EventType, label: 'Bedtime', icon: '🌙' },
          ]
        }
        // Default to nap start
        return [
          { eventType: 'nap_start' as EventType, label: 'Start Nap', icon: '😴' },
        ]
    }
  }

  const quickActions = getQuickActions()

  return (
    <>
      <PromptInput onSubmit={handleSubmit} className="bg-background">
        <PromptInputTextarea
          placeholder="Ask about sleep..."
          disabled={disabled}
        />

        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              onClick={() => setDialogOpen(true)}
              aria-label="Record past event"
              variant="ghost"
            >
              <PlusIcon className="size-4" />
              <span>Event</span>
            </PromptInputButton>
            {quickActions.map((action) => (
              <SleepEventButton
                key={action.eventType}
                eventType={action.eventType}
                label={action.label}
                icon={action.icon}
                onClick={() => handleQuickAction(action.eventType)}
                disabled={disabled}
                size="compact"
              />
            ))}
          </PromptInputTools>
          <PromptInputSubmit status={status} disabled={disabled} />
        </PromptInputFooter>
      </PromptInput>

      <SleepEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        babyId={babyId}
        onSave={handleDialogSave}
      />
    </>
  )
}
