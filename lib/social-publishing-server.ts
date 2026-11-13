import type {SocialPlatform} from './social-calendar';
import 'server-only';
import {PUBLISHER_VERSION,publisherNeedsRecovery} from './social-reliability';
import {randomUUID} from 'node:crypto';
import {start,getRun} from 'workflow/api';
import {jobAdmin} from './social-job-db';
import {publishSocialCalendar} from '../workflows/social-publishing';
import {checkBufferConnection} from './buffer';
import {chooseMarlowChannels} from './buffer-publishing';
export function publishingOwner(userId:string) {
  return Boolean(process.env.SOCIAL_STUDIO_OWNER_ID&&process.env.SOCIAL_STUDIO_OWNER_ID===userId);
}
export async function wakePublisher(owner:string) {
  const {data,error}=await jobAdmin().from('social_publishing_settings').select('enabled,workflow_run_id').eq('user_id',owner).maybeSingle();
  if(error) throw new Error('The automatic publisher could not be checked.');
  if(data?.enabled&&data.workflow_run_id) await getRun(data.workflow_run_id).wakeUp();
}
export async function enablePublisher(owner:string,platforms?:SocialPlatform[]) {
  const db=jobAdmin();
  const {data:previous,error}=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
  if(error||!previous?.preflight_at||previous.test_drafts?.length) throw new Error('Buffer draft checks must finish before automatic publishing can be enabled.');
  const selected=platforms??(Object.keys(previous.channels??{}).length?Object.keys(previous.channels) as SocialPlatform[]:undefined);
  const channels=chooseMarlowChannels((await checkBufferConnection()).channels,false,selected);
  const lease=randomUUID();
  const {error:saveError}=await db.from('social_publishing_settings').update({enabled:true,worker_version:PUBLISHER_VERSION,channels,connection_checked_at:new Date().toISOString(),lease,generation:0,workflow_run_id:null,heartbeat_at:null,last_error:'',updated_at:new Date().toISOString()}).eq('user_id',owner);
  if(saveError) throw new Error('Automatic publishing could not be enabled.');
  try {
    const run=await start(publishSocialCalendar,[owner,lease,0]);
    const {error}=await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease);
    if(error) throw new Error('The publisher started but its reference could not be saved.');
    return run.runId;
  }catch(error) {
    await db.from('social_publishing_settings').update({last_error:'The automatic publisher could not start. Automatic recovery will retry.'}).eq('user_id',owner).eq('lease',lease);
    throw error;
  }
}


// Compare-and-swap the observed worker. Concurrent checks cannot create two
// active leases, and a paused publisher is never silently re-enabled.
export async function recoverPublisher(owner:string){
 const db=jobAdmin();
 const current=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
 if(current.error)throw Error('Publisher recovery could not read its state.');
 const previous=current.data;
 if(!previous||!publisherNeedsRecovery(previous))return {restarted:false};
 const lease=randomUUID(),now=new Date().toISOString();
 let claim=db.from('social_publishing_settings').update({lease,generation:0,workflow_run_id:null,heartbeat_at:null,worker_version:PUBLISHER_VERSION,last_error:'',updated_at:now}).eq('user_id',owner).eq('enabled',true).eq('lease',previous.lease).eq('generation',previous.generation).eq('worker_version',previous.worker_version);
 claim=previous.heartbeat_at?claim.eq('heartbeat_at',previous.heartbeat_at):claim.is('heartbeat_at',null).eq('updated_at',previous.updated_at);
 const saved=await claim.select('user_id');
 if(saved.error)throw Error('Publisher recovery could not claim a replacement.');
 if(!saved.data.length)return {restarted:false};
 try{
  const run=await start(publishSocialCalendar,[owner,lease,0]);
  const recorded=await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease).is('workflow_run_id',null);
  if(recorded.error)throw Error('The replacement reference could not be saved.');
  return {restarted:true};
 }catch(error){
  await db.from('social_publishing_settings').update({last_error:'Publisher recovery is retrying automatically.'}).eq('user_id',owner).eq('lease',lease);
  throw error;
 }
}
