import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'

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

      // Fetch current baby to get pattern notes
      const { data: baby, error: fetchError } = await supabase
        .from('babies')
        .select('pattern_notes')
        .eq('id', babyId)
        .single()

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

      const { error } = await supabase
        .from('babies')
        .update({ pattern_notes: updatedNotes })
        .eq('id', babyId)

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        message: `Noted: "${pattern_info}"`,
        current_notes: updatedNotes
      }
    },
  })
}
