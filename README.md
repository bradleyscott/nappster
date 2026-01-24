# Baby Naps

A PWA for tracking baby sleep and getting AI-powered recommendations for nap times and bedtime. Built to replace a long-running ChatGPT conversation with a purpose-built UX that both parents can use.

## Features

- **Quick Entry UI** - Large tap targets for one-handed use while holding a baby
- **AI Recommendations** - Automatically calculates next nap or bedtime based on logged events
- **AI Chat** - Ask complex questions about sleep schedules, edge cases, and general advice
- **Family Sharing** - Multiple users can track the same baby via Supabase auth
- **Mobile-First Design** - Optimized for phones with PWA support

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| AI | Vercel AI SDK + @ai-sdk/react + OpenAI GPT-4 |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |

## Getting Started

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase-schema.sql`
3. Copy your project URL and anon key from Settings > API

### 2. Configure Environment Variables

Copy `.env.local.example` to `.env` and fill in your values:

```bash
# Supabase - from https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI - from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Home (landing or dashboard)
│   ├── chat/page.tsx            # AI chat interface
│   ├── onboarding/page.tsx      # Baby profile setup
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/route.ts
│   └── api/
│       ├── chat/route.ts        # AI SDK streamText for chat
│       └── recommend/route.ts   # AI SDK streamObject for recommendations
├── components/
│   ├── ui/                      # shadcn/ui components
│   ├── dashboard-content.tsx    # Main dashboard with event buttons
│   ├── chat-content.tsx         # Chat UI with useChat hook
│   ├── recommendation-card.tsx  # AI recommendation with useObject hook
│   ├── timeline.tsx             # Today's sleep events
│   └── sleep-event-button.tsx   # Quick entry buttons
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser Supabase client
│   │   └── server.ts            # Server Supabase client
│   └── sleep-utils.ts           # Age calculation, time formatting
├── types/
│   └── database.ts              # Supabase types
└── middleware.ts                # Auth session refresh
```

## Database Schema

```sql
-- Babies
create table babies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date not null,
  sleep_training_method text,
  pattern_notes text,
  created_at timestamp default now()
);

-- Family members (links users to babies)
create table family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  baby_id uuid references babies(id) on delete cascade,
  role text default 'parent',
  created_at timestamp default now(),
  unique(user_id, baby_id)
);

-- Sleep events
create table sleep_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babies(id) on delete cascade,
  event_type text not null, -- 'wake', 'nap_start', 'nap_end', 'bedtime'
  event_time timestamp not null,
  context text,
  notes text,
  created_at timestamp default now()
);
```

## AI Integration

The app uses Vercel AI SDK UI hooks for all AI interactions:

### useChat (Chat Interface)

```tsx
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

const transport = useMemo(() => new DefaultChatTransport({
  api: '/api/chat',
  body: { babyId: baby.id },
}), [baby.id])

const { messages, sendMessage, status } = useChat({ transport })
```

### useObject (Structured Recommendations)

```tsx
import { experimental_useObject as useObject } from '@ai-sdk/react'

const { object, submit, isLoading } = useObject({
  api: '/api/recommend',
  schema: recommendationSchema,
})
```

## Usage Flow

1. **Sign up** - Create an account with email/password
2. **Onboarding** - Enter baby's name, birthdate, and optional sleep training notes
3. **Log wake time** - Start the day by logging when baby woke up
4. **Log naps** - Tap "Nap Started" and "Nap Ended" throughout the day
5. **Get recommendations** - AI automatically suggests next nap or bedtime
6. **Ask questions** - Use the chat for complex situations like "She had a car nap at 4pm, what now?"

## Deploy on Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## License

MIT
