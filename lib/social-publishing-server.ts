import type {SocialPlatform} from './social-calendar';
import 'server-only';
import {PUBLISHER_VERSION,publisherNeedsRecovery} from './social-reliability';
import {randomUUID} from 'node:crypto';
import {backgroundRun,isQueueRun,startBackground} from './background-queue';
import {jobAdmin} from './social-job-db';
import {checkBufferConnection} from './buffer';
import {chooseMarlowChannels} from './buffer-publishing';
export function publishingOwner(userId:string) {
  return Boolean(process.env.SOCIAL_STUDIO_OWNER_ID&&process.env.SOCIAL_STUDIO_OWNER_ID===userId);
}
async function recordRun(owner:string,lease:string) {
  const run=await startBackground('publisher',[owner,lease,'0'],owner);
  const saved=await jobAdmin().from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease).is('workflow_run_id',null);
  if(saved.error)throw Error('The publisher reference could not be saved.');
  return run.runId;
}
export async function wakePublisher(owner:string) {await recoverPublisher(owner,true);}
export async function enablePublisher(owner:string,platforms?:SocialPlatform[]) {
  const db=jobAdmin();
  const {data:previous,error}=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
  if(error||!previous?.preflight_at||previous.test_drafts?.length)throw Error('Buffer draft checks must finish before automatic publishing can be enabled.');
  const selected=platforms??(Object.keys(previous.channels??{}).length?Object.keys(previous.channels) as SocialPlatform[]:undefined);
  const channels=chooseMarlowChannels((await checkBufferConnection()).channels,false,selected),lease=randomUUID();
  const saved=await db.from('social_publishing_settings').update({enabled:true,worker_version:PUBLISHER_VERSION,channels,connection_checked_at:new Date().toISOString(),lease,generation:0,workflow_run_id:null,heartbeat_at:null,last_error:'',updated_at:new Date().toISOString()}).eq('user_id',owner);
  if(saved.error)throw Error('Automatic publishing could not be enabled.');
  return recordRun(owner,lease);
}
// Calendar edits fence the previous sleeper and queue a fresh due-time check.
// Maintenance recognises a healthy long sleep or empty calendar as intentional.
export async function recoverPublisher(owner:string,force=false) {
  const db=jobAdmin(),current=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
  if(current.error)throw Error('Publisher recovery could not read its state.');
  const previous=current.data;
  if(!previous?.enabled)return {restarted:false};
  if(!force&&isQueueRun(previous.workflow_run_id)&&previous.worker_version===PUBLISHER_VERSION){
    const run=await backgroundRun(previous.workflow_run_id);
    if(run?.status==='completed')return {restarted:false};
    if(run?.status==='queued'&&Date.parse(run.next_at)>Date.now()-8*60_000)return {restarted:false};
    if(run?.status==='running'&&Date.parse(run.locked_at!)>Date.now()-10*60_000)return {restarted:false};
  }else if(!force&&previous.worker_version===PUBLISHER_VERSION&&!publisherNeedsRecovery(previous))return {restarted:false};
  const lease=randomUUID(),now=new Date().toISOString();
  let claim=db.from('social_publishing_settings').update({lease,generation:0,workflow_run_id:null,heartbeat_at:null,worker_version:PUBLISHER_VERSION,last_error:'',updated_at:now}).eq('user_id',owner).eq('enabled',true).eq('lease',previous.lease).eq('generation',previous.generation).eq('worker_version',previous.worker_version);
  claim=previous.heartbeat_at?claim.eq('heartbeat_at',previous.heartbeat_at):claim.is('heartbeat_at',null).eq('updated_at',previous.updated_at);
  const saved=await claim.select('user_id');
  if(saved.error)throw Error('Publisher recovery could not claim a replacement.');
  if(!saved.data.length)return {restarted:false};
  try {await recordRun(owner,lease);return {restarted:true};}
  catch(error){await db.from('social_publishing_settings').update({last_error:'Publisher dispatch needs recovery.'}).eq('user_id',owner).eq('lease',lease);throw error;}
}
