-- Future-only reliability cutover, existing posts and publication results stay intact.
alter table public.social_publishing_settings
 add column worker_version text not null default '',
 add column reliability_from timestamptz not null default now(),
 add column maintenance_checked_at timestamptz;
alter table public.social_learning_state add column coverage jsonb not null default '{}' check(jsonb_typeof(coverage)='object');
create or replace function public.social_claim_publication(p_owner uuid,p_lease uuid,p_generation integer,p_worker text,p_post uuid,p_version integer,p_payload jsonb)
returns setof public.social_publications language plpgsql security invoker set search_path=public as $$
declare settings social_publishing_settings; post social_posts; previous social_publications;
begin
 select * into settings from social_publishing_settings where user_id=p_owner for update;
 if not found or not settings.enabled or settings.lease<>p_lease or settings.generation<>p_generation or settings.workflow_run_id is distinct from p_worker then return;end if;
 select * into post from social_posts where id=p_post and user_id=p_owner for update;
 if not found or post.status<>'approved' or post.version<>p_version or post.scheduled_at is null or post.scheduled_at>now() or post.scheduled_at<now()-(case when post.scheduled_at>=settings.reliability_from then interval '6 hours' else interval '30 minutes' end) then return;end if;
 if length(trim(post.caption))=0 or (post.platform<>'facebook' and post.media_path is null) then return;end if;
 select * into previous from social_publications where post_id=p_post for update;
 if found and (previous.state<>'retry' or previous.provider_post_id is not null or not previous.safe_to_retry or previous.next_check_at>now()) then return;end if;
 insert into social_publications(post_id,user_id,state,payload,scheduled_at,next_check_at)
 values(p_post,p_owner,'submitting',p_payload,post.scheduled_at,now()+interval '2 minutes')
 on conflict(post_id) do update set state='submitting',attempt=social_publications.attempt+1,poll_count=0,payload=excluded.payload,scheduled_at=excluded.scheduled_at,submitted_at=clock_timestamp(),next_check_at=now()+interval '2 minutes',last_error='',safe_to_retry=false,updated_at=clock_timestamp();
 update social_posts set status='publishing' where id=p_post and user_id=p_owner;
 return query select * from social_publications where post_id=p_post and user_id=p_owner;
end;$$;
