/**
 * Validates required environment variables at startup.
 * Call this in server-side entry points (e.g., API routes, server components)
 * to fail fast with a clear message instead of surfacing a cryptic runtime error.
 *
 * In mock-data mode, only Supabase env vars are required (for the client build;
 * the mock client does not make real network calls).
 */
export function validateEnv(): void {
  const isMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'

  const required = isMock
    ? ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
    : ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'OPENAI_API_KEY']

  const missing = required.filter((name) => !process.env[name])

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please set them in your .env.local file or deployment environment.'
    )
  }
}

/**
 * Validates env vars and returns whether the app is in mock-data mode.
 * Safe to call on both server and client.
 */
export function isMockDataMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
}
