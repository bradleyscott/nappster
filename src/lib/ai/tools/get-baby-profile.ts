import { tool } from 'ai'
import { z } from 'zod'
import { ToolContext } from './types'
import { formatAge } from '@/lib/sleep-utils'

/**
 * Creates a tool that fetches the baby's profile information.
 * This should be called FIRST before any other tools to understand
 * who you're helping.
 */
export function createGetBabyProfileTool(context: ToolContext) {
  const { supabase, babyId } = context

  return tool({
    description: `Get the baby's profile including name, age, birth date, sleep training method, and pattern notes.
Call this FIRST before any other tools to understand who you're helping and their known sleep patterns.`,
    inputSchema: z.object({}),
    execute: async () => {
      const { data, error } = await supabase
        .from('babies')
        .select('*')
        .eq('id', babyId)
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      if (!data) {
        return { success: false, error: 'Baby not found' }
      }

      return {
        success: true,
        baby: {
          name: data.name,
          age: formatAge(data.birth_date),
          birthDate: data.birth_date,
          sleepTrainingMethod: data.sleep_training_method,
          patternNotes: data.pattern_notes
        }
      }
    },
  })
}
