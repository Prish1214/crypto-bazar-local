-- ============================================================
-- CryptoBazar — v20 zero trade fees
-- Trading fee is now 0%. complete_deal_release credits the buyer
-- the FULL deal amount and no longer writes platform_fees entries.
-- Run AFTER schema-v7-settlement.sql. Idempotent / safe to re-run.
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

  -- Move USDT out of seller escrow.
  update public.wallets
     set escrow_balance = escrow_balance - amt,
         updated_at = now()
   where user_id = d.seller_id
     and escrow_balance >= amt;
  if not found then
    raise exception 'Seller escrow balance is insufficient';
  end if;

  -- Credit buyer with the full amount (0% fee).
  update public.wallets
     set balance = balance + amt,
         updated_at = now()
   where user_id = d.buyer_id;
  if not found then
    raise exception 'Buyer wallet not found';
  end if;

  -- Ledger entries (no fee rows — trading is fee-free).
  insert into public.transactions (user_id, deal_id, type, amount, description)
  values
    (d.seller_id, d.id, 'escrow_release', amt, 'Released from escrow to buyer'),
    (d.buyer_id,  d.id, 'trade',          amt, 'USDT received');

  -- Reputation update.
  update public.profiles
     set total_trades     = total_trades + 1,
         completed_trades = completed_trades + 1,
         trade_volume     = trade_volume + amt,
         updated_at       = now()
   where id in (d.buyer_id, d.seller_id);

  update public.deals
     set status = 'completed',
         fee_usdt = 0,
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
