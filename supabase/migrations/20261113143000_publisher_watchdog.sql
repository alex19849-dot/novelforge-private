-- Independent of the publisher's own deployment and durable workflow.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists social_private;
revoke all on schema social_private from public,anon,authenticated;
create or replace function social_private.check_publisher()
returns bigint language plpgsql security invoker set search_path='' as $$
declare signing_key text; stamp text; signature text; request_id bigint;
begin
 select decrypted_secret into signing_key from vault.decrypted_secrets where name='social_maintenance_signing_key';
 if signing_key is null then raise exception 'Social maintenance signing key is not configured';end if;
 stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac(stamp||':social-maintenance-v1',signing_key,'sha256'),'hex');
 -- Only a five-minute signature enters pg_net's plaintext request queue.
 -- The signing key and service role credential are never sent.
 select net.http_post(
  url:='https://project-mkt4s.vercel.app/api/social-studio/maintenance',
  headers:=jsonb_build_object('Content-Type','application/json','x-maintenance-at',stamp,'x-maintenance-signature',signature),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 ) into request_id;
 return request_id;
end;$$;
revoke all on function social_private.check_publisher() from public,anon,authenticated,service_role;
-- Activate cron only after the endpoint and its server-only key are deployed.
