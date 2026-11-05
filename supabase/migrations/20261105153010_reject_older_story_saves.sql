-- Keep older browser autosaves from rolling a newer saved story backwards.
-- Applies to row updates, including the UPDATE side of an upsert.
-- Equal timestamps remain valid for writes that do not advance the revision.
create or replace function public.reject_older_story_save()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.updated_at is not null
     and (new.updated_at is null or new.updated_at < old.updated_at) then
    raise exception using
      errcode = '40001',
      message = 'This story has newer saved changes. Reopen the story before saving; your local text has not been deleted.';
  end if;
  return new;
end;
$$;

create trigger stories_reject_older_save
before update on public.stories
for each row execute function public.reject_older_story_save();
