// Authorized maintenance: fill only the missing platforms for one date.
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {start,getRun} from 'workflow/api';
import {addDays,londonDate,londonSchedule} from '../lib/social-calendar.ts';
const owner=process.env.SOCIAL_OWNER_ID,date=process.env.SOCIAL_DATE,deploymentId=process.env.SOCIAL_TARGET_DEPLOYMENT_ID;
if(!owner||date!==londonDate()||!deploymentId) throw new Error('Select the owner, today and a deployed workflow.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const identity=kind=>{const h=createHash('sha256').update(`${owner}:${date}:${kind}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const dayStart=londonSchedule(date,'00:00'),dayEnd=londonSchedule(addDays(date,1),'00:00');
async function job(id){const {data,error}=await db.from('social_generation_runs').select('*').eq('id',id).eq('user_id',owner).maybeSingle();if(error)throw new Error('Could not read the date-fill job.');return data;}
async function launch(current){
 if(current.workflow_run_id) return getRun(current.workflow_run_id);
 const run=await start({workflowId:'workflow//./workflows/social-generation//generateSocialJob'},[current.id],{deploymentId});
 const {error}=await db.from('social_generation_runs').update({workflow_run_id:run.runId}).eq('id',current.id).eq('user_id',owner);
 if(error)throw new Error('Workflow started; verify its saved reference before retrying.');return run;
}
const planId=identity('extra-day-copy'),mediaId=identity('extra-day-media');
let plan=await job(planId);
if(!plan){
 const {data:active,error:activeError}=await db.from('social_generation_runs').select('id').eq('user_id',owner).eq('status','generating');
 if(activeError||active.length)throw new Error('Wait until the current generation job finishes.');
 const {data:existing,error:existingError}=await db.from('social_posts').select('platform').eq('user_id',owner).gte('scheduled_at',dayStart).lt('scheduled_at',dayEnd).neq('status','cancelled');
 if(existingError)throw new Error('Today could not be checked.');
 const occupied=new Set(existing.map(p=>p.platform));
 const platforms=['facebook','instagram','tiktok'].filter(p=>!occupied.has(p));
 if(platforms.length){
  const {data:sources,error:sourceError}=await db.from('social_generation_runs').select('config').eq('user_id',owner).eq('job_type','plan').eq('status','completed').order('created_at',{ascending:false}).limit(1);
  const books=sources?.[0]?.config?.books;
  if(sourceError||!books?.length)throw new Error('The verified book catalogue is unavailable.');
  const {data:upcoming,error:upcomingError}=await db.from('social_posts').select('book_slug,title').eq('user_id',owner).gte('scheduled_at',dayEnd).order('scheduled_at').limit(12);
  if(upcomingError)throw new Error('Upcoming hooks could not be checked.');
  const nextBook=upcoming[0]?.book_slug;
  const book=books.find(b=>b.slug==='borrow-my-calm'&&b.slug!==nextBook)??books.find(b=>b.slug!==nextBook)??books[0];
  const config={books:[book],platforms,guidance:'Create a distinct extra campaign filling today only. Use the assigned genuine book facts. Do not repeat these upcoming hooks: '+upcoming.map(p=>p.title).join('; ')};
  const {error}=await db.from('social_generation_runs').insert({id:planId,user_id:owner,start_date:date,status:'generating',job_type:'plan',config,total_tasks:1});
  if(error)throw new Error('The one-day copy job could not be created.');
  plan=await job(planId);
 }
}
if(plan){
 if(plan.status==='failed'||plan.status==='paused')throw new Error('The date-fill copy job needs attention.');
 if(plan.status==='generating'){
  const {error}=await db.from('social_generation_tasks').upsert({run_id:planId,user_id:owner,ordinal:0,request:{assignments:[{dayIndex:0,date,postType:'trope_hook',book:plan.config.books[0].slug}]}},{onConflict:'run_id,ordinal',ignoreDuplicates:true});
  if(error)throw new Error('The one-day task could not be saved.');
  await (await launch(plan)).returnValue;
  plan=await job(planId);
  if(plan.status!=='completed')throw new Error('Today’s copy did not finish. Saved posts are kept.');
 }
}
const {data:missing,error:missingError}=await db.from('social_posts').select('*').eq('user_id',owner).gte('scheduled_at',dayStart).lt('scheduled_at',dayEnd).eq('status','draft').is('media_path',null).not('planned_media_type','is',null);
if(missingError)throw new Error('Today’s missing media could not be read.');
if(missing.length){
 const groups=new Map();for(const post of missing){const key=`${post.campaign_id}:${post.platform==='tiktok'?'portrait':'feed'}:${post.planned_media_type}:${post.creative_brief}`;groups.set(key,[...(groups.get(key)??[]),post]);}
 if(groups.size>2)throw new Error('The date-fill media job is limited to two artworks.');
 let media=await job(mediaId);
 if(!media){
  const {error}=await db.from('social_generation_runs').insert({id:mediaId,user_id:owner,start_date:date,status:'generating',job_type:'media',config:{books:plan.config.books},total_tasks:groups.size});
  if(error)throw new Error('Today’s media job could not be created.');media=await job(mediaId);
 }
 if(media.status==='generating'){
  const {error}=await db.from('social_generation_tasks').upsert([...groups.values()].map((posts,ordinal)=>({run_id:mediaId,user_id:owner,ordinal,request:{posts}})),{onConflict:'run_id,ordinal',ignoreDuplicates:true});
  if(error)throw new Error('Today’s media tasks could not be saved.');
  await launch(media);
 }
}
console.log('Today’s missing content was prepared; its missing media runs in the background. Existing dates were kept.');
