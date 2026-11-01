-- ============================================================
-- KryptoBazar — v23 KYC (identity verification) gate
-- Run AFTER all previous migrations (v1…v22) in: Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- Every account must submit an Aadhaar/ID-card photo + a live selfie.
-- An admin reviews each submission; approval flips profiles.verified=true,
-- which unlocks the app (RequireAuth gate).
-- ============================================================

-- 1. Table ------------------------------------------------------------------
create table if not exists public.kyc_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  id_document_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_verifications_status_idx
  on public.kyc_verifications (status, created_at);

grant select, insert, update on public.kyc_verifications to authenticated;
grant all on public.kyc_verifications to service_role;

alter table public.kyc_verifications enable row level security;

drop policy if exists "kyc_select_own" on public.kyc_verifications;
create policy "kyc_select_own" on public.kyc_verifications for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "kyc_insert_own" on public.kyc_verifications;
create policy "kyc_insert_own" on public.kyc_verifications for insert
  with check (auth.uid() = user_id);

drop policy if exists "kyc_update_own" on public.kyc_verifications;
create policy "kyc_update_own" on public.kyc_verifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "kyc_admin_update" on public.kyc_verifications;
create policy "kyc_admin_update" on public.kyc_verifications for update
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 2. Private storage bucket + policies -------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('kyc-documents', 'kyc-documents', false, 5242880)
on conflict (id) do nothing;

drop policy if exists "kyc_docs_insert_own" on storage.objects;
create policy "kyc_docs_insert_own" on storage.objects for insert to authenticated
with check (
  bucket_id = 'kyc-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "kyc_docs_select" on storage.objects;
create policy "kyc_docs_select" on storage.objects for select to authenticated
using (
  bucket_id = 'kyc-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(), 'admin')
  )
);

-- 3. Approval syncs profiles.verified --------------------------------------
create or replace function public.kyc_sync_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.profiles set verified = true where id = new.user_id;
  end if;
  return new;
end
$$;

drop trigger if exists kyc_verifications_review on public.kyc_verifications;
create trigger kyc_verifications_review
after insert or update of status on public.kyc_verifications
for each row execute function public.kyc_sync_verified();
