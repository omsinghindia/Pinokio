-- Connectly — Supabase database schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL) after creating a project.
-- Requires: Auth enabled, Storage bucket "avatars" created (public read recommended for avatars).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  age integer check (age is null or age >= 18),
  gender text,
  city text,
  bio text,
  interests text, -- beginner-friendly: comma-separated interests
  avatar_url text,
  -- Internal copy of signup email for debugging/support; not shown on cards in the app UI
  email_mirror text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Dating profiles; age must be 18+ when set.';

-- Auto-create profile row when a user signs up (runs with elevated rights; not callable by clients)
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email_mirror)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email_mirror = excluded.email_mirror,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- Likes (swipes)
-- ---------------------------------------------------------------------------
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid (),
  liker_id uuid not null references public.profiles (id) on delete cascade,
  liked_id uuid not null references public.profiles (id) on delete cascade,
  is_like boolean not null default true,
  created_at timestamptz not null default now (),
  constraint likes_no_self check (liker_id <> liked_id),
  constraint likes_unique unique (liker_id, liked_id)
);

create index if not exists likes_liked_id_idx on public.likes (liked_id);
create index if not exists likes_liker_id_idx on public.likes (liker_id);

-- ---------------------------------------------------------------------------
-- Matches (mutual likes)
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid (),
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now (),
  constraint matches_ordered check (user_low < user_high),
  constraint matches_unique unique (user_low, user_high)
);

create index if not exists matches_user_low_idx on public.matches (user_low);
create index if not exists matches_user_high_idx on public.matches (user_high);

-- When two users like each other, insert a match (canonical ordering)
create or replace function public.try_create_match ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reciprocal boolean;
  a uuid;
  b uuid;
begin
  if new.is_like is not true then
    return new;
  end if;

  select exists (
    select 1 from public.likes l
    where l.liker_id = new.liked_id
      and l.liked_id = new.liker_id
      and l.is_like = true
  ) into reciprocal;

  if reciprocal then
    a := least(new.liker_id, new.liked_id);
    b := greatest(new.liker_id, new.liked_id);
    insert into public.matches (user_low, user_high)
    values (a, b)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists likes_after_insert_match on public.likes;
create trigger likes_after_insert_match
  after insert on public.likes
  for each row execute function public.try_create_match ();

-- ---------------------------------------------------------------------------
-- Blocked users
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid (),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now (),
  constraint blocked_no_self check (blocker_id <> blocked_id),
  constraint blocked_unique unique (blocker_id, blocked_id)
);

create index if not exists blocked_blocked_id_idx on public.blocked_users (blocked_id);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid (),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now (),
  constraint reports_no_self check (reporter_id <> reported_id)
);

-- ---------------------------------------------------------------------------
-- Messages (persisted; real-time via Socket.IO + API insert)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid (),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  kind text not null default 'text',
  file_path text,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now (),
  constraint messages_kind_valid check (
    kind in ('text', 'image', 'file', 'audio', 'location')
  )
);

-- Idempotent columns for DBs created from older schema.sql (table already existed)
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

create index if not exists messages_match_id_created_idx
  on public.messages (match_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at touch
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;

-- Profiles: everyone authenticated can read non-blocked logic handled in app;
-- for simplicity, readable by all logged-in users (dating browse). Hide emails: no email in profiles for public - we use email_mirror only for owner optional
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid () = id)
  with check (auth.uid () = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid () = id);

-- Likes: insert/read own
drop policy if exists "likes_select_own" on public.likes;
create policy "likes_select_own"
  on public.likes for select
  to authenticated
  using (auth.uid () = liker_id or auth.uid () = liked_id);

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (auth.uid () = liker_id);

-- Matches: participants only
drop policy if exists "matches_select_participant" on public.matches;
create policy "matches_select_participant"
  on public.matches for select
  to authenticated
  using (auth.uid () = user_low or auth.uid () = user_high);

-- Messages: only if sender is in the match
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (auth.uid () = m.user_low or auth.uid () = m.user_high)
    )
  );

drop policy if exists "messages_insert_sender_in_match" on public.messages;
create policy "messages_insert_sender_in_match"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid () = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (auth.uid () = m.user_low or auth.uid () = m.user_high)
    )
  );

-- Blocked: either party can read a row (needed so the blocked user can hide blockers in Discover)
drop policy if exists "blocked_select_own" on public.blocked_users;
drop policy if exists "blocked_select_if_party" on public.blocked_users;
create policy "blocked_select_if_party"
  on public.blocked_users for select
  to authenticated
  using (auth.uid () = blocker_id or auth.uid () = blocked_id);

drop policy if exists "blocked_insert_own" on public.blocked_users;
create policy "blocked_insert_own"
  on public.blocked_users for insert
  to authenticated
  with check (auth.uid () = blocker_id);

drop policy if exists "blocked_delete_own" on public.blocked_users;
create policy "blocked_delete_own"
  on public.blocked_users for delete
  to authenticated
  using (auth.uid () = blocker_id);

-- Reports: insert own, select own (admin would use service role in dashboard)
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (auth.uid () = reporter_id);

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports for select
  to authenticated
  using (auth.uid () = reporter_id);

-- ---------------------------------------------------------------------------
-- Storage: create bucket "avatars" in Dashboard → Storage → New bucket
-- Then run (or set policies in UI):
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername (name))[1] = auth.uid ()::text
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername (name))[1] = auth.uid ()::text
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername (name))[1] = auth.uid ()::text
  );

-- ---------------------------------------------------------------------------
-- Chat attachments (private bucket; clients use signed URLs)
-- Path: {match_id}/{user_id}/{uuid}_{filename}
-- ---------------------------------------------------------------------------
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
