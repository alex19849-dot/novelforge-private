create table public.manuscript_review_jobs (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating','completed','failed')),
  source_key text not null,
  input jsonb not null,
  approved_budget_usd numeric not null check (approved_budget_usd >= 0),
  report jsonb,
  diagnostic jsonb,
  dismissed_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(dismissed_ids) = 'array'),
  model_call_in_flight boolean not null default false,
  workflow_run_id text,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index manuscript_review_one_active on public.manuscript_review_jobs(story_id,user_id) where status='generating';
create index manuscript_review_history on public.manuscript_review_jobs(user_id,story_id,created_at desc);
alter table public.manuscript_review_jobs enable row level security;
revoke all on public.manuscript_review_jobs from anon, authenticated;
grant select on public.manuscript_review_jobs to authenticated;
grant all on public.manuscript_review_jobs to service_role;
create policy manuscript_review_owner_read on public.manuscript_review_jobs for select to authenticated using ((select auth.uid()) = user_id);
