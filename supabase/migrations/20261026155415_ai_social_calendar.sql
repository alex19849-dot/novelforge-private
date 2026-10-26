create table public.social_generation_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  status text not null check (status in ('generating','completed','failed')),
  created_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id,user_id)
);
alter table public.social_generation_runs enable row level security;
revoke all on public.social_generation_runs from anon,authenticated;
grant select, insert, update on public.social_generation_runs to authenticated;
create policy social_generation_runs_read on public.social_generation_runs for select to authenticated using (user_id=(select auth.uid()));
create policy social_generation_runs_insert on public.social_generation_runs for insert to authenticated with check (user_id=(select auth.uid()));
create policy social_generation_runs_update on public.social_generation_runs for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create unique index social_generation_runs_active_start on public.social_generation_runs(user_id,start_date) where status='generating';
alter table public.social_posts
  add column creative_brief text not null default '',
  add column planned_media_type text check (planned_media_type in ('image','video')),
  add column generation_run_id uuid,
  add column quality_notes text not null default '',
  add foreign key (generation_run_id,user_id) references public.social_generation_runs(id,user_id);
create index social_posts_generation_run on public.social_posts(generation_run_id);
create unique index social_posts_ai_day_platform on public.social_posts(user_id,platform,((scheduled_at at time zone 'Europe/London')::date)) where generation_run_id is not null and status <> 'cancelled';
