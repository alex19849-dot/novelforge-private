import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(), owner=randomUUID(), other=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f.includes('_social_')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
await db.query('insert into auth.users values($1),($2)',[owner,other]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
await db.exec('set role authenticated');
async function insert(platform,path,type='image',user=owner){return (await db.query(`insert into social_posts(campaign_id,user_id,platform,title,caption,media_path,media_type,status) values(gen_random_uuid(),$1,$2,'Actual book title','A platform-specific caption',$3,$4,'draft') returning *`,[user,platform,path,type])).rows[0];}
for(const platform of ['facebook','tiktok','youtube']){
 const type=platform==='facebook'?'image':'video';
 const path=owner+'/creations/'+randomUUID()+'/'+(type==='image'?'feed.jpg':'short-music-v1.mp4');
 const post=await insert(platform,path,type);
 assert.equal(post.media_path,path);
 const updated=(await db.query("update social_posts set status='approved',scheduled_at=now()+interval '1 day' where id=$1 and user_id=$2 and version=$3 returning *",[post.id,owner,post.version])).rows[0];
 assert.equal(updated.status,'approved');assert.equal(updated.version,2);
 assert.equal((await db.query('select * from social_posts where id=$1',[post.id])).rows.length,1);
}
assert.equal((await insert('facebook',owner+'/calendar/legacy.jpg')).status,'draft');
await assert.rejects(insert('facebook',other+'/creations/foreign.jpg'),e=>e.code==='23514');
await assert.rejects(insert('facebook',owner+'/unapproved-folder/file.jpg'),e=>e.code==='23514');
await assert.rejects(insert('facebook',other+'/creations/file.jpg','image',other),e=>e.code==='42501');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
assert.equal((await db.query('select * from social_posts')).rows.length,0);
await db.close();
console.log('PASS: generated media saves and approves for Facebook, TikTok and YouTube under authenticated RLS; optimistic update versions work; calendar compatibility retained; foreign media and cross-account access rejected.');
