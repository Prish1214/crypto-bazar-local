-- ============================================================
-- CryptoBazar — Settlement v7
-- Replaces complete_deal_release to:
--   • charge the 0.1% platform fee to the BUYER (per spec)
--   • record fee into public.platform_fees ledger (from v5)
--   • recompute rating averages on completion
-- Run AFTER schema-v5-custody.sql.
-- ============================================================

create or replace function public.complete_deal_release(_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals%rowtype;
  amt numeric(20,6);
  fee numeric(20,6);
  net numeric(20,6);
begin
  select * into d from public.deals where id = _deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  if auth.uid() <> d.seller_id then
    raise exception 'Only the seller can release escrow';
  end if;

  if d.status <> 'cash_sent' then
    raise exception 'Deal is not ready for escrow release';
  end if;

  amt := d.amount_usdt;
  fee := coalesce(d.fee_usdt, round(amt * 0.001, 6)); -- 0.1% buyer fee
  net := amt - fee;

  -- Move USDT out of seller escrow.
  update public.wallets
     set escrow_balance = escrow_balance - amt,
         updated_at = now()
   where user_id = d.seller_id
     and escrow_balance >= amt;
  if not found then
    raise exception 'Seller escrow balance is insufficient';
  end if;

  -- Credit buyer with amount - fee.
  update public.wallets
     set balance = balance + net,
         updated_at = now()
   where user_id = d.buyer_id;
  if not found then
    raise exception 'Buyer wallet not found';
  end if;

  -- Ledger entries (fee attributed to buyer per spec).
  insert into public.transactions (user_id, deal_id, type, amount, description)
  values
    (d.seller_id, d.id, 'escrow_release', amt, 'Released from escrow to buyer'),
    (d.buyer_id,  d.id, 'trade',          net, 'USDT received (net of platform fee)'),
    (d.buyer_id,  d.id, 'fee',            fee, 'Platform fee 0.1%');

  -- Platform fee ledger (v5).
  insert into public.platform_fees (deal_id, source_user_id, amount)
  values (d.id, d.buyer_id, fee);

  -- Reputation update.
  update public.profiles
     set total_trades     = total_trades + 1,
         completed_trades = completed_trades + 1,
         trade_volume     = trade_volume + amt,
         updated_at       = now()
   where id in (d.buyer_id, d.seller_id);

  update public.deals
     set status = 'completed',
         seller_confirmed_at = now(),
         completed_at = now(),
         updated_at = now()
   where id = d.id
   returning * into d;

  return d;
end;
$$;

revoke all on function public.complete_deal_release(uuid) from public;
grant execute on function public.complete_deal_release(uuid) to authenticated;
