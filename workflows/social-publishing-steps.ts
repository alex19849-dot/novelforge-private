import {getWorkflowMetadata} from 'workflow';
import {jobAdmin} from '../lib/social-job-db';
import {bufferPayload,BufferPublishError,createBufferPost,readBufferPost,recentBufferPosts,matchingBufferPosts} from '../lib/buffer-publishing';
import type {ProviderPost} from '../lib/buffer-publishing';
import type {CalendarPost} from '../lib/social-calendar';
import {checkBufferConnection} from '../lib/buffer';
import {chooseMarlowChannels} from '../lib/buffer-publishing';
type Publication={post_id:string;user_id:string;attempt:number;state:string;provider_post_id:string|null;payload:any;submitted_at:string;next_check_at:string|null;poll_count:number};
async function result(item:Publication,state:string,options:{id?:string;link?:string;error?:string;delay?:number}={}) {
  const {error}=await jobAdmin().rpc('social_publication_result',{p_owner:item.user_id,p_post:item.post_id,p_attempt:item.attempt,p_state:state,p_provider:options.id??null,p_link:options.link??null,p_error:options.error??'',p_delay:options.delay??60});
  if(error) throw new Error('Publishing progress could not be saved.');
}
async function observe(item:Publication,post:ProviderPost) {
  if(post.status==='sent') return result(item,'published',{id:post.id,link:post.externalLink});
  if(post.status==='error'||post.status==='draft'||post.status==='needs_approval') return result(item,'failed',{id:post.id,error:post.error?.message||`Buffer returned ${post.status}. Check this post in Buffer before retrying.`});
  if(item.poll_count>=20) return result(item,'attention',{id:post.id,error:'Buffer has not confirmed publication yet. Check Buffer history, then use Check publishing status. No duplicate was sent.'});
  return result(item,'accepted',{id:post.id,error:'',delay:item.poll_count<3?30:300});
}
async function reconcile(item:Publication,channels:any) {
  try {
    if(item.provider_post_id) return await observe(item,await readBufferPost(item.provider_post_id));
    const channel=Object.values(channels).find((channel:any)=>channel.id===item.payload.channelId) as any;
    if(!channel) return result(item,'attention',{error:'The original Buffer channel is missing. Check the connection before retrying.'});
    const since=new Date(Date.parse(item.submitted_at)-60000).toISOString();
    const candidates=matchingBufferPosts(await recentBufferPosts(channel.organizationId,channel.id,since),item.payload,since);
    if(candidates.length===1) return await observe(item,candidates[0]);
    if(candidates.length>1||item.poll_count>=10) return result(item,'attention',{error:'Buffer did not provide one confirmed matching post. Check Buffer history before retrying. No duplicate was sent.'});
    return result(item,'uncertain',{error:'Waiting for Buffer to confirm whether it accepted the request. No duplicate will be submitted.',delay:120});
  }catch(error) {
    if(item.poll_count>=20) return result(item,'attention',{error:'Buffer status could not be confirmed. Use Check publishing status after checking the connection.'});
    return result(item,item.provider_post_id?'accepted':'uncertain',{error:error instanceof Error?error.message:'Buffer status is temporarily unavailable.',delay:error instanceof BufferPublishError?error.retryAfter:300});
  }
}
export async function registerPublisher(owner:string,lease:string,generation:number) {
  'use step';
  const {data,error}=await jobAdmin().rpc('social_register_publisher',{p_owner:owner,p_lease:lease,p_generation:generation,p_worker:getWorkflowMetadata().workflowRunId});
  if(error) throw new Error('The automatic publisher could not register.');
  console.log('Social publisher registered',{owner,generation,active:data});
  return Boolean(data);
}
async function failBeforeSubmission(post:CalendarPost,message:string) {
  const db=jobAdmin();
  const {data,error}=await db.from('social_posts').update({status:'failed'}).eq('id',post.id).eq('user_id',post.user_id).eq('version',post.version).eq('status','approved').select('id');
  if(error) throw new Error('The publishing error could not be saved.');
  if(data.length) {
    const {error}=await db.from('social_publications').upsert({post_id:post.id,user_id:post.user_id,state:'failed',payload:{},scheduled_at:post.scheduled_at,last_error:message,safe_to_retry:true},{onConflict:'post_id'});
    if(error) throw new Error('The publishing error details could not be saved.');
  }
}
export async function publishingTick(owner:string,lease:string,generation:number):Promise<{stop:boolean;delay:number}> {
  'use step';
  const db=jobAdmin(),worker=getWorkflowMetadata().workflowRunId;
  const {data:settings,error:settingsError}=await db.from('social_publishing_settings').select('*').eq('user_id',owner).single();
  if(settingsError) throw new Error('Publishing settings could not be loaded.');
  if(!settings.enabled||settings.lease!==lease||settings.generation!==generation||settings.workflow_run_id!==worker) return {stop:true,delay:300};
  try {
    const now=new Date().toISOString();
    const {error:heartbeatError}=await db.from('social_publishing_settings').update({heartbeat_at:now,last_error:''}).eq('user_id',owner).eq('lease',lease).eq('generation',generation);
    if(heartbeatError) throw new Error('The publisher heartbeat could not be saved.');
    const {data:pending,error:pendingError}=await db.from('social_publications').select('*').eq('user_id',owner).in('state',['submitting','accepted','uncertain']).lte('next_check_at',now).order('next_check_at').limit(6);
    if(pendingError) throw new Error('The publishing history could not be loaded.');
    for(const item of pending) await reconcile(item,settings.channels);
    const {data:due,error:dueError}=await db.from('social_posts').select('*').eq('user_id',owner).eq('status','approved').lte('scheduled_at',now).order('scheduled_at').limit(6);
    if(dueError) throw new Error('Approved posts could not be loaded.');
    // Refresh connection health only when work is due, not during every idle tick.
    if(due.length&&Date.now()-Date.parse(settings.connection_checked_at??'2000-01-01')>6*60*60_000) {
      const fresh=chooseMarlowChannels((await checkBufferConnection()).channels,true);
      for(const platform of ['facebook','instagram','tiktok']) if(settings.channels[platform]?.id!==fresh[platform].id) throw new Error('A Buffer channel changed. Pause and reconnect before publishing to a different account.');
      const {error}=await db.from('social_publishing_settings').update({connection_checked_at:now,channels:fresh}).eq('user_id',owner).eq('lease',lease);
      if(error) throw new Error('Connection health could not be saved.');
      settings.channels=fresh;
    }
    const retryTimes:number[]=[];
    for(const post of due as CalendarPost[]) {
      if(Date.parse(post.scheduled_at!)<Date.now()-30*60_000) {await failBeforeSubmission(post,'This posting time was missed by more than 30 minutes. Return it to a draft and choose a new time.');continue;}
      const {data:previous,error:previousError}=await db.from('social_publications').select('*').eq('post_id',post.id).eq('user_id',owner).maybeSingle();
      if(previousError) throw new Error('Duplicate protection could not be checked.');
      if(previous&&!(previous.state==='retry'&&previous.safe_to_retry&&Date.parse(previous.next_check_at)<=Date.now())) {if(previous.state==='retry'&&previous.safe_to_retry&&previous.next_check_at) retryTimes.push(Date.parse(previous.next_check_at));continue;}
      let payload;
      try {
        const channel=settings.channels[post.platform];
        if(!channel) throw new Error(`The ${post.platform} connection is missing.`);
        if(channel.isDisconnected||channel.isLocked||channel.isQueuePaused) throw new Error(`Reconnect or unpause ${post.platform} in Buffer before publishing.`);
        const url=post.media_path?db.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl:'';
        payload=bufferPayload(post,channel,url);
      }catch(error){await failBeforeSubmission(post,error instanceof Error?error.message:'The post is not ready for publishing.');continue;}
      const {data:claimed,error:claimError}=await db.rpc('social_claim_publication',{p_owner:owner,p_lease:lease,p_generation:generation,p_worker:worker,p_post:post.id,p_version:post.version,p_payload:payload});
      if(claimError) throw new Error('This post could not be reserved for publishing.');
      const item=claimed?.[0] as Publication|undefined;
      if(!item) continue;
      console.log('Dispatching approved social post',{postId:post.id,platform:post.platform,attempt:item.attempt});
      try {await observe(item,await createBufferPost(payload));}
      catch(error) {
        const type=error instanceof BufferPublishError?error.kind:'unknown';
        await result(item,type==='retry'?'retry':type==='rejected'?'failed':'uncertain',{error:error instanceof Error?error.message:'The Buffer response could not be confirmed.',delay:error instanceof BufferPublishError?error.retryAfter:120});
      }
    }
    const {data:future,error:futureError}=await db.from('social_posts').select('scheduled_at').eq('user_id',owner).eq('status','approved').gt('scheduled_at',now).order('scheduled_at').limit(1);
    const {data:checks,error:checksError}=await db.from('social_publications').select('next_check_at').eq('user_id',owner).in('state',['submitting','accepted','uncertain']).not('next_check_at','is',null).order('next_check_at').limit(1);
    if(futureError||checksError) throw new Error('The next publishing time could not be checked.');
    const times=[...retryTimes,...[future[0]?.scheduled_at,checks[0]?.next_check_at].filter(Boolean).map(time=>Date.parse(time))];
    return {stop:false,delay:Math.max(5,Math.min(300,Math.ceil((Math.min(...times,Date.now()+300_000)-Date.now())/1000)))};
  }catch(error) {
    const message=error instanceof Error?error.message:'The automatic publisher is retrying.';
    await db.from('social_publishing_settings').update({last_error:message,heartbeat_at:new Date().toISOString()}).eq('user_id',owner).eq('lease',lease);
    console.warn('Social publisher will retry',{owner,message});
    return {stop:false,delay:60};
  }
}
export async function advancePublisher(owner:string,lease:string,generation:number) {
  'use step';
  const db=jobAdmin();
  const {data,error}=await db.from('social_publishing_settings').update({generation:generation+1,workflow_run_id:null}).eq('user_id',owner).eq('lease',lease).eq('generation',generation).eq('enabled',true).select('generation');
  if(error) throw new Error('The next publisher run could not be prepared.');
  if(data.length) return generation+1;
  const {data:current,error:readError}=await db.from('social_publishing_settings').select('generation,lease,enabled').eq('user_id',owner).single();
  if(readError) throw new Error('The publisher continuation could not be checked.');
  return current.enabled&&current.lease===lease&&current.generation===generation+1?generation+1:null;
}
