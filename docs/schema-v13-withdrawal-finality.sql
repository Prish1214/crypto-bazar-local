-- ============================================================
-- CryptoBazar — schema v13 (withdrawal finality fix)
-- Run this whole file in Supabase SQL Editor after v12.
--
-- Purpose:
--   • NOWPayments shows custody write-offs as "Withdrawal to master".
--     That is only an internal custody→master movement, NOT the user's
--     external withdrawal to their requested address.
--   • Keep app withdrawals as processing until the external payout has an
--     on-chain transaction hash.
--   • Repair old rows that were incorrectly marked completed from a
--     write-off/master event or from a final status without a tx hash.
-- ============================================================

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
  _raw_safe jsonb := coalesce(_raw, '{}'::jsonb);
  _kind text := lower(concat_ws(' ',
    _raw_safe->>'transaction_type',
    _raw_safe->>'type',
    _raw_safe->>'operation',
    _raw_safe->>'event',
    _raw_safe->>'description',
    _raw_safe->'result'->>'transaction_type',
    _raw_safe->'result'->>'type'
  ));
  _final_tx text := nullif(coalesce(
    _tx_hash,
    _raw_safe->>'hash',
    _raw_safe->>'tx_hash',
    _raw_safe->>'txid',
    _raw_safe->>'transaction_hash',
    _raw_safe->>'withdrawal_hash',
    _raw_safe->>'payout_hash',
    _raw_safe->'withdrawals'->0->>'hash',
    _raw_safe->'withdrawals'->0->>'tx_hash',
    _raw_safe->'result'->'withdrawals'->0->>'hash',
    _raw_safe->'result'->'withdrawals'->0->>'tx_hash'
  ), '');
begin
  if _payout_id is null or length(_payout_id) = 0 then return; end if;

  -- Ignore internal custody movement callbacks. They may be "finished", but
  -- the user has not received funds on their requested address yet.
  if _kind ~ 'withdrawal\s*to\s*master|write[-_\s]*off|sub[-_\s]*partner' then
    return;
  end if;

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
    -- Final only when the external on-chain payout hash exists.
    if _final_tx is not null and length(_final_tx) > 8 then
      _mapped := 'completed';
    else
      _mapped := 'processing';
    end if;
  elsif _mapped in ('failed','rejected','rejected_not_checked') then
    _mapped := 'failed';
  else
    _mapped := 'processing';
  end if;

  update public.withdrawals
     set status = _mapped,
         tx_hash = coalesce(_final_tx, tx_hash),
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('last_payout_ipn', _raw_safe),
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

-- One-time repair: completed withdrawals without a real on-chain payout hash
-- are moved back to processing so the app can keep retrying/polling instead
-- of showing a false success.
create or replace function public.repair_false_completed_withdrawals()
returns table(withdrawal_id uuid, old_status text, new_status text)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, status
    from public.withdrawals
    where status = 'completed'
      and (
        tx_hash is null
        or length(tx_hash) <= 8
        or lower(coalesce(raw->>'transaction_type','') || ' ' || coalesce(raw->>'type','') || ' ' || coalesce(raw->>'description',''))
           ~ 'withdrawal\s*to\s*master|write[-_\s]*off|sub[-_\s]*partner'
      )
  loop
    update public.withdrawals
       set status = 'processing',
           tx_hash = null,
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
             'repair_v13', jsonb_build_object(
               'reason', 'Completed status came from master/write-off or had no external payout hash',
               'repaired_at', now()
             )
           ),
           updated_at = now()
     where id = r.id;

    withdrawal_id := r.id;
    old_status := r.status;
    new_status := 'processing';
    return next;
  end loop;
end;
$$;

revoke all on function public.repair_false_completed_withdrawals() from public;
grant execute on function public.repair_false_completed_withdrawals() to service_role;

-- Run after this migration if any old withdrawal shows false completed:
-- select * from public.repair_false_completed_withdrawals();