-- ============================================================
-- v22 — Krypto Token waitlist
-- Run this in the Supabase SQL editor.
-- Stores waitlist emails for the Krypto Token launch page (/token).
-- ============================================================

create table if not exists public.token_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

-- Write access for visitors (join the waitlist); only service_role reads.
GRANT INSERT ON public.token_waitlist TO anon, authenticated;
GRANT ALL ON public.token_waitlist TO service_role;

alter table public.token_waitlist enable row level security;

drop policy if exists "token_waitlist_insert_anyone" on public.token_waitlist;
create policy "token_waitlist_insert_anyone"
  on public.token_waitlist
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT / UPDATE / DELETE grants for anon or authenticated:
-- the waitlist email list stays private; service_role manages it.
