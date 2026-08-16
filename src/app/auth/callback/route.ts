import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Validate that a post-auth redirect target is a safe internal path.
 * Rejects absolute URLs, protocol-relative URLs, query strings, and hashes
 * to prevent open-redirect / reflected-XSS attacks.
 */
function isSafeInternalPath(path: string): boolean {
  // Allow root "/" or "/segment/segment" with alphanumeric, underscore, and hyphen.
  return /^\/[a-zA-Z0-9/_-]*$/i.test(path)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  const next = isSafeInternalPath(rawNext) ? rawNext : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`)
}
