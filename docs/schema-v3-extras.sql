-- ============================================================
-- CryptoBazar — v3 migration (additive)
-- Run AFTER docs/schema.sql and docs/schema-v2-dealroom.sql
-- in: Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Add 'transfer' to tx_type enum --------------------------------
do $$ begin
  alter type public.tx_type add value if not exists 'transfer';
exception when others then null; end $$;

-- 2. Disputes table ------------------------------------------------
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  evidence_url text,
  status text not null default 'open'
    check (status in ('open','reviewing','resolved_buyer','resolved_seller','cancelled')),
  admin_notes text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.disputes to authenticated;
grant all on public.disputes to service_role;

alter table public.disputes enable row level security;

drop policy if exists "disputes_select_party_or_admin" on public.disputes;
create policy "disputes_select_party_or_admin"
on public.disputes for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.deals d
    where d.id = disputes.deal_id
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

drop policy if exists "disputes_insert_party" on public.disputes;
create policy "disputes_insert_party"
on public.disputes for insert to authenticated
with check (
  auth.uid() = opened_by
  and exists (
    select 1 from public.deals d
    where d.id = disputes.deal_id
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

drop policy if exists "disputes_update_admin" on public.disputes;
create policy "disputes_update_admin"
on public.disputes for update to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- 3. Backfill wallets for any existing auth user --------------------
insert into public.wallets (user_id)
select u.id from auth.users u
left join public.wallets w on w.user_id = u.id
where w.id is null
on conflict do nothing;

-- 4. Also backfill profiles for completeness ------------------------
insert into public.profiles (id, username)
select u.id, coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1))
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role from auth.users u
left join public.user_roles r on r.user_id = u.id
where r.id is null
on conflict do nothing;
