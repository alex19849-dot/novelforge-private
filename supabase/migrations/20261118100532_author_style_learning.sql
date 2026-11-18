-- Account-wide editorial preferences, isolated from manuscript and narrative memory.
create table public.author_style_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules)='array' and jsonb_array_length(rules)<=60),
  revision integer not null default 0,
  lock_id uuid,
  lock_until timestamptz,
  runs_day date,
  runs_count integer not null default 0 check (runs_count>=0)
);
create table public.author_style_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  chapter_id text not null check (length(chapter_id)<=100),
  before_text text not null check (length(before_text)<=6000),
  after_text text not null check (length(after_text)<=6000),
  before_hash text not null,
  after_hash text not null,
  instruction text not null default '' check (length(instruction)<=2000),
  status text not null default 'pending' check (status in ('pending','analysed','ignored')),
  created_at timestamptz not null default now(),
  unique(user_id,story_id,chapter_id,before_hash,after_hash)
);
create index author_style_edits_pending on public.author_style_edits(user_id,status,created_at);
alter table public.author_style_profiles enable row level security;
alter table public.author_style_edits enable row level security;
create policy own_style_profile on public.author_style_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy own_style_edits on public.author_style_edits for select to authenticated using ((select auth.uid())=user_id);
-- All writes use the authenticated server route, with ownership and revision checks.
revoke all on public.author_style_profiles,public.author_style_edits from anon,authenticated;
grant select on public.author_style_profiles,public.author_style_edits to authenticated;
grant all on public.author_style_profiles,public.author_style_edits to service_role;
