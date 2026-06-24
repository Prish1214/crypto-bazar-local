-- ============================================================
-- CryptoBazar — v4 deal flow fixes (additive / safe to re-run)
-- Run AFTER docs/schema.sql, schema-v2-dealroom.sql, schema-v3-extras.sql
-- in: Supabase SQL Editor.
-- ============================================================

-- 1. Deal creation must work from either side of a listing.
-- If a seller clicks a BUY listing, the signed-in user is seller_id,
-- so the old buyer-only insert policy blocked the deal.
drop policy if exists "deals_insert_buyer" on public.deals;
drop policy if exists "deals_insert_participant_for_listing" on public.deals;
create policy "deals_insert_participant_for_listing"
on public.deals for insert to authenticated
with check (
  auth.uid() in (buyer_id, seller_id)
  and buyer_id <> seller_id
  and exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.status = 'active'
      and (
        (l.type = 'sell' and l.user_id = seller_id and auth.uid() = buyer_id)
        or
        (l.type = 'buy' and l.user_id = buyer_id and auth.uid() = seller_id)
      )
  )
);

-- 2. Participants should see all escrow/accounting movements for their deal,
-- not only the rows attached to their own wallet.
drop policy if exists "transactions_select_deal_participant" on public.transactions;
create policy "transactions_select_deal_participant"
on public.transactions for select to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.deals d
    where d.id = transactions.deal_id
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

-- 3. Ensure realtime is enabled for the deal room surfaces.
-- This powers instant deal status, chat, dispute, and escrow-history updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deals'
    ) then
      alter publication supabase_realtime add table public.deals;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'disputes'
    ) then
      alter publication supabase_realtime add table public.disputes;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
    ) then
      alter publication supabase_realtime add table public.transactions;
    end if;
  end if;
end $$;

-- 4. Backfill a system message so existing active deals are visible in history.
insert into public.messages (deal_id, sender_id, content, kind)
select d.id, d.buyer_id, 'Deal started. Both parties can track this trade in the Deal Room.', 'system'
from public.deals d
where not exists (
  select 1 from public.messages m
  where m.deal_id = d.id and m.kind = 'system' and m.content ilike 'Deal started%'
);

-- 5. Atomic seller confirmation / escrow release.
-- Browser RLS correctly prevents a seller from directly updating the buyer's
-- wallet, so settlement must happen through this authorized database function.
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
  fee := coalesce(d.fee_usdt, 0);
  net := amt - fee;

  update public.wallets
     set escrow_balance = escrow_balance - amt,
         updated_at = now()
   where user_id = d.seller_id
     and escrow_balance >= amt;
  if not found then
    raise exception 'Seller escrow balance is insufficient';
  end if;

  update public.wallets
     set balance = balance + net,
         updated_at = now()
   where user_id = d.buyer_id;
  if not found then
    raise exception 'Buyer wallet not found';
  end if;

  insert into public.transactions (user_id, deal_id, type, amount, description)
  values
    (d.seller_id, d.id, 'escrow_release', amt, 'Released to buyer'),
    (d.buyer_id, d.id, 'trade', net, 'USDT received'),
    (d.seller_id, d.id, 'fee', fee, 'Platform fee');

  update public.profiles
     set total_trades = total_trades + 1,
         completed_trades = completed_trades + 1,
         trade_volume = trade_volume + amt,
         updated_at = now()
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