// Run explicitly inside Vercel after the matching source deployment is READY.
// Reuse the existing publisher and leave every approved post/content/date unchanged.
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {start} from 'workflow/api';
const owner=process.env.SOCIAL_STUDIO_OWNER_ID,target=process.env.SOCIAL_STRATEGY_DEPLOYMENT_ID;
if(!owner||!target||process.env.SOCIAL_STRATEGY_UPGRADE!=='1')throw Error('Select the tested Social Studio deployment and explicitly enable this upgrade.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=result=>{if(result.error)throw Error(result.error.message);return result.data;};
const manifest=JSON.parse(await readFile('.next/diagnostics/workflows-manifest.json','utf8'));
const publisher=manifest.workflows['workflows/social-publishing.ts']?.publishSocialCalendar,analytics=manifest.workflows['workflows/social-analytics.ts']?.collectSocialAnalytics;
if(!publisher?.workflowId||!analytics?.workflowId)throw Error('The tested build is missing a Social Studio workflow.');
const previous=checked(await db.from('social_publishing_settings').select('enabled,lease,generation').eq('user_id',owner).single());
const before=checked(await db.from('social_posts').select('id,version,status,scheduled_at').eq('user_id',owner));
if(previous.enabled){
 const lease=crypto.randomUUID();
 const saved=checked(await db.from('social_publishing_settings').update({lease,generation:0,workflow_run_id:null,heartbeat_at:null,last_error:''}).eq('user_id',owner).eq('lease',previous.lease).eq('generation',previous.generation).select('user_id'));
 if(saved.length!==1)throw Error('The publisher changed during the upgrade. Inspect it before retrying.');
 const run=await start({workflowId:publisher.workflowId},[owner,lease,0],{deploymentId:target});
 checked(await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease).eq('generation',0));
 console.log(JSON.stringify({publisherUpgraded:true,workflowRunId:run.runId,target}));
}else console.log('Publishing was paused and remains paused.');
const token=checked(await db.rpc('social_claim_analytics',{p_owner:owner,p_force:false}));
if(token){const run=await start({workflowId:analytics.workflowId},[owner,token],{deploymentId:target});checked(await db.from('social_learning_state').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('collection_token',token));console.log(JSON.stringify({analyticsStarted:true,workflowRunId:run.runId}));}
const after=checked(await db.from('social_posts').select('id,version,status,scheduled_at').eq('user_id',owner));
console.log(JSON.stringify({calendarUntouched:JSON.stringify(before.sort((a,b)=>a.id.localeCompare(b.id)))===JSON.stringify(after.sort((a,b)=>a.id.localeCompare(b.id))),posts:after.length}));
