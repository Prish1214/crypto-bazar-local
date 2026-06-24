-- ============================================================
-- CryptoBazar — schema v5 (Wallet Custody, multi-network deposits,
-- NOWPayments deposits/withdrawals, internal transfers, fee ledger)
-- Run in: Supabase SQL Editor.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- 1. Profile extension: NOWPayments sub-partner id (one per user).
alter table public.profiles
  add column if not exists nowpayments_sub_partner_id text;

-- 2. Permanent deposit addresses (one per user per network).
create table if not exists public.deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('trc20','bep20','erc20','polygon')),
  currency text not null,            -- usdttrc20 / usdtbsc / usdterc20 / usdtmatic
  address text not null,
  payment_id text,                   -- NOWPayments payment_id (if any)
  created_at timestamptz not null default now(),
  unique (user_id, network)
);
create index if not exists deposit_addresses_user_idx on public.deposit_addresses(user_id);

-- 3. Deposits ledger (raw blockchain events, one row per detected tx).
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null,
  amount numeric(20,6) not null,
  tx_hash text,
  nowpayments_payment_id text unique,    -- idempotency key
  status text not null default 'pending',-- pending | confirming | completed | failed
  credited_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists deposits_user_idx on public.deposits(user_id, created_at desc);

-- 4. Withdrawals ledger.
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null,
  address text not null,
  amount numeric(20,6) not null,
  fee numeric(20,6) not null default 0,
  net_amount numeric(20,6) not null,
  status text not null default 'pending',-- pending | processing | completed | failed | rejected
  nowpayments_payout_id text,
  tx_hash text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists withdrawals_user_idx on public.withdrawals(user_id, created_at desc);

-- 5. Platform fee ledger (where the 0.1% goes).
create table if not exists public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  source_user_id uuid references auth.users(id) on delete set null,
  amount numeric(20,6) not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_fees_deal_idx on public.platform_fees(deal_id);

-- 6. Transactions: add columns for richer history.
alter table public.transactions
  add column if not exists network text,
  add column if not exists tx_hash text,
  add column if not exists reference_id uuid;

-- ============================================================
-- GRANTS
-- ============================================================
grant select, insert, update on public.deposit_addresses to authenticated;
grant all   on public.deposit_addresses to service_role;

grant select on public.deposits to authenticated;
grant all   on public.deposits to service_role;

grant select, insert on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;

grant select on public.platform_fees to authenticated;
grant all   on public.platform_fees to service_role;

-- ============================================================
-- RLS
-- ============================================================
alter table public.deposit_addresses enable row level security;
alter table public.deposits          enable row level security;
alter table public.withdrawals       enable row level security;
alter table public.platform_fees     enable row level security;

drop policy if exists deposit_addresses_select_own on public.deposit_addresses;
create policy deposit_addresses_select_own on public.deposit_addresses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists deposit_addresses_insert_own on public.deposit_addresses;
create policy deposit_addresses_insert_own on public.deposit_addresses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists deposit_addresses_update_own on public.deposit_addresses;
create policy deposit_addresses_update_own on public.deposit_addresses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists deposits_select_own on public.deposits;
create policy deposits_select_own on public.deposits
  for select using (auth.uid() = user_id);

drop policy if exists withdrawals_select_own on public.withdrawals;
create policy withdrawals_select_own on public.withdrawals
  for select using (auth.uid() = user_id);

drop policy if exists withdrawals_insert_own on public.withdrawals;
create policy withdrawals_insert_own on public.withdrawals
  for insert with check (auth.uid() = user_id);

drop policy if exists platform_fees_admin on public.platform_fees;
create policy platform_fees_admin on public.platform_fees
  for select using (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- RPCs
-- ============================================================

-- Atomic internal transfer @user -> @user. Caller is sender.
create or replace function public.internal_transfer(
  _recipient_username text,
  _amount numeric,
  _note text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  _sender uuid := auth.uid();
  _recipient uuid;
  _new_sender_balance numeric;
begin
  if _sender is null then raise exception 'Not authenticated'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Invalid amount'; end if;

  select id into _recipient from public.profiles
    where lower(username) = lower(regexp_replace(_recipient_username, '^@', ''));
  if _recipient is null then raise exception 'Recipient not found'; end if;
  if _recipient = _sender then raise exception 'Cannot transfer to yourself'; end if;

  -- Ensure both wallets exist.
  insert into public.wallets (user_id) values (_recipient) on conflict do nothing;
  insert into public.wallets (user_id) values (_sender)    on conflict do nothing;

  update public.wallets
     set balance = balance - _amount, updated_at = now()
   where user_id = _sender and balance >= _amount
  returning balance into _new_sender_balance;
  if _new_sender_balance is null then raise exception 'Insufficient balance'; end if;

  update public.wallets
     set balance = balance + _amount, updated_at = now()
   where user_id = _recipient;

  insert into public.transactions (user_id, type, amount, description) values
    (_sender,    'transfer', _amount,
       'Sent to @' || _recipient_username || coalesce(' · ' || _note, '')),
    (_recipient, 'transfer', _amount,
       'Received from ' ||
       coalesce((select '@' || username from public.profiles where id = _sender), 'a user') ||
       coalesce(' · ' || _note, ''));
end;
$$;

revoke all on function public.internal_transfer(text, numeric, text) from public;
grant execute on function public.internal_transfer(text, numeric, text) to authenticated;

-- Credit a confirmed deposit (called by webhook with service-role; idempotent).
create or replace function public.credit_deposit(
  _user_id uuid,
  _amount numeric,
  _network text,
  _tx_hash text,
  _nowpayments_payment_id text,
  _raw jsonb default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  _existing uuid;
begin
  -- Idempotency: skip if already credited.
  select id into _existing from public.deposits
    where nowpayments_payment_id = _nowpayments_payment_id and status = 'completed';
  if _existing is not null then return; end if;

  insert into public.wallets (user_id) values (_user_id) on conflict do nothing;
  update public.wallets
     set balance = balance + _amount, updated_at = now()
   where user_id = _user_id;

  insert into public.deposits
    (user_id, network, amount, tx_hash, nowpayments_payment_id, status, credited_at, raw)
  values
    (_user_id, _network, _amount, _tx_hash, _nowpayments_payment_id, 'completed', now(), _raw)
  on conflict (nowpayments_payment_id) do update
     set status = 'completed', credited_at = now(), tx_hash = excluded.tx_hash, raw = excluded.raw;

  insert into public.transactions (user_id, type, amount, network, tx_hash, description)
  values (_user_id, 'deposit', _amount, _network, _tx_hash,
          'Deposit ' || upper(_network) || ' · ' || substr(_tx_hash,1,10));
end;
$$;

revoke all on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) to service_role;

-- Update withdrawal status from NOWPayments callback.
create or replace function public.update_withdrawal_status(
  _payout_id text,
  _status text,
  _tx_hash text default null,
  _raw jsonb default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  _w public.withdrawals%rowtype;
begin
  select * into _w from public.withdrawals where nowpayments_payout_id = _payout_id for update;
  if not found then return; end if;

  update public.withdrawals
     set status = _status,
         tx_hash = coalesce(_tx_hash, tx_hash),
         raw = coalesce(_raw, raw),
         updated_at = now()
   where id = _w.id;

  -- Refund on failure.
  if _status in ('failed','rejected') and _w.status <> _status then
    update public.wallets set balance = balance + _w.amount, updated_at = now()
      where user_id = _w.user_id;
    insert into public.transactions (user_id, type, amount, network, description)
      values (_w.user_id, 'deposit', _w.amount, _w.network,
              'Withdrawal refund (' || _status || ')');
  end if;
end;
$$;

revoke all on function public.update_withdrawal_status(text, text, text, jsonb) from public;
grant execute on function public.update_withdrawal_status(text, text, text, jsonb) to service_role;

-- Realtime
alter publication supabase_realtime add table public.deposits;
alter publication supabase_realtime add table public.withdrawals;
