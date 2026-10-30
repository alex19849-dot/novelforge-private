// Explicit one-off upgrade of default times from the next UK calendar day.
// No caption, media, approval or already submitted post is changed.
import {createClient} from '@supabase/supabase-js';
import {addDays,londonDate,londonTime,londonSchedule} from '../lib/social-calendar.ts';
import {testingPostingHours,TIMING_POLICY} from '../lib/social-posting-times.ts';
const owner=process.env.SOCIAL_STUDIO_OWNER_ID;
if(!owner||process.env.SOCIAL_TIMING_APPLY!=='1')throw Error('Explicitly enable the owner-scoped timing upgrade.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const first=addDays(londonDate(),1);
const posts=checked(await db.from('social_posts').select('*').eq('user_id',owner).eq('status','approved').gte('scheduled_at',londonSchedule(first,'00:00')).order('scheduled_at').limit(200));
if(posts.length===200)throw Error('Review pagination before changing this larger calendar.');
const submitted=checked(await db.from('social_publications').select('post_id').eq('user_id',owner).in('post_id',posts.map(p=>p.id)));
const held=new Set(submitted.map(p=>p.post_id)),counts={};let changed=0,kept=0;
for(const post of posts){
 const oldHour=londonTime(post.scheduled_at);
 const defaults=post.platform==='instagram'?['19:00']:post.platform==='tiktok'?['10:00','18:00']:['10:00','12:00'];
 if(held.has(post.id)||post.content_metadata?.timing_policy===TIMING_POLICY||!defaults.includes(oldHour)){kept++;continue;}
 const date=londonDate(post.scheduled_at),hour=testingPostingHours(date,post.platform)[0],time=String(hour).padStart(2,'0')+':00';
 const scheduled_at=londonSchedule(date,time);
 const saved=checked(await db.from('social_posts').update({scheduled_at,content_metadata:{...post.content_metadata,timing_policy:TIMING_POLICY,timing_previous_at:post.scheduled_at}}).eq('id',post.id).eq('user_id',owner).eq('version',post.version).eq('status','approved').select('id'));
 if(!saved.length){kept++;continue;}
 if(Date.parse(post.scheduled_at)!==Date.parse(scheduled_at))changed++;
 const key=post.platform+' '+time;counts[key]=(counts[key]??0)+1;
}
console.log(JSON.stringify({fromUKDate:first,changedTimes:changed,keptOrEdited:kept,distribution:counts,approvalPreserved:true,policy:TIMING_POLICY}));
