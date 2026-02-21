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

-- Sleep plans table (persists AI-generated sleep schedules, shared across family members)
create table if not exists public.sleep_plans (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references public.babies(id) on delete cascade not null,
  current_state text not null check (current_state in ('awaiting_morning_wake', 'overnight_sleep', 'daytime_awake', 'daytime_napping')),
  next_action jsonb not null,
  schedule jsonb not null,
  target_bedtime text not null,
  summary text not null,
  events_hash text not null,
  plan_date date not null default current_date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

-- Index for fetching active plan by baby
create index if not exists idx_sleep_plans_baby_active on public.sleep_plans(baby_id, is_active, created_at desc);

-- Index for history queries by date
create index if not exists idx_sleep_plans_baby_date on public.sleep_plans(baby_id, plan_date);

-- Enable Row Level Security
alter table public.sleep_plans enable row level security;

-- RLS Policies for sleep_plans table
create policy "Users can view sleep plans for their babies"
  on public.sleep_plans for select
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can insert sleep plans for their babies"
  on public.sleep_plans for insert
  with check (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "Users can update sleep plans for their babies"
  on public.sleep_plans for update
  using (
    baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- Invite codes table (for sharing baby access with family members)
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references public.babies(id) on delete cascade not null,
  code text not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  expires_at timestamp with time zone not null,
  used_by uuid references auth.users(id),
  used_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Unique index on code for fast lookup during redemption
create unique index if not exists idx_invite_codes_code on public.invite_codes(code);
-- Index for finding codes by creator
create index if not exists idx_invite_codes_created_by on public.invite_codes(created_by);

-- Enable Row Level Security
alter table public.invite_codes enable row level security;

-- RLS Policies for invite_codes table
create policy "Users can view their own invite codes"
  on public.invite_codes for select
  using (created_by = auth.uid());

create policy "Family members can create invite codes"
  on public.invite_codes for insert
  with check (
    created_by = auth.uid()
    and baby_id in (
      select baby_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- Database function for redeeming invite codes
-- Uses SECURITY DEFINER to bypass RLS so the redeeming user can look up
-- a code they didn't create, and atomically create a family_members entry
create or replace function public.redeem_invite_code(
  invite_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row invite_codes%rowtype;
  v_user_id uuid;
  v_existing_member family_members%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Look up and lock the code row
  select * into v_code_row
  from invite_codes
  where code = invite_code
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid invite code');
  end if;

  if v_code_row.used_by is not null then
    return jsonb_build_object('success', false, 'error', 'This invite code has already been used');
  end if;

  if v_code_row.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'This invite code has expired');
  end if;

  -- Check if user is already a family member of this baby
  select * into v_existing_member
  from family_members
  where user_id = v_user_id and baby_id = v_code_row.baby_id;

  if found then
    return jsonb_build_object('success', false, 'error', 'You are already linked to this baby');
  end if;

  -- Create family_members link
  insert into family_members (user_id, baby_id, role)
  values (v_user_id, v_code_row.baby_id, 'parent');

  -- Mark code as used
  update invite_codes
  set used_by = v_user_id, used_at = now()
  where id = v_code_row.id;

  return jsonb_build_object(
    'success', true,
    'baby_id', v_code_row.baby_id
  );
end;
$$;

-- Enable Realtime for multi-family member synchronization
-- This allows changes made by one family member to appear in realtime for others
-- Note: Can also be enabled via Supabase Dashboard > Database > Replication
alter publication supabase_realtime add table public.sleep_events;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.sleep_plans;
