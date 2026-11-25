import { randomUUID } from 'node:crypto';
import { jobAdmin } from './social-job-db';
import { backgroundRun, dispatchBackground, type BackgroundRun } from './background-queue';
import { withBackgroundExecution } from './background-context';
import { advanceBackground, failBackground } from './background-processors';
export type BackgroundMessage = {id:string;sequence:number};
export async function processBackground(message:BackgroundMessage) {
  if(!message||!/^queue:[a-f0-9-]{36}$/i.test(message.id)||!Number.isInteger(message.sequence))throw Error('Invalid background queue message.');
  const db=jobAdmin(),row=await backgroundRun(message.id);
  if(!row||['completed','failed'].includes(row.status))return;
  if(row.sequence!==message.sequence){if(row.status==='queued')await dispatchBackground(row);return;}
  if(row.status==='running') {
    if(Date.now()-Date.parse(row.locked_at!)<10*60_000)throw Error('This background stage is already running.');
    // Never rerun an unconfirmed stage: it may already have charged a provider.
    await failBackground(row,'The background stage was interrupted. Saved progress is kept; no paid request was automatically repeated.');
    const saved=await db.from('background_queue_runs').update({status:'failed',error_message:'Interrupted stage requires review.',updated_at:new Date().toISOString()}).eq('id',row.id).eq('sequence',row.sequence).eq('status','running');
    if(saved.error)throw Error('Interrupted task could not be recorded.');
    return;
  }
  const claim=randomUUID();
  const {data:claimed,error}=await db.from('background_queue_runs').update({status:'running',locked_at:new Date().toISOString(),claim}).eq('id',row.id).eq('sequence',row.sequence).eq('status','queued').select('id').maybeSingle();
  if(error)throw Error('Background task could not be claimed.');
  if(!claimed)throw Error('Background task was claimed concurrently.');
  let next:{done?:boolean;checkpoint?:any;delay?:number};
  try {
    next=Date.parse(row.next_at)>Date.now()+1000?{checkpoint:row.checkpoint,delay:Math.ceil((Date.parse(row.next_at)-Date.now())/1000)}
      :await withBackgroundExecution(row.id,()=>advanceBackground(row));
  }catch(error){
    const message=error instanceof Error?error.message:'The background task stopped.';
    await failBackground(row,message);
    next={done:true,checkpoint:{...row.checkpoint,error:message}};
  }
  const patch={checkpoint:next.checkpoint??row.checkpoint,status:next.done?(next.checkpoint?.error?'failed':'completed'):'queued',sequence:row.sequence+1,next_at:new Date(Date.now()+Math.max(0,next.delay??0)*1000).toISOString(),locked_at:null,claim:null,error_message:next.checkpoint?.error??'',updated_at:new Date().toISOString()};
  const saved=await db.from('background_queue_runs').update(patch).eq('id',row.id).eq('sequence',row.sequence).eq('claim',claim).select('id').maybeSingle();
  if(saved.error||!saved.data)throw Error('Background checkpoint could not be confirmed. It will not repeat the stage.');
  if(!next.done)await dispatchBackground({...row,...patch} as BackgroundRun);
}
