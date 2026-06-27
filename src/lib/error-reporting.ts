/**
 * Lightweight error reporting.
 *
 * In production, set NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT to capture
 * client-side errors. The payload intentionally avoids PII.
 */

export interface ErrorReport {
  message: string
  name?: string
  digest?: string
  stack?: string
  url?: string
  timestamp: string
}

export function reportError(error: Error & { digest?: string }, context?: Record<string, unknown>) {
  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

  const report: ErrorReport & { context?: Record<string, unknown> } = {
    message: error.message,
    name: error.name,
    digest: error.digest,
    stack: error.stack,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
    context,
  }

  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error reported:', report)
  }

  if (!endpoint) {
    return
  }

  // Fire-and-forget; don't block the UI on error reporting
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {
    // Silently ignore reporting failures to avoid cascading errors
  })
}
