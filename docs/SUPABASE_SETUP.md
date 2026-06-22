# CryptoBazar — Supabase setup

This project uses **your own Supabase** (project `jponeelmwvkufvsuxyes`),
not Lovable Cloud.

## 1. Run the SQL migration

Open the Supabase SQL Editor for your project and paste the contents of
[`schema.sql`](./schema.sql), then run it. This creates:

- `profiles`, `user_roles`, `wallets`
- `listings`, `deals`, `messages`, `transactions`, `reviews`
- Enum types + `has_role()` security definer function
- All RLS policies + grants
- A trigger that auto-creates a profile, wallet, and `user` role on signup

## 2. Auth settings

In the Supabase dashboard → **Authentication → Providers**:

- Enable **Email** (already on by default)
- (Optional, for faster local testing) Auth → Sign In/Up → **disable**
  "Confirm email" so signups work without email verification

## 3. Allowed redirect URLs

Auth → URL Configuration → add your Lovable preview URL and any custom
domain you publish to.

## Schema overview

- **profiles**: public profile info, rating, completed trades, verified
- **wallets**: per-user USDT balance + escrow_balance
- **listings**: buy/sell offers scoped by city, with price + min/max
- **deals**: trade between a buyer and seller, with full status workflow
  (`pending → accepted → escrow_funded → meeting_scheduled →
   proof_uploaded → completed`)
- **messages**: in-app chat scoped to a deal
- **transactions**: every wallet movement (deposit, withdraw, escrow, fee)
- **reviews**: post-trade rating between participants

All sensitive tables have RLS scoped to the participating users.
