import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { generateSocialJob } from '../workflows/social-generation';
import { addDays, londonDate, londonSchedule, SOCIAL_PLATFORMS } from './social-calendar';
import type { CalendarPost, SocialPlatform } from './social-calendar';
import { CONTENT_MIX, plannedTime } from './social-planner';
import { isImageModerationFailure } from './social-image-result';
import type { PlanBook } from './social-planner';

export const jobJson = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export { jobAdmin } from './social-job-db';
import { jobAdmin } from './social-job-db';
export async function jobUser(request: Request) {
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  return error ? null : data.user;
}
export async function queueSocialJob(request: Request,kind:'plan'|'media') {
  const user=await jobUser(request);
  if (!user) return jobJson({error:'Sign in to NovelForge first.'},401);
  let ownedRun='';
  try {
    const admin=jobAdmin();
    if(!process.env.OPENAI_API_KEY) return jobJson({error:'The AI API key is not configured.'},503);
    const body=await request.json();
    const runId=body.runId;
    const date=body.start;
    if(typeof runId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jobJson({error:'Choose a valid start date.'},400);
    londonSchedule(date,'12:00');
    const {data:duplicate,error:duplicateError}=await admin.from('social_generation_runs').select('id,status,job_type').eq('id',runId).eq('user_id',user.id).maybeSingle();
    if(duplicateError) throw new Error('Background jobs could not be checked.');
    if(duplicate) return jobJson({ok:true,runId:duplicate.id,status:duplicate.status},202);
    const {data:active,error:activeError}=await admin.from('social_generation_runs').select('id,status,job_type').eq('user_id',user.id).eq('status','generating').maybeSingle();
    if(activeError) throw new Error('Background jobs could not be checked.');
    if(active) return jobJson({ok:true,runId:active.id,status:active.status,existing:true},202);
    const response=await fetch('https://www.marlowquinn.com/api/books',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Your website book catalogue could not be loaded. Try again shortly.');
    const catalogue=await response.json();
    const slugs=Array.isArray(body.books)?body.books.filter((v:unknown)=>typeof v==='string'):[];
    const allBooks:PlanBook[]=(catalogue.books??[]).filter((b:PlanBook)=>b.slug&&b.title&&b.blurb).map((b:PlanBook)=>({slug:b.slug,title:b.title,blurb:b.blurb.slice(0,7000),tropes:b.tropes,subgenre:b.subgenre,kindleUnlimited:b.kindleUnlimited,amazonUrl:b.amazonUrl,coverUrl:b.coverUrl}));
    let config:Record<string,unknown>;
    let tasks:{ordinal:number;request:unknown}[]=[];
    if(kind==='plan') {
      if(date<londonDate()) return jobJson({error:'Choose today or a future start date.'},400);
      const platforms=[...new Set<SocialPlatform>(Array.isArray(body.platforms)?body.platforms.filter((v:unknown)=>SOCIAL_PLATFORMS.includes(v as SocialPlatform)):[])];
      if(!platforms.length) return jobJson({error:'Choose at least one platform.'},400);
      plannedTime(date,29,platforms[0]);
      const books=allBooks.filter(b=>!slugs.length||slugs.includes(b.slug));
      if(!books.length) return jobJson({error:'No matching published books were found.'},400);
      config={platforms,books,guidance:typeof body.guidance==='string'?body.guidance.slice(0,3000):''};
      for(let i=0;i<30;i+=5) tasks.push({ordinal:i/5,request:{assignments:CONTENT_MIX.slice(i,i+5).map((postType,j)=>({dayIndex:i+j,date:addDays(date,i+j),postType,book:books[(i+j)%books.length].slug}))}});
    } else {
      const {data:rows,error}=await admin.from('social_posts').select('*').eq('user_id',user.id).eq('status','draft').is('media_path',null).not('planned_media_type','is',null).gte('scheduled_at',londonSchedule(date,'00:00')).lt('scheduled_at',londonSchedule(addDays(date,30),'00:00')).order('scheduled_at');
      if(error) throw new Error('Your saved posts could not be loaded.');
      const selected=(rows as CalendarPost[]).filter(p=>!body.postId||p.id===body.postId);
      const groups=new Map<string,CalendarPost[]>();
      for(const post of selected){
        if(!post.creative_brief?.trim()) return jobJson({error:'Add an AI creative brief to each selected draft first.'},400);
        if(!allBooks.some(b=>b.slug===post.book_slug&&b.coverUrl)) return jobJson({error:`The genuine cover for ${post.book_title} could not be found.`},400);
        const key=`${post.campaign_id}:${post.platform==='tiktok'?'portrait':'feed'}:${post.planned_media_type}:${post.creative_brief}`;
        groups.set(key,[...(groups.get(key)??[]),post]);
      }
      config={books:allBooks};
      const {data:previousFailures,error:failureError}=await admin.from('social_generation_tasks').select('request,result').eq('user_id',user.id).eq('status','failed').order('created_at',{ascending:false}).limit(120);
      if(failureError) throw new Error('Previous artwork failures could not be checked.');
      tasks=[...groups.values()].map((group,ordinal)=>{
        const first=group[0];
        const keepOriginal=previousFailures.some(task=>{
          const previous=task.request?.posts?.[0];
          return previous?.campaign_id===first.campaign_id&&previous.creative_brief===first.creative_brief&&(previous.platform==='tiktok')===(first.platform==='tiktok')&&isImageModerationFailure(task.result?.provider_diagnostic??{});
        });
        return {ordinal,request:{posts:group,...(keepOriginal?{asset_mode:'original_cover_overlay'}:{})}};
      });
      if(!tasks.length) return jobJson({ok:true,message:'There is no missing AI media in these 30 days.',status:'completed'});
    }
    const {error:insertError}=await admin.from('social_generation_runs').insert({id:runId,user_id:user.id,start_date:date,status:'generating',job_type:kind,config,total_tasks:tasks.length});
    if(insertError) return jobJson({error:insertError.code==='23505'?'Generation is already starting. Refresh to see its progress.':'The background job could not be saved.'},409);
    ownedRun=runId;
    const {error:taskError}=await admin.from('social_generation_tasks').insert(tasks.map(t=>({...t,run_id:runId,user_id:user.id})));
    if(taskError) throw new Error('The background tasks could not be saved.');
    const workflow=await start(generateSocialJob,[runId]);
    await admin.from('social_generation_runs').update({workflow_run_id:workflow.runId}).eq('id',runId).eq('user_id',user.id);
    return jobJson({ok:true,runId,status:'generating'},202);
  }catch(error){
    if(ownedRun) await jobAdmin().from('social_generation_runs').update({status:'failed',error_message:'The background job could not be started. Saved posts are kept.'}).eq('id',ownedRun).eq('user_id',user.id);
    return jobJson({error:error instanceof Error?error.message:'Background generation could not be started.'},503);
  }
}
