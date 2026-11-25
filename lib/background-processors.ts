import { jobAdmin } from './social-job-db';
import type { BackgroundRun } from './background-queue';
import { advanceChapterJob, finishChapterJob, failChapterJob } from '../workflows/chapter-generation-steps';
import { runManuscriptReview, failManuscriptReview } from '../workflows/manuscript-review-steps';
import { prepareTask, submitTask, pollResponse, persistTask, renderMusicTask, failTask, finishJob } from '../workflows/social-generation-steps';
import { publishingTick, registerPublisher } from '../workflows/social-publishing-steps';
import { queueAnalyticsRefresh, prepareAnalytics, collectAnalyticsBatch, finishAnalytics, failAnalytics } from '../workflows/social-analytics-steps';
export async function advanceBackground(run:BackgroundRun):Promise<{done?:boolean;checkpoint?:any;delay?:number}> {
  const cp=run.checkpoint??{},[id,token,generation]=run.args;
  if(run.kind==='probe')return {done:true,checkpoint:{verified:true}};
  if(run.kind==='chapter') {
    if(await advanceChapterJob(id)){await finishChapterJob(id);return {done:true};}
    return {checkpoint:cp};
  }
  if(run.kind==='review'){await runManuscriptReview(id);return {done:true};}
  if(run.kind==='publisher'){
    if(!await registerPublisher(id,token,Number(generation)))return {done:true};
    const next=await publishingTick(id,token,Number(generation));
    await queueAnalyticsRefresh(id);
    return {done:next.stop||next.delay===null,checkpoint:cp,delay:next.delay??0};
  }
  if(run.kind==='analytics'){
    if(!cp.ids)return {checkpoint:{ids:await prepareAnalytics(id,token),offset:0,coverage:{requested:0,received:0,usable:0,issues:[]}}};
    if(cp.offset>=cp.ids.length){await finishAnalytics(id,token,cp.coverage);return {done:true};}
    const ids=cp.ids.slice(cp.offset,cp.offset+20);
    try {
      const batch=await collectAnalyticsBatch(id,token,ids);
      cp.coverage.requested+=batch.requested;cp.coverage.received+=batch.received;cp.coverage.usable+=batch.usable;cp.coverage.issues.push(...batch.issues);
    }catch{cp.coverage.requested+=ids.length;cp.coverage.issues.push(...ids.map((id:string)=>({id,code:'COLLECTION_ERROR'})));}
    return {checkpoint:{...cp,offset:cp.offset+ids.length}};
  }
  if(run.kind==='social'&&run.args[1]==='scene-slides')return (await import('./social-scene-slides-server')).advanceSceneSlides(run);
  if(run.kind==='social') {
    const db=jobAdmin();
    const job=await db.from('social_generation_runs').select('status,cancel_requested').eq('id',id).eq('user_id',run.user_id).single();
    if(job.error)throw Error('Saved generation could not be read.');
    if(job.data.status!=='generating')return {done:true};
    if(job.data.cancel_requested){await finishJob(id,true);return {done:true};}
    if(!cp.task){
      const tasks=await db.from('social_generation_tasks').select('id').eq('run_id',id).eq('user_id',run.user_id).in('status',['pending','running']).order('ordinal').limit(1);
      if(tasks.error)throw Error('Saved generation tasks could not be read.');
      if(!tasks.data.length){await finishJob(id,false);return {done:true};}
      return {checkpoint:{task:tasks.data[0].id,phase:'prepare',polls:0}};
    }
    try {
      if(cp.phase==='prepare'){
        const next=await prepareTask(id,cp.task);
        if(next==='stop'){await finishJob(id,true);return {done:true};}
        return {checkpoint:next==='skip'?{}:{...cp,phase:next==='music'?'music':'submit'}};
      }
      if(cp.phase==='music'){await renderMusicTask(id,cp.task);return {checkpoint:{}};}
      if(cp.phase==='submit'){
        const response=await submitTask(id,cp.task);
        return {checkpoint:response?{...cp,phase:'poll',response,polls:0}:{},delay:response?30:0};
      }
      if(cp.phase==='poll'){
        const status=await pollResponse(id,cp.task,cp.response);
        if(status==='completed')return {checkpoint:{...cp,phase:'persist'}};
        if(!['queued','in_progress'].includes(status)||cp.polls>=60)throw Error('The provider did not finish this item within 30 minutes. Its saved response is retained.');
        return {checkpoint:{...cp,polls:cp.polls+1},delay:30};
      }
      if(cp.phase==='persist'){await persistTask(id,cp.task,cp.response);return {checkpoint:{}};}
      throw Error('Unknown saved generation stage.');
    }catch(error){await failTask(id,cp.task,error instanceof Error?error.message:'This item needs attention.');return {checkpoint:{}};}
  }
  throw Error('Unknown background task.');
}
export async function failBackground(run:BackgroundRun,message:string) {
  if(run.kind==='chapter')return failChapterJob(run.args[0],message);
  if(run.kind==='review')return failManuscriptReview(run.args[0],message);
  if(run.kind==='analytics')return failAnalytics(run.args[0],run.args[1]);
  if(run.kind==='social'&&run.args[1]==='scene-slides')return (await import('./social-scene-slides-server')).failSceneSlides(run.user_id,run.args[0],run.args[2],message);
  if(run.kind==='social'){
    const saved=await jobAdmin().from('social_generation_runs').update({status:'failed',error_message:message,updated_at:new Date().toISOString()}).eq('id',run.args[0]).eq('user_id',run.user_id).eq('status','generating');
    if(saved.error)throw Error('Stopped generation could not be saved.');
  }
  if(run.kind==='publisher'){
    const saved=await jobAdmin().from('social_publishing_settings').update({last_error:message}).eq('user_id',run.user_id).eq('lease',run.args[1]);
    if(saved.error)throw Error('Publisher status could not be saved.');
  }
}
