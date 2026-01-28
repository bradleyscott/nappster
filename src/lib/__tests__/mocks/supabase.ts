import { vi } from 'vitest'

/**
 * Creates a mock Supabase client that mimics the fluent query builder API.
 * Use this for testing tools and functions that interact with Supabase.
 */
export function createMockSupabaseClient() {
  // Store for mock responses
  let mockInsertResponse: { data: unknown; error: unknown } = { data: null, error: null }
  let mockSelectResponse: { data: unknown; error: unknown } = { data: [], error: null }

  // Track calls for assertions
  const insertCalls: unknown[] = []
  const selectCalls: string[] = []
  const fromCalls: string[] = []
  const eqCalls: Array<{ column: string; value: unknown }> = []
  const updateCalls: unknown[] = []

  // Build the chainable query builder
  const createQueryBuilder = () => {
    const builder = {
      insert: vi.fn((data: unknown) => {
        insertCalls.push(data)
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve(mockInsertResponse)),
          })),
        }
      }),
      select: vi.fn((columns?: string) => {
        if (columns) selectCalls.push(columns)
        return {
          eq: vi.fn((column: string, value: unknown) => {
            eqCalls.push({ column, value })
            return {
              order: vi.fn(() => ({
                data: mockSelectResponse.data,
                error: mockSelectResponse.error,
                then: (resolve: (val: unknown) => void) => resolve(mockSelectResponse),
              })),
              single: vi.fn(() => Promise.resolve(mockSelectResponse)),
              gte: vi.fn(() => ({
                lt: vi.fn(() => ({
                  order: vi.fn(() => Promise.resolve(mockSelectResponse)),
                })),
                order: vi.fn(() => Promise.resolve(mockSelectResponse)),
              })),
              limit: vi.fn(() => Promise.resolve(mockSelectResponse)),
            }
          }),
          single: vi.fn(() => Promise.resolve(mockSelectResponse)),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockSelectResponse)),
          })),
        }
      }),
      update: vi.fn((data: unknown) => {
        updateCalls.push(data)
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(mockInsertResponse)),
            })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }
    return builder
  }

  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table)
      return createQueryBuilder()
    }),

    // Test helpers to set mock responses
    _setInsertResponse: (response: { data: unknown; error: unknown }) => {
      mockInsertResponse = response
    },
    _setSelectResponse: (response: { data: unknown; error: unknown }) => {
      mockSelectResponse = response
    },

    // Test helpers to inspect calls
    _getInsertCalls: () => insertCalls,
    _getSelectCalls: () => selectCalls,
    _getFromCalls: () => fromCalls,
    _getEqCalls: () => eqCalls,
    _getUpdateCalls: () => updateCalls,

    // Reset all mocks
    _reset: () => {
      insertCalls.length = 0
      selectCalls.length = 0
      fromCalls.length = 0
      eqCalls.length = 0
      updateCalls.length = 0
      mockInsertResponse = { data: null, error: null }
      mockSelectResponse = { data: [], error: null }
    },
  }

  return client
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>
