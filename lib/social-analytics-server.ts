import 'server-only';
import {startBackground} from './background-queue';
import {jobAdmin} from './social-job-db';
export async function queueAnalytics(owner:string,force=false){
 const db=jobAdmin();
 const {data:token,error}=await db.rpc('social_claim_analytics',{p_owner:owner,p_force:force});
 if(error)throw Error('Analytics collection could not be queued.');
 if(!token)return null;
 try{
  const run=await startBackground('analytics',[owner,token],owner);
  const {error}=await db.from('social_learning_state').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('collection_token',token);
  if(error)throw Error('Analytics progress could not be saved.');
  return run.runId;
 }catch(error){
  await db.from('social_learning_state').update({status:'error',collecting_until:null,next_collect_at:new Date(Date.now()+3600000).toISOString(),last_error:'Analytics could not start. Retrying later; publishing is unaffected.'}).eq('user_id',owner).eq('collection_token',token);
  throw error;
 }
}
