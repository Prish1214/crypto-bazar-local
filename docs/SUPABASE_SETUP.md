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

Each file is **idempotent** (safe to re-run). If a step errors,
copy the exact error text — it usually means a previous file wasn't
run yet.

> **Tip**: If you're starting clean, you can just run all three back to
> back. If you previously only ran schema.sql, run v2 and v3 now.

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
