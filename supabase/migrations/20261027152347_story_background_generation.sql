-- Durable, owner-scoped chapter requests. Browser clients can read progress;
-- only the authenticated server queues or mutates jobs.
create table public.story_generation_jobs (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating','completed','failed','conflict')),
  stage text not null default 'prepare',
  input jsonb not null,
  checkpoint jsonb,
  result jsonb,
  error_message text not null default '',
  source_updated_at timestamptz not null,
  workflow_run_id text,
  model_call_in_flight boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index story_generation_jobs_active_story on public.story_generation_jobs(story_id) where status='generating';
create index story_generation_jobs_owner_recent on public.story_generation_jobs(user_id,story_id,created_at desc);
alter table public.story_generation_jobs enable row level security;
revoke all on public.story_generation_jobs from anon, authenticated;
grant select on public.story_generation_jobs to authenticated;
grant all on public.story_generation_jobs to service_role;
create policy story_generation_jobs_read on public.story_generation_jobs for select to authenticated using (user_id=(select auth.uid()));

-- Save the result and mark the job in one transaction. A concurrent edit wins;
-- the generated result remains available in the job rather than replacing it.
create function public.finish_story_generation_job(p_job_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.story_generation_jobs%rowtype; s jsonb; affected integer;
begin
  select * into j from public.story_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'generating' then return; end if;
  s := j.result->'story';
  if s is null or s->>'id'<>j.story_id::text then raise exception 'Missing chapter result'; end if;
  update public.stories set
    title=s->>'title', form=s->'storyBible', chapters=s->'chapters', messages=s->'messages',
    story_state=coalesce(s->'storyState','{}'::jsonb) || jsonb_build_object('workspaceMetadata',jsonb_build_object('seriesType',s->'seriesType','seriesTitle',s->'seriesTitle','bookNumber',s->'bookNumber','lineage',s->'lineage')),
    custom_rewrite=case when j.result->'pending' is null or j.result->'pending'='null'::jsonb then '' else (j.result->'pending')::text end,
    updated_at=now()
  where id=j.story_id and user_id=j.user_id and updated_at=j.source_updated_at;
  get diagnostics affected=row_count;
  update public.story_generation_jobs set
    status=case when affected=0 then 'conflict' when error_message<>'' then 'failed' else 'completed' end,
    error_message=case when affected=0 then 'The story changed during generation. Your newer edits were kept; the generated result is saved separately.' else error_message end,
    updated_at=now()
  where id=j.id;
end;
$$;
revoke all on function public.finish_story_generation_job(uuid) from public, anon, authenticated;
grant execute on function public.finish_story_generation_job(uuid) to service_role;
