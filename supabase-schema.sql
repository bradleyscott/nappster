-- Baby Nap Tracker Database Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Babies table
create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date not null,
  sleep_training_method text,
  pattern_notes text,
  created_at timestamp with time zone default now()
);

-- Family members table (links users to babies)
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  baby_id uuid references public.babies(id) on delete cascade not null,
  role text default 'parent',
  created_at timestamp with time zone default now(),
  unique(user_id, baby_id)
);

-- Sleep events table
create table if not exists public.sleep_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references public.babies(id) on delete cascade not null,
  event_type text not null check (event_type in ('wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake')),
  event_time timestamp with time zone not null,
  end_time timestamp with time zone,
  context text check (context is null or context in ('home', 'daycare', 'travel')),
  notes text,
  created_at timestamp with time zone default now()
);

-- Create indexes for common queries
create index if not exists idx_sleep_events_baby_id on public.sleep_events(baby_id);
create index if not exists idx_sleep_events_event_time on public.sleep_events(event_time);
create index if not exists idx_family_members_user_id on public.family_members(user_id);
create index if not exists idx_family_members_baby_id on public.family_members(baby_id);

-- Enable Row Level Security
alter table public.babies enable row level security;
alter table public.family_members enable row level security;
alter table public.sleep_events enable row level security;

-- RLS Policies for babies table
create policy "Users can view babies they are linked to"
  on public.babies for select
  using (
    id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can insert babies"
  on public.babies for insert
  with check (true);

create policy "Users can update their babies"
  on public.babies for update
  using (
    id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- RLS Policies for family_members table
create policy "Users can view their family memberships"
  on public.family_members for select
  using (user_id = auth.uid());

create policy "Users can insert family memberships for themselves"
  on public.family_members for insert
  with check (user_id = auth.uid());

-- RLS Policies for sleep_events table
create policy "Users can view sleep events for their babies"
  on public.sleep_events for select
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can insert sleep events for their babies"
  on public.sleep_events for insert
  with check (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can update sleep events for their babies"
  on public.sleep_events for update
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can delete sleep events for their babies"
  on public.sleep_events for delete
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- Chat messages table (persists conversation history)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references public.babies(id) on delete cascade not null,
  message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null,
  created_at timestamp with time zone default now()
);

-- Index for fetching messages by baby, ordered by time
create index if not exists idx_chat_messages_baby_created on public.chat_messages(baby_id, created_at);

-- Enable Row Level Security
alter table public.chat_messages enable row level security;

-- RLS Policies for chat_messages table
create policy "Users can view chat messages for their babies"
  on public.chat_messages for select
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can insert chat messages for their babies"
  on public.chat_messages for insert
  with check (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );
