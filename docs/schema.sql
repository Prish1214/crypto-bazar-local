-- ============================================================
-- CryptoBazar — initial schema (v1)
-- Run this in: Supabase SQL Editor (project jponeelmwvkufvsuxyes)
-- ============================================================

-- 1. Enum types
create type public.app_role as enum ('user', 'merchant', 'admin');
create type public.listing_type as enum ('buy', 'sell');
create type public.listing_status as enum ('active', 'paused', 'closed');
create type public.deal_status as enum (
  'pending', 'accepted', 'escrow_funded', 'meeting_scheduled',
  'proof_uploaded', 'completed', 'cancelled', 'disputed'
);
create type public.tx_type as enum ('deposit', 'withdraw', 'escrow_lock', 'escrow_release', 'fee', 'trade');

-- 2. Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  city text,
  phone text,
  bio text,
  verified boolean not null default false,
  rating numeric(3,2) not null default 0,
  total_trades int not null default 0,
  completed_trades int not null default 0,
  trade_volume numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. User roles (separate table — prevents privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 4. Wallets
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  balance numeric(20,6) not null default 0,
  escrow_balance numeric(20,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Listings
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type listing_type not null,
  status listing_status not null default 'active',
  city text not null,
  price_per_usdt numeric(20,4) not null,
  min_amount numeric(20,2) not null,
  max_amount numeric(20,2) not null,
  available_amount numeric(20,2) not null,
  meeting_location text,
  available_timings text,
  notes text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_city_status_idx on public.listings (city, status);
create index listings_type_idx on public.listings (type);

-- 6. Deals
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount_usdt numeric(20,6) not null,
  price_per_usdt numeric(20,4) not null,
  total_fiat numeric(20,2) not null,
  fee_usdt numeric(20,6) not null default 0,
  status deal_status not null default 'pending',
  meeting_at timestamptz,
  meeting_location text,
  proof_image_url text,
  proof_video_url text,
  proof_uploaded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_deal_idx on public.messages (deal_id, created_at);

-- 8. Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  type tx_type not null,
  amount numeric(20,6) not null,
  description text,
  created_at timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, created_at desc);

-- 9. Reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (deal_id, reviewer_id)
);

-- ============================================================
-- GRANTS
-- ============================================================
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

grant select, insert, update on public.wallets to authenticated;
grant all on public.wallets to service_role;

grant select, insert, update, delete on public.listings to authenticated;
grant select on public.listings to anon;
grant all on public.listings to service_role;

grant select, insert, update on public.deals to authenticated;
grant all on public.deals to service_role;

grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;

grant select, insert on public.transactions to authenticated;
grant all on public.transactions to service_role;

grant select, insert on public.reviews to authenticated;
grant select on public.reviews to anon;
grant all on public.reviews to service_role;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.wallets enable row level security;
alter table public.listings enable row level security;
alter table public.deals enable row level security;
alter table public.messages enable row level security;
alter table public.transactions enable row level security;
alter table public.reviews enable row level security;

create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

create policy "user_roles_select_own" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "wallets_select_own" on public.wallets for select using (auth.uid() = user_id);
create policy "wallets_insert_own" on public.wallets for insert with check (auth.uid() = user_id);
create policy "wallets_update_own" on public.wallets for update using (auth.uid() = user_id);

create policy "listings_select_all" on public.listings for select using (true);
create policy "listings_insert_own" on public.listings for insert with check (auth.uid() = user_id);
create policy "listings_update_own" on public.listings for update using (auth.uid() = user_id);
create policy "listings_delete_own" on public.listings for delete using (auth.uid() = user_id);

create policy "deals_select_participant" on public.deals for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id or public.has_role(auth.uid(), 'admin'));
create policy "deals_insert_buyer" on public.deals for insert with check (auth.uid() = buyer_id);
create policy "deals_update_participant" on public.deals for update
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "messages_select_participant" on public.messages for select using (
  exists (select 1 from public.deals d where d.id = deal_id and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id))
);
create policy "messages_insert_participant" on public.messages for insert with check (
  auth.uid() = sender_id and exists (
    select 1 from public.deals d where d.id = deal_id and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);

create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_participant" on public.reviews for insert with check (
  auth.uid() = reviewer_id and exists (
    select 1 from public.deals d
    where d.id = deal_id
      and d.status = 'completed'
      and (auth.uid() = d.buyer_id or auth.uid() = d.seller_id)
  )
);

-- ============================================================
-- Trigger: auto-create profile + wallet + default role on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
