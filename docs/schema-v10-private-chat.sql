-- ============================================================
-- CryptoBazar — Private Chat (v10)
-- Run in Supabase SQL Editor (project jponeelmwvkufvsuxyes).
-- Independent of Deal Rooms. End-to-end encrypted client side.
-- ============================================================

-- 1. Conversations (1:1 between two users, ordered uuids for uniqueness)
create table if not exists public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  created_at timestamptz not null default now(),
  constraint pc_users_order check (user_a < user_b),
  constraint pc_users_unique unique (user_a, user_b)
);
create index if not exists pc_user_a_idx on public.private_conversations(user_a, last_message_at desc);
create index if not exists pc_user_b_idx on public.private_conversations(user_b, last_message_at desc);

-- 2. Messages
create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  kind text not null default 'text' check (kind in ('text','image','location')),
  attachment_url text,
  lat numeric(10,6),
  lng numeric(10,6),
  created_at timestamptz not null default now()
);
create index if not exists pm_conv_idx on public.private_messages(conversation_id, created_at);

-- 3. Grants
grant select, insert, update on public.private_conversations to authenticated;
grant all on public.private_conversations to service_role;
grant select, insert on public.private_messages to authenticated;
grant all on public.private_messages to service_role;

-- 4. RLS
alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;

drop policy if exists "pc_select_participant" on public.private_conversations;
create policy "pc_select_participant" on public.private_conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "pc_update_participant" on public.private_conversations;
create policy "pc_update_participant" on public.private_conversations for update
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "pm_select_participant" on public.private_messages;
create policy "pm_select_participant" on public.private_messages for select
  using (exists (
    select 1 from public.private_conversations c
    where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b)
  ));

drop policy if exists "pm_insert_participant" on public.private_messages;
create policy "pm_insert_participant" on public.private_messages for insert
  with check (
    auth.uid() = sender_id and exists (
      select 1 from public.private_conversations c
      where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- 5. RPC — find or create a 1:1 conversation
create or replace function public.start_private_conversation(_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _me uuid := auth.uid();
  _a uuid;
  _b uuid;
  _id uuid;
begin
  if _me is null then raise exception 'not authenticated'; end if;
  if _other = _me then raise exception 'cannot chat with yourself'; end if;
  if _me < _other then _a := _me; _b := _other; else _a := _other; _b := _me; end if;
  select id into _id from public.private_conversations where user_a = _a and user_b = _b;
  if _id is null then
    insert into public.private_conversations(user_a, user_b) values(_a, _b) returning id into _id;
  end if;
  return _id;
end;
$$;

grant execute on function public.start_private_conversation(uuid) to authenticated;

-- 6. Trigger — bump last_message_at + preview on new message
create or replace function public.bump_private_conversation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.private_conversations
     set last_message_at = new.created_at,
         last_message_preview = case
           when new.kind = 'image' then '📷 Photo'
           when new.kind = 'location' then '📍 Location'
           else left(new.content, 80)
         end
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists bump_pc_on_message on public.private_messages;
create trigger bump_pc_on_message
  after insert on public.private_messages
  for each row execute function public.bump_private_conversation();

-- 7. Realtime
alter publication supabase_realtime add table public.private_messages;
alter publication supabase_realtime add table public.private_conversations;

-- 8. Storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists "chat_attach_read" on storage.objects;
create policy "chat_attach_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments');

drop policy if exists "chat_attach_write" on storage.objects;
create policy "chat_attach_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- 9. Allow username to be supplied at signup via raw_user_meta_data.username
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _uname text;
begin
  _uname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1)
  );
  -- ensure uniqueness; append short suffix if taken
  if exists (select 1 from public.profiles where username = _uname) then
    _uname := _uname || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    _uname
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;

  return new;
end;
$$;
