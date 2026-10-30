-- Extend the existing calendar. Previously approved posts and their schedules stay intact.
alter table public.social_posts drop constraint social_posts_post_type_check;
alter table public.social_posts add constraint social_posts_post_type_check check(post_type in ('premise_hook','trope_hook','character_conflict','reader_question','humour','book_promotion','new_release','video','reader_engagement','romance_hot_take','this_or_that','original_quote'));
alter table public.social_posts add column content_metadata jsonb not null default '{}' check(jsonb_typeof(content_metadata)='object');
alter table public.social_publications add column content_snapshot jsonb not null default '{}' check(jsonb_typeof(content_snapshot)='object');
create function public.social_freeze_content() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or (new.state='submitting' and new.attempt>old.attempt) then
  select jsonb_build_object('id',p.id,'platform',p.platform,'media_type',p.media_type,'book_slug',p.book_slug,'post_type',p.post_type,'scheduled_at',p.scheduled_at,'caption',p.caption,'hashtags',p.hashtags,'content_metadata',p.content_metadata)
  into new.content_snapshot from public.social_posts p where p.id=new.post_id and p.user_id=new.user_id;
 end if;
 return new;
end;$$;
revoke all on function public.social_freeze_content() from public,anon,authenticated;
create trigger social_freeze_content before insert or update on public.social_publications for each row execute function public.social_freeze_content();
-- Existing posts are deliberately unclassified, rather than inventing visual/angle labels.
update public.social_publications r set content_snapshot=jsonb_build_object('id',p.id,'platform',p.platform,'media_type',p.media_type,'book_slug',p.book_slug,'post_type',p.post_type,'scheduled_at',p.scheduled_at,'caption',p.caption,'hashtags',p.hashtags,'content_metadata','{}'::jsonb)
from public.social_posts p where p.id=r.post_id and p.user_id=r.user_id;
create table public.social_strategy_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 settings jsonb not null default '{}' check(jsonb_typeof(settings)='object'),
 updated_at timestamptz not null default now()
);
create table public.social_metric_snapshots(
 post_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 provider_updated_at timestamptz not null,
 observed_at timestamptz not null default now(),
 source text not null default 'buffer_experimental' check(source='buffer_experimental'),
 metrics jsonb not null check(jsonb_typeof(metrics)='object'),
 primary key(post_id,provider_updated_at),
 foreign key(post_id,user_id) references public.social_posts(id,user_id) on delete cascade
);
create index social_metrics_owner_observed on public.social_metric_snapshots(user_id,observed_at desc);
create table public.social_learning_state(
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_started_at timestamptz,
 last_collected_at timestamptz,
 next_collect_at timestamptz not null default now(),
 collection_token uuid,
 collecting_until timestamptz,
 workflow_run_id text,
 status text not null default 'waiting' check(status in ('waiting','collecting','ready','unavailable','error')),
 last_error text not null default '',
 report jsonb not null default '{}' check(jsonb_typeof(report)='object')
);
alter table public.social_strategy_settings enable row level security;
alter table public.social_metric_snapshots enable row level security;
alter table public.social_learning_state enable row level security;
create policy social_strategy_read on public.social_strategy_settings for select to authenticated using(user_id=(select auth.uid()));
create policy social_metrics_read on public.social_metric_snapshots for select to authenticated using(user_id=(select auth.uid()));
create policy social_learning_read on public.social_learning_state for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.social_strategy_settings,public.social_metric_snapshots,public.social_learning_state from anon,authenticated;
grant select on public.social_strategy_settings,public.social_metric_snapshots,public.social_learning_state to authenticated;
grant all on public.social_strategy_settings,public.social_metric_snapshots,public.social_learning_state to service_role;
create function public.social_claim_analytics(p_owner uuid,p_force boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare token uuid;
begin
 insert into public.social_learning_state(user_id) values(p_owner) on conflict do nothing;
 token:=gen_random_uuid();
 update public.social_learning_state set collection_token=token,collecting_until=now()+interval '15 minutes',last_started_at=now(),status='collecting',last_error='',workflow_run_id=null
 where user_id=p_owner and (collecting_until is null or collecting_until<now())
 and (last_started_at is null or last_started_at<now()-interval '1 hour')
 and (p_force or next_collect_at<=now());
 if found then return token;end if;
 return null;
end;$$;
revoke all on function public.social_claim_analytics(uuid,boolean) from public,anon,authenticated;
grant execute on function public.social_claim_analytics(uuid,boolean) to service_role;
