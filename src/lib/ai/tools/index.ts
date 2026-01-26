import { ToolContext } from './types'
import { createGetBabyProfileTool } from './get-baby-profile'
import { createGetTodayEventsTool } from './get-today-events'
import { createGetSleepHistoryTool } from './get-sleep-history'
import { createGetChatHistoryTool } from './get-chat-history'
import { createCreateSleepEventTool } from './create-event'
import { createUpdatePatternNotesTool } from './update-notes'
import { createUpdateSleepPlanTool } from './update-sleep-plan'

/**
 * Creates the full set of tools for the chat route.
 * Includes both read and write tools.
 */
export function createChatTools(context: ToolContext) {
  return {
    getBabyProfile: createGetBabyProfileTool(context),
    getTodayEvents: createGetTodayEventsTool(context),
    getSleepHistory: createGetSleepHistoryTool(context),
    getChatHistory: createGetChatHistoryTool(context),
    createSleepEvent: createCreateSleepEventTool(context),
    updatePatternNotes: createUpdatePatternNotesTool(context),
    updateSleepPlan: createUpdateSleepPlanTool(context),
  }
}

/**
 * Creates read-only tools for routes that don't modify data.
 * Suitable for recommend and sleep-plan routes.
 */
export function createReadOnlyTools(context: ToolContext) {
  return {
    getBabyProfile: createGetBabyProfileTool(context),
    getTodayEvents: createGetTodayEventsTool(context),
    getSleepHistory: createGetSleepHistoryTool(context),
  }
}

// Re-export individual tool factories for custom combinations
export { createGetBabyProfileTool } from './get-baby-profile'
export { createGetTodayEventsTool } from './get-today-events'
export { createGetSleepHistoryTool } from './get-sleep-history'
export { createGetChatHistoryTool } from './get-chat-history'
export { createCreateSleepEventTool } from './create-event'
export { createUpdatePatternNotesTool } from './update-notes'
export { createUpdateSleepPlanTool } from './update-sleep-plan'

// Re-export types
export type { ToolContext } from './types'
