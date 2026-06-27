# Nappster Architecture

This document provides a comprehensive overview of the Nappster application architecture.

## Table of Contents

- [System Overview](#system-overview)
- [Directory Structure](#directory-structure)
- [Data Flow](#data-flow)
- [AI Integration](#ai-integration)
- [Deterministic State Machine](#deterministic-state-machine)
- [Sleep Trends](#sleep-trends)
- [Data Access Layer](#data-access-layer)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Realtime Sync](#realtime-sync)
- [State Management](#state-management)
- [Component Architecture](#component-architecture)
- [Key Patterns](#key-patterns)

## System Overview

Nappster is a Progressive Web App for tracking baby sleep patterns and generating AI-powered schedule recommendations. The architecture prioritizes:

- **Mobile-first UX** - Large tap targets, one-handed operation, a swipe-up chat drawer
- **State-driven dashboard** - A deterministic sleep state machine drives the hero card and quick actions
- **Multi-caregiver collaboration** - Real-time sync between family members, joinable via 6-digit invite codes
- **AI-assisted decision making** - Tool-calling AI that can read and write data, kept in a drawer until needed
- **Offline development** - Mock mode for local development without external services

### Technology Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│  Next.js 16 App Router + React 19 + Tailwind CSS 4          │
│  shadcn/ui + Motion + Vercel AI SDK (@ai-sdk/react)         │
│  Serwist 9 service worker (precache + runtime caching)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Routes                             │
│  /api/chat                 - Streaming chat + tools         │
│  /api/chat/messages        - Chat history pagination         │
│  /api/sleep-plan/[babyId]  - Fetch active sleep plan        │
│  /api/invite, /invite/redeem - Caregiver invite codes       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│      OpenAI API         │     │         Supabase            │
│  GPT-5.2 with tools     │     │  PostgreSQL + Auth + RT     │
│  Extended reasoning     │     │  Row Level Security         │
└─────────────────────────┘     └─────────────────────────────┘
```

## Directory Structure

```text
src/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Main dashboard (server component)
│   ├── sleep-trends/page.tsx         # 7/14-day trends + typical-day view
│   ├── layout.tsx                    # Root layout with providers
│   ├── error.tsx                     # Error boundary
│   ├── auth/
│   │   ├── login/page.tsx            # Email/password login
│   │   ├── signup/page.tsx           # Account creation
│   │   └── callback/route.ts         # OAuth callback handler
│   ├── onboarding/page.tsx           # Baby profile setup
│   ├── settings/page.tsx             # Profile, caregivers, invite codes
│   ├── sw.ts                         # Serwist service worker entry
│   └── api/
│       ├── chat/
│       │   ├── route.ts              # POST: Streaming chat endpoint
│       │   └── messages/route.ts     # POST: Chat history pagination
│       ├── sleep-plan/
│       │   └── [babyId]/route.ts     # GET: Fetch active plan (staleness check)
│       └── invite/
│           ├── route.ts              # POST: Generate invite code
│           └── redeem/route.ts      # POST: Redeem invite to join baby
│
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   │   ├── button.tsx, button-group.tsx, card.tsx, dialog.tsx,
│   │   │   input.tsx, input-group.tsx, textarea.tsx, label.tsx,
│   │   │   scroll-area.tsx, separator.tsx, skeleton.tsx,
│   │   │   collapsible.tsx, tooltip.tsx
│   ├── ai-elements/                  # Chat UI components
│   │   ├── conversation.tsx          # Scrollable message container
│   │   ├── message.tsx               # Message bubble
│   │   ├── chain-of-thought.tsx     # Tool invocation display
│   │   ├── reasoning.tsx            # Extended thinking display
│   │   ├── prompt-input.tsx         # Message input field
│   │   ├── loader.tsx, shimmer.tsx, suggestion.tsx
│   ├── sleep/                       # Dashboard composition
│   │   ├── sleep-dashboard.tsx      # State-driven dashboard shell
│   │   ├── state-hero.tsx           # Countdown-ring hero card
│   │   ├── countdown-ring.tsx       # Circular progress ring
│   │   ├── subtitle-pills.tsx       # Tappable sub-label chips
│   │   ├── action-buttons.tsx       # Primary/secondary quick actions
│   │   ├── timeline-section.tsx    # Grouped, editable day timeline
│   │   ├── event-sheet.tsx         # Bottom-sheet create/edit event
│   │   ├── chat-drawer.tsx          # Swipe-up AI chat drawer + FAB
│   │   ├── trends-view.tsx          # Typical-day + history trends UI
│   │   └── page-header.tsx         # Shared rounded-card header
│   ├── chat-content.tsx             # Main page client component (wires dashboard + chat)
│   ├── chat-input.tsx               # Quick-action input (legacy chat mode)
│   ├── app-header.tsx               # Dashboard header (trends + settings nav)
│   ├── nappster-logo.tsx            # Brand logo
│   ├── settings-form.tsx            # Profile + caregiver + invite management
│   ├── mock-user-toggle.tsx
│   ├── service-worker-register.tsx
│   ├── timezone-provider.tsx
│   ├── back-button.tsx
│   ├── event-type-selector.tsx
│   ├── night-wake-form.tsx
│   ├── sleep-event-button.tsx, sleep-event-dialog.tsx
│   ├── sleep-session-dialog.tsx
│   ├── unified-event-dialog.tsx, unified-edit-dialog.tsx
│   ├── unified-nap-form.tsx, unified-sleep-form.tsx
│   ├── delete-confirmation-dialog.tsx
│   ├── timeline-renderer.tsx
│   └── sleep-plan-card.tsx
│
├── lib/
│   ├── ai/
│   │   ├── tools/                   # AI tool definitions
│   │   │   ├── index.ts             # createChatTools / createReadOnlyTools
│   │   │   ├── types.ts             # ToolContext type
│   │   │   ├── get-baby-profile.ts, get-today-events.ts,
│   │   │   │   get-sleep-history.ts, get-chat-history.ts
│   │   │   └── create-event.ts, update-notes.ts, update-sleep-plan.ts
│   │   ├── prompts.ts               # System prompt builder
│   │   ├── schemas/sleep-plan.ts    # Zod schema for AI plan output
│   │   └── format-context.ts
│   ├── services/                    # Typed data-access layer
│   │   ├── sleep-events.ts, sleep-plans.ts, chat-messages.ts,
│   │   │   babies.ts, family-members.ts, invite-codes.ts
│   ├── supabase/
│   │   ├── server.ts                # Server-side client (cookies)
│   │   └── client.ts                # Client-side client (browser)
│   ├── mock/                        # Development mock system
│   │   ├── store.ts, client.ts, auth.ts, query-builder.ts
│   ├── hooks/
│   │   ├── use-realtime-sync.ts     # Multi-user sync
│   │   ├── use-sleep-event-crud.ts  # Optimistic event create/update/delete
│   │   ├── use-sleep-plan-sync.ts   # Local plan state + active selection
│   │   ├── use-background-refresh.ts # Reconnect/visibility recovery
│   │   ├── use-chat-transport.ts     # Chat API transport setup
│   │   ├── use-chat-history.ts       # Paginated history loading
│   │   ├── use-timeline-builder.ts   # Merge streams into timeline props
│   │   ├── use-tool-outputs.ts       # Extract AI tool results
│   │   ├── use-today-sleep-state.ts  # Current sleep state
│   │   ├── use-event-dialog-handlers.ts
│   │   └── use-media-query.ts
│   ├── api/                         # API route helpers
│   │   ├── auth.ts (requireBabyAccess, authErrorResponse)
│   │   ├── validation.ts (validateRequest + zod)
│   │   ├── responses.ts (apiSuccess, apiError)
│   │   └── index.ts
│   ├── state-machine.ts             # Deterministic sleep-state computation
│   ├── sleep-utils.ts               # Event grouping, formatting, events hash
│   ├── sleep-trends.ts              # Trends day-row + typical-day builder
│   ├── sleep-trend-stats.ts         # Aggregate trend stats
│   ├── merge-data.ts                # Merge initial/local/realtime/refresh streams
│   ├── timezone.ts                  # Timezone utilities (date-fns-tz)
│   ├── env.ts                       # Environment validation
│   ├── error-reporting.ts           # Configurable error reporting
│   └── utils.ts                     # General utilities (cn, etc.)
│
├── types/
│   └── database.ts                  # TypeScript types
│
└── proxy.ts                         # Auth middleware (supabase-ssr)
```

## Data Flow

### Main Page (Dashboard) Load

```text
GET / (Home)
         │
         ▼
page.tsx (Server Component)
  ├── supabase.auth.getUser()
  │     └── No user → render landing page (Get Started / Sign In)
  ├── getFamilyMembersForUser() ─── no baby? → redirect("/onboarding")
  ├── getBabyById(babyId)
  ├── getChatMessages(babyId, limit: 50)      ┐ parallel
  ├── getSleepEvents(babyId, from: yesterday) ┘
  └── getSleepPlansSinceCreatedAt(babyId, ...)
         │
         ▼
ChatContent (Client Component)
  ├── AppHeader (logo, greeting, trends + settings nav)
  ├── SleepDashboard
  │     ├── computeCurrentState(events)        ← state-machine.ts
  │     ├── StateHero (countdown ring, pills)
  │     ├── ActionButtons (queued from VALID_EVENTS[state])
  │     ├── TimelineSection (grouped, editable)
  │     ├── EventSheet (create/edit bottom sheet)
  │     └── ChatDrawer (FAB + swipe-up drawer)
  └── UnifiedEditDialog (dispatches single vs paired event edits)
```

### User Message Flow

```text
User opens ChatDrawer and types
         │
         ▼
ChatContent.handleSendMessage()
         │
         ▼
useChat.sendMessage() ──────────────────────────────────┐
         │                                               │
         ▼                                               │
POST /api/chat                                          │
  ├── Model: gpt-5.2 (reasoning: medium)                │
  ├── System prompt with tool instructions              │
  ├── stopWhen: stepCountIs(MAX_TOOL_STEPS)             │
  └── Tools: createChatTools(context)                   │
         │                                               │
         ▼                                               │
AI calls tools as needed:                               │
  ├── getBabyProfile → babies table                     │
  ├── getTodayEvents → sleep_events table               │
  ├── getSleepHistory → sleep_events (historical)       │
  ├── getChatHistory → chat_messages table              │
  ├── createSleepEvent → INSERT sleep_events            │
  ├── updatePatternNotes → UPDATE babies                │
  └── updateSleepPlan → INSERT/UPDATE sleep_plans       │
         │                                               │
         ▼                                               │
Stream response with:                                   │
  ├── Reasoning blocks (extended thinking)              │
  ├── Tool invocation parts (input + output)            │
  └── Text response                                     │
         │                                               │
         ▼                                               │
Client processes stream: ◄──────────────────────────────┘
  ├── useToolOutputs extracts createSleepEvent / updateSleepPlan
  │   outcomes → update local event/plan state
  ├── Display reasoning in collapsible section
  └── Render markdown response

After stream completes:
  └── Persist messages to chat_messages table (via after())
```

### Sleep Plan Generation Flow

```text
Events change (create/update/delete)
         │
         ▼
Events hash changes (djb2 in sleep-utils.computeEventsHash)
         │
         ▼
Sleep plan is (re)generated by the AI during chat via the
updateSleepPlan tool — there is NO separate generation endpoint:
  ├── Deactivates existing active plans
  ├── Computes and stores events_hash (cache invalidation)
  └── Inserts new plan into sleep_plans table
         │
         ▼
GET /api/sleep-plan/[babyId] reads the active plan and
compares its events_hash to current events to report staleness.
```

### Event Logging Flow (quick action)

```text
Dashboard action button tapped (or EventSheet saved)
         │
         ▼
useSleepEventCRUD optimistic insert/update/delete
         │
         ▼
State updates immediately (UI)
         │
         ▼
computeCurrentState() rerun → StateHero + buttons change
         │
         ▼
Realtime broadcast → other caregivers' UIs update
```

### Realtime Sync Flow

```text
Family member A modifies event
         │
         ▼
Supabase postgres_changes
         │
         ▼
Broadcast to all subscribers
         │
         ▼
Family member B's useRealtimeSync hook
         │
         ├── INSERT → Add to localEvents
         ├── UPDATE → Update in localEvents
         └── DELETE → Remove from localEvents
                      (via broadcast workaround)
         │
         ▼
merge-data.ts merges all streams → triggers plan refresh
```

## AI Integration

### Tool-Based Architecture

Instead of injecting all context into the system prompt, the AI dynamically fetches data using tools:

**Benefits:**

- AI decides how much history to fetch
- Reduces token waste from unused context
- Enables dynamic data needs (e.g., "show me last Tuesday")
- Write operations happen during inference

### Tool Definitions

```typescript
// src/lib/ai/tools/types.ts
interface ToolContext {
  supabase: SupabaseClient
  babyId: string
  timezone: string
}

// Each tool receives this context and returns typed data
```

**Read Tools (used in chat and sleep-plan routes):**

| Tool              | Purpose                           | Returns                  |
| ----------------- | --------------------------------- | ------------------------ |
| `getBabyProfile`  | Baby name, age, patterns          | `Baby` object            |
| `getTodayEvents`  | Events since yesterday's bedtime  | `SleepEvent[]`           |
| `getSleepHistory` | Up to 30 days of history          | `SleepEvent[]` by day    |
| `getChatHistory`  | Previous conversations            | `ChatMessage[]`          |

**Write Tools (chat route only):**

| Tool                | Purpose                         | Side Effect              |
| ------------------- | ------------------------------- | ------------------------ |
| `createSleepEvent`  | Log nap, wake, bedtime, etc.    | INSERT into sleep_events |
| `updatePatternNotes`| Save baby-specific patterns     | UPDATE babies            |
| `updateSleepPlan`   | Save generated schedule         | UPSERT sleep_plans       |

### Chat Route Implementation

```typescript
// src/app/api/chat/route.ts
streamText({
  model: openai("gpt-5.2"),
  system: buildToolBasedSystemPrompt(timezone),
  messages: await convertToModelMessages(messages),
  tools: createChatTools(toolContext),
  stopWhen: stepCountIs(MAX_TOOL_STEPS),  // Max tool call rounds
  providerOptions: {
    openai: {
      reasoningEffort: "medium",  // Extended thinking
    },
  },
})
```

### Sleep Plan Generation

Sleep plans are generated via the `updateSleepPlan` AI tool during chat, not through a separate API endpoint. The `GET /api/sleep-plan/[babyId]` route fetches the active plan and checks staleness against current events using the stored `events_hash`.

## Deterministic State Machine

The dashboard is driven by a pure, deterministic state machine in `src/lib/state-machine.ts` — sleep state is computed from events, never inferred by the LLM.

### States

```text
awaiting_morning_wake   ──wake──▶   daytime_awake
overnight_sleep         ──wake──▶   daytime_awake
overnight_sleep     ──night_wake──▶ overnight_sleep (logs event, no state change)
daytime_awake      ──nap_start──▶ daytime_napping
daytime_awake         ──bedtime──▶ overnight_sleep
daytime_napping       ──nap_end──▶ daytime_awake
```

### API

- `computeCurrentState(events): SleepState` — pure function; infers state from the last event but also supports transition-based computation for edge cases (e.g., missing morning wake).
- `VALID_EVENTS[state]` — which quick-action buttons to render.
- `getQuickEntryButtons(state, { showBedtimeOverNap })` — button config per state.
- `shouldShowBedtime(schedule, targetBedtime, now)` — swap nap button for bedtime when all naps are done or within 1 hour of target.
- `getSuggestedQuestions(state, babyName)` — contextual chat prompts.

`SleepDashboard.getStateConfig()` maps each state to a hero accent, icon, title, subtitle pills, countdown, expected transition label, and action buttons. The hero accent rotates across four brand palettes: `lavender` (overnight), `peach` (awake), `mint` (napping), `sunset` (bedtime near).

## Sleep Trends

The `/sleep-trends` page (`src/app/sleep-trends/page.tsx`) fetches 16 days of events (14 days + buffer for overnight sessions crossing midnight) and renders via `TrendsView` (`src/components/sleep/trends-view.tsx`):

1. **Typical Day card** — `computeExpectedDays()` in `src/lib/sleep-trends.ts` reduces the history into an aggregated "expected day" for both `home` and `daycare` contexts, rendered as a 24-hour bar with night/naps/awake split and stat pills.
2. **Stat cards** — average naps, average bedtime, average wake time (`src/lib/sleep-trend-stats.ts`).
3. **History** — `buildDayRows()` produces per-day rows with overnight blocks, nap blocks (daycare naps colored peach, home naps mint), and night-wake markers. Tapping a row opens a `DayDetailSheet` timeline of the day's blocks.
4. **Edit-in-place** — events can be edited from the detail sheet via `useSleepEventCRUD` + `EventSheet`.

## Data Access Layer

All direct Supabase queries live in `src/lib/services/`. Components, hooks, API routes, and AI tools consume these services instead of calling `supabase.from(...)` directly.

### Service Modules

| Service | Responsibility |
| ------- | -------------- |
| `sleep-events.ts` | Create/read/update/delete sleep events; today/recent/since queries. |
| `sleep-plans.ts` | Active plan lookup, create plan, deactivate old plans, recent plans. |
| `chat-messages.ts` | Persist and paginate chat messages. |
| `babies.ts` | Baby profile CRUD. |
| `family-members.ts` | Membership lookup, access checks, invite redemption, all-caregivers lookup (via SECURITY DEFINER RPC). |
| `invite-codes.ts` | 6-digit invite code generation and lookup. |

### Design Rules

1. Services accept an injected `SupabaseClient` so mock mode works without code changes.
2. No `supabase.from('...')` calls outside `src/lib/services/`.
3. Services return `{ data, error }` shapes with typed errors.
4. Complex queries (filters, ordering, pagination) are encapsulated in services, not duplicated in callers.

## Database Schema

### Entity Relationship Diagram

```text
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   auth.users     │      │  family_members  │      │     babies       │
│──────────────────│      │──────────────────│      │──────────────────│
│ id (PK)          │◄────►│ user_id (FK)     │      │ id (PK)          │
│ email            │      │ baby_id (FK)     │◄────►│ name             │
│ ...              │      │ role             │      │ birth_date       │
└──────────────────┘      │ created_at       │      │ pattern_notes    │
                          └──────────────────┘      │ created_at       │
                                                    └──────────────────┘
                            │         │                 │
       ┌────────────────────┘         │                 │
       ▼                              ▼                 ▼
┌──────────────────┐      ┌──────────────────┐   ┌──────────────────┐
│   sleep_events    │      │ invite_codes     │   │   sleep_plans    │
│──────────────────│      │──────────────────│   │──────────────────│
│ id (PK)          │      │ id (PK)          │   │ id (PK)          │
│ baby_id (FK)     │      │ baby_id (FK)     │   │ baby_id (FK)     │
│ event_type       │      │ code             │   │ current_state    │
│ event_time       │      │ created_by (FK)  │   │ next_action      │
│ end_time         │      │ expires_at       │   │ schedule (JSONB) │
│ context          │      │ created_at       │   │ events_hash      │
│ notes            │      └──────────────────┘   │ is_active        │
│ created_at       │                              │ plan_date        │
└──────────────────┘                              │ created_at       │
                                                  └──────────────────┘

                       ┌──────────────────┐
                       │  chat_messages   │
                       │──────────────────│
                       │ id (PK)          │
                       │ baby_id (FK)     │
                       │ message_id        │
                       │ role (user/assistant) │
                       │ parts (JSONB)    │
                       │ created_at       │
                       └──────────────────┘
```

### Table Details

**babies**

```sql
CREATE TABLE babies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  pattern_notes TEXT,         -- AI-generated + user notes about patterns
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**family_members** (Junction table for multi-caregiver support)

```sql
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  baby_id UUID REFERENCES babies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'parent',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, baby_id)
);
```

**sleep_events**

```sql
CREATE TABLE sleep_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID REFERENCES babies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,   -- 'wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake'
  event_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,       -- For night_wake duration
  context TEXT,               -- NULL, 'home', 'daycare', 'travel'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sleep_events_baby_time ON sleep_events(baby_id, event_time);
```

**chat_messages**

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID REFERENCES babies(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL,         -- 'user', 'assistant'
  parts JSONB NOT NULL,       -- Array of text/tool parts
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chat_messages_baby_time ON chat_messages(baby_id, created_at DESC);
```

**sleep_plans**

```sql
CREATE TABLE sleep_plans(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID REFERENCES babies(id) ON DELETE CASCADE,
  current_state TEXT NOT NULL,
  next_action JSONB NOT NULL,
  schedule JSONB NOT NULL,
  target_bedtime TEXT,
  summary TEXT,
  events_hash TEXT,           -- For cache invalidation
  plan_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sleep_plans_active ON sleep_plans(baby_id, is_active, created_at DESC);
```

**invite_codes** (Caregiver onboarding)

```sql
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID REFERENCES babies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,           -- 6-digit numeric
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,  -- 24-hour expiry
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_invite_codes_code ON invite_codes(code);
```

## Authentication

### Flow

```text
1. User visits / (home)
   └── proxy.ts middleware checks supabase.auth.getUser()
       ├── Authenticated → Allow access
       └── Unauthenticated → Landing page (Get Started / Sign In)

2. User signs up at /auth/signup
   └── Create account via Supabase Auth
       └── Redirect to /onboarding

3. Onboarding
   └── Create baby profile
       └── Link user to baby via family_members
           └── Redirect to home

4. Caregiver joins via invite
   └── POST /api/invite/redeem with a 6-digit code
       └── family_members row created for the new user

5. Session management
   └── proxy.ts refreshes session on each request
       └── Cookies managed by @supabase/ssr
       └── Mock mode (NEXT_PUBLIC_USE_MOCK_DATA=true) bypasses auth entirely
```

### Row Level Security

All tables have RLS policies that check `family_members` membership:

```sql
-- Example: sleep_events SELECT policy
CREATE POLICY "Users can view sleep events for their babies"
ON sleep_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM family_members
    WHERE family_members.baby_id = sleep_events.baby_id
    AND family_members.user_id = auth.uid()
  )
);
```

The `family_members` table also exposes a `SECURITY DEFINER` RPC (used by the settings page) to list all caregivers of a baby, since a regular SELECT on `family_members` would be RLS-scoped to the current user only.

## Realtime Sync

### Implementation

```typescript
// src/lib/hooks/use-realtime-sync.ts
export function useRealtimeSync({
  babyId,
  onSleepEventChange,
  onChatMessageChange,
  onSleepPlanChange,
}: RealtimeSyncOptions) {
  useEffect(() => {
    const channel = supabase
      .channel(`baby:${babyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sleep_events',
        filter: `baby_id=eq.${babyId}`,
      }, handleSleepEventChange)
      // ... similar for chat_messages and sleep_plans
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [babyId])
}
```

### DELETE Workaround

RLS prevents `postgres_changes` from broadcasting DELETE events. Workaround uses broadcast channel:

```typescript
// After successful delete
await channel.send({
  type: 'broadcast',
  event: 'delete',
  payload: { table: 'sleep_events', record: { id: eventId } }
})
```

### Reconnection Strategy

- Exponential backoff on connection failure
- Max 10 reconnection attempts
- Backoff caps at 30 seconds
- Background refresh refetches missed data on reconnect/visibility change

## State Management

### State Synchronization Contract

`ChatContent` receives initial server-rendered data and then merges four asynchronous streams:

1. **Local edits** – optimistic updates from `useSleepEventCRUD`.
2. **AI tool outputs** – new events/plans extracted from streaming assistant messages via `useToolOutputs`.
3. **Realtime changes** – `useRealtimeSync` pushes INSERT/UPDATE/DELETE events from other caregivers.
4. **Background refresh** – `useBackgroundRefresh` refetches recent events/messages/plans when the tab becomes visible or reconnects after disconnect.

Merging is centralized in `src/lib/merge-data.ts`:

```typescript
// Events: initial + history + local + realtime + refresh
const allSleepEvents = mergeEvents(initialEvents, historyEvents, localEvents, deletedIds)

// Messages: live + history + refreshed
const allMessages = mergeMessages(liveMessages, historyMessages, refreshedMessages)

// Plans: initial + local + refreshed
const allSleepPlans = mergeSleepPlans(initialPlans, localPlans, refreshedPlans)
```

### Deduplication Rules

- `useSleepEventCRUD` tracks locally-created IDs and deleted IDs.
- `useToolOutputs` processes each assistant message once, adding tool-created events/plans to local state.
- `useSleepPlanSync` ignores duplicate tool-created plans by ID.
- Deleted IDs are filtered out by `mergeEvents` so a background refresh does not resurrect deleted records.

### Extracted Hooks

| Hook | Responsibility |
| ---- | -------------- |
| `useSleepEventCRUD` | Optimistic create/update/delete for events and sessions. |
| `useSleepPlanSync` | Local plan state, active-plan selection, realtime plan handling. |
| `useBackgroundRefresh` | Refetch missed data on reconnect/visibility change. |
| `useChatTransport` | Build `DefaultChatTransport` with pre-injected context. |
| `useChatHistory` | Paginated loading of older chat messages. |
| `useToolOutputs` | Extract `createSleepEvent`/`updateSleepPlan` results from message parts. |
| `useTodaySleepState` | Compute current sleep state from today's events. |
| `useEventDialogHandlers` | Wrap save/delete handlers with dialog close logic. |
| `useTimelineBuilder` | Merge all data streams into `TimelineRenderer` props. |

## Component Architecture

### Main Page Hierarchy

```text
page.tsx (Server Component)
├── Landing page (if no user)
└── ChatContent (Client Component)
    ├── AppHeader
    │   └── Trends link, Settings link
    └── SleepDashboard
        ├── StateHero
        │   └── CountdownRing + SubtitlePills (tappable to edit source event)
        ├── ActionButtons (Primary / Secondary, from VALID_EVENTS[state])
        ├── TimelineSection
        │   └── grouped, editable day entries (+/edit → EventSheet)
        ├── EventSheet (bottom-sheet create/edit)
        └── ChatDrawer
            ├── FAB (💬)
            └── Drawer (open)
                ├── AI identity header (Nappster, online)
                ├── Conversation (ai-elements)
                │   ├── Message (user) → MessageContent
                │   └── Message (assistant)
                │       ├── ChainOfThought (tool calls)
                │       ├── Reasoning (extended thinking)
                │       └── MessageContent (markdown)
                └── Input form (textarea + send)
    └── UnifiedEditDialog (single vs paired event dispatcher)
```

### Sleep Trends Page Hierarchy

```text
sleep-trends/page.tsx (Server Component)
└── TrendsView (Client Component)
    ├── PageHeader (back → /)
    ├── Typical Day card (home / daycare toggle)
    │   ├── 24h bar (night/naps/awake)
    │   └── stat pills (night / naps / awake)
    ├── Stat cards (avg naps, avg bedtime, avg wake)
    ├── History (7d / 14d toggle)
    │   └── DayHistoryRow (overnight + nap blocks + night-wake markers)
    ├── DayDetailSheet (tappable day timeline + totals)
    └── EventSheet (edit an event from detail sheet)
```

### AI Elements (Reusable Chat Components)

| Component        | Purpose                              |
| ---------------- | ------------------------------------ |
| `Conversation`   | Scrollable container with auto-stick |
| `Message`        | Bubble wrapper with role styling     |
| `MessageContent` | Padded content area                  |
| `ChainOfThought` | Collapsible tool invocation list     |
| `Reasoning`      | Extended thinking display            |
| `Loader`         | Spinning indicator                   |
| `Shimmer`        | Streaming placeholder               |
| `Suggestion`     | Quick reply button                   |

## Key Patterns

### Timezone Handling

```typescript
// Set timezone cookie on client
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
document.cookie = `timezone=${tz}; path=/`

// Read in API routes
const timezone = request.headers.get('cookie')?.match(/timezone=([^;]+)/)?.[1] || 'UTC'

// Convert for queries
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
```

### Event Pairing Logic

```typescript
// src/lib/sleep-utils.ts
export function groupEventsIntoSessions(events: SleepEvent[]): TimelineItem[] {
  // nap_start pairs with next nap_end (stops at another nap_start)
  // bedtime pairs with next wake (within 16 hours)
  // wake and night_wake can be standalone or part of session
}
```

### Sleep Plan Cache Invalidation

```typescript
function computeEventsHash(events: SleepEvent[]): string {
  const normalized = events
    .map(e => `${e.id}:${e.event_time}:${e.event_type}`)
    .sort()
    .join('|')
  // djb2 hash algorithm
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i)
  }
  return hash.toString(36)
}
```

### Message Parts Structure

```typescript
// Chat messages store parts array (JSONB)
interface MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-invocation'; toolName: string; input: object; output: object }
```

### PWA / Service Worker

Nappster is a PWA via [Serwist](https://serwist.pages.dev/) (migrated from next-pwa):

- `src/app/sw.ts` declares the service worker with `precacheEntries` from Serwist's injected manifest and `defaultCache` runtime caching (fonts, static assets, images, API).
- `src/components/service-worker-register.tsx` registers the worker in production.
- `public/manifest.json` + `public/icons/` provide the installable web app manifest and icons.

### Mock Development Mode

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to:

- Skip Supabase auth (auto-login as `dev@example.com`)
- Use in-memory store instead of database
- Auto-generate sample events based on current time
- Provide a second caregiver (`dev2@example.com`) for family-sync testing
- Enable full CRUD (resets on refresh)

Implementation in `src/lib/mock/`:

- `store.ts` - In-memory data store with sample data
- `client.ts` - Mock Supabase client factory
- `query-builder.ts` - Mock query builder matching Supabase API
- `auth.ts` - Mock auth with auto-session