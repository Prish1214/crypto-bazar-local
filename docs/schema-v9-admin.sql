-- ============================================================
-- CryptoBazar — Admin powers (v9)
-- Run in: Supabase SQL Editor
-- Grants admins full visibility + action RPCs (wallet adjust,
-- force-cancel deal w/ escrow refund, dispute resolution that
-- actually moves funds). Adds a `banned` flag to profiles.
-- ============================================================

-- 1. Banned flag
alter table public.profiles add column if not exists banned boolean not null default false;

-- 2. Admin SELECT visibility ---------------------------------
do $$ begin
  -- transactions: admin sees all
  if not exists (select 1 from pg_policies where policyname = 'transactions_select_admin' and tablename = 'transactions') then
    create policy "transactions_select_admin" on public.transactions for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- wallets: admin sees all
  if not exists (select 1 from pg_policies where policyname = 'wallets_select_admin' and tablename = 'wallets') then
    create policy "wallets_select_admin" on public.wallets for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- messages: admin can read for moderation
  if not exists (select 1 from pg_policies where policyname = 'messages_select_admin' and tablename = 'messages') then
    create policy "messages_select_admin" on public.messages for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- disputes: admin sees & updates
  if not exists (select 1 from pg_policies where policyname = 'disputes_select_admin' and tablename = 'disputes') then
    create policy "disputes_select_admin" on public.disputes for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'disputes_update_admin' and tablename = 'disputes') then
    create policy "disputes_update_admin" on public.disputes for update
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- listings: admin can update / delete (moderation)
  if not exists (select 1 from pg_policies where policyname = 'listings_update_admin' and tablename = 'listings') then
    create policy "listings_update_admin" on public.listings for update
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'listings_delete_admin' and tablename = 'listings') then
    create policy "listings_delete_admin" on public.listings for delete
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- profiles: admin can update (verify / ban)
  if not exists (select 1 from pg_policies where policyname = 'profiles_update_admin' and tablename = 'profiles') then
    create policy "profiles_update_admin" on public.profiles for update
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- deals: admin can update (already has select via base policy)
  if not exists (select 1 from pg_policies where policyname = 'deals_update_admin' and tablename = 'deals') then
    create policy "deals_update_admin" on public.deals for update
      using (public.has_role(auth.uid(), 'admin'));
  end if;
  -- user_roles: admin can manage roles
  if not exists (select 1 from pg_policies where policyname = 'user_roles_admin_all' and tablename = 'user_roles') then
    create policy "user_roles_admin_all" on public.user_roles for all
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

grant insert, update, delete on public.user_roles to authenticated;

-- 3. RPC: admin_adjust_wallet -------------------------------
-- Credit or debit a user's balance (positive=credit, negative=debit).
create or replace function public.admin_adjust_wallet(
  _user_id uuid,
  _amount numeric,
  _note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _bal numeric;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  insert into public.wallets (user_id) values (_user_id) on conflict (user_id) do nothing;
  select balance into _bal from public.wallets where user_id = _user_id for update;
  if _amount < 0 and _bal + _amount < 0 then
    raise exception 'insufficient balance';
  end if;

  update public.wallets
    set balance = balance + _amount, updated_at = now()
    where user_id = _user_id;

  insert into public.transactions (user_id, type, amount, description)
  values (_user_id, case when _amount >= 0 then 'deposit' else 'withdraw' end, abs(_amount),
          coalesce('Admin adjustment: ' || _note, 'Admin adjustment'));
end $$;

grant execute on function public.admin_adjust_wallet(uuid, numeric, text) to authenticated;

-- 4. RPC: admin_force_cancel_deal ---------------------------
-- Cancel deal & refund the seller's locked escrow (if any).
create or replace function public.admin_force_cancel_deal(
  _deal_id uuid,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _deal record;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  select * into _deal from public.deals where id = _deal_id for update;
  if _deal is null then raise exception 'deal not found'; end if;
  if _deal.status in ('completed', 'cancelled') then
    raise exception 'deal already closed';
  end if;

  -- refund escrow to seller if it was locked
  if _deal.status in ('escrow_funded', 'meeting_proposed', 'meeting_scheduled',
                      'locked', 'arrived', 'verified', 'cash_sent', 'confirmed',
                      'proof_uploaded', 'disputed') then
    update public.wallets
      set escrow_balance = greatest(0, escrow_balance - _deal.amount_usdt),
          balance = balance + _deal.amount_usdt,
          updated_at = now()
      where user_id = _deal.seller_id;
    insert into public.transactions (user_id, deal_id, type, amount, description)
    values (_deal.seller_id, _deal.id, 'escrow_release', _deal.amount_usdt,
            'Admin force-cancel refund');
  end if;

  update public.deals set status = 'cancelled', updated_at = now() where id = _deal_id;

  insert into public.messages (deal_id, sender_id, content, kind)
  values (_deal_id, auth.uid(), 'Deal cancelled by admin: ' || coalesce(_reason, 'no reason'), 'system');
end $$;

grant execute on function public.admin_force_cancel_deal(uuid, text) to authenticated;

-- 5. RPC: admin_resolve_dispute -----------------------------
-- Move escrow correctly when settling a dispute.
create or replace function public.admin_resolve_dispute(
  _dispute_id uuid,
  _outcome text,  -- 'resolved_buyer' | 'resolved_seller' | 'cancelled'
  _notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _dp record;
  _deal record;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  if _outcome not in ('resolved_buyer', 'resolved_seller', 'cancelled') then
    raise exception 'invalid outcome';
  end if;

  select * into _dp from public.disputes where id = _dispute_id for update;
  if _dp is null then raise exception 'dispute not found'; end if;
  select * into _deal from public.deals where id = _dp.deal_id for update;
  if _deal is null then raise exception 'deal not found'; end if;

  if _outcome = 'resolved_buyer' then
    -- release escrow from seller to buyer
    update public.wallets set escrow_balance = greatest(0, escrow_balance - _deal.amount_usdt),
                              updated_at = now()
      where user_id = _deal.seller_id;
    update public.wallets set balance = balance + (_deal.amount_usdt - coalesce(_deal.fee_usdt,0)),
                              updated_at = now()
      where user_id = _deal.buyer_id;
    insert into public.transactions (user_id, deal_id, type, amount, description) values
      (_deal.seller_id, _deal.id, 'escrow_release', _deal.amount_usdt, 'Dispute: released to buyer'),
      (_deal.buyer_id,  _deal.id, 'trade',          _deal.amount_usdt, 'Dispute: received from seller');
    update public.deals set status = 'completed', completed_at = now(), updated_at = now() where id = _deal.id;
  elsif _outcome = 'resolved_seller' then
    -- refund seller's escrow
    update public.wallets set escrow_balance = greatest(0, escrow_balance - _deal.amount_usdt),
                              balance = balance + _deal.amount_usdt,
                              updated_at = now()
      where user_id = _deal.seller_id;
    insert into public.transactions (user_id, deal_id, type, amount, description) values
      (_deal.seller_id, _deal.id, 'escrow_release', _deal.amount_usdt, 'Dispute: refunded to seller');
    update public.deals set status = 'cancelled', updated_at = now() where id = _deal.id;
  else
    update public.deals set status = 'cancelled', updated_at = now() where id = _deal.id;
  end if;

  update public.disputes set status = _outcome, resolved_by = auth.uid(),
                             resolved_at = now(), admin_notes = _notes
    where id = _dispute_id;

  insert into public.messages (deal_id, sender_id, content, kind)
  values (_deal.id, auth.uid(),
          'Dispute resolved by admin (' || _outcome || ')' ||
          case when _notes is not null then ': ' || _notes else '' end, 'system');
end $$;

grant execute on function public.admin_resolve_dispute(uuid, text, text) to authenticated;

-- 6. RPC: admin_set_role ------------------------------------
create or replace function public.admin_set_role(_user_id uuid, _role app_role, _grant boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if _grant then
    insert into public.user_roles (user_id, role) values (_user_id, _role) on conflict do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end $$;
grant execute on function public.admin_set_role(uuid, app_role, boolean) to authenticated;
