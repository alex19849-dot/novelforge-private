-- Studio previews use creations; legacy calendar uploads remain valid.
-- Keep the same owner prefix on both paths. RLS and publishing rules are unchanged.
alter table public.social_posts
  drop constraint social_posts_check1,
  add constraint social_posts_check1 check (
    media_path is null
    or media_path like user_id::text || '/calendar/%'
    or media_path like user_id::text || '/creations/%'
  );
