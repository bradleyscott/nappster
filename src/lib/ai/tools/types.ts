import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

/**
 * Context passed to all tool factories.
 * Contains the dependencies needed to create tools that interact with the database.
 */
export interface ToolContext {
  supabase: SupabaseClient<Database>
  babyId: string
  timezone: string
}
