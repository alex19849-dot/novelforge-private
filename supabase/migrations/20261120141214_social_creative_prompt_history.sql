create table public.social_creative_prompts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 book_slug text not null,
 concept_key text not null,
 recipe jsonb not null,
 prompt text not null default '',
 hook text not null default '',
 scene text not null default '',
 status text not null default 'pending' check(status in ('pending','ready','failed')),
 poster_state text not null default 'idle' check(poster_state in ('idle','generating','ready','failed')),
 poster_request_id uuid,
 poster_result jsonb,
 poster_error text not null default '',
 created_at timestamptz not null default now(),
 unique(user_id,book_slug,concept_key)
);
create index social_creative_prompts_owner_history on public.social_creative_prompts(user_id,book_slug,created_at desc);
alter table public.social_creative_prompts enable row level security;
revoke all on public.social_creative_prompts from anon,authenticated;
grant select on public.social_creative_prompts to authenticated;
grant all on public.social_creative_prompts to service_role;
create policy "Read own creative prompt history" on public.social_creative_prompts for select to authenticated using ((select auth.uid())=user_id);
