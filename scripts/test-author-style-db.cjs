const {PGlite}=require('@electric-sql/pglite');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.stories(id uuid primary key);`);
await db.exec(fs.readFileSync(require('path').join(__dirname,'../supabase/migrations/20261118100532_author_style_learning.sql'),'utf8'));
await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');insert into author_style_profiles(user_id) select id from auth.users;set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
assert.equal((await db.query('select * from author_style_profiles')).rows.length,1);
await assert.rejects(()=>db.exec("update author_style_profiles set enabled=false"));
await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select * from author_style_profiles'));
await db.close();console.log('Style database: migration, account isolation, anonymous denial and server-only writes passed.');})().catch(e=>{console.error(e);process.exitCode=1});
