import OpenAI from 'openai';
import {FatalError,getWorkflowMetadata} from 'workflow';
import {createHash} from 'node:crypto';
import {jobAdmin} from '../lib/social-job-db';
import {completedImage} from '../lib/social-image-result';
import concepts from '../content-revisions/2026-11-04-romance/concepts.json';
const owner='c8fcb780-183a-4301-ab38-051a5ec7755f';
const operation='romance_backgrounds_2026_11_04';
const ai=()=>new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:30000,maxRetries:0});
async function context(runId:string,taskId?:string){
  const db=jobAdmin();
  const {data:job,error}=await db.from('social_generation_runs').select('*').eq('id',runId).eq('user_id',owner).single();
  if(error||!job||job.config?.operation!==operation)throw new FatalError('Unknown artwork repair job.');
  if(taskId){
    const {data:task,error}=await db.from('social_generation_tasks').select('*').eq('id',taskId).eq('run_id',runId).eq('user_id',owner).single();
    if(error||!task)throw new FatalError('Unknown artwork task.');
    return {db,job,task};
  }
  return {db,job,task:null};
}
async function progress(runId:string){
  const {db}=await context(runId);
  const {data,error}=await db.from('social_generation_tasks').select('status').eq('run_id',runId).eq('user_id',owner);
  if(error)throw Error('Could not read artwork progress.');
  const changed=await db.from('social_generation_runs').update({completed_tasks:data.filter(t=>['completed','skipped'].includes(t.status)).length,updated_at:new Date().toISOString()}).eq('id',runId).eq('user_id',owner);
  if(changed.error)throw Error('Could not save artwork progress.');
}
export async function registerRepair(runId:string){
  'use step';
  const {db,job}=await context(runId);const worker=getWorkflowMetadata().workflowRunId;
  if(job.status!=='generating'||job.cancel_requested)return [] as string[];
  if(job.workflow_run_id!==worker){
    const changed=await db.from('social_generation_runs').update({workflow_run_id:worker}).eq('id',runId).eq('user_id',owner).eq('workflow_run_id','starting').select('id');
    if(changed.error)throw Error('Could not register the artwork worker.');
    if(!changed.data.length)return [] as string[];
  }
  console.log('Registered romance artwork worker',{runId});
  const {data,error}=await db.from('social_generation_tasks').select('id').eq('run_id',runId).eq('user_id',owner).in('status',['pending','running']).order('ordinal');
  if(error)throw Error('Could not load artwork tasks.');
  return data.map(t=>t.id);
}
export async function submitBackground(runId:string,taskId:string){
  'use step';
  const {db,job,task}=await context(runId,taskId);
  if(job.cancel_requested||job.status!=='generating'||task.status==='completed')return null;
  if(task.response_id)return task.response_id as string;
  const slug=task.request?.background_slug;
  if(typeof slug!=='string'||!Object.hasOwn(concepts,slug))throw new FatalError('No approved book-specific concept.');
  const claim=await db.from('social_generation_tasks').update({status:'running'}).eq('id',taskId).eq('run_id',runId).eq('user_id',owner).eq('status','pending').select('id');
  if(claim.error||!claim.data.length)throw new FatalError('This artwork submission was already claimed. Inspect before resubmitting.');
  console.log('Submitting object-only romance background',{runId,taskId,slug});
  const style='Generate one photographic portrait background plate for an adult Marlow Quinn MM romance campaign. Rich romantic cinematic atmosphere and tactile realism, black, charcoal, silver-white and electric magenta. Main scene objects in the lower-middle 45 percent, upper 35 percent naturally dark for later typography, bottom 15 percent dark. Distinct book-specific imagery with chemistry and intimacy conveyed by objects and light. NO PEOPLE: no figures, faces, bodies, hands, silhouettes, statues, human reflections or people in pictures. No text, letters, logos, book covers, mockups, corporate cards, presentations or business adverts. No type is needed; the application adds the approved words later. ';
  try{
    const response=await ai().responses.create({model:'gpt-6-astra',background:true,store:true,reasoning:{effort:'low'},max_output_tokens:1000,input:[{role:'user',content:[{type:'input_text',text:style+concepts[slug as keyof typeof concepts]}]}],tools:[{type:'image_generation',model:'gpt-image-2',size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:94,background:'opaque'}],tool_choice:{type:'image_generation'}});
    const saved=await db.from('social_generation_tasks').update({response_id:response.id}).eq('id',taskId).eq('run_id',runId).eq('user_id',owner);
    if(saved.error)throw new FatalError('Provider accepted the artwork but its response reference needs recovery. Do not resubmit.');
    return response.id;
  }catch(error){
    if(error instanceof FatalError)throw error;
    throw new FatalError(error instanceof OpenAI.APIError?`Artwork submission returned HTTP ${error.status}. Inspect before resubmitting.`:'Artwork submission could not be confirmed. It was not automatically retried.');
  }
}
submitBackground.maxRetries=0;
export async function pollBackground(runId:string,taskId:string,responseId:string){
  'use step';
  await context(runId,taskId);return (await ai().responses.retrieve(responseId)).status??'failed';
}
export async function saveBackground(runId:string,taskId:string,responseId:string){
  'use step';
  const {db,task}=await context(runId,taskId);
  if(task.status==='completed')return;
  const response=await ai().responses.retrieve(responseId);const image=completedImage(response);
  if(response.status!=='completed'||!image?.result)throw new FatalError('No completed background returned.');
  const slug=task.request.background_slug;const directory=`${owner}/calendar/romance-v3/backgrounds`;const file=`${slug}-${taskId}.jpg`,path=`${directory}/${file}`;
  const bytes=Buffer.from(image.result,'base64');
  const {data:files,error}=await db.storage.from('social-media').list(directory,{search:file,limit:1});
  if(error)throw Error('Background storage could not be checked.');
  if(!files.some(f=>f.name===file)){
    const saved=await db.storage.from('social-media').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
    if(saved.error&&String(saved.error.statusCode)!=='409')throw Error('Background could not be stored. The saved provider response will be reused.');
  }
  const saved=await db.from('social_generation_tasks').update({status:'completed',result:{path,book_slug:slug,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length}}).eq('id',taskId).eq('run_id',runId).eq('user_id',owner);
  if(saved.error)throw Error('Artwork completion could not be saved.');
  console.log('Saved romance background',{runId,taskId,slug});
  await progress(runId);
}
export async function recordRepairFailure(runId:string,taskId:string,message:string){
  'use step';
  const {db}=await context(runId,taskId);
  const saved=await db.from('social_generation_tasks').update({status:'failed',error_message:message.slice(0,500)}).eq('id',taskId).eq('run_id',runId).eq('user_id',owner);
  if(saved.error)throw Error('Artwork error could not be saved.');
  console.warn('Romance background needs attention',{runId,taskId});
}
export async function finishRepair(runId:string){
  'use step';
  const {db,job}=await context(runId);await progress(runId);
  const {data,error}=await db.from('social_generation_tasks').select('status').eq('run_id',runId).eq('user_id',owner);
  if(error)throw Error('Artwork results could not be checked.');
  const failed=data.filter(t=>t.status==='failed').length;
  const saved=await db.from('social_generation_runs').update({status:job.cancel_requested?'paused':failed?'failed':'completed',error_message:failed?`${failed} backgrounds need attention.`:'',updated_at:new Date().toISOString()}).eq('id',runId).eq('user_id',owner);
  if(saved.error)throw Error('Artwork run completion could not be saved.');
  console.log('Romance background run finished',{runId,failed});
}
