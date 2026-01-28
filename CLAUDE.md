# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Architecture Overview

Nappster is a PWA for tracking baby sleep with AI-powered recommendations. Built with Next.js 16 App Router, Supabase for auth/database/realtime, and Vercel AI SDK for OpenAI integration.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed system documentation.

## Key Patterns

### Tool-Based AI Architecture

The AI uses **tool calling** to fetch data dynamically rather than receiving pre-injected context:

```text
User message → AI decides which tools to call → Tools fetch from database → AI responds
```

Tools are defined in [src/lib/ai/tools/](src/lib/ai/tools/):

- **Read tools**: `getBabyProfile`, `getTodayEvents`, `getSleepHistory`, `getChatHistory`
- **Write tools**: `createSleepEvent`, `updatePatternNotes`, `updateSleepPlan`

### API Routes

| Route                          | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `POST /api/chat`               | Streaming chat with tool calling (GPT-5.2) |
| `POST /api/chat/messages`      | Paginated chat history                     |
| `POST /api/sleep-plan`         | Generate structured sleep schedule         |
| `GET /api/sleep-plan/[babyId]` | Fetch active sleep plan                    |

### Supabase Clients

Two patterns in [src/lib/supabase/](src/lib/supabase/):

- `server.ts` - Server components and API routes (cookie-based)
- `client.ts` - Client components (browser storage)

### Database Schema

Core tables in [supabase-schema.sql](supabase-schema.sql):

- `babies` - Baby profiles with birth date and pattern notes
- `family_members` - Links users to babies (multi-caregiver support)
- `sleep_events` - Event types: `wake`, `nap_start`, `nap_end`, `bedtime`, `night_wake`
- `chat_messages` - Persisted messages with tool invocation parts
- `sleep_plans` - Generated daily schedules with cache invalidation via events hash

### Realtime Sync

Multi-user sync via Supabase Realtime in [src/lib/hooks/use-realtime-sync.ts](src/lib/hooks/use-realtime-sync.ts):

- Subscribes to `postgres_changes` on `sleep_events`, `chat_messages`, `sleep_plans`
- Uses broadcast channel workaround for DELETE events (RLS blocks postgres_changes deletes)

### Event Grouping

[src/lib/sleep-utils.ts](src/lib/sleep-utils.ts) provides:

- `groupEventsIntoSessions()` - Pairs nap_start/nap_end and bedtime/wake
- `findSessionForEvent()` - Finds which session an event belongs to
- Returns `TimelineItem[]` for UI rendering

### Timezone Handling

- User timezone stored in cookie, set client-side
- Passed to all API endpoints in request body
- All timestamps stored as UTC in database
- `date-fns-tz` used for timezone conversions

## Types

Database types in [src/types/database.ts](src/types/database.ts):

- `Baby`, `SleepEvent`, `ChatMessage`, `SleepPlan`
- `EventType`: `'wake' | 'nap_start' | 'nap_end' | 'bedtime' | 'night_wake'`
- `Context`: `'home' | 'daycare' | 'travel'`

## UI Components

- shadcn/ui components in [src/components/ui/](src/components/ui/)
- AI chat components in [src/components/ai-elements/](src/components/ai-elements/)
- App uses large tap targets for one-handed mobile use

## Environment Variables

Required in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-...
```

## Local Development Without Supabase

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env.local` to use in-memory mock data:

- Auto-authenticated mock user (`dev@example.com`)
- Sample baby "Luna" (~7 months old)
- Today's sleep events generated dynamically based on current time
- Full CRUD operations on in-memory data (resets on page refresh)

Mock implementation in [src/lib/mock/](src/lib/mock/).

## Common Tasks

### Adding a New AI Tool

1. Create tool file in `src/lib/ai/tools/`
2. Export from `src/lib/ai/tools/index.ts`
3. Add to `createChatTools()` or `createReadOnlyTools()` as appropriate

### Adding a New Database Table

1. Add schema to `supabase-schema.sql`
2. Add RLS policies for access control
3. Add TypeScript types to `src/types/database.ts`
4. If realtime needed, add to publication and update `use-realtime-sync.ts`

### Modifying Sleep Events

- Events are paired into sessions (nap_start→nap_end, bedtime→wake)
- Use `SleepEventDialog` for single events, `SleepSessionDialog` for pairs
- After modification, increment `refreshKey` to regenerate sleep plan
