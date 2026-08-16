import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { getBabyById, updateBaby } from '@/lib/services/babies'
import { logInfo, logWarn } from '@/lib/error-reporting'

// Maximum characters for a single LLM append to pattern notes.
const MAX_APPEND_LENGTH = 300

// Prompt-injection markers. If the LLM's proposed note contains any of these,
// the append is rejected — the text would otherwise persist and re-enter
// future system prompts for all family members.
const INJECTION_PATTERNS = [
  /ignore (all |any |previous |prior )?instructions/i,
  /disregard (all |any |previous |prior )?instructions/i,
  /forget (all |any |previous |prior )?(instructions|context|rules)/i,
  /you are now/i,
  /new (system )?prompt/i,
  /override (your |the )?(instructions|prompt|rules)/i,
  /system\s*:/i,
  /<system/i,
]

/**
 * Creates a tool that updates the baby's pattern notes.
 * Use this when the user shares important information about their baby's
 * sleep patterns, preferences, or behaviors that should be remembered.
 */
export function createUpdatePatternNotesTool(context: ToolContext) {
  const { supabase, babyId } = context

  return tool({
    description: `Update the baby's pattern notes when the user shares important information about their baby's sleep patterns, preferences, or behaviors that should be remembered for future recommendations.

Use this tool when the user mentions:
- Consistent sleep preferences (light sleeper, needs dark room, needs white noise, etc.)
- Sleep associations (needs pacifier, specific lovey, rocking, etc.)
- Typical wake times or schedule preferences
- Nap preferences (length, number of naps, where they nap best)
- Feeding/sleep relationships (needs feed before nap, etc.)
- Environmental needs (temperature, swaddle preferences, etc.)
- Behavioral patterns (fights last nap, hard to settle at bedtime, etc.)
- Changes in routine or new developments

Do NOT use this for:
- One-time events (use createSleepEvent instead)
- Questions or hypothetical scenarios
- Information already in the current pattern notes`,
    inputSchema: z.object({
      pattern_info: z.string()
        .describe('A concise description of the pattern or preference to remember, written in third person (e.g., "Usually wakes around 7am", "Needs white noise to sleep")'),
    }),
    execute: async ({ pattern_info }) => {
      const MAX_NOTES_LENGTH = 2000

      // Reject appends that look like prompt-injection attempts. The note
      // persists and re-enters future system prompts, so this is a hard gate.
      const injectionMatch = INJECTION_PATTERNS.find((re) => re.test(pattern_info))
      if (injectionMatch) {
        logWarn(
          'update-notes',
          'Rejected pattern note append matching injection pattern',
          { pattern: injectionMatch.source, babyId },
        )
        return {
          success: false,
          error: 'The proposed note was rejected because it contains instructions that could override the assistant. Please rephrase the note as a factual description of the baby\'s sleep pattern.',
        }
      }

      // Per-append cap: prevents a single LLM turn from flooding the notes.
      if (pattern_info.length > MAX_APPEND_LENGTH) {
        return {
          success: false,
          error: `The proposed note is too long (${pattern_info.length}/${MAX_APPEND_LENGTH} chars). Please summarize it to the most important detail.`,
        }
      }

      // Fetch current baby to get pattern notes
      const { data: baby, error: fetchError } = await getBabyById(supabase, babyId)

      if (fetchError) {
        return { success: false, error: fetchError.message }
      }

      if (!baby) {
        return { success: false, error: 'Baby not found' }
      }

      // Append new info (the AI should provide non-duplicate info)
      const currentNotes = baby.pattern_notes || ''
      const updatedNotes = currentNotes
        ? `${currentNotes}. ${pattern_info}`
        : pattern_info

      if (updatedNotes.length > MAX_NOTES_LENGTH) {
        return {
          success: false,
          error: `Pattern notes are too long (${updatedNotes.length}/${MAX_NOTES_LENGTH} chars). Consider summarizing or replacing existing notes instead of appending.`,
          current_notes: currentNotes,
        }
      }

      const { error } = await updateBaby(supabase, babyId, { pattern_notes: updatedNotes })

      if (error) {
        return { success: false, error: error.message }
      }

      logInfo('update-notes', 'Appended pattern note', { babyId, length: pattern_info.length })

      return {
        success: true,
        message: `Noted: "${pattern_info}"`,
        current_notes: updatedNotes
      }
    },
  })
}
