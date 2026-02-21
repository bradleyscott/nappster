import { MOCK_USER, MOCK_USER_2 } from './store'

/**
 * Get the active mock user based on localStorage.
 * Defaults to MOCK_USER (User 1). Set localStorage 'mockUserId' to '2' for User 2.
 */
export function getActiveMockUser() {
  if (typeof window !== 'undefined' && localStorage.getItem('mockUserId') === '2') {
    return MOCK_USER_2
  }
  return MOCK_USER
}

export const mockAuth = {
  getUser: async () => ({
    data: { user: getActiveMockUser() },
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signInWithPassword: async (_credentials: { email: string; password: string }) => ({
    data: { user: getActiveMockUser(), session: { access_token: 'mock-token' } },
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signUp: async (_credentials: { email: string; password: string }) => ({
    data: { user: getActiveMockUser(), session: null },
    error: null,
  }),

  signOut: async () => ({
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exchangeCodeForSession: async (_code: string) => ({
    data: { user: getActiveMockUser(), session: { access_token: 'mock-token' } },
    error: null,
  }),
}
