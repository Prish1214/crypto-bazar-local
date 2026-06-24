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
    where l.id = deals.listing_id
      and l.status = 'active'
      and (
        (l.type = 'sell' and l.user_id = deals.seller_id and auth.uid() = deals.buyer_id)
        or
        (l.type = 'buy' and l.user_id = deals.buyer_id and auth.uid() = deals.seller_id)
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