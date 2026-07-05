# Nappster

![CI](https://github.com/bradleyscott/nappster/actions/workflows/ci.yml/badge.svg)

A Progressive Web App for tracking baby sleep with AI-powered schedule recommendations. Built to replace ad-hoc ChatGPT conversations with a purpose-built experience that multiple caregivers can share.

## Screenshots

<p align="center">
  <img src="chat_page.png" alt="Nappster sleep dashboard with state hero, quick actions, and timeline" width="300" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="trends_page.png" alt="Sleep trends: typical day, history bars, and day detail" width="300" />
</p>

**Left:** Sleep dashboard — a state-aware hero card with a countdown ring, contextual quick-action buttons, and a scrolling day timeline. AI sleep coach lives in a swipe-up chat drawer. **Right:** Sleep trends view — a "Typical Day" summary across home/daycare contexts, average-day stat cards, and 7/14-day history bars with tappable day detail.

## Features

- **State-Aware Dashboard** - The app computes a deterministic sleep state (`awaiting_morning_wake`, `overnight_sleep`, `daytime_awake`, `daytime_napping`) from logged events and shows a matching hero card with a live countdown ring and only the quick actions that make sense for the current state.
- **Quick Entry UI** - Large tap targets for one-handed use while holding a baby. Tap once to log an event instantly, or open the EventSheet to backfill a time, context, or notes.
- **AI Sleep Coach (drawer)** - A swipe-up chat drawer with tool-calling AI (gpt-5.4) that reads baby history, logs events, updates pattern notes, and generates structured sleep plans. The chat stays out of the way until you need it.
- **Sleep Trends** - A dedicated `/sleep-trends` page visualizes a "Typical Day" (night/naps/awake split) for home and daycare contexts, average-day stat cards (avg naps, bedtime, wake), and 7/14-day history bars with a tappable day-detail sheet.
- **Real-time Family Sync** - Multiple caregivers see updates instantly via Supabase Realtime, and new caregivers join with a 6-digit invite code generated from Settings.
- **Mobile-First PWA** - Optimized for phones with a Serwist service worker for offline-capable architecture, web app manifest, and installable icons.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 (strict mode) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui |
| Animation | Motion |
| AI | Vercel AI SDK 6 + OpenAI gpt-5.4 (tool calling, reasoning) |
| Database | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| PWA | Serwist 9 (service worker, precaching, runtime caching) |
| Testing | Vitest + Testing Library |

## Getting Started

### Option 1: Local Development with Mock Data

The fastest way to get started - no external services required:

```bash
# Clone and install
git clone <repo-url>
cd nappster
npm install

# Enable mock mode
echo "NEXT_PUBLIC_USE_MOCK_DATA=true" >> .env.local
echo "OPENAI_API_KEY=sk-your-key" >> .env.local

# Start development server
npm run dev
```

Mock mode provides:
- Auto-authenticated user (`dev@example.com`)
- Sample baby "Luna" (~7 months old)
- Dynamically generated sleep events based on current time
- Full CRUD operations (resets on refresh)
- A second caregiver (`dev2@example.com`) for testing family sync

### Option 2: Full Setup with Supabase

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Run the schema from `supabase-schema.sql` in the SQL Editor

2. **Configure Environment**
   ```bash
   cp .env.local.example .env.local
   ```

   Fill in your values:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   OPENAI_API_KEY=sk-your-key
   ```

3. **Install and Run**
   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

The codebase is organized around these core concerns:

### Pages & Routing (`src/app/`)
Next.js App Router pages for the main dashboard (`/`), sleep trends (`/sleep-trends`), authentication (`/auth/*`), onboarding (`/onboarding`), and settings (`/settings`). A root layout provides providers and error boundaries. The service worker entry (`sw.ts`) is also here.

### API Routes (`src/app/api/`)
- **`POST /api/chat`** — Streaming AI chat with tool calling (read/write baby data during conversation)
- **`GET /api/sleep-plan/[babyId]`** — Fetch the active sleep plan with staleness check
- **`POST /api/sleep-plan/generate`** — Background sleep plan generation (triggered on stale plans)
- **`POST /api/invite` / `POST /api/invite/redeem`** — 6-digit invite code generation and redemption

### Components (`src/components/`)
- **`sleep/`** — Dashboard composition: state-driven hero card with countdown ring, contextual action buttons, grouped day timeline, bottom-sheet event editor, swipe-up chat drawer, trends view, and a shared page header
- **`ui/`** — shadcn/ui primitives (button, card, dialog, input, scroll-area, etc.)
- **`ai-elements/`** — Chat UI building blocks: scrollable conversation, message bubbles, tool-invocation accordion, reasoning display, streaming indicators
- **Top-level** — Wires everything together: `chat-content.tsx` (main page client component), dialog dispatchers for single/pair event editing, shared forms, settings, app header, timezone provider, and service worker registration

### Data & AI Layer (`src/lib/`)
- **`ai/`** — Tool definitions (3 tool factories for read-only, chat, and background plan generation), system prompt builder, Zod schemas for AI output, context formatters, and chat persistence
- **`services/`** — Typed data-access layer per domain (sleep events, plans, chat messages, babies, family members, invite codes). All `supabase.from()` calls live here
- **`supabase/`** — Server-side (cookie-based) and client-side Supabase client factories
- **`mock/`** — In-memory mock store, client, auth, and query builder for offline development
- **`hooks/`** — Realtime sync, optimistic CRUD, event merging, chat transport, tool output extraction, day-timeline building, background plan generation, trends projection, and live countdown clock
- **Core modules** — Deterministic sleep state machine, event grouping/session logic, countdown projection, dashboard UI config, sleep-chart block builder, trend statistics, multi-stream data merging, timezone utilities, environment validation, and error reporting

### Types (`src/types/`)
Shared TypeScript types for `Baby`, `SleepEvent`, `ChatMessage`, `SleepPlan`, `InviteCode`, and the `SleepState` union.

### Auth Middleware (`src/proxy.ts`)
Supabase SSR middleware that refreshes sessions and handles cookie management on every request.

## App Tour

1. **Landing → Sign up** - Logged-out visitors see a branded landing page with "Get Started".
2. **Onboarding** - Enter baby's name and birthdate to create a baby profile and link via `family_members`.
3. **Dashboard** - The state hero shows where baby is now (e.g. "Taking a Nap") with a countdown to the next expected transition. Contextual action buttons let you log the next event in one tap.
4. **Timeline** - Below the hero, today's events render as a grouped, editable timeline. Tap an entry to edit, or use "+" to backfill an event via the EventSheet.
5. **AI coach drawer** - Tap the 💬 FAB to open the chat drawer. Ask edge-case questions ("She had a car nap, what now?") and the AI can read history, log events, update pattern notes, and save a structured sleep plan.
6. **Sleep Trends** - Tap the chart icon in the header to open `/sleep-trends` for a 7- or 14-day view, a Typical Day summary (home vs daycare), and average-day stats.
7. **Settings** - Tap the profile icon to manage baby profile, view connected caregivers, and generate a 6-digit invite code so a partner/caregiver can join.

## AI Capabilities

The AI assistant uses tool calling to fetch data on demand rather than receiving pre-injected context:

- **Read context** - `getBabyProfile`, `getTodayEvents`, `getSleepHistory`, `getChatHistory`
- **Log events** - `createSleepEvent` (wake, nap_start, nap_end, bedtime, night_wake)
- **Update patterns** - `updatePatternNotes` saves notes about your baby's sleep patterns
- **Generate schedules** - `updateSleepPlan` writes a structured daily plan (current state, next action, schedule, target bedtime, summary) with an `events_hash` used for cache invalidation

Sleep plans are generated by the AI during chat (via `updateSleepPlan`) or regenerated automatically in the background when the plan becomes stale after new events. `GET /api/sleep-plan/[babyId]` fetches the active plan and checks staleness against current events.

## Scripts

```bash
npm run dev            # Start development server
npm run build          # Production build (webpack)
npm run start          # Start production server
npm run lint           # Run ESLint
npm run test           # Run Vitest suite
npm run test:watch     # Run Vitest in watch mode
npm run test:coverage   # Run tests with coverage report
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
4. Deploy

## Documentation

- [CLAUDE.md](CLAUDE.md) - AI assistant guidance for code modifications
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Detailed system architecture
- [docs/adr/](docs/adr/) - Architecture Decision Records (tool-based AI, events-hash cache, broadcast-delete workaround, mock mode, service layer)

## License

MIT
