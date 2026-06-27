'use client'

import { useEffect } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import type { SleepEvent, SleepPlanRow } from '@/types/database'

interface UseToolOutputsOptions {
  liveMessages: UIMessage[]
  onSleepEventCreated: (event: SleepEvent) => void
  onSleepPlanUpdated: (plan: SleepPlanRow) => void
}

const isToolPart = (part: unknown): part is { type: string; state?: string; output?: unknown } => {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    typeof (part as { type: unknown }).type === 'string'
  )
}

const hasToolOutput = (part: { output?: unknown }): part is { output: Record<string, unknown> } => {
  return typeof part.output === 'object' && part.output !== null
}

export function useToolOutputs({ liveMessages, onSleepEventCreated, onSleepPlanUpdated }: UseToolOutputsOptions) {
  useEffect(() => {
    for (const msg of liveMessages) {
      if (msg.role !== 'assistant') continue
      const parts = msg.parts
      if (!Array.isArray(parts)) continue

      for (const part of parts) {
        if (!isToolPart(part)) continue

        if (
          part.type === 'tool-createSleepEvent' &&
          part.state === 'output-available' &&
          hasToolOutput(part) &&
          part.output.success === true &&
          part.output.event
        ) {
          onSleepEventCreated(part.output.event as SleepEvent)
        }

        if (
          part.type === 'tool-updateSleepPlan' &&
          part.state === 'output-available' &&
          hasToolOutput(part) &&
          part.output.success === true &&
          part.output.plan
        ) {
          onSleepPlanUpdated(part.output.plan as SleepPlanRow)
        }
      }
    }
  }, [liveMessages, onSleepEventCreated, onSleepPlanUpdated])
}
