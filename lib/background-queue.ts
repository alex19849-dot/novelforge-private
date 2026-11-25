import 'server-only';
import { QueueClient } from '@vercel/queue';
import { randomUUID } from 'node:crypto';
import { jobAdmin } from './social-job-db';
export type BackgroundKind = 'chapter' | 'social' | 'publisher' | 'analytics' | 'review' | 'probe';
export type BackgroundRun = { id:string; user_id:string; kind:BackgroundKind; args:string[]; checkpoint:any; status:string; sequence:number; next_at:string; locked_at:string|null; error_message:string };
export const backgroundQueue = new QueueClient({region:'iad1'});
export const BACKGROUND_TOPIC = 'novelforge-background';
export const isQueueRun = (id:string|null|undefined) => Boolean(id?.startsWith('queue:'));
export async function dispatchBackground(run: Pick<BackgroundRun,'id'|'sequence'|'next_at'>) {
  const delaySeconds=Math.max(0,Math.min(6*86400,Math.ceil((Date.parse(run.next_at)-Date.now())/1000)));
  await backgroundQueue.send(BACKGROUND_TOPIC,{id:run.id,sequence:run.sequence},{delaySeconds,retentionSeconds:7*86400,idempotencyKey:`${run.id}:${run.sequence}`});
}
export async function startBackground(kind:BackgroundKind,args:string[],owner:string) {
  const id='queue:'+randomUUID();
  const row={id,user_id:owner,kind,args,checkpoint:{},status:'queued',sequence:0,next_at:new Date().toISOString()};
  const {error}=await jobAdmin().from('background_queue_runs').insert(row);
  if(error)throw Error('The background task could not be saved.');
  // On an ambiguous queue response, keep the durable outbox pending. Maintenance
  // or the authenticated status check dispatches the same idempotency key.
  try {await dispatchBackground(row);} catch {console.warn('Background dispatch pending',id);}
  return {runId:id};
}
export async function backgroundRun(id:string):Promise<BackgroundRun|null> {
  if(!isQueueRun(id))return null;
  const {data,error}=await jobAdmin().from('background_queue_runs').select('*').eq('id',id).maybeSingle();
  if(error)throw Error('Background progress could not be checked.');
  return data;
}
export async function backgroundStatus(id:string) {
  const row=await backgroundRun(id);
  if(!row)return 'legacy';
  return row.status==='completed'?'completed':row.status==='failed'?'failed':'running';
}
export async function recoverBackgroundDispatches() {
  const {data,error}=await jobAdmin().from('background_queue_runs').select('id,sequence,next_at').eq('status','queued').lte('next_at',new Date().toISOString()).order('next_at').limit(20);
  if(error)throw Error('Pending background work could not be checked.');
  for(const row of data)await dispatchBackground(row);
}
