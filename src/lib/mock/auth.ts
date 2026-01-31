import { MOCK_USER } from './store'

export const mockAuth = {
  getUser: async () => ({
    data: { user: MOCK_USER },
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signInWithPassword: async (_credentials: { email: string; password: string }) => ({
    data: { user: MOCK_USER, session: { access_token: 'mock-token' } },
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signUp: async (_credentials: { email: string; password: string }) => ({
    data: { user: MOCK_USER, session: null },
    error: null,
  }),

  signOut: async () => ({
    error: null,
  }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exchangeCodeForSession: async (_code: string) => ({
    data: { user: MOCK_USER, session: { access_token: 'mock-token' } },
    error: null,
  }),
}
