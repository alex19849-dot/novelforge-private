// One-off maintenance launcher. Run after a tested deployment is READY.
// It prepares media only; it cannot send anything to a social network.
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {start} from 'workflow/api';
import {postingHours} from '../lib/social-posting-times.ts';
import {londonDate,londonTime,londonSchedule} from '../lib/social-calendar.ts';
import {musicForPath} from '../lib/social-music.ts';
const owner=process.env.SOCIAL_MUSIC_OWNER_ID;
const deploymentId=process.env.SOCIAL_MUSIC_DEPLOYMENT_ID;
if(!owner||!deploymentId) throw new Error('Select the owner and tested deployment first.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:active,error:activeError}=await db.from('social_generation_runs').select('*').eq('user_id',owner).eq('status','generating').maybeSingle();
if(activeError) throw new Error('The existing background queue could not be checked.');
if(active&&active.config?.operation!=='music') throw new Error('Let the existing content job finish first.');
if(active?.workflow_run_id) { console.log(JSON.stringify({runId:active.id,status:active.status,message:'Music is already running.'})); process.exit(0); }
// Only replace the old automatic defaults; preserve individually chosen times.
const timingChanges=[];
if(process.env.SOCIAL_OPTIMISE_TIMES==='1'&&!active) {
 const {data:future,error}=await db.from('social_posts').select('*').eq('user_id',owner).in('status',['draft','approved']).gt('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(540);
 if(error) throw new Error('Posting times could not be checked.');
 for(const post of future) {
  const oldDefault=post.platform==='facebook'?'18:00':post.platform==='tiktok'?'20:00':'19:00';
  if(londonTime(post.scheduled_at)!==oldDefault) continue;
  const date=londonDate(post.scheduled_at);
  const candidate=postingHours(date,post.platform).map(hour=>londonSchedule(date,`${String(hour).padStart(2,'0')}:00`)).find(time=>Date.parse(time)>Date.now()+30*60_000);
  if(!candidate||candidate===post.scheduled_at) continue;
  const {data:saved,error}=await db.from('social_posts').update({scheduled_at:candidate}).eq('id',post.id).eq('user_id',owner).eq('version',post.version).in('status',['draft','approved']).select('id');
  if(error) throw new Error('A posting time could not be saved.');
  if(saved.length) timingChanges.push({id:post.id,platform:post.platform,from:post.scheduled_at,to:candidate});
 }
 console.log('Updated '+timingChanges.length+' default posting times using the reviewed weekly scores.');
}
const {data:posts,error}=await db.from('social_posts').select('*').eq('user_id',owner).eq('platform','tiktok').in('status',['draft','approved']).not('media_path','is',null).gt('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(180);
if(error) throw new Error('Upcoming TikTok posts could not be loaded.');
const selected=posts.filter(post=>!musicForPath(post.media_path));
if(!selected.length) { console.log('All upcoming TikTok posts have licensed backing music.'); process.exit(0); }
const runId=active?.id??crypto.randomUUID();
if(!active) {
 const {error}=await db.from('social_generation_runs').insert({id:runId,user_id:owner,start_date:londonDate(),status:'generating',job_type:'media',config:{operation:'music',books:[],timing_review:'2026-10-27',timing_changes:timingChanges},total_tasks:selected.length});
 if(error) throw new Error('The music batch could not be created.');
}
const {error:taskError}=await db.from('social_generation_tasks').upsert(selected.map((post,ordinal)=>({run_id:runId,user_id:owner,ordinal,request:{music:true,posts:[post]}})),{onConflict:'run_id,ordinal',ignoreDuplicates:true});
if(taskError) throw new Error('Music tasks could not be saved.');
const manifest=JSON.parse(await readFile('.next/diagnostics/workflows-manifest.json','utf8'));
const reference=manifest.workflows['workflows/social-generation.ts']?.generateSocialJob;
if(!reference?.workflowId) throw new Error('The tested workflow is missing from the build manifest.');
const workflow=await start({workflowId:reference.workflowId},[runId],{deploymentId});
const {error:saveError}=await db.from('social_generation_runs').update({workflow_run_id:workflow.runId}).eq('id',runId).eq('user_id',owner);
if(saveError) throw new Error('The music workflow started but its reference could not be saved.');
console.log(JSON.stringify({runId,count:selected.length,status:'generating',message:'Music exports are running in the background. Nothing was published.'}));
