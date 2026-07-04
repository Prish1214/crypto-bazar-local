-- v15: internal reserve adjustments ledger.
-- Records when the platform's master reserve tops up a user withdrawal
-- because NOWPayments custody was short (e.g. deposit-processing fees ate
-- into it). These entries are for internal accounting only and are never
-- exposed to end users.

create table if not exists public.reserve_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  withdrawal_id uuid references public.withdrawals(id) on delete set null,
  currency text not null,
  network text,
  amount numeric(30, 8) not null check (amount >= 0),
  reason text not null default 'custody_shortfall',
  custody_available numeric(30, 8),
  payout_amount numeric(30, 8),
  raw jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.reserve_adjustments to service_role;

alter table public.reserve_adjustments enable row level security;

-- No user-facing policies: this table is server-side accounting only.
-- Only service_role (used by admin() server client) can read/write.

create index if not exists reserve_adjustments_user_id_idx
  on public.reserve_adjustments (user_id, created_at desc);
create index if not exists reserve_adjustments_withdrawal_id_idx
  on public.reserve_adjustments (withdrawal_id);
