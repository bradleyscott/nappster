/**
 * Centralized tunable constants for the application.
 *
 * Age-window functions (`defaultWakeWindowMin`, `defaultNapMin`,
 * `defaultOvernightMin`) are re-exported from `lib/countdown-projection.ts`.
 * They are defined there alongside the countdown logic that uses them, but are
 * exported here for convenience when callers need a clean import from config.
 */

// ---------------------------------------------------------------------------
// AI / Chat
// ---------------------------------------------------------------------------

/**
 * Maximum tool invocation steps before stopping the AI response in the chat
 * route. Allows for data-fetching tools (2-3 calls) plus action tools (1-2
 * calls) with headroom for multi-step reasoning.
 */
export const CHAT_MAX_TOOL_STEPS = 6

/**
 * Maximum tool invocation steps for background sleep-plan generation.
 */
export const PLAN_GEN_MAX_TOOL_STEPS = 4

/**
 * Maximum number of recent messages to include in the model context.
 * Older messages are available via the getChatHistory tool.
 */
export const MAX_CONVERSATION_MESSAGES = 20

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

/**
 * Maximum connection retry attempts before giving up.
 */
export const REALTIME_MAX_RECONNECT_ATTEMPTS = 10

// ---------------------------------------------------------------------------
// Sleep events
// ---------------------------------------------------------------------------

/**
 * Maximum hours between bedtime and wake to consider them a paired overnight
 * session. Prevents pairing a bedtime with a wake that happened much later
 * (e.g., next evening).
 */
export const MAX_OVERNIGHT_HOURS = 16

// ---------------------------------------------------------------------------
// Age-window tables (re-exported from countdown-projection.ts)
// ---------------------------------------------------------------------------

export {
  defaultWakeWindowMin,
  defaultNapMin,
  defaultOvernightMin,
} from './countdown-projection'
