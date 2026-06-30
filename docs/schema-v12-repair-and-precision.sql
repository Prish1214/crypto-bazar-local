-- ============================================================
-- CryptoBazar — schema v12 (FINAL wallet repair + safe deposits/withdrawals)
-- Run this whole file in Supabase SQL Editor after v5/v11.
--
-- Fixes:
--   1) Stops the 100000/notional NOWPayments address amount from being credited.
--   2) Repairs wallets that were already credited with that fake notional amount.
--   3) Adds atomic wallet debit/refund RPCs used by withdrawals.
--   4) Makes withdrawal IPNs/status updates match either batch id or item id.
-- ============================================================

-- Keep all money columns at 8 decimals.
alter table public.wallets
  alter column balance type numeric(20,8) using round(balance::numeric, 8),
  alter column escrow_balance type numeric(20,8) using round(escrow_balance::numeric, 8);

alter table public.deposits
  alter column amount type numeric(20,8) using round(amount::numeric, 8);

alter table public.withdrawals
  alter column amount type numeric(20,8) using round(amount::numeric, 8),
  alter column fee type numeric(20,8) using round(fee::numeric, 8),
  alter column net_amount type numeric(20,8) using round(net_amount::numeric, 8);

alter table public.transactions
  alter column amount type numeric(20,8) using round(amount::numeric, 8);

insert into public.wallets (user_id)
select u.id from auth.users u
left join public.wallets w on w.user_id = u.id
where w.id is null
on conflict do nothing;

create index if not exists withdrawals_payout_id_idx on public.withdrawals(nowpayments_payout_id);

-- ------------------------------------------------------------
-- Atomic wallet operations for server-side withdrawal flow.
-- ------------------------------------------------------------
create or replace function public.lock_wallet_balance(
  _user_id uuid,
  _amount numeric
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  _new_balance numeric(20,8);
  _amt numeric(20,8) := round(_amount::numeric, 8);
begin
  if _user_id is null then raise exception 'Missing user'; end if;
  if _amt is null or _amt <= 0 then raise exception 'Invalid amount'; end if;

  insert into public.wallets (user_id) values (_user_id) on conflict do nothing;

  update public.wallets
     set balance = round((balance - _amt)::numeric, 8),
         updated_at = now()
   where user_id = _user_id
     and balance >= _amt
   returning balance into _new_balance;

  if _new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  return _new_balance;
end;
$$;

revoke all on function public.lock_wallet_balance(uuid, numeric) from public;
grant execute on function public.lock_wallet_balance(uuid, numeric) to service_role;

create or replace function public.refund_wallet_balance(
  _user_id uuid,
  _amount numeric
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  _new_balance numeric(20,8);
  _amt numeric(20,8) := round(_amount::numeric, 8);
begin
  if _user_id is null then raise exception 'Missing user'; end if;
  if _amt is null or _amt <= 0 then raise exception 'Invalid amount'; end if;

  insert into public.wallets (user_id) values (_user_id) on conflict do nothing;

  update public.wallets
     set balance = round((balance + _amt)::numeric, 8),
         updated_at = now()
   where user_id = _user_id
   returning balance into _new_balance;

  return _new_balance;
end;
$$;

revoke all on function public.refund_wallet_balance(uuid, numeric) from public;
grant execute on function public.refund_wallet_balance(uuid, numeric) to service_role;

-- ------------------------------------------------------------
-- Safe deposit crediting.
-- IMPORTANT: the app now sends only actually_paid/outcome_amount to this RPC.
-- This RPC also rejects any accidental notional 99000+ amount.
-- ------------------------------------------------------------
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
  _existing public.deposits%rowtype;
  _credit numeric(20,8) := round(_amount::numeric, 8);
begin
  if _user_id is null then raise exception 'Missing user'; end if;
  if _credit is null or _credit <= 0 then raise exception 'Invalid deposit amount'; end if;
  if _credit >= 99000 then raise exception 'Refusing notional deposit amount'; end if;

  select * into _existing
    from public.deposits
   where nowpayments_payment_id = _nowpayments_payment_id
   for update;

  -- Already credited: idempotent no-op.
  if found and _existing.status = 'completed' then
    return;
  end if;

  insert into public.wallets (user_id) values (_user_id) on conflict do nothing;

  update public.wallets
     set balance = round((balance + _credit)::numeric, 8),
         updated_at = now()
   where user_id = _user_id;

  insert into public.deposits
    (user_id, network, amount, tx_hash, nowpayments_payment_id, status, credited_at, raw)
  values
    (_user_id, _network, _credit, _tx_hash, _nowpayments_payment_id, 'completed', now(), _raw)
  on conflict (nowpayments_payment_id) do update
     set amount = excluded.amount,
         status = 'completed',
         credited_at = coalesce(public.deposits.credited_at, now()),
         tx_hash = excluded.tx_hash,
         raw = excluded.raw;

  insert into public.transactions (user_id, type, amount, network, tx_hash, description)
  values (_user_id, 'deposit', _credit, _network, _tx_hash,
          'Deposit ' || upper(coalesce(_network, 'USDT')) || ' · ' || coalesce(substr(_tx_hash,1,10), 'confirmed'));
end;
$$;

revoke all on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- Withdrawal IPN/status update. Matches both NOWPayments batch id and item id,
-- and refunds only once on final failure/rejection.
-- ------------------------------------------------------------
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
  _mapped text := lower(coalesce(_status, 'processing'));
begin
  if _payout_id is null or length(_payout_id) = 0 then return; end if;

  select * into _w
    from public.withdrawals
   where nowpayments_payout_id = _payout_id
      or raw->>'id' = _payout_id
      or raw->'result'->>'id' = _payout_id
      or raw->'withdrawals'->0->>'id' = _payout_id
      or raw->'result'->'withdrawals'->0->>'id' = _payout_id
      or raw->'payout'->>'id' = _payout_id
      or raw->'payout'->'withdrawals'->0->>'id' = _payout_id
   order by created_at desc
   limit 1
   for update;

  if not found then return; end if;

  if _mapped in ('finished','sent','completed') then
    _mapped := 'completed';
  elsif _mapped in ('failed','rejected','rejected_not_checked') then
    _mapped := 'failed';
  else
    _mapped := 'processing';
  end if;

  update public.withdrawals
     set status = _mapped,
         tx_hash = coalesce(_tx_hash, tx_hash),
         raw = coalesce(_raw, raw),
         updated_at = now()
   where id = _w.id;

  if _mapped = 'failed' and _w.status not in ('failed','rejected') then
    update public.wallets
       set balance = round((balance + _w.amount)::numeric, 8),
           updated_at = now()
     where user_id = _w.user_id;

    insert into public.transactions (user_id, type, amount, network, description)
    values (_w.user_id, 'deposit', _w.amount, _w.network,
            'Withdrawal refund (provider failed)');
  end if;
end;
$$;

revoke all on function public.update_withdrawal_status(text, text, text, jsonb) from public;
grant execute on function public.update_withdrawal_status(text, text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- One-time repair for wallets that were credited with the 100000 notional
-- address ceiling. Run:
--   select * from public.repair_notional_deposits();
-- Optional single user:
--   select * from public.repair_notional_deposits('USER_UUID_HERE');
-- ------------------------------------------------------------
create table if not exists public.wallet_repair_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  before_balance numeric(20,8) not null,
  removed_amount numeric(20,8) not null,
  after_balance numeric(20,8) not null,
  details jsonb,
  created_at timestamptz not null default now()
);

grant select on public.wallet_repair_audit to authenticated;
grant all on public.wallet_repair_audit to service_role;
alter table public.wallet_repair_audit enable row level security;

drop policy if exists wallet_repair_audit_select_own on public.wallet_repair_audit;
create policy wallet_repair_audit_select_own on public.wallet_repair_audit
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create or replace function public.repair_notional_deposits(_only_user_id uuid default null)
returns table(user_id uuid, before_balance numeric, removed_amount numeric, after_balance numeric)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  d record;
  _before numeric(20,8);
  _after numeric(20,8);
  _remove numeric(20,8);
  _corrected numeric(20,8);
  _total_remove numeric(20,8);
begin
  create temp table if not exists _notional_fix (
    deposit_id uuid,
    user_id uuid,
    old_amount numeric(20,8),
    corrected_amount numeric(20,8)
  ) on commit drop;
  truncate _notional_fix;

  insert into _notional_fix (deposit_id, user_id, old_amount, corrected_amount)
  select
    d.id,
    d.user_id,
    round(d.amount::numeric, 8),
    round(coalesce(
      case when nullif(d.raw->>'actually_paid','')::numeric > 0 and nullif(d.raw->>'actually_paid','')::numeric < 99000 then nullif(d.raw->>'actually_paid','')::numeric end,
      case when nullif(d.raw->>'actual_paid','')::numeric > 0 and nullif(d.raw->>'actual_paid','')::numeric < 99000 then nullif(d.raw->>'actual_paid','')::numeric end,
      case when nullif(d.raw->>'paid_amount','')::numeric > 0 and nullif(d.raw->>'paid_amount','')::numeric < 99000 then nullif(d.raw->>'paid_amount','')::numeric end,
      case when nullif(d.raw->>'outcome_amount','')::numeric > 0 and nullif(d.raw->>'outcome_amount','')::numeric < 99000 then nullif(d.raw->>'outcome_amount','')::numeric end,
      0
    )::numeric, 8)
  from public.deposits d
  where d.status = 'completed'
    and d.amount >= 99000
    and (_only_user_id is null or d.user_id = _only_user_id);

  -- Correct the bad deposit rows first.
  for d in select * from _notional_fix loop
    update public.deposits
       set amount = d.corrected_amount,
           status = case when d.corrected_amount > 0 then 'completed' else 'failed' end,
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
             'repair_v12', jsonb_build_object(
               'old_amount', d.old_amount,
               'corrected_amount', d.corrected_amount,
               'repaired_at', now()
             )
           )
     where id = d.deposit_id;
  end loop;

  -- Remove the fake difference from each affected wallet.
  for r in
    select nf.user_id, round(sum(nf.old_amount - nf.corrected_amount)::numeric, 8) as remove_amount
    from _notional_fix nf
    where nf.old_amount > nf.corrected_amount
    group by nf.user_id
  loop
    select balance into _before from public.wallets where wallets.user_id = r.user_id for update;
    _remove := round(r.remove_amount::numeric, 8);
    _after := greatest(0, round((_before - _remove)::numeric, 8));

    update public.wallets
       set balance = _after,
           updated_at = now()
     where wallets.user_id = r.user_id;

    update public.transactions
       set amount = 0,
           description = coalesce(description, 'Deposit') || ' · corrected invalid notional NOWPayments amount'
     where transactions.user_id = r.user_id
       and transactions.type = 'deposit'
       and transactions.amount >= 99000;

    insert into public.wallet_repair_audit
      (user_id, reason, before_balance, removed_amount, after_balance, details)
    values
      (r.user_id, 'Removed NOWPayments notional deposit credit', _before, _remove, _after,
       (select jsonb_agg(jsonb_build_object(
          'deposit_id', nf.deposit_id,
          'old_amount', nf.old_amount,
          'corrected_amount', nf.corrected_amount
        )) from _notional_fix nf where nf.user_id = r.user_id));

    user_id := r.user_id;
    before_balance := _before;
    removed_amount := _remove;
    after_balance := _after;
    return next;
  end loop;
end;
$$;

revoke all on function public.repair_notional_deposits(uuid) from public;
grant execute on function public.repair_notional_deposits(uuid) to service_role;

-- If you are running this as Supabase owner in SQL Editor, execute this line
-- after the migration to immediately fix existing wrong balances:
-- select * from public.repair_notional_deposits();
