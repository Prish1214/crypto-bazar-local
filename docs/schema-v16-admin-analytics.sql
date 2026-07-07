-- v16: Admin analytics RPCs.
-- Aggregates platform-wide + per-merchant insights. Uses SECURITY DEFINER
-- so it can read tables like reserve_adjustments (service-role only) while
-- still enforcing an in-function has_role('admin') check.
--
-- Apply once via the Supabase SQL editor. Idempotent.

create or replace function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'users_total',              (select count(*) from public.profiles),
    'users_verified',           (select count(*) from public.profiles where verified = true),
    'users_active_7d',          (select count(distinct user_id) from public.transactions where created_at > now() - interval '7 days'),
    'listings_total',           (select count(*) from public.listings),
    'listings_active',          (select count(*) from public.listings where status = 'active'),
    'deals_total',              (select count(*) from public.deals),
    'deals_completed',          (select count(*) from public.deals where status = 'completed'),
    'deals_cancelled',          (select count(*) from public.deals where status = 'cancelled'),
    'deals_active',             (select count(*) from public.deals where status not in ('completed','cancelled')),
    'deals_disputed_open',      (select count(*) from public.disputes where status in ('open','reviewing')),
    'trading_volume_usdt',      coalesce((select sum(amount_usdt) from public.deals where status = 'completed'), 0),
    'trading_volume_30d',       coalesce((select sum(amount_usdt) from public.deals where status = 'completed' and created_at > now() - interval '30 days'), 0),
    'fees_collected_usdt',      coalesce((select sum(amount) from public.platform_fees), 0),
    'escrow_held_usdt',         coalesce((select sum(escrow_balance) from public.wallets), 0),
    'wallet_balance_total',     coalesce((select sum(balance) from public.wallets), 0),
    'deposits_total',           coalesce((select sum(amount) from public.transactions where type = 'deposit'), 0),
    'deposits_count',           (select count(*) from public.transactions where type = 'deposit'),
    'withdrawals_total',        coalesce((select sum(net_amount) from public.withdrawals where status = 'completed'), 0),
    'withdrawals_count',        (select count(*) from public.withdrawals where status = 'completed'),
    'withdrawals_pending',      (select count(*) from public.withdrawals where status in ('pending','processing')),
    'reserve_comp_total',       coalesce((select sum(amount) from public.reserve_adjustments), 0),
    'reserve_comp_count',       (select count(*) from public.reserve_adjustments),
    'success_rate',             (
      select case when count(*) = 0 then 0
        else round((count(*) filter (where status = 'completed'))::numeric * 100 / count(*), 2)
      end
      from public.deals where status in ('completed','cancelled')
    )
  ) into _result;

  return _result;
end;
$$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;


create or replace function public.admin_merchant_analytics(_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  with d as (
    select
      p.id as user_id,
      p.username,
      p.full_name,
      p.city,
      p.verified,
      coalesce(w.balance, 0)         as wallet_balance,
      coalesce(w.escrow_balance, 0)  as escrow_balance,
      (select count(*) from public.deals x where (x.buyer_id = p.id or x.seller_id = p.id) and x.status = 'completed') as deals_completed,
      (select count(*) from public.deals x where (x.buyer_id = p.id or x.seller_id = p.id) and x.status = 'cancelled') as deals_cancelled,
      (select coalesce(sum(x.amount_usdt),0) from public.deals x where (x.buyer_id = p.id or x.seller_id = p.id) and x.status = 'completed') as volume,
      (select max(x.created_at) from public.deals x where (x.buyer_id = p.id or x.seller_id = p.id)) as last_deal_at,
      (select coalesce(sum(t.amount),0) from public.transactions t where t.user_id = p.id and t.type = 'deposit') as deposits,
      (select coalesce(sum(x.net_amount),0) from public.withdrawals x where x.user_id = p.id and x.status = 'completed') as withdrawals
    from public.profiles p
    left join public.wallets w on w.user_id = p.id
  )
  select jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'username', username,
      'full_name', full_name,
      'city', city,
      'verified', verified,
      'wallet_balance', wallet_balance,
      'escrow_balance', escrow_balance,
      'deals_completed', deals_completed,
      'deals_cancelled', deals_cancelled,
      'volume', volume,
      'success_rate', case when (deals_completed + deals_cancelled) = 0 then 0
        else round(deals_completed::numeric * 100 / (deals_completed + deals_cancelled), 1) end,
      'last_deal_at', last_deal_at,
      'deposits', deposits,
      'withdrawals', withdrawals
    ) order by volume desc, deals_completed desc
  ) into _result
  from (select * from d order by volume desc, deals_completed desc limit _limit) sub;

  return coalesce(_result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_merchant_analytics(int) from public;
grant execute on function public.admin_merchant_analytics(int) to authenticated;
