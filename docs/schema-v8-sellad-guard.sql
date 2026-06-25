-- CryptoBazar schema v8
-- 1) Enforce wallet balance for SELL listings
-- 2) Only ad owner can accept/decline deals (RPC)
-- 3) Auto-lock escrow when owner accepts

-- ------------------------------------------------------------------
-- 1. Sell-listing balance trigger
-- ------------------------------------------------------------------
create or replace function public.enforce_sell_listing_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric := 0;
begin
  if new.type <> 'sell' then
    return new;
  end if;
  select coalesce(balance, 0) into bal from public.wallets where user_id = new.user_id;
  if bal is null then bal := 0; end if;
  if bal <= 0 then
    raise exception 'Insufficient wallet balance: deposit USDT before creating a Sell ad';
  end if;
  if new.available_amount is not null and new.available_amount > bal then
    raise exception 'Available amount (%) exceeds your wallet balance (%)', new.available_amount, bal;
  end if;
  if new.max_amount is not null and new.max_amount > bal then
    raise exception 'Max amount (%) exceeds your wallet balance (%)', new.max_amount, bal;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sell_listing_balance on public.listings;
create trigger trg_enforce_sell_listing_balance
before insert or update on public.listings
for each row execute function public.enforce_sell_listing_balance();

-- ------------------------------------------------------------------
-- 2 + 3. respond_to_deal RPC (accept / decline) with auto escrow lock
-- ------------------------------------------------------------------
create or replace function public.respond_to_deal(_deal_id uuid, _action text)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals%rowtype;
  l public.listings%rowtype;
  w public.wallets%rowtype;
  amt numeric;
begin
  select * into d from public.deals where id = _deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  select * into l from public.listings where id = d.listing_id;
  if not found then raise exception 'Listing not found'; end if;

  if auth.uid() is null or auth.uid() <> l.user_id then
    raise exception 'Only the ad owner can respond to this deal';
  end if;

  if d.status <> 'pending' then
    raise exception 'Deal is no longer pending';
  end if;

  if _action = 'decline' then
    update public.deals
       set status = 'cancelled', updated_at = now()
     where id = _deal_id
     returning * into d;

    insert into public.messages(deal_id, sender_id, content, kind)
    values (_deal_id, auth.uid(), 'Ad owner declined the deal.', 'system');
    return d;
  end if;

  if _action <> 'accept' then
    raise exception 'Unknown action %', _action;
  end if;

  -- Accept path: lock seller's wallet balance into escrow
  amt := d.amount_usdt;
  select * into w from public.wallets where user_id = d.seller_id for update;
  if not found then
    raise exception 'Seller wallet missing';
  end if;
  if coalesce(w.balance, 0) < amt then
    raise exception 'Seller has insufficient balance to lock escrow';
  end if;

  update public.wallets
     set balance = balance - amt,
         escrow_balance = coalesce(escrow_balance, 0) + amt,
         updated_at = now()
   where user_id = d.seller_id;

  insert into public.transactions(user_id, deal_id, type, amount, description)
  values (d.seller_id, _deal_id, 'escrow_lock', amt, 'Auto-locked on deal acceptance');

  update public.deals
     set status = 'escrow_funded',
         locked_at = now(),
         updated_at = now()
   where id = _deal_id
   returning * into d;

  insert into public.messages(deal_id, sender_id, content, kind)
  values (_deal_id, auth.uid(),
          'Deal accepted. Escrow auto-locked — funds secured by CryptoBazar.',
          'system');

  return d;
end;
$$;

grant execute on function public.respond_to_deal(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 4. Tighten deals UPDATE: ad owner controls accept/decline
--    (Other status transitions remain via existing policies / RPCs.)
-- ------------------------------------------------------------------
-- (No additional policy added here — accept/decline is routed exclusively
--  through respond_to_deal() above. Keep existing UPDATE policy as-is.)
