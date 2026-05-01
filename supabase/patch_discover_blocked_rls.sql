-- Run once in SQL Editor if Discover / blocking feels wrong with an older schema.
-- Lets each user read block rows where they are blocker OR blocked (Discover needs the latter).

drop policy if exists "blocked_select_own" on public.blocked_users;
drop policy if exists "blocked_select_if_party" on public.blocked_users;

create policy "blocked_select_if_party"
  on public.blocked_users for select
  to authenticated
  using (auth.uid () = blocker_id or auth.uid () = blocked_id);
