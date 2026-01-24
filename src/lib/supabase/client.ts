import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'
import { createMockClient } from '@/lib/mock/client'

export function createClient() {
  // Use mock client for local development without Supabase
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return createMockClient() as unknown as ReturnType<typeof createBrowserClient<Database>>
  }

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
