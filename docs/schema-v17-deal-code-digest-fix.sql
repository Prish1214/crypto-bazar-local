-- ============================================================
-- CryptoBazar — v17: fix verify_deal_code "function digest(text, unknown) does not exist"
--
-- On Supabase, pgcrypto is installed into the `extensions` schema, not `public`.
-- Our SECURITY DEFINER function set search_path = public, so digest() was
-- unresolved at call time and the escrow release failed with:
--   ERROR: function digest(text, unknown) does not exist
--
-- Fix: include `extensions` in search_path and fully-qualify digest(). Also
-- ensure pgcrypto exists in the extensions schema (Supabase default).
-- Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_deal_code(_user_id uuid, _code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
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

  _candidate := encode(extensions.digest(_salt || ':' || _code, 'sha256'), 'hex');
  return _candidate = _hash;
end $$;

grant execute on function public.verify_deal_code(uuid, text) to authenticated, service_role;
