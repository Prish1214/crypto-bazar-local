-- ============================================================
-- KryptoBazar — v21 Cash Deposit Machine (CDM) support
-- Run AFTER all previous migrations (v1…v20) in: Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. Listings: optional CDM acceptance with a masked bank summary ----
-- Listings are publicly readable, so ONLY non-sensitive fields live
-- here: bank name, last 4 digits of the account, IFSC, holder name.
alter table public.listings
  add column if not exists cdm_enabled boolean not null default false,
  add column if not exists cdm_bank_name text,
  add column if not exists cdm_bank_account_last4 text,
  add column if not exists cdm_ifsc text,
  add column if not exists cdm_holder_name text,
  add column if not exists cdm_instructions text;

-- 2. Bank accounts: full account numbers, owner-only ------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  bank_name text not null,
  account_number text not null,
  ifsc text not null,
  holder_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.bank_accounts to authenticated;
grant all on public.bank_accounts to service_role;

alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts_select_own" on public.bank_accounts;
create policy "bank_accounts_select_own" on public.bank_accounts for select
  using (auth.uid() = user_id);
drop policy if exists "bank_accounts_insert_own" on public.bank_accounts;
create policy "bank_accounts_insert_own" on public.bank_accounts for insert
  with check (auth.uid() = user_id);
drop policy if exists "bank_accounts_update_own" on public.bank_accounts;
create policy "bank_accounts_update_own" on public.bank_accounts for update
  using (auth.uid() = user_id);
drop policy if exists "bank_accounts_delete_own" on public.bank_accounts;
create policy "bank_accounts_delete_own" on public.bank_accounts for delete
  using (auth.uid() = user_id);

-- 3. Deals: payment method + CDM state ---------------------------------
alter table public.deals
  add column if not exists payment_method text not null default 'cash',
  add column if not exists cdm_bank_name text,
  add column if not exists cdm_bank_account text,
  add column if not exists cdm_ifsc text,
  add column if not exists cdm_holder_name text,
  add column if not exists cdm_receipt_url text,
  add column if not exists cdm_receipt_uploaded_at timestamptz,
  add column if not exists cdm_verified_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'deals_payment_method_check'
  ) then
    alter table public.deals
      add constraint deals_payment_method_check check (payment_method in ('cash','cdm'));
  end if;
exception when others then null; end $$;

-- 4. Copy the seller's bank details onto the CDM deal the moment it
--    leaves 'pending' (seller accepted). Full account numbers live on
--    the participant-scoped deal row, never on the public listing.
create or replace function public.fill_cdm_bank_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ba public.bank_accounts%rowtype;
begin
  if new.payment_method is distinct from 'cdm' then return new; end if;
  if new.cdm_bank_account is not null then return new; end if;

  select * into ba
    from public.bank_accounts
   where user_id = new.seller_id
   order by updated_at desc
   limit 1;

  if found then
    new.cdm_bank_name    := ba.bank_name;
    new.cdm_bank_account := ba.account_number;
    new.cdm_ifsc         := ba.ifsc;
    new.cdm_holder_name  := ba.holder_name;
  end if;

  return new;
end;
$$;

drop trigger if exists deals_fill_cdm_bank_details on public.deals;
create trigger deals_fill_cdm_bank_details
  before update on public.deals
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.fill_cdm_bank_details();

-- SAFETY: there is NO auto-release path for CDM deals. Escrow is only
-- released by the seller's explicit confirmation (existing
-- complete_deal_release RPC) after they verify the bank credit.
