/**
 * Chat message persistence utilities for the AI chat API.
 *
 * Extracted from the chat route so the streaming + retry logic can be
 * unit-tested independently.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { saveChatMessage } from '@/lib/services/chat-messages'
import { logError } from '@/lib/error-reporting'

// ---------------------------------------------------------------------------
// Tool output condensing
// ---------------------------------------------------------------------------

/**
 * Read-only tools whose full output is expensive to persist.
 * We store a condensed summary instead to save DB storage and
 * reduce tokens when these messages are loaded back as history.
 */
export const READ_TOOL_NAMES = new Set([
  'getBabyProfile',
  'getTodayEvents',
  'getSleepHistory',
  'getChatHistory',
])

/**
 * Condense the output of a read-only tool for storage.
 * Keeps success/error status and a lightweight summary; drops bulky data.
 * Write-tool outputs are passed through unchanged.
 */
export function condenseToolOutput(
  toolName: string,
  output: unknown,
): unknown {
  if (!READ_TOOL_NAMES.has(toolName)) return output
  if (typeof output !== 'object' || output === null) return output

  const o = output as Record<string, unknown>
  if (toolName === 'getSleepHistory') {
    return {
      success: o.success,
      days_retrieved: o.days_retrieved,
      total_events: o.total_events,
      _condensed: true,
    }
  }
  if (toolName === 'getChatHistory') {
    return {
      success: o.success,
      days_retrieved: o.days_retrieved,
      message_count: o.message_count,
      _condensed: true,
    }
  }
  if (toolName === 'getTodayEvents') {
    const summary = (o.summary as Record<string, unknown>) ?? {}
    return {
      success: o.success,
      currentState: o.currentState,
      eventCount: Array.isArray(o.events) ? o.events.length : 0,
      summary,
      _condensed: true,
    }
  }
  if (toolName === 'getBabyProfile') {
    return { success: o.success, _condensed: true }
  }
  return output
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 2

interface SaveData {
  baby_id: string
  message_id: string
  role: string
  parts: Json
}

/**
 * Save a chat message with exponential-backoff retry.
 * Returns true on success, false after exhausting retries.
 */
export async function saveWithRetry(
  supabase: SupabaseClient,
  data: SaveData,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<boolean> {
  async function attempt(n: number): Promise<boolean> {
    const { error } = await saveChatMessage(supabase, {
      baby_id: data.baby_id,
      message_id: data.message_id,
      role: data.role as 'user' | 'assistant',
      parts: data.parts as Record<string, unknown>[],
    })
    if (!error) return true
    if (n < maxRetries) {
      await new Promise((r) => setTimeout(r, 100 * n))
      return attempt(n + 1)
    }
    logError(
      'chat-persistence',
      `Failed to save chat message after ${maxRetries} attempts:`,
      { messageId: data.message_id, role: data.role, error },
    )
    return false
  }
  return attempt(1)
}

/**
 * Build the assistant message parts array from the stream result.
 *
 * Ordering: reasoning blocks → text reply → tool-call outputs (with
 * read-only tool outputs condensed for storage).
 */
export function buildAssistantParts(
  reasoning: ReadonlyArray<{ text?: string; type?: string }> | undefined,
  text: string | undefined,
  toolCalls: Array<{ toolCallId: string; toolName: string; input?: unknown }>,
  toolResults: Array<{ toolCallId: string; output?: unknown }>,
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = []

  // Reasoning blocks first
  if (reasoning && reasoning.length > 0) {
    for (const block of reasoning) {
      if (block.text) {
        parts.push({ type: 'reasoning', text: block.text })
      }
    }
  }

  // Text reply
  if (text) {
    parts.push({ type: 'text', text })
  }

  // Tool-call outputs
  for (const tc of toolCalls) {
    const result = toolResults.find((r) => r.toolCallId === tc.toolCallId)
    const output = result ? condenseToolOutput(tc.toolName, result.output) : undefined
    parts.push({
      type: `tool-${tc.toolName}`,
      state: 'output-available',
      input: 'input' in tc ? tc.input : undefined,
      output,
    })
  }

  return parts
}

// ---------------------------------------------------------------------------
// Full turn persistence
// ---------------------------------------------------------------------------

export interface PersistChatTurnInput {
  supabase: SupabaseClient
  babyId: string
  /** Pre-generated assistant message ID (for realtime dedup) */
  assistantMessageId: string
  /** The raw messages array from the request */
  messages: unknown[]
  /** Stream result from streamText */
  result: {
    text: PromiseLike<string>
    toolCalls: PromiseLike<Array<{ toolCallId: string; toolName: string; input?: unknown }>>
    toolResults: PromiseLike<Array<{ toolCallId: string; output?: unknown }>>
    reasoning: PromiseLike<ReadonlyArray<{ text?: string; type?: string }> | undefined>
  }
}

/**
 * Persist both the user's last message and the assistant's full response
 * (reasoning, text, and tool-call outputs) to the database.
 *
 * Designed to be called inside `after()` — runs after the stream has been
 * sent to the client. Best-effort: failures are logged but not thrown so
 * response latency is never impacted.
 */
export async function persistChatTurn(input: PersistChatTurnInput): Promise<void> {
  const { supabase, babyId, assistantMessageId, messages, result } = input

  try {
    // Save user message
    const lastUserMessage = messages[messages.length - 1] as
      | { id?: string; role?: string; parts?: unknown[] }
      | undefined
    if (lastUserMessage?.role === 'user' && lastUserMessage.id) {
      await saveWithRetry(supabase, {
        baby_id: babyId,
        message_id: lastUserMessage.id,
        role: 'user',
        parts: JSON.parse(JSON.stringify(lastUserMessage.parts ?? [])),
      })
    }

    // Wait for stream completion
    const [text, toolCalls, toolResults, reasoning] = await Promise.all([
      result.text,
      result.toolCalls,
      result.toolResults,
      result.reasoning,
    ])

    const assistantParts = buildAssistantParts(reasoning, text, toolCalls, toolResults)
    if (assistantParts.length > 0) {
      await saveWithRetry(supabase, {
        baby_id: babyId,
        message_id: assistantMessageId,
        role: 'assistant',
        parts: JSON.parse(JSON.stringify(assistantParts)) as Json,
      })
    }
  } catch (saveError) {
    logError('chat-persistence', 'Error saving chat messages:', saveError)
    // Don't throw — persistence is best-effort
  }
}
