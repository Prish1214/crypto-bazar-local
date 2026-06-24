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

## v5 — Wallet custody, NOWPayments deposits/withdrawals, internal transfers

Run **`docs/schema-v5-custody.sql`** in the SQL Editor (Supabase Dashboard → SQL Editor → New query → paste the entire file → Run). It is idempotent.

After running v5 you ALSO need these secrets configured in Lovable
(Project → Secrets):

- `NOWPAYMENTS_API_KEY` — Store Settings → API keys
- `NOWPAYMENTS_IPN_SECRET` — Store Settings → IPN
- `NOWPAYMENTS_EMAIL` / `NOWPAYMENTS_PASSWORD` — used for the JWT that
  authorizes Custody payouts
- `CB_SUPABASE_URL` — `https://<project>.supabase.co`
- `CB_SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API → service_role

Then in your NOWPayments dashboard, set the IPN callback URL to:

```
https://<your-published-domain>/api/public/webhooks/nowpayments
```

What v5 adds:

- `deposit_addresses` — one permanent address per (user × network).
- `deposits` / `withdrawals` ledgers with NOWPayments IDs for idempotency.
- `platform_fees` ledger.
- `internal_transfer(...)` RPC — atomic @user → @user transfer.
- `credit_deposit(...)` and `update_withdrawal_status(...)` RPCs called
  by the IPN webhook (service_role only).
