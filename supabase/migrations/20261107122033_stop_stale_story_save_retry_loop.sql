-- A rejected stale save is a permanent conflict, not a retryable serialization failure.
-- PT409 prevents PostgREST 14 from looping on SQLSTATE 40001.
CREATE OR REPLACE FUNCTION public.reject_older_story_save()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF old.updated_at IS NOT NULL
     AND (new.updated_at IS NULL OR new.updated_at < old.updated_at) THEN
    RAISE SQLSTATE 'PT409'
      USING MESSAGE = 'This story has newer saved changes. Reopen the story before saving; your local text has not been deleted.';
  END IF;
  RETURN new;
END;
$function$;
