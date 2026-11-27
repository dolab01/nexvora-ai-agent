-- NEXVORA operational dashboard tables
-- Run this once in Supabase Dashboard → SQL Editor → New query.
create extension if not exists pgcrypto;

create table if not exists public.nexvora_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 180),
  description text not null default '',
  status text not null default 'queued'
    check (status in ('queued','in_progress','completed','failed','cancelled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high')),
  source text not null default 'dashboard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexvora_approvals (
  id uuid primary key default gen_random_uuid(),
  action_type text not null default 'external_action',
  title text not null check (char_length(title) <= 180),
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.nexvora_activity (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists nexvora_tasks_created_idx on public.nexvora_agent_tasks (created_at desc);
create index if not exists nexvora_approvals_created_idx on public.nexvora_approvals (created_at desc);
create index if not exists nexvora_activity_created_idx on public.nexvora_activity (created_at desc);

alter table public.nexvora_agent_tasks enable row level security;
alter table public.nexvora_approvals enable row level security;
alter table public.nexvora_activity enable row level security;

-- No public policies are created. The server accesses these tables using
-- the Supabase service-role key, which must remain private in Render.

-- Keep the service-role key as the only application access path.
revoke all on public.nexvora_agent_tasks from anon, authenticated;
revoke all on public.nexvora_approvals from anon, authenticated;
revoke all on public.nexvora_activity from anon, authenticated;
grant all on public.nexvora_agent_tasks to service_role;
grant all on public.nexvora_approvals to service_role;
grant all on public.nexvora_activity to service_role;
