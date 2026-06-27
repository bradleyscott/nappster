import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reportError } from '../error-reporting'

describe('reportError', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // fetch must return a promise-like value so .catch() doesn't crash
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(undefined))
    vi.stubGlobal('console', { error: vi.fn(), warn: vi.fn(), log: vi.fn() })
    vi.stubGlobal('window', { location: { href: 'https://example.com/page' } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs to console in development mode', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

    reportError(new Error('test error'))

    expect(console.error).toHaveBeenCalledWith(
      'Error reported:',
      expect.objectContaining({ message: 'test error' })
    )
  })

  it('does not fetch when no endpoint is configured in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' }
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

    reportError(new Error('test error'))

    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends error to endpoint when configured', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT: 'https://errors.example.com/report',
    }

    reportError(new Error('production error'))

    expect(fetch).toHaveBeenCalledWith(
      'https://errors.example.com/report',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      })
    )
  })

  it('includes digest and context in the report', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

    const error = new Error('context error') as Error & { digest?: string }
    error.digest = 'DIGEST_123'

    reportError(error, { userId: 'user-1' })

    expect(console.error).toHaveBeenCalledWith(
      'Error reported:',
      expect.objectContaining({
        message: 'context error',
        digest: 'DIGEST_123',
        context: { userId: 'user-1' },
      })
    )
  })

  it('includes page URL in the report', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT

    reportError(new Error('url test'))

    expect(console.error).toHaveBeenCalledWith(
      'Error reported:',
      expect.objectContaining({ url: 'https://example.com/page' })
    )
  })

  it('handles fetch rejection without throwing', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT: 'https://errors.example.com/report',
    }

    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))

    // fetch is called synchronously; rejection is handled by .catch()
    expect(() => reportError(new Error('should not throw'))).not.toThrow()

    // Give the promise chain a tick to settle
    await new Promise((r) => setTimeout(r, 0))

    expect(fetch).toHaveBeenCalled()
  })
})
