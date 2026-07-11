-- Adds a short-lived server-side nonce used by the "change Deal Code"
-- magic-link flow. When the user clicks "Change Deal Code" we generate
-- a nonce, embed it in the magic link's redirect URL, and store the
-- hash + expiry here. When the user returns from their inbox we accept
-- the change ONLY if the URL nonce matches and hasn't expired.

alter table public.profiles
  add column if not exists deal_code_rotate_nonce text,
  add column if not exists deal_code_rotate_expires_at timestamptz;

-- No new grants needed: the column lives on profiles which already has
-- the standard grants. All reads/writes happen through the service_role
-- server routes; RLS on profiles already prevents client access.
