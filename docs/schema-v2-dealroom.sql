-- ============================================================
-- CryptoBazar — Deal Room v2 migration (additive)
-- Run AFTER docs/schema.sql in: Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS where possible).
-- ============================================================

-- 1. Extend deals table -----------------------------------------------
alter table public.deals
  add column if not exists deal_code text unique,
  add column if not exists meeting_proposed_by uuid references auth.users(id),
  add column if not exists meeting_status text check (meeting_status in ('proposed','confirmed','rejected')),
  add column if not exists locked_at timestamptz,
  add column if not exists buyer_arrived_at timestamptz,
  add column if not exists seller_arrived_at timestamptz,
  add column if not exists buyer_arrival_lat numeric(10,6),
  add column if not exists buyer_arrival_lng numeric(10,6),
  add column if not exists seller_arrival_lat numeric(10,6),
  add column if not exists seller_arrival_lng numeric(10,6),
  add column if not exists buyer_selfie_url text,
  add column if not exists seller_selfie_url text,
  add column if not exists buyer_location_photo_url text,
  add column if not exists seller_location_photo_url text,
  add column if not exists cash_photo_url text,
  add column if not exists cash_video_url text,
  add column if not exists cash_notes text,
  add column if not exists cash_handover_at timestamptz,
  add column if not exists seller_confirmed_at timestamptz,
  add column if not exists trust_score_snapshot int;

-- 2. Extend deal_status enum with new states --------------------------
do $$ begin
  alter type public.deal_status add value if not exists 'meeting_proposed';
  alter type public.deal_status add value if not exists 'locked';
  alter type public.deal_status add value if not exists 'arrived';
  alter type public.deal_status add value if not exists 'verified';
  alter type public.deal_status add value if not exists 'cash_sent';
  alter type public.deal_status add value if not exists 'confirmed';
exception when others then null; end $$;

-- 3. Extend messages --------------------------------------------------
alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text','voice','image','location','note','system')),
  add column if not exists attachment_url text,
  add column if not exists lat numeric(10,6),
  add column if not exists lng numeric(10,6),
  add column if not exists duration_ms int;

-- 4. Auto-generate deal_code -----------------------------------------
create or replace function public.gen_deal_code()
returns trigger
language plpgsql
as $$
begin
  if new.deal_code is null then
    new.deal_code := 'CM-' || lpad(((random() * 899999)::int + 100000)::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists deals_set_code on public.deals;
create trigger deals_set_code
  before insert on public.deals
  for each row execute function public.gen_deal_code();

-- backfill existing rows
update public.deals
   set deal_code = 'CM-' || lpad(((random() * 899999)::int + 100000)::text, 6, '0')
 where deal_code is null;

-- 5. Storage bucket for deal evidence ---------------------------------
insert into storage.buckets (id, name, public)
values ('deal-evidence', 'deal-evidence', false)
on conflict (id) do nothing;

-- Policies: only deal participants can read/write their deal's files.
-- Path convention: {deal_id}/{user_id}/{filename}
drop policy if exists "deal_evidence_read" on storage.objects;
create policy "deal_evidence_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'deal-evidence'
  and exists (
    select 1 from public.deals d
    where d.id::text = split_part(name, '/', 1)
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

drop policy if exists "deal_evidence_write" on storage.objects;
create policy "deal_evidence_write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'deal-evidence'
  and auth.uid()::text = split_part(name, '/', 2)
  and exists (
    select 1 from public.deals d
    where d.id::text = split_part(name, '/', 1)
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);
