-- Batch only the owner's explicit id/version snapshots, using the existing RLS.
create function public.social_set_ready_posts_approval(p_posts jsonb, p_approve boolean default true)
returns setof public.social_posts
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Sign in before approving posts.' using errcode='42501';
  end if;
  if p_approve is null or p_posts is null or jsonb_typeof(p_posts)<>'array' then
    raise exception 'Select the posts to update.' using errcode='22023';
  end if;
  if jsonb_array_length(p_posts)<1 or jsonb_array_length(p_posts)>300 then
    raise exception 'Select between 1 and 300 posts.' using errcode='22023';
  end if;
  return query
    update public.social_posts as post
    set status = case when p_approve then 'approved' else 'draft' end
    from jsonb_to_recordset(p_posts) as item(id uuid, version integer)
    where post.id=item.id
      and post.user_id=owner_id
      and post.version=item.version
      and post.status=case when p_approve then 'draft' else 'approved' end
      and (not p_approve or (
        post.scheduled_at>statement_timestamp()
        and post.caption ~ '[^[:space:]]'
        and ((post.platform='facebook' and post.planned_media_type is null)
             or (post.media_path is not null and post.media_type is not null))
        and length(post.caption || E'\n\n' || array_to_string(post.hashtags,' ')) <=
          case when post.platform='instagram' then 2196
               when post.platform='tiktok' and post.media_type='video' then 2200
               when post.platform='tiktok' then 4000 else 5000 end
      ))
    returning post.*;
end;
$$;
revoke all on function public.social_set_ready_posts_approval(jsonb,boolean) from public,anon;
grant execute on function public.social_set_ready_posts_approval(jsonb,boolean) to authenticated;
