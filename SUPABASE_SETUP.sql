-- 3000 / SeHezar - Supabase account & progress setup
-- Run this whole file once in Supabase -> SQL Editor.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar text not null default '🦊',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 20),
  constraint profiles_avatar_valid check (avatar in ('🦊','🐼','🐸','🐱','🐯','🐰','🐵','🐨'))
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on profile edits.
create or replace function public.set_3000_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_3000_updated_at();

drop trigger if exists user_progress_set_updated_at on public.user_progress;
create trigger user_progress_set_updated_at
before update on public.user_progress
for each row execute function public.set_3000_updated_at();

-- Automatically create a profile + empty progress row when a new Auth user is created.
create or replace function public.handle_3000_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_username text;
  wanted_avatar text;
begin
  wanted_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  wanted_avatar := nullif(new.raw_user_meta_data ->> 'avatar', '');

  if wanted_username is null then
    wanted_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  if wanted_avatar is null or wanted_avatar not in ('🦊','🐼','🐸','🐱','🐯','🐰','🐵','🐨') then
    wanted_avatar := '🦊';
  end if;

  insert into public.profiles (user_id, username, avatar)
  values (new.id, wanted_username, wanted_avatar)
  on conflict (user_id) do nothing;

  insert into public.user_progress (user_id, data)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_3000_auth_user_created on auth.users;
create trigger on_3000_auth_user_created
after insert on auth.users
for each row execute function public.handle_3000_new_user();

-- Lock down both tables. The publishable key in the website is safe only with RLS.
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_progress from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_progress to authenticated;

drop policy if exists "3000 users can view own profile" on public.profiles;
create policy "3000 users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "3000 users can insert own profile" on public.profiles;
create policy "3000 users can insert own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "3000 users can update own profile" on public.profiles;
create policy "3000 users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "3000 users can delete own profile" on public.profiles;
create policy "3000 users can delete own profile"
on public.profiles for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "3000 users can view own progress" on public.user_progress;
create policy "3000 users can view own progress"
on public.user_progress for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "3000 users can insert own progress" on public.user_progress;
create policy "3000 users can insert own progress"
on public.user_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "3000 users can update own progress" on public.user_progress;
create policy "3000 users can update own progress"
on public.user_progress for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "3000 users can delete own progress" on public.user_progress;
create policy "3000 users can delete own progress"
on public.user_progress for delete
to authenticated
using ((select auth.uid()) = user_id);
