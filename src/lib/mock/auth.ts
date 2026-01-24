import { MOCK_USER } from './store'

export const mockAuth = {
  getUser: async () => ({
    data: { user: MOCK_USER },
    error: null,
  }),

  signInWithPassword: async (_credentials: { email: string; password: string }) => ({
    data: { user: MOCK_USER, session: { access_token: 'mock-token' } },
    error: null,
  }),

  signUp: async (_credentials: { email: string; password: string }) => ({
    data: { user: MOCK_USER, session: null },
    error: null,
  }),

  signOut: async () => ({
    error: null,
  }),

  exchangeCodeForSession: async (_code: string) => ({
    data: { user: MOCK_USER, session: { access_token: 'mock-token' } },
    error: null,
  }),
}
