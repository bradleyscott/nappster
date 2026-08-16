/**
 * Lightweight error reporting.
 *
 * In production, set NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT to capture
 * client-side errors. The payload intentionally avoids PII: sensitive
 * context values are redacted before sending.
 */

export interface ErrorReport {
  message: string
  name?: string
  digest?: string
  stack?: string
  url?: string
  timestamp: string
}

// Keys whose values are treated as secrets and redacted in error payloads.
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|passwd|api[_-]?key|session|credential)/i

const REDACTED = '[REDACTED]'

/**
 * Recursively redact values under sensitive keys (and any string that looks
 * like a bearer token or API key) so error payloads don't leak credentials.
 */
function scrubValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED
  }

  if (typeof value === 'string') {
    // Redact common credential formats: Bearer tokens, sk-* keys, long hex/base64 blobs.
    if (
      /^Bearer\s+\S+/i.test(value) ||
      /^sk-[A-Za-z0-9_-]{8,}$/.test(value) ||
      /^[A-Za-z0-9_-]{32,}$/.test(value)
    ) {
      return REDACTED
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item))
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, k)
    }
    return out
  }

  return value
}

/**
 * Log an error-level message. Logs in both development and production so
 * production incidents are never silently dropped.
 */
export function logError(context: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, ...args)
  } else if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify({ level: 'error', context, args: scrubValue(args) }))
  }
}

/**
 * Log a warning-level message. Logs in both development and production.
 */
export function logWarn(context: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[${context}]`, ...args)
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(JSON.stringify({ level: 'warn', context, args: scrubValue(args) }))
  }
}

/**
 * Log an info-level message. Logs in both development and production.
 */
export function logInfo(context: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${context}]`, ...args)
  } else if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({ level: 'info', context, args: scrubValue(args) }))
  }
}

export function reportError(error: Error & { digest?: string }, context?: Record<string, unknown>) {
  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

  const report: ErrorReport & { context?: Record<string, unknown> } = {
    message: scrubValue(error.message) as string,
    name: error.name,
    digest: error.digest,
    stack: scrubValue(error.stack) as string | undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
    context: context ? (scrubValue(context) as Record<string, unknown>) : undefined,
  }

  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error reported:', report)
  } else {
    console.error(JSON.stringify({ level: 'error', report }))
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
