-- ============================================================
-- CryptoBazar — schema v14 (Deal Code + optional biometric)
-- Run this whole file in Supabase SQL Editor after v13.
--
-- Adds a mandatory 6-digit "Deal Code" used by the seller to
-- authorize escrow release, plus an opt-in biometric flag.
-- Codes are stored as salted SHA-256 hashes; the plaintext code
-- never leaves the user's device.
-- ============================================================

alter table public.profiles
  add column if not exists deal_code_hash text,
  add column if not exists deal_code_salt text,
  add column if not exists deal_code_set_at timestamptz,
  add column if not exists deal_code_updated_at timestamptz,
  add column if not exists biometric_enabled boolean not null default false;

-- Helper: verify a 6-digit code against a stored (salt, hash).
create or replace function public.verify_deal_code(_user_id uuid, _code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _salt text;
  _hash text;
  _candidate text;
begin
  select deal_code_salt, deal_code_hash into _salt, _hash
  from public.profiles where id = _user_id;

  if _salt is null or _hash is null then
    return false;
  end if;

  _candidate := encode(digest(_salt || ':' || _code, 'sha256'), 'hex');
  return _candidate = _hash;
end $$;

grant execute on function public.verify_deal_code(uuid, text) to authenticated, service_role;

-- Ensure pgcrypto (for digest) is available.
create extension if not exists pgcrypto;
