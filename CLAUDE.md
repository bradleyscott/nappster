# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Architecture

Nappster is a PWA for tracking baby sleep with AI-powered recommendations. Built with Next.js 16 App Router, Supabase for auth/database, and Vercel AI SDK for OpenAI integration.

### Data Flow

1. **Authentication**: Supabase Auth with proxy session refresh in [proxy.ts](src/proxy.ts). Unauthenticated users are redirected to `/auth/login`.

2. **Database**: Supabase PostgreSQL with Row Level Security. Schema in [supabase-schema.sql](supabase-schema.sql).
   - `babies` - Baby profiles with birth date and sleep training notes
   - `family_members` - Links users to babies (supports multiple caregivers)
   - `sleep_events` - Event types: `wake`, `nap_start`, `nap_end`, `bedtime`, `night_wake`

3. **Supabase Clients**: Two client patterns in [src/lib/supabase/](src/lib/supabase/):
   - `server.ts` - Server components/API routes (uses cookies)
   - `client.ts` - Client components (uses browser storage)

### AI Integration

Uses Vercel AI SDK with OpenAI GPT-4-turbo. Two patterns:

**Chat (streaming text)** - [src/app/api/chat/route.ts](src/app/api/chat/route.ts)
```tsx
// API: streamText() → toTextStreamResponse()
// Client: useChat() with DefaultChatTransport
```

**Recommendations (structured output)** - [src/app/api/recommend/route.ts](src/app/api/recommend/route.ts)
```tsx
// API: streamObject() with Zod schema → toTextStreamResponse()
// Client: experimental_useObject() with matching schema
```

Both endpoints use `buildSystemPrompt()` from [sleep-utils.ts](src/lib/sleep-utils.ts) to inject baby context, today's events, and recent history into the AI system prompt.

### Types

Database types in [src/types/database.ts](src/types/database.ts). Key exports: `Baby`, `SleepEvent`, `EventType`, `Context`.

### UI Components

shadcn/ui components in [src/components/ui/](src/components/ui/). App components use large tap targets for one-handed mobile use.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `OPENAI_API_KEY` - OpenAI API key

## Local Development Without Supabase

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env.local` to use in-memory mock data instead of Supabase. This enables local development without a Supabase account.

Mock mode provides:

- Auto-authenticated mock user (`dev@example.com`)
- Sample baby "Luna" (~7 months old)
- Today's sleep events generated dynamically based on current time
- Full CRUD operations on in-memory data (resets on page refresh)

Mock implementation in [src/lib/mock/](src/lib/mock/).
