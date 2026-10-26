-- Calendar foundation only. No worker or automatic publishing is enabled here.
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  book_slug text not null default '',
  book_title text not null default '',
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  post_type text not null default 'book_promotion' check (post_type in ('premise_hook','trope_hook','character_conflict','reader_question','humour','book_promotion','new_release','video','reader_engagement')),
  title text not null default '' check (length(title) <= 240),
  caption text not null default '' check (length(caption) <= 10000),
  hashtags text[] not null default '{}',
  media_path text,
  media_type text check (media_type in ('image','video')),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','publishing','published','failed','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_id, platform),
  check ((media_path is null) = (media_type is null)),
  check (media_path is null or media_path like user_id::text || '/calendar/%'),
  check (status <> 'approved' or (scheduled_at is not null and length(trim(caption)) > 0 and (platform = 'facebook' or media_path is not null)))
);
create index social_posts_user_schedule on public.social_posts(user_id, scheduled_at);
alter table public.social_posts enable row level security;
create policy social_posts_read_own on public.social_posts for select to authenticated using (user_id = (select auth.uid()));
create policy social_posts_create_own_drafts on public.social_posts for insert to authenticated with check (user_id = (select auth.uid()) and status in ('draft','approved'));
create policy social_posts_edit_own_drafts on public.social_posts for update to authenticated using (user_id = (select auth.uid()) and status in ('draft','approved')) with check (user_id = (select auth.uid()) and status in ('draft','approved'));
create policy social_posts_delete_own_drafts on public.social_posts for delete to authenticated using (user_id = (select auth.uid()) and status in ('draft','approved'));
revoke all on public.social_posts from anon, authenticated;
grant select, insert, update, delete on public.social_posts to authenticated;
create function public.social_posts_version() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger social_posts_version before update on public.social_posts for each row execute function public.social_posts_version();
