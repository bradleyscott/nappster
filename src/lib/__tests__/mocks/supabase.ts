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
  const rpcCalls: string[] = []

  const resolveSelect = () => Promise.resolve(mockSelectResponse)
  const resolveInsert = () => Promise.resolve(mockInsertResponse)

  const createThenable = (resolve: () => Promise<{ data: unknown; error: unknown }>) => {
    const thenable = {
      then: (onFulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
        resolve().then(onFulfilled),
    } as unknown as Promise<{ data: unknown; error: unknown }>
    return Object.assign(thenable, chainMethods)
  }

  const chainMethods = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value })
      return chainable
    }),
    gte: vi.fn(() => chainable),
    lt: vi.fn(() => chainable),
    is: vi.fn(() => chainable),
    order: vi.fn(() => chainable),
    limit: vi.fn((count: number) => {
      void count
      return chainable
    }),
    single: vi.fn(() => resolveSelect()),
  }

  const chainable = createThenable(resolveSelect)

  const createQueryBuilder = () => {
    const builder = {
      insert: vi.fn((data: unknown) => {
        insertCalls.push(data)
        const insertChain = {
          select: vi.fn(() => ({
            single: vi.fn(() => resolveInsert()),
          })),
          then: (onFulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
            resolveInsert().then(onFulfilled),
        }
        return insertChain
      }),
      select: vi.fn((columns?: string) => {
        if (columns) selectCalls.push(columns)
        return chainable
      }),
      update: vi.fn((data: unknown) => {
        updateCalls.push(data)
        return {
          eq: vi.fn(() => {
            const updateEqChain = {
              eq: vi.fn(() => updateEqChain),
              select: vi.fn(() => ({
                single: vi.fn(() => resolveInsert()),
              })),
              then: (onFulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
                resolveInsert().then(onFulfilled),
            }
            return updateEqChain
          }),
          then: (onFulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
            resolveInsert().then(onFulfilled),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }
    return builder
  }

  const client = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rpc: vi.fn((fnName: string, _params?: unknown) => {
      rpcCalls.push(fnName)
      return resolveSelect()
    }),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: 'mock-user-123' } }, error: null })
      ),
    },
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
    _setRpcResponse: (response: { data: unknown; error: unknown }) => {
      mockSelectResponse = response
    },

    // Test helpers to inspect calls
    _getInsertCalls: () => insertCalls,
    _getSelectCalls: () => selectCalls,
    _getFromCalls: () => fromCalls,
    _getEqCalls: () => eqCalls,
    _getUpdateCalls: () => updateCalls,
    _getRpcCalls: () => rpcCalls,

    // Reset all mocks
    _reset: () => {
      insertCalls.length = 0
      selectCalls.length = 0
      fromCalls.length = 0
      eqCalls.length = 0
      updateCalls.length = 0
      rpcCalls.length = 0
      mockInsertResponse = { data: null, error: null }
      mockSelectResponse = { data: [], error: null }
    },
  }

  return client
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>
