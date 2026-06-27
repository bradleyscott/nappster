import type { SleepEvent, SleepPlanRow } from '@/types/database'
import type { ChatMessageData } from './hooks/use-chat-history'

/**
 * Merge multiple ordered event sources, giving precedence to earlier sources.
 * Later sources are only added if the event id is not already present.
 * Deleted event ids are excluded.
 */
export function mergeEvents(
  deletedIds: Set<string>,
  ...sources: SleepEvent[][]
): SleepEvent[] {
  const seen = new Set<string>()
  const merged: SleepEvent[] = []

  for (const source of sources) {
    for (const event of source) {
      if (seen.has(event.id) || deletedIds.has(event.id)) continue
      seen.add(event.id)
      merged.push(event)
    }
  }

  return merged.sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )
}

/**
 * Merge multiple ordered message sources, giving precedence to earlier sources.
 */
export function mergeMessages(
  ...sources: ChatMessageData[][]
): ChatMessageData[] {
  const seen = new Set<string>()
  const merged: ChatMessageData[] = []

  for (const source of sources) {
    for (const message of source) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      merged.push(message)
    }
  }

  return merged
}

/**
 * Merge multiple ordered sleep plan sources, giving precedence to earlier sources.
 */
export function mergeSleepPlans(
  ...sources: SleepPlanRow[][]
): SleepPlanRow[] {
  const seen = new Set<string>()
  const merged: SleepPlanRow[] = []

  for (const source of sources) {
    for (const plan of source) {
      if (seen.has(plan.id)) continue
      seen.add(plan.id)
      merged.push(plan)
    }
  }

  return merged.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}
