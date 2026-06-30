-- ============================================================
-- CryptoBazar — schema v11 (wallet precision + deposit/withdrawal fixes)
-- Run AFTER schema-v5-custody.sql and later deal/chat migrations.
-- Purpose:
--   • preserve USDT amounts up to 8 decimals in wallet ledgers
--   • credit deposits from the real on-chain paid amount
--   • keep withdrawal callbacks idempotent and safe
-- ============================================================

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

  select * into _existing from public.deposits
    where nowpayments_payment_id = _nowpayments_payment_id
    for update;

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
          'Deposit ' || upper(_network) || ' · ' || coalesce(substr(_tx_hash,1,10), 'confirmed'));
end;
$$;

revoke all on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.credit_deposit(uuid, numeric, text, text, text, jsonb) to service_role;

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

  if _status in ('failed','rejected') and _w.status not in ('failed','rejected') then
    update public.wallets
       set balance = round((balance + _w.amount)::numeric, 8),
           updated_at = now()
     where user_id = _w.user_id;

    insert into public.transactions (user_id, type, amount, network, description)
    values (_w.user_id, 'deposit', _w.amount, _w.network,
            'Withdrawal refund (' || _status || ')');
  end if;
end;
$$;

revoke all on function public.update_withdrawal_status(text, text, text, jsonb) from public;
grant execute on function public.update_withdrawal_status(text, text, text, jsonb) to service_role;