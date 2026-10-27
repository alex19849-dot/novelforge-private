import 'server-only';
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
export async function enablePublisher(owner:string) {
  const db=jobAdmin();
  const {data:previous,error}=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
  if(error||!previous?.preflight_at||previous.test_drafts?.length) throw new Error('Buffer draft checks must finish before automatic publishing can be enabled.');
  const channels=chooseMarlowChannels((await checkBufferConnection()).channels);
  const lease=randomUUID();
  const {error:saveError}=await db.from('social_publishing_settings').update({enabled:true,channels,connection_checked_at:new Date().toISOString(),lease,generation:0,workflow_run_id:null,heartbeat_at:null,last_error:'',updated_at:new Date().toISOString()}).eq('user_id',owner);
  if(saveError) throw new Error('Automatic publishing could not be enabled.');
  try {
    const run=await start(publishSocialCalendar,[owner,lease,0]);
    const {error}=await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease);
    if(error) throw new Error('The publisher started but its reference could not be saved.');
    return run.runId;
  }catch(error) {
    await db.from('social_publishing_settings').update({enabled:false,last_error:'The automatic publisher could not start. Try enabling it again.'}).eq('user_id',owner).eq('lease',lease);
    throw error;
  }
}
