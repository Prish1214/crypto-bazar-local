-- ============================================================
-- KryptoBazar — v24 Token waitlist: BEP20 wallet instead of email
-- Run AFTER v22 in: Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- The Krypto Token waitlist now records a BEP20 (BSC) wallet address
-- instead of an email. One wallet address per entry, and one entry per
-- account. At launch, earned KRYPTO is transferred to the address.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'token_waitlist'
  ) then
    -- Fresh install (v22 never ran)
    create table public.token_waitlist (
      id uuid primary key default gen_random_uuid(),
      wallet text not null,
      user_id uuid references auth.users(id) on delete cascade,
      source text not null default 'web',
      created_at timestamptz not null default now()
    );

    grant insert on public.token_waitlist to anon, authenticated;
    grant all on public.token_waitlist to service_role;

    alter table public.token_waitlist enable row level security;

    drop policy if exists "token_waitlist_insert_anyone" on public.token_waitlist;
    create policy "token_waitlist_insert_anyone"
      on public.token_waitlist
      for insert
      to anon, authenticated
      with check (true);
  else
    -- Migrate the v22 email-based table to wallet-based
    alter table public.token_waitlist drop column if exists email cascade;
    alter table public.token_waitlist add column if not exists wallet text;
    alter table public.token_waitlist add column if not exists user_id uuid references auth.users(id) on delete cascade;

    -- Old email-only rows have no wallet; remove them.
    delete from public.token_waitlist where wallet is null;

    alter table public.token_waitlist alter column wallet set not null;

    grant insert on public.token_waitlist to anon, authenticated;
    grant all on public.token_waitlist to service_role;

    alter table public.token_waitlist enable row level security;

    drop policy if exists "token_waitlist_insert_anyone" on public.token_waitlist;
    create policy "token_waitlist_insert_anyone"
      on public.token_waitlist
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

-- Case-insensitive uniqueness: one wallet address on the whole list.
-- (API normalizes to lowercase before insert; ilike lookups match either case.)
create unique index if not exists token_waitlist_wallet_key
  on public.token_waitlist (wallet);

-- One waitlist entry per account.
create unique index if not exists token_waitlist_user_key
  on public.token_waitlist (user_id)
  where user_id is not null;

-- No SELECT / UPDATE / DELETE grants for anon or authenticated:
-- the waitlist stays private; service_role manages it.
