// Explicit maintenance command. Runs inside Vercel with existing server credentials.
// Rotates the worker lease; never retries provider-created or ambiguous posts.
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {start} from 'workflow/api';
import {checkBufferConnection} from '../lib/buffer.ts';
import {chooseMarlowChannels,bufferPayload,recentBufferPosts,matchingBufferPosts} from '../lib/buffer-publishing.ts';
const owner=process.env.SOCIAL_STUDIO_OWNER_ID,target=process.env.SOCIAL_PUBLISHING_DEPLOYMENT_ID;
const date=process.env.SOCIAL_PUBLISHING_RECOVER;
if(!owner||!target||date!=='2026-10-28')throw Error('Select the tested deployment and explicitly authorized recovery date.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=(result)=>{if(result.error)throw Error(result.error.message);return result.data;};
const settings=checked(await db.from('social_publishing_settings').select('*').eq('user_id',owner).single());
if(!settings.enabled||!settings.preflight_at||settings.test_drafts.length||settings.workflow_run_id)throw Error('Expected an enabled publisher stranded between runs, with draft tests complete.');
const channels=chooseMarlowChannels((await checkBufferConnection()).channels);
const posts=checked(await db.from('social_posts').select('*').eq('user_id',owner).eq('status','approved').gte('scheduled_at',date+'T00:00:00Z').lt('scheduled_at','2026-10-29T00:00:00Z').order('scheduled_at'));
if(posts.length!==3||new Set(posts.map(p=>p.platform)).size!==3)throw Error('Expected precisely today’s three approved posts. No schedule was changed.');
const publications=checked(await db.from('social_publications').select('post_id').in('post_id',posts.map(p=>p.id)));
if(publications.length)throw Error('An existing publication needs reconciliation, not resubmission.');
for(const post of posts){
 const channel=channels[post.platform];if(channel.id!==settings.channels[post.platform]?.id)throw Error('The publishing account changed.');
 const since=date+'T00:00:00Z',url=post.media_path?db.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl:'';
 const matches=matchingBufferPosts(await recentBufferPosts(channel.organizationId,channel.id,since),bufferPayload(post,channel,url),since);
 if(matches.length)throw Error('Buffer already has a matching post. No duplicate will be created.');
}
const lease=crypto.randomUUID();
const claimed=checked(await db.from('social_publishing_settings').update({lease,generation:0,workflow_run_id:null,heartbeat_at:null,last_error:'',channels,connection_checked_at:new Date().toISOString()}).eq('user_id',owner).eq('lease',settings.lease).eq('generation',settings.generation).is('workflow_run_id',null).select('user_id'));
if(claimed.length!==1)throw Error('The worker changed while checking. Recovery stopped.');
const startAt=Date.now()+120000;
for(const [index,post] of posts.entries()){
 const scheduled_at=new Date(startAt+index*120000).toISOString();
 const updated=checked(await db.from('social_posts').update({scheduled_at}).eq('id',post.id).eq('user_id',owner).eq('status','approved').eq('version',post.version).select('id'));
 if(updated.length!==1)throw Error('A post changed during recovery. Inspect the calendar before continuing.');
 console.log(JSON.stringify({recoveredPost:post.id,platform:post.platform,originalTime:post.scheduled_at,newTime:scheduled_at}));
}
const manifest=JSON.parse(await readFile('.next/diagnostics/workflows-manifest.json','utf8'));
const reference=manifest.workflows['workflows/social-publishing.ts']?.publishSocialCalendar;
if(!reference?.workflowId)throw Error('The tested publisher is missing from the build.');
const run=await start({workflowId:reference.workflowId},[owner,lease,0],{deploymentId:target});
checked(await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease).eq('generation',0));
console.log(JSON.stringify({restarted:true,workflowRunId:run.runId,target,recoveredPosts:posts.length}));
