-- BINOKIO: rich chat (images, files, audio, location) + private chat-media bucket.
-- Run once in Supabase SQL Editor if your project already has the older messages table.

alter table public.messages add column if not exists kind text;
alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists mime_type text;

update public.messages set kind = 'text' where kind is null;
alter table public.messages alter column kind set default 'text';
alter table public.messages alter column kind set not null;
alter table public.messages alter column body set default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_kind_valid'
  ) then
    alter table public.messages
      add constraint messages_kind_valid check (
        kind in ('text', 'image', 'file', 'audio', 'location')
      );
  end if;
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "chat_media_select_participant" on storage.objects;
create policy "chat_media_select_participant"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1
      from public.matches m
      where m.id::text = split_part (name, '/', 1)
        and (auth.uid () = m.user_low or auth.uid () = m.user_high)
    )
  );

drop policy if exists "chat_media_insert_participant" on storage.objects;
create policy "chat_media_insert_participant"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1
      from public.matches m
      where m.id::text = split_part (name, '/', 1)
        and (auth.uid () = m.user_low or auth.uid () = m.user_high)
    )
    and split_part (name, '/', 2) = auth.uid ()::text
  );

drop policy if exists "chat_media_delete_own" on storage.objects;
create policy "chat_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and split_part (name, '/', 2) = auth.uid ()::text
  );
