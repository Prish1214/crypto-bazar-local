-- ============================================================
-- CryptoBazar — QR mutual verification (additive)
-- Run AFTER previous schema migrations in Supabase SQL Editor.
-- ============================================================

alter table public.deals
  add column if not exists buyer_qr_verified_at timestamptz,
  add column if not exists seller_qr_verified_at timestamptz;
