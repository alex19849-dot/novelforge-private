-- Job state belongs to the server. Clients may read only their own progress.
alter table public.social_generation_runs drop constraint social_generation_runs_status_check;
alter table public.social_generation_runs add constraint social_generation_runs_status_check check (status in ('generating','completed','failed','paused'));
alter table public.social_generation_runs
  add column job_type text not null default 'plan' check (job_type in ('plan','media')),
  add column config jsonb not null default '{}'::jsonb,
  add column workflow_run_id text,
  add column completed_tasks integer not null default 0,
  add column total_tasks integer not null default 0,
  add column error_message text not null default '',
  add column cancel_requested boolean not null default false,
  add column updated_at timestamptz not null default now();
-- Old request-bound work cannot be resumed: its request was never persisted.
update public.social_generation_runs set status='failed',error_message='This older request timed out. Start generation again; saved posts are kept.' where status='generating';
drop index public.social_generation_runs_active_start;
create unique index social_generation_runs_active_user on public.social_generation_runs(user_id) where status='generating';
revoke insert,update on public.social_generation_runs from authenticated;
drop policy social_generation_runs_insert on public.social_generation_runs;
drop policy social_generation_runs_update on public.social_generation_runs;
create table public.social_generation_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','skipped')),
  request jsonb not null,
  response_id text,
  error_message text not null default '',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,ordinal),
  foreign key(run_id,user_id) references public.social_generation_runs(id,user_id) on delete cascade
);
create index social_generation_tasks_owner on public.social_generation_tasks(user_id);
alter table public.social_generation_tasks enable row level security;
revoke all on public.social_generation_tasks from anon,authenticated;
grant select on public.social_generation_tasks to authenticated;
create policy social_generation_tasks_read on public.social_generation_tasks for select to authenticated using (user_id=(select auth.uid()));
grant all on public.social_posts, public.social_generation_runs, public.social_generation_tasks to service_role;
