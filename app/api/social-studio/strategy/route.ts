import {jobAdmin,jobUser,jobJson} from '../../../../lib/social-job-server';
import {publishingOwner} from '../../../../lib/social-publishing-server';
import {cleanStrategy} from '../../../../lib/social-strategy';
import {queueAnalytics} from '../../../../lib/social-analytics-server';
export const runtime='nodejs';
export const maxDuration=60;
async function owner(request:Request){const user=await jobUser(request);return user&&publishingOwner(user.id)?user:null;}
export async function GET(request:Request){
 const user=await owner(request);if(!user)return jobJson({error:'Sign in with the Social Studio owner account.'},401);
 try{
  const db=jobAdmin();const [preferences,state]=await Promise.all([
   db.from('social_strategy_settings').select('settings').eq('user_id',user.id).maybeSingle(),
   db.from('social_learning_state').select('status,last_started_at,last_collected_at,next_collect_at,last_error,report').eq('user_id',user.id).maybeSingle(),
  ]);
  if(preferences.error||state.error)throw Error('The social strategy could not be loaded.');
  return jobJson({settings:cleanStrategy(preferences.data?.settings),state:state.data});
 }catch{return jobJson({error:'The social strategy could not be loaded.'},503);}
}
export async function POST(request:Request){
 const user=await owner(request);if(!user)return jobJson({error:'Sign in with the Social Studio owner account.'},401);
 try{
  const body=await request.json();
  if(body.action==='refresh')return jobJson({ok:true,runId:await queueAnalytics(user.id,true),message:'Analytics runs in the background, at most once an hour. You can close this page.'},202);
  const db=jobAdmin();let settings;
  if(body.action==='block'&&typeof body.topic==='string'&&body.topic.trim()){
   const {data,error}=await db.from('social_strategy_settings').select('settings').eq('user_id',user.id).maybeSingle();
   if(error)throw Error('Blocked topics could not be loaded.');
   const previous=cleanStrategy(data?.settings);
   settings=cleanStrategy({...previous,blocked_topics:[...new Set([...previous.blocked_topics,body.topic.trim()])]});
  }else if(body.action==='save')settings=cleanStrategy(body.settings);
  else return jobJson({error:'Choose a valid strategy action.'},400);
  const {error}=await db.from('social_strategy_settings').upsert({user_id:user.id,settings,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw Error('The strategy could not be saved.');
  return jobJson({ok:true,settings});
 }catch(error){return jobJson({error:error instanceof Error?error.message:'The strategy could not be saved.'},400);}
}
