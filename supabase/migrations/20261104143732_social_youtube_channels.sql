-- Add YouTube without deleting or changing existing platform history or RLS.
alter table public.social_posts drop constraint social_posts_platform_check;
alter table public.social_posts add constraint social_posts_platform_check check (platform in ('facebook','instagram','tiktok','youtube'));
alter table public.social_posts add constraint social_posts_youtube_approval_check check (platform <> 'youtube' or status <> 'approved' or (media_type='video' and length(trim(title)) between 1 and 100));
