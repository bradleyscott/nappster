'use client'

import { useState, useRef, useCallback } from 'react'
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
import { UnifiedEventDialog } from '@/components/unified-event-dialog'
import { EventType, Context, SleepEvent } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'
import {
  getQuickEntryButtons,
  getSuggestedQuestions,
  shouldShowBedtime,
  type SleepState,
} from '@/lib/state-machine'
import { Suggestion } from '@/components/ai-elements/suggestion'

interface ChatInputProps {
  babyId: string
  babyName: string
  allEvents: SleepEvent[]
  onSendMessage: (text: string) => void | Promise<void>
  onCreateEvent: (eventData: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => void | Promise<void>
  status: ChatStatus
  sleepPlan?: SleepPlan | null
  currentState: SleepState
  disabled?: boolean
}

export function ChatInput({
  babyId,
  babyName,
  allEvents,
  onSendMessage,
  onCreateEvent,
  status,
  sleepPlan,
  currentState,
  disabled = false,
}: ChatInputProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const quickActionInFlight = useRef(false)

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim()) return
    await onSendMessage(text.trim())
  }

  const handleQuickAction = useCallback(async (eventType: EventType) => {
    // Prevent duplicate events from rapid taps
    if (quickActionInFlight.current) return
    quickActionInFlight.current = true
    try {
      await onCreateEvent({
        event_type: eventType,
        event_time: new Date().toISOString(),
        context: 'home',
        notes: null,
      })
    } finally {
      quickActionInFlight.current = false
    }
  }, [onCreateEvent])

  const handleDialogSave = async (eventData: {
    event_type: EventType
    event_time: string
    end_time?: string | null
    context: Context
    notes: string | null
  }) => {
    await onCreateEvent(eventData)
  }

  // Determine which quick action buttons to show based on current state
  // Uses the state machine for deterministic button selection
  const showBedtime = currentState === 'daytime_awake' && shouldShowBedtime(
    sleepPlan?.schedule,
    sleepPlan?.targetBedtime
  )
  const quickActions = getQuickEntryButtons(currentState, { showBedtimeOverNap: showBedtime })

  // Get contextual suggested questions based on current sleep state
  const suggestedQuestions = getSuggestedQuestions(currentState, babyName, { hasSleepPlan: !!sleepPlan })

  return (
    <>
      <PromptInput onSubmit={handleSubmit} className="bg-background">
        <PromptInputTextarea
          placeholder="Ask about sleep..."
          disabled={disabled}
        />

        <PromptInputFooter>
          <PromptInputTools className="flex-wrap">
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
            {suggestedQuestions.map((question) => (
              <Suggestion
                key={question}
                suggestion={question}
                onClick={onSendMessage}
                disabled={disabled}
              />
            ))}
          </PromptInputTools>
          <PromptInputSubmit status={status} disabled={disabled} />
        </PromptInputFooter>
      </PromptInput>

      <UnifiedEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        babyId={babyId}
        allEvents={allEvents}
        onSave={handleDialogSave}
      />
    </>
  )
}
