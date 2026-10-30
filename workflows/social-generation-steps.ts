import OpenAI from 'openai';
import { FatalError, getWorkflowMetadata } from 'workflow';
import { createHash } from 'node:crypto';
import { jobAdmin } from '../lib/social-job-db';
import { planRequest } from '../lib/social-plan-request';
import { plannedFormat, plannedTime, validateAiDays } from '../lib/social-planner';
import { addDays, londonDate, londonSchedule } from '../lib/social-calendar';
import type { CalendarPost, SocialPlatform } from '../lib/social-calendar';
import type { PlanBook } from '../lib/social-planner';
import { inspectPoster, posterPrompt } from '../lib/social-artwork';
import { chooseSocialTrack, musicForPath, MUSIC_VERSION, MUSIC_LICENSE } from '../lib/social-music';
import { socialTrackAudio, soundtrackSocialVideo } from '../lib/social-music-render';
import { renderSocialMedia } from '../lib/social-render';
import { completedImage, imageDiagnostic, noImageMessage } from '../lib/social-image-result';
import { compositeOriginalCover, originalCoverBackgroundPrompt, originalCoverBytes } from '../lib/social-cover-artwork';

import type {StrategyAssignment,StrategySettings,LearningReport} from '../lib/social-strategy';
import {learnedPostingHours} from '../lib/social-strategy';
import {validateStrategyCopy} from '../lib/social-strategy-validation';
import {generalReaderBook} from '../lib/social-planner';
type Assignment=StrategyAssignment;
type Job={id:string;user_id:string;status:string;job_type:'plan'|'media';start_date:string;cancel_requested:boolean;config:{books:PlanBook[];platforms:SocialPlatform[];guidance:string;strategy?:{settings:StrategySettings;recent:{platform:string;caption:string}[];report:LearningReport|null}}};
type Task={id:string;run_id:string;user_id:string;status:string;response_id:string|null;request:{assignments?:Assignment[];posts?:CalendarPost[];asset_mode?:'original_cover_overlay';music?:boolean};result:Record<string,unknown>};
const ai=()=>new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:30000,maxRetries:0});
async function context(runId:string,taskId?:string) {
  const db=jobAdmin();
  const {data:job,error}=await db.from('social_generation_runs').select('*').eq('id',runId).single();
  if(error||!job) throw new FatalError('This background job no longer exists.');
  if(!taskId) return {db,job:job as Job,task:null as Task|null};
  const {data:task,error:taskError}=await db.from('social_generation_tasks').select('*').eq('id',taskId).eq('run_id',runId).eq('user_id',job.user_id).single();
  if(taskError||!task) throw new FatalError('This background task no longer exists.');
  return {db,job:job as Job,task:task as Task};
}
async function recordProgress(job:Job) {
  const db=jobAdmin();
  const {data:tasks,error}=await db.from('social_generation_tasks').select('status').eq('run_id',job.id).eq('user_id',job.user_id);
  if(error) throw new Error('Progress could not be saved.');
  const {count,error:countError}=await db.from('social_posts').select('id',{head:true,count:'exact'}).eq('generation_run_id',job.id).eq('user_id',job.user_id);
  if(countError) throw new Error('Progress could not be counted.');
  const {error:updateError}=await db.from('social_generation_runs').update({completed_tasks:tasks.filter(t=>['completed','skipped'].includes(t.status)).length,created_count:count??0,updated_at:new Date().toISOString()}).eq('id',job.id).eq('user_id',job.user_id);
  if(updateError) throw new Error('Progress could not be saved.');
}
export async function describeJob(runId:string) {
  'use step';
  const {db,job}=await context(runId);
  const {error:registrationError}=await db.from('social_generation_runs').update({workflow_run_id:getWorkflowMetadata().workflowRunId}).eq('id',runId).eq('user_id',job.user_id).is('workflow_run_id',null);
  if(registrationError) throw new Error('The worker could not save its run reference.');
  const {data,error}=await db.from('social_generation_tasks').select('id').eq('run_id',runId).eq('user_id',job.user_id).order('ordinal');
  if(error) throw new Error('The task queue could not be read.');
  return data.map(t=>t.id);
}
export async function prepareTask(runId:string,taskId:string):Promise<'stop'|'skip'|'run'|'music'> {
  'use step';
  const {db,job,task}=await context(runId,taskId);
  if(job.status!=='generating'||job.cancel_requested) return 'stop';
  if(['completed','skipped'].includes(task.status)) return 'skip';
  const {error}=await db.from('social_generation_tasks').update({status:'running'}).eq('id',taskId).eq('user_id',job.user_id);
  if(error) throw new Error('The task could not be started.');
  return task.request.music?'music':'run';
}
export async function submitTask(runId:string,taskId:string):Promise<string|null> {
  'use step';
  const {db,job,task}=await context(runId,taskId);
  if(task.response_id) return task.response_id;
  let request:OpenAI.Responses.ResponseCreateParamsNonStreaming;
  if(job.job_type==='plan') {
    const assignments=task.request.assignments!;
    const {data:existing,error}=await db.from('social_posts').select('scheduled_at,platform').eq('user_id',job.user_id).gte('scheduled_at',londonSchedule(assignments[0].date,'00:00')).lt('scheduled_at',londonSchedule(addDays(assignments.at(-1)!.date,1),'00:00')).neq('status','cancelled');
    if(error) throw new FatalError('The calendar could not be checked. No new AI request was started.');
    const occupied=new Set(existing.map(p=>`${londonDate(p.scheduled_at)}:${p.platform}`));
    const open=assignments.filter(day=>job.config.platforms.some(platform=>!occupied.has(`${day.date}:${platform}`)&&Date.parse(plannedTime(job.start_date,day.dayIndex,platform,learnedPostingHours(job.config.strategy?.report,platform,job.config.strategy?.settings.adaptive)))>Date.now()));
    if(!open.length) {
      const {error:skipError}=await db.from('social_generation_tasks').update({status:'skipped'}).eq('id',taskId).eq('user_id',job.user_id);
      if(skipError) throw new FatalError('The completed date range could not be recorded.');
      await recordProgress(job); return null;
    }
    let strategy=job.config.strategy;
    if(strategy){const {data,error}=await db.from('social_posts').select('platform,caption').eq('user_id',job.user_id).neq('status','cancelled').order('created_at',{ascending:false}).limit(120);if(error)throw new Error('Recent content could not be checked.');strategy={...strategy,recent:data.map(p=>({platform:p.platform,caption:p.caption.slice(0,240)}))};}
    request=planRequest(job.config.platforms,open,job.config.books,job.config.guidance,strategy);
    const {error:saveError}=await db.from('social_generation_tasks').update({request:{assignments:open}}).eq('id',taskId).eq('user_id',job.user_id);
    if(saveError) throw new FatalError('The batch could not be saved before generation.');
  } else {
    const posts=task.request.posts!;const first=posts[0];
    // Reuse a completed feed/portrait asset when another platform still needs it.
    const {data:existing,error}=await db.from('social_posts').select('*').eq('user_id',job.user_id).eq('campaign_id',first.campaign_id).not('media_path','is',null);
    if(error) throw new FatalError('Existing artwork could not be checked.');
    const match=(existing as CalendarPost[]).find(p=>p.book_slug===first.book_slug&&p.media_type===(first.platform==='tiktok'?'video':first.planned_media_type)&&p.creative_brief===first.creative_brief&&(p.platform==='tiktok')===(first.platform==='tiktok'));
    if(match) { await attachMedia(job,task,match.media_path!,match.quality_notes??'',match.media_type!); return null; }
    const book=first.book_slug?job.config.books.find(b=>b.slug===first.book_slug)!:generalReaderBook();
    request={model:'gpt-6-astra',background:true,store:true,reasoning:{effort:'low'},max_output_tokens:1000,
      input:[{role:'user',content:task.request.asset_mode==='original_cover_overlay'?[{type:'input_text',text:originalCoverBackgroundPrompt(first.creative_brief!,first.platform==='tiktok',book.title)}]:[{type:'input_text',text:posterPrompt({...book,author:'Marlow Quinn'},first.platform,first.planned_media_type!,first.creative_brief!,'',first.post_type)},...(book.coverUrl?[{type:'input_image' as const,image_url:book.coverUrl,detail:'high' as const}]:[])]}],
      tools:[{type:'image_generation',model:'gpt-image-2',size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:92,background:'opaque'}],tool_choice:{type:'image_generation'}};
  }
  try { return (await ai().responses.create(request)).id; }
  catch(error) {
    // Do not blindly resubmit an ambiguous paid request after a network error.
    // Only an explicit 429 is safe to retry before any response was accepted.
    if(error instanceof OpenAI.APIError&&error.status===429) throw new Error('The AI is busy. Retrying shortly.');
    throw new FatalError(error instanceof OpenAI.APIError&&error.status===401?'The AI API key needs attention.':error instanceof OpenAI.APIError&&error.status===400?'The AI rejected this request. Check the brief or model configuration.':'The AI request could not be confirmed. It was not automatically submitted again to avoid duplicate charges.');
  }
}
export async function rememberResponse(runId:string,taskId:string,responseId:string) {
  'use step';
  const {db,job}=await context(runId,taskId);
  const {error}=await db.from('social_generation_tasks').update({response_id:responseId}).eq('id',taskId).eq('user_id',job.user_id);
  if(error) throw new Error('The AI response reference could not be saved.');
}
export async function pollResponse(runId:string,taskId:string,responseId:string) {
  'use step';
  await context(runId,taskId);
  const response=await ai().responses.retrieve(responseId);
  return response.status??'failed';
}
function campaignId(taskId:string,index:number) {
  const hex=createHash('sha256').update(`${taskId}:${index}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
async function attachMedia(job:Job,task:Task,path:string,notes:string,mediaType?:'image'|'video') {
  const db=jobAdmin();let saved=0;
  for(const post of task.request.posts!) {
    // Optimistic version checks protect edits, approvals and reschedules made while AI runs.
    const {data,error}=await db.from('social_posts').update({media_path:path,media_type:mediaType??post.planned_media_type,planned_media_type:mediaType??post.planned_media_type,quality_notes:notes}).eq('id',post.id).eq('user_id',job.user_id).eq('version',post.version).eq('status','draft').is('media_path',null).select('id');
    if(error) throw new Error('Generated artwork could not be attached.');
    saved+=data.length;
  }
  const {error}=await db.from('social_generation_tasks').update({status:'completed',result:{path,saved,message:saved?'Saved':'The draft changed during generation; the saved artwork was kept without replacing your edits.'}}).eq('id',task.id).eq('user_id',job.user_id);
  if(error) throw new Error('The saved media progress could not be recorded.');
  await recordProgress(job);
}
export async function persistTask(runId:string,taskId:string,responseId:string) {
  'use step';
  const {db,job,task}=await context(runId,taskId);
  if(task.status==='completed') return;
  // Large base64 images never enter the workflow event log or the browser.
  const response=await ai().responses.retrieve(responseId);
  if(response.status!=='completed') throw new FatalError('The AI response is not complete.');
  if(job.job_type==='plan') {
    let days;
    try { days=validateAiDays(JSON.parse(response.output_text),job.config.platforms,task.request.assignments!.map(d=>d.dayIndex)); }
    catch { throw new FatalError('The AI returned incomplete content for this batch. Other saved batches are kept.'); }
    let strategyCopies:ReturnType<typeof validateStrategyCopy>|null=null;
    if(job.config.strategy){
      const {data:history,error}=await db.from('social_posts').select('platform,title,caption,campaign_id').eq('user_id',job.user_id).neq('status','cancelled').order('created_at',{ascending:false}).limit(180);
      if(error)throw new Error('Recent content could not be checked.');
      try{strategyCopies=validateStrategyCopy(days,task.request.assignments!,job.config.books,job.config.strategy.settings,history.filter(p=>!days.some(day=>p.campaign_id===campaignId(taskId,day.dayIndex))) as CalendarPost[]);}catch(error){throw new FatalError(error instanceof Error?error.message:'Content labels could not be validated.');}
    }
    for(const day of days) {
      const assignment=task.request.assignments!.find(d=>d.dayIndex===day.dayIndex)!;
      const legacyBook=assignment.book?job.config.books.find(b=>b.slug===assignment.book)!:null;
      for(const platform of job.config.platforms) {
        const scheduled=plannedTime(job.start_date,day.dayIndex,platform,learnedPostingHours(job.config.strategy?.report,platform,job.config.strategy?.settings.adaptive));
        if(Date.parse(scheduled)<=Date.now()) continue;
        const {count,error:checkError}=await db.from('social_posts').select('id',{head:true,count:'exact'}).eq('user_id',job.user_id).eq('platform',platform).gte('scheduled_at',londonSchedule(assignment.date,'00:00')).lt('scheduled_at',londonSchedule(addDays(assignment.date,1),'00:00')).neq('status','cancelled');
        if(checkError) throw new Error('The calendar could not be checked before saving.');
        if(count) continue;
        const copy=day.posts.find(p=>p.platform===platform)!;
        const strategyCopy=strategyCopies?.get(day.dayIndex+':'+platform);
        const book=strategyCopy?strategyCopy.book:legacyBook;
        const postType=strategyCopy?.postType??assignment.postType;
        const {error}=await db.from('social_posts').insert({campaign_id:campaignId(taskId,day.dayIndex),generation_run_id:runId,user_id:job.user_id,book_slug:book?.slug??'',book_title:book?.title??'',platform,post_type:postType,title:copy.title,caption:copy.caption,hashtags:copy.hashtags,creative_brief:strategyCopy?.brief??day.creativeBrief,content_metadata:strategyCopy?{...strategyCopy.metadata,timing_policy:'balanced_time_trials_v1'}:{},planned_media_type:strategyCopy?(platform==='tiktok'?'video':'image'):plannedFormat(postType,platform),scheduled_at:scheduled,status:'draft'});
        if(error&&error.code!=='23505') throw new Error('Generated drafts could not be saved. Retrying the saved response.');
      }
    }
    const {error}=await db.from('social_generation_tasks').update({status:'completed'}).eq('id',taskId).eq('user_id',job.user_id);
    if(error) throw new Error('Batch progress could not be saved.');
    await recordProgress(job);
  } else {
    const first=task.request.posts![0];const book=first.book_slug?job.config.books.find(b=>b.slug===first.book_slug)!:generalReaderBook();
    const image=completedImage(response);
    if(!image?.result) {
      const {error:diagnosticError}=await db.from('social_generation_tasks').update({result:{...task.result,provider_diagnostic:imageDiagnostic(response)}}).eq('id',taskId).eq('user_id',job.user_id);
      if(diagnosticError) throw new Error('The image failure details could not be saved.');
      throw new FatalError(noImageMessage(response));
    }
    let artworkSource=Buffer.from(image.result,'base64');
    if(task.request.asset_mode==='original_cover_overlay') artworkSource=Buffer.from(await compositeOriginalCover(artworkSource,await originalCoverBytes(book.coverUrl),first.platform==='tiktok'));
    const video=first.platform==='tiktok'||first.planned_media_type==='video';
    const track=video?chooseSocialTrack(first.campaign_id,first.post_type):null;
    const extension=video?'mp4':'jpg';
    const file=`${taskId}${track?`-music-v${MUSIC_VERSION}-${track.id}`:''}.${extension}`;
    const path=`${job.user_id}/calendar/${file}`;
    const {data:files,error:listError}=await db.storage.from('social-media').list(`${job.user_id}/calendar`,{search:file,limit:1});
    if(listError) throw new Error('Media storage could not be checked.');
    if(!files.some(f=>f.name===file)) {
      const media=await renderSocialMedia(artworkSource,first.platform==='tiktok',video,task.request.asset_mode==='original_cover_overlay'?'contain':'cover',track?await socialTrackAudio(track):undefined);
      if(media.length>50*1024*1024) throw new FatalError('This media exceeds the 50 MB storage limit.');
      const {error}=await db.storage.from('social-media').upload(path,media,{contentType:extension==='mp4'?'video/mp4':'image/jpeg',upsert:false});
      if(error&&error.statusCode!=='409') throw new Error('The generated media could not be uploaded. Retrying the same saved image.');
    }
    const inspection=await inspectPoster(`data:image/jpeg;base64,${artworkSource.toString('base64')}`,{...book,author:'Marlow Quinn'},first.platform,first.creative_brief!,first.post_type);
    const notes=inspection.qualityCheck.decision==='review'?inspection.qualityCheck.summary:'';
    await attachMedia(job,task,path,notes,video?'video':'image');
  }
}
export async function failTask(runId:string,taskId:string,message:string) {
  'use step';
  const {db,job}=await context(runId,taskId);
  const {error}=await db.from('social_generation_tasks').update({status:'failed',error_message:message.slice(0,600)}).eq('id',taskId).eq('user_id',job.user_id);
  if(error) throw new Error('The task error could not be saved.');
}
export async function renderMusicTask(runId:string,taskId:string) {
  'use step';
  const {db,job,task}=await context(runId,taskId);
  if(task.status==='completed'||task.status==='skipped') return;
  const original=task.request.posts?.[0];
  if(!task.request.music||!original?.media_path||!original.media_path.startsWith(`${job.user_id}/calendar/`)||original.platform!=='tiktok') throw new FatalError('Invalid soundtrack task.');
  const track=chooseSocialTrack(original.campaign_id,original.post_type);
  const hash=createHash('sha256').update(original.media_path).digest('hex').slice(0,16);
  const file=`${original.id}-${hash}-music-v${MUSIC_VERSION}-${track.id}.mp4`;
  const directory=`${job.user_id}/calendar/music`;
  const path=`${directory}/${file}`;
  async function complete(saved:number,message:string,status='completed') {
    const {error}=await db.from('social_generation_tasks').update({status,result:{path,source_path:original.media_path,saved,message,music:{id:track.id,title:track.title,artist:track.artist,source:track.source,license:MUSIC_LICENSE,version:MUSIC_VERSION}}}).eq('id',taskId).eq('user_id',job.user_id);
    if(error) throw new Error('The soundtrack progress could not be saved.');
    await recordProgress(job);
  }
  const {data:current,error:readError}=await db.from('social_posts').select('*').eq('id',original.id).eq('user_id',job.user_id).maybeSingle();
  if(readError) throw new Error('The current post could not be checked.');
  if(current?.media_path===path) { await complete(1,'Music is already attached.'); return; }
  if(job.cancel_requested||job.status!=='generating'||!current||!['draft','approved'].includes(current.status)||current.version!==original.version||current.media_path!==original.media_path||!current.scheduled_at||Date.parse(current.scheduled_at)<=Date.now()||musicForPath(current.media_path)) {
    await complete(0,'This post changed or is no longer eligible. Its current content was kept.','skipped'); return;
  }
  console.log('Preparing social soundtrack',{runId,taskId,track:track.id});
  const {data:files,error:listError}=await db.storage.from('social-media').list(directory,{search:file,limit:1});
  if(listError) throw new Error('Saved music exports could not be checked.');
  if(!files.some(item=>item.name===file)) {
    const {data:asset,error:downloadError}=await db.storage.from('social-media').download(original.media_path);
    if(downloadError||!asset) throw new Error('The saved original artwork could not be loaded.');
    if(asset.size>50*1024*1024) throw new FatalError('The source exceeds the 50 MB media limit.');
    const source=Buffer.from(await asset.arrayBuffer());
    const audio=await socialTrackAudio(track);
    let media:Buffer;
    try { media=original.media_type==='video'?await soundtrackSocialVideo(source,audio):await renderSocialMedia(source,true,true,'contain',audio); }
    catch(error) { throw new FatalError(error instanceof Error?error.message:'The soundtrack export failed. The original was kept.'); }
    if(media.length>50*1024*1024) throw new FatalError('The music export exceeds the 50 MB media limit.');
    const {error}=await db.storage.from('social-media').upload(path,media,{contentType:'video/mp4',upsert:false});
    if(error&&String(error.statusCode)!=='409') throw new Error('The soundtrack could not be uploaded. Retrying the same export.');
  }
  // Keep captions, dates and approval status. A version check protects concurrent edits.
  const {data:saved,error:saveError}=await db.from('social_posts').update({media_path:path,media_type:'video',planned_media_type:'video'}).eq('id',original.id).eq('user_id',job.user_id).eq('version',original.version).eq('media_path',original.media_path).in('status',['draft','approved']).gt('scheduled_at',new Date().toISOString()).select('id');
  if(saveError) throw new Error('The soundtrack could not be attached. The original is still saved.');
  await complete(saved.length,saved.length?'Licensed backing music added.':'The post changed during export. Its current content was kept.',saved.length?'completed':'skipped');
}
export async function finishJob(runId:string,paused:boolean) {
  'use step';
  const {db,job}=await context(runId);
  await recordProgress(job);
  const {data:failed,error}=await db.from('social_generation_tasks').select('error_message').eq('run_id',runId).eq('user_id',job.user_id).eq('status','failed');
  if(error) throw new Error('The final job status could not be checked.');
  const {error:updateError}=await db.from('social_generation_runs').update({status:paused?'paused':failed.length?'failed':'completed',error_message:failed.length?`${failed.length} item(s) need attention. ${failed[0].error_message}`:'',updated_at:new Date().toISOString()}).eq('id',runId).eq('user_id',job.user_id);
  if(updateError) throw new Error('The final job status could not be saved.');
}
