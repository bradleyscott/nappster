import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateEnv, isMockDataMode } from '../env'

describe('env validation', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws when required variables are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.OPENAI_API_KEY

    expect(() => validateEnv()).toThrow('Missing required environment variables')
  })

  it('passes when all required variables are present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    process.env.OPENAI_API_KEY = 'sk-test'

    expect(() => validateEnv()).not.toThrow()
  })

  it('does not require OPENAI_API_KEY in mock mode', () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    delete process.env.OPENAI_API_KEY

    expect(() => validateEnv()).not.toThrow()
  })

  it('detects mock data mode', () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    expect(isMockDataMode()).toBe(true)

    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
    expect(isMockDataMode()).toBe(false)
  })
})
