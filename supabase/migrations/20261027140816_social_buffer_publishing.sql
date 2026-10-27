-- Provider credentials stay in Vercel. Clients can read only their own publishing state.
alter table public.social_posts add constraint social_posts_id_owner unique(id,user_id);
create table public.social_publishing_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 channels jsonb not null default '{}',
 connection_checked_at timestamptz,
 preflight_at timestamptz,
 test_drafts jsonb not null default '[]',
 lease uuid not null default gen_random_uuid(),
 generation integer not null default 0,
 workflow_run_id text,
 heartbeat_at timestamptz,
 last_error text not null default '',
 updated_at timestamptz not null default now()
);
create table public.social_publications (
 post_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 state text not null check(state in ('submitting','accepted','retry','published','failed','uncertain','attention')),
 attempt integer not null default 1,
 poll_count integer not null default 0,
 provider_post_id text unique,
 external_link text,
 payload jsonb not null,
 scheduled_at timestamptz not null,
 submitted_at timestamptz not null default now(),
 next_check_at timestamptz,
 published_at timestamptz,
 last_error text not null default '',
 safe_to_retry boolean not null default false,
 updated_at timestamptz not null default now(),
 foreign key(post_id,user_id) references public.social_posts(id,user_id) on delete cascade
);
create index social_publications_owner on public.social_publications(user_id,post_id);
create index social_publications_pending on public.social_publications(user_id,next_check_at) where state in ('submitting','accepted','uncertain','retry');
alter table public.social_publishing_settings enable row level security;
alter table public.social_publications enable row level security;
create policy social_publishing_settings_read on public.social_publishing_settings for select to authenticated using(user_id=(select auth.uid()));
create policy social_publications_read on public.social_publications for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.social_publishing_settings,public.social_publications from anon,authenticated;
grant select on public.social_publishing_settings,public.social_publications to authenticated;
grant all on public.social_publishing_settings,public.social_publications to service_role;

create function public.social_register_publisher(p_owner uuid,p_lease uuid,p_generation integer,p_worker text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update social_publishing_settings set workflow_run_id=p_worker,heartbeat_at=clock_timestamp()
 where user_id=p_owner and enabled and lease=p_lease and generation=p_generation
 and (workflow_run_id is null or workflow_run_id=p_worker);
 return found;
end;$$;

create function public.social_claim_publication(p_owner uuid,p_lease uuid,p_generation integer,p_worker text,p_post uuid,p_version integer,p_payload jsonb)
returns setof public.social_publications language plpgsql security invoker set search_path=public as $$
declare settings social_publishing_settings; post social_posts; previous social_publications;
begin
 select * into settings from social_publishing_settings where user_id=p_owner for update;
 if not found or not settings.enabled or settings.lease<>p_lease or settings.generation<>p_generation or settings.workflow_run_id is distinct from p_worker then return;end if;
 select * into post from social_posts where id=p_post and user_id=p_owner for update;
 if not found or post.status<>'approved' or post.version<>p_version or post.scheduled_at is null or post.scheduled_at>now() or post.scheduled_at<now()-interval '30 minutes' then return;end if;
 if length(trim(post.caption))=0 or (post.platform<>'facebook' and post.media_path is null) then return;end if;
 select * into previous from social_publications where post_id=p_post for update;
 if found and (previous.state<>'retry' or previous.provider_post_id is not null or not previous.safe_to_retry or previous.next_check_at>now()) then return;end if;
 insert into social_publications(post_id,user_id,state,payload,scheduled_at,next_check_at)
 values(p_post,p_owner,'submitting',p_payload,post.scheduled_at,now()+interval '2 minutes')
 on conflict(post_id) do update set state='submitting',attempt=social_publications.attempt+1,poll_count=0,payload=excluded.payload,scheduled_at=excluded.scheduled_at,submitted_at=clock_timestamp(),next_check_at=now()+interval '2 minutes',last_error='',safe_to_retry=false,updated_at=clock_timestamp();
 update social_posts set status='publishing' where id=p_post and user_id=p_owner;
 return query select * from social_publications where post_id=p_post and user_id=p_owner;
end;$$;

create function public.social_publication_result(p_owner uuid,p_post uuid,p_attempt integer,p_state text,p_provider text default null,p_link text default null,p_error text default '',p_delay integer default 60)
returns boolean language plpgsql security invoker set search_path=public as $$
declare item social_publications;
begin
 if p_state not in ('accepted','retry','published','failed','uncertain','attention') then raise exception 'Invalid publication result';end if;
 select * into item from social_publications where post_id=p_post and user_id=p_owner for update;
 if not found or item.attempt<>p_attempt or item.state in ('published','failed') then return false;end if;
 if p_state='retry' and (item.provider_post_id is not null or item.state<>'submitting') then raise exception 'Only a confirmed unaccepted request may retry';end if;
 if p_state='published' and coalesce(p_provider,item.provider_post_id) is null then raise exception 'Published confirmation needs a provider reference';end if;
 update social_publications set state=p_state,provider_post_id=coalesce(p_provider,provider_post_id),external_link=coalesce(p_link,external_link),last_error=left(p_error,1000),safe_to_retry=(p_state='retry' or(p_state='failed' and coalesce(p_provider,provider_post_id) is null and item.state='submitting')),
 poll_count=poll_count+case when p_state in ('accepted','uncertain') then 1 else 0 end,
 next_check_at=case when p_state in ('accepted','uncertain','retry') then now()+make_interval(secs=>greatest(10,least(86400,p_delay))) else null end,
 published_at=case when p_state='published' then clock_timestamp() else published_at end,updated_at=clock_timestamp()
 where post_id=p_post and user_id=p_owner;
 update social_posts set status=case when p_state='published' then 'published' when p_state='failed' then 'failed' when p_state='retry' then 'approved' else 'publishing' end where id=p_post and user_id=p_owner and status='publishing';
 return true;
end;$$;
revoke all on function public.social_register_publisher(uuid,uuid,integer,text),public.social_claim_publication(uuid,uuid,integer,text,uuid,integer,jsonb),public.social_publication_result(uuid,uuid,integer,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.social_register_publisher(uuid,uuid,integer,text),public.social_claim_publication(uuid,uuid,integer,text,uuid,integer,jsonb),public.social_publication_result(uuid,uuid,integer,text,text,text,text,integer) to service_role;
