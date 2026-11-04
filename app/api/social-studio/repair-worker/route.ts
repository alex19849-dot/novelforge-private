import {timingSafeEqual} from 'node:crypto';
import {start} from 'workflow/api';
import {jobAdmin} from '../../../../lib/social-job-db';
import {generateRomanceBackgrounds} from '../../../../workflows/romance-backgrounds';
export const runtime='nodejs';
export const maxDuration=60;
const runId='e955a834-fab6-4577-bf96-bd50077f63a5';
const owner='c8fcb780-183a-4301-ab38-051a5ec7755f';
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET,token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(!secret||token.length!==secret.length||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return new Response('Unauthorized',{status:401});
  if(Date.now()>Date.parse('2026-11-05T23:59:00Z'))return new Response('Maintenance complete',{status:410});
  const db=jobAdmin();
  // This endpoint can start only the exact owner-authorized queued repair.
  // It accepts no prompts, job IDs, owner IDs, uploads, or account data.
  const {data,error}=await db.from('social_generation_runs').update({workflow_run_id:'starting'}).eq('id',runId).eq('user_id',owner).eq('status','generating').eq('cancel_requested',false).contains('config',{operation:'romance_backgrounds_2026_11_04'}).is('workflow_run_id',null).select('id');
  if(error)return new Response('Queue could not be checked',{status:503});
  if(!data.length)return Response.json({ok:true,already_started:true});
  try{
    const run=await start(generateRomanceBackgrounds,[runId]);
    await db.from('social_generation_runs').update({workflow_run_id:run.runId}).eq('id',runId).eq('user_id',owner).eq('workflow_run_id','starting');
    return Response.json({ok:true,runId});
  }catch{
    await db.from('social_generation_runs').update({status:'failed',error_message:'Worker start could not be confirmed. Inspect before restarting.'}).eq('id',runId).eq('user_id',owner);
    return new Response('Worker start could not be confirmed',{status:503});
  }
}
