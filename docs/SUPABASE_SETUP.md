# CryptoBazar — Supabase setup

This project uses **your own Supabase** (project `jponeelmwvkufvsuxyes`).

## SQL migrations — run in order

Open Supabase → **SQL Editor** → New query, then paste & RUN each file
in this exact order:

1. **`docs/schema.sql`** — base schema (profiles, wallets, listings,
   deals, messages, transactions, reviews, roles, RLS, signup trigger).
2. **`docs/schema-v2-dealroom.sql`** — extended Deal Room
   (`deal_code`, meeting/arrival fields, selfie/cash evidence,
   `messages.kind`, `deal-evidence` storage bucket).
3. **`docs/schema-v3-extras.sql`** — adds the `transfer` wallet
   transaction type, the `disputes` table, and backfills wallets /
   profiles / roles for any user that signed up before the trigger
   existed.
4. **`docs/schema-v4-deal-flow.sql`** — fixes deal creation from both
   BUY and SELL listings, enables realtime for deal rooms, and allows
   both deal participants to see escrow/accounting movements for the
   deal details view.

Each file is **idempotent** (safe to re-run). If a step errors,
copy the exact error text — it usually means a previous file wasn't
run yet.

> **Tip**: If you're starting clean, run all four back to back. If you
> previously ran the first three, run v4 now to fix Start Deal and
> realtime notifications.

## Auth settings

Authentication → Providers → make sure **Email** is enabled. For
faster local testing you can also disable "Confirm email".

## Allowed redirect URLs

Auth → URL Configuration → add your Lovable preview URL and any
published / custom domain.

## Schema overview

- **profiles / user_roles / wallets** — per-user state.
- **listings** — buy/sell offers scoped by city.
- **deals** — full escrow workflow:
  `pending → accepted → escrow_funded → meeting_scheduled → locked →
   arrived → verified → cash_sent → completed` (with `disputed` and
   `cancelled` branches).
- **messages** — in-deal chat with `kind` (text / voice / image /
  location / system).
- **transactions** — every wallet movement (deposit, withdraw,
  transfer, escrow_lock, escrow_release, fee, trade).
- **disputes** — opened by either party, reviewed by admins.
- **reviews** — post-trade rating.

All sensitive tables use RLS scoped to participating users; admin
overrides go through the `has_role(auth.uid(), 'admin')` security
definer.

## If Start Deal opens nothing

Run **`docs/schema-v4-deal-flow.sql`** in the SQL Editor. That is the
file that fixes the common issue where SELL listings worked but BUY
listing deals were blocked by the old insert policy, and it enables the
realtime Deal Room notifications/tracking surfaces.
