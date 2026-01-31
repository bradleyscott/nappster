# Nappster Architecture

This document provides a comprehensive overview of the Nappster application architecture.

## Table of Contents

- [System Overview](#system-overview)
- [Directory Structure](#directory-structure)
- [Data Flow](#data-flow)
- [AI Integration](#ai-integration)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Realtime Sync](#realtime-sync)
- [State Management](#state-management)
- [Component Architecture](#component-architecture)
- [Key Patterns](#key-patterns)

## System Overview

Nappster is a Progressive Web App for tracking baby sleep patterns and generating AI-powered schedule recommendations. The architecture prioritizes:

- **Mobile-first UX** - Large tap targets, one-handed operation
- **Multi-caregiver collaboration** - Real-time sync between family members
- **AI-assisted decision making** - Tool-calling AI that can read and write data
- **Offline development** - Mock mode for local development without external services

### Technology Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│  Next.js 16 App Router + React 19 + Tailwind CSS 4          │
│  shadcn/ui components + Vercel AI SDK (@ai-sdk/react)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Routes                             │
│  /api/chat - Streaming chat with tool calling               │
│  /api/sleep-plan - Structured schedule generation           │
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
│   ├── layout.tsx                    # Root layout with providers
│   ├── auth/
│   │   ├── login/page.tsx            # Email/password login
│   │   ├── signup/page.tsx           # Account creation
│   │   └── callback/route.ts         # OAuth callback handler
│   ├── onboarding/page.tsx           # Baby profile setup
│   ├── settings/page.tsx             # User preferences
│   └── api/
│       ├── chat/
│       │   ├── route.ts              # POST: Streaming chat endpoint
│       │   └── messages/route.ts     # POST: Chat history pagination
│       └── sleep-plan/
│           ├── route.ts              # POST: Generate new plan
│           └── [babyId]/route.ts     # GET: Fetch active plan
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (14 components)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── ai-elements/                  # Chat UI components
│   │   ├── conversation.tsx          # Scrollable message container
│   │   ├── message.tsx               # Message bubble
│   │   ├── chain-of-thought.tsx      # Tool invocation display
│   │   ├── reasoning.tsx             # Extended thinking display
│   │   └── prompt-input.tsx          # Message input field
│   ├── chat-content.tsx              # Main chat interface (client)
│   ├── chat-input.tsx                # Input with quick actions
│   ├── sleep-event-dialog.tsx        # Edit single event
│   ├── sleep-session-dialog.tsx      # Edit paired events
│   └── app-header.tsx                # Navigation header
│
├── lib/
│   ├── ai/tools/                     # AI tool definitions
│   │   ├── index.ts                  # Tool exports and factories
│   │   ├── types.ts                  # ToolContext type
│   │   ├── get-baby-profile.ts       # Read baby info
│   │   ├── get-today-events.ts       # Read today's sleep events
│   │   ├── get-sleep-history.ts      # Read historical events
│   │   ├── get-chat-history.ts       # Read past conversations
│   │   ├── create-event.ts           # Create sleep event
│   │   ├── update-notes.ts           # Update pattern notes
│   │   └── update-sleep-plan.ts      # Save generated plan
│   ├── supabase/
│   │   ├── server.ts                 # Server-side client (cookies)
│   │   └── client.ts                 # Client-side client (browser)
│   ├── mock/                         # Development mock system
│   │   ├── store.ts                  # In-memory data store
│   │   ├── client.ts                 # Mock Supabase client
│   │   ├── auth.ts                   # Mock auth provider
│   │   └── query-builder.ts          # Mock query builder
│   ├── hooks/
│   │   └── use-realtime-sync.ts      # Multi-user sync hook
│   ├── sleep-utils.ts                # Event grouping, formatting
│   ├── timezone.ts                   # Timezone utilities
│   └── utils.ts                      # General utilities (cn, etc.)
│
├── types/
│   └── database.ts                   # TypeScript types
│
└── proxy.ts                          # Auth middleware
```

## Data Flow

### User Message Flow

```text
User types message in ChatInput
         │
         ▼
ChatContent.handleSendMessage()
         │
         ▼
useChat.sendMessage() ──────────────────────────────────┐
         │                                               │
         ▼                                               │
POST /api/chat                                          │
  ├── Model: gpt-5.2 (reasoning enabled)                │
  ├── System prompt with tool instructions              │
  └── Tools: 7 available                                │
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
  ├── Extract tool outputs → update local state
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
Increment refreshKey state
         │
         ▼
SleepPlanCard detects key change
         │
         ▼
Compute events hash (djb2 algorithm)
         │
         ├── Hash unchanged? → Use cached plan
         │
         └── Hash changed? → POST /api/sleep-plan
                   │
                   ▼
              AI calls read-only tools:
                ├── getBabyProfile
                ├── getTodayEvents
                └── getSleepHistory
                   │
                   ▼
              Stream structured output:
                {
                  currentState: 'daytime_awake' | ...
                  nextAction: { label, timeWindow, isUrgent }
                  schedule: [...]
                  targetBedtime: string
                  summary: string
                }
                   │
                   ▼
              Save to sleep_plans table
              (with events_hash for cache invalidation)
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
Trigger plan refresh → New schedule generated
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
  stopWhen: stepCountIs(6),  // Max tool call rounds
  providerOptions: {
    openai: {
      reasoningEffort: "medium",  // Extended thinking
    },
  },
})
```

### Sleep Plan Route Implementation

```typescript
// src/app/api/sleep-plan/route.ts
streamText({
  model: openai("gpt-5.2"),
  output: Output.object({ schema: sleepPlanSchema }),
  system: buildToolBasedSystemPrompt(timezone),
  tools: createReadOnlyTools(toolContext),  // No write tools
  stopWhen: stepCountIs(4),
})
```

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
                                                            │
                          ┌─────────────────────────────────┼─────────────────────────────────┐
                          │                                 │                                 │
                          ▼                                 ▼                                 ▼
               ┌──────────────────┐              ┌──────────────────┐              ┌──────────────────┐
               │  sleep_events    │              │  chat_messages   │              │   sleep_plans    │
               │──────────────────│              │──────────────────│              │──────────────────│
               │ id (PK)          │              │ id (PK)          │              │ id (PK)          │
               │ baby_id (FK)     │              │ baby_id (FK)     │              │ baby_id (FK)     │
               │ event_type       │              │ message_id       │              │ current_state    │
               │ event_time       │              │ role             │              │ next_action      │
               │ end_time         │              │ parts (JSONB)    │              │ schedule (JSONB) │
               │ context          │              │ created_at       │              │ events_hash      │
               │ notes            │              └──────────────────┘              │ is_active        │
               │ created_at       │                                                │ plan_date        │
               └──────────────────┘                                                │ created_at       │
                                                                                   └──────────────────┘
```

### Table Details

**babies**

```sql
CREATE TABLE babies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  sleep_training_method TEXT,
  pattern_notes TEXT,         -- AI-generated patterns
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
  context TEXT,               -- 'home', 'daycare', 'travel'
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
CREATE TABLE sleep_plans (
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

## Authentication

### Flow

```text
1. User visits / (home)
   └── proxy.ts middleware checks supabase.auth.getUser()
       ├── Authenticated → Allow access
       └── Unauthenticated → Redirect to /auth/login

2. User signs up at /auth/signup
   └── Create account via Supabase Auth
       └── Redirect to /onboarding

3. Onboarding
   └── Create baby profile
       └── Link user to baby via family_members
           └── Redirect to home

4. Session management
   └── proxy.ts refreshes session on each request
       └── Cookies managed by @supabase/ssr
```

### Row Level Security

All tables have RLS policies that check `family_members` junction:

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
      // ... similar for other tables
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

## State Management

### Client State (ChatContent)

```typescript
// Live chat session
const { messages: liveMessages, sendMessage } = useChat({ transport })

// Sleep events (local + realtime)
const [localEvents, setLocalEvents] = useState<SleepEvent[]>(initialEvents)

// Historical data (paginated)
const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
const [historySleepEvents, setHistorySleepEvents] = useState<SleepEvent[]>([])

// Current sleep plan
const [sleepPlan, setSleepPlan] = useState<SleepPlan | null>(initialPlan)

// Modal state
const [selectedEvent, setSelectedEvent] = useState<SleepEvent | null>(null)
const [selectedSession, setSelectedSession] = useState<Session | null>(null)

// Plan refresh trigger
const [refreshKey, setRefreshKey] = useState(0)
```

### Deduplication Refs

```typescript
// Prevent duplicate events from AI tool + realtime
const processedToolEventIds = useRef<Set<string>>(new Set())

// Track manually created events
const locallyCreatedEventIds = useRef<Set<string>>(new Set())

// Process tool outputs once
const processedSleepPlanMsgIds = useRef<Set<string>>(new Set())

// Track deleted events for filtering
const deletedEventIds = useRef<Set<string>>(new Set())
```

## Component Architecture

### Main Page Hierarchy

```text
page.tsx (Server Component)
├── Fetch user, baby, events, messages, plan
└── ChatContent (Client Component)
    ├── AppHeader
    │   └── Settings, Sign Out
    ├── Conversation (ai-elements)
    │   ├── Message (user)
    │   │   └── MessageContent
    │   └── Message (assistant)
    │       ├── ChainOfThought (tool calls)
    │       ├── Reasoning (extended thinking)
    │       └── MessageContent (markdown)
    ├── ChatInput
    │   ├── Quick action buttons
    │   └── Text input
    └── Dialogs
        ├── SleepEventDialog
        ├── SleepSessionDialog
        └── DeleteConfirmationDialog
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

### Mock Development Mode

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to:

- Skip Supabase auth (auto-login as `dev@example.com`)
- Use in-memory store instead of database
- Auto-generate sample events based on current time
- Enable full CRUD (resets on refresh)

Implementation in `src/lib/mock/`:

- `store.ts` - In-memory data store with sample data
- `client.ts` - Mock Supabase client factory
- `query-builder.ts` - Mock query builder matching Supabase API
- `auth.ts` - Mock auth with auto-session
