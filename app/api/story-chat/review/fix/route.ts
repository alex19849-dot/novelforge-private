import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { jobAdmin } from '../../../../../lib/social-job-db';
import { reviewSourceKey, type ReviewSnapshot, type ReviewInput, type ReviewReport } from '../../../../../lib/manuscript-review';
import { reviewFixTargets, completeBibleTargets, resolveReviewTarget, patchReviewTarget, undoReviewTarget, fixPrompt, fixQuote, FIX_OUTPUT_LIMIT, type ReviewFixUndo } from '../../../../../lib/manuscript-review-fix';
export const runtime='nodejs';
export const maxDuration=300;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export async function POST(request:Request){
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!token)return json({error:'Sign in to NovelForge first.'},401);
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await client.auth.getUser(token);
  if(authError||!auth.user)return json({error:'Sign in to NovelForge first.'},401);
  let diagnostic: {costUsd:number|null;inputTokens:number;outputTokens:number;durationMs:number}|null=null;
  try{
    const body=await request.json();
    if(!uuid(body.storyId)||!['prepare','apply','undo'].includes(body.action)||typeof body.currentSourceKey!=='string')return json({error:'Choose a saved review correction.'},400);
    const db=jobAdmin();
    const {data:saved,error}=await db.from('stories').select('*').eq('id',body.storyId).eq('user_id',auth.user.id).maybeSingle();
    if(error||!saved)return json({error:'The manuscript could not be found in your account.'},404);
    const snapshot:ReviewSnapshot={title:saved.title,storyBible:saved.form,chapters:saved.chapters??[]};
    if(await reviewSourceKey(snapshot)!==body.currentSourceKey)return json({error:'Wait for saving to finish or reopen this story. The saved manuscript differs from this screen.'},409);
    let patch:{chapters:typeof snapshot.chapters;storyBible:typeof snapshot.storyBible},undo:ReviewFixUndo|undefined,dirty:number;
    if(body.action==='undo'){
      const u=body.undo as ReviewFixUndo;
      if(!u||u.storyId!==body.storyId||!u.target||!['chapter','bible'].includes(u.target.kind)||typeof u.before!=='string'||typeof u.after!=='string'||u.before.length>200000||u.after.length>200000)return json({error:'The saved Undo is invalid.'},400);
      patch=undoReviewTarget(snapshot,u);dirty=u.target.chapterNumber??Math.min(...snapshot.chapters.map(c=>c.number));
    }else{
      if(!uuid(body.reviewId)||typeof body.findingId!=='string')return json({error:'Choose a saved finding.'},400);
      const {data:job,error:jobError}=await db.from('manuscript_review_jobs').select('id,input,report,status').eq('id',body.reviewId).eq('story_id',body.storyId).eq('user_id',auth.user.id).eq('status','completed').maybeSingle();
      if(jobError||!job)return json({error:'This review could not be found in your account.'},404);
      const finding=(job.report as ReviewReport).findings.find(f=>f.id===body.findingId);
      if(!finding?.evidenceChecked)return json({error:'This finding needs verified evidence before it can be applied.'},409);
      const groups=await completeBibleTargets(await reviewFixTargets(job.report as ReviewReport,job.input as ReviewInput),snapshot.storyBible);
      const available=[];
      for(const originalTarget of groups[finding.id]??[]){
        const target=await resolveReviewTarget(snapshot,originalTarget);if(!target)continue;
        const prompt=fixPrompt(target,finding,snapshot,'');
        available.push({target,quote:fixQuote(prompt+'x'.repeat(8000))});
      }
      if(body.action==='prepare')return json({targets:available});
      const chosen=available.find(t=>t.target.id===body.targetId);
      if(!chosen)return json({error:'The reviewed passage or Bible entry has changed. This fix was not submitted.'},409);
      const decision=typeof body.decision==='string'?body.decision.trim():'';
      if(decision.length>2000)return json({error:'Keep the author decision under 2,000 characters.'},400);
      if(chosen.target.kind==='bible'&&!decision)return json({error:'State which fact you want to keep before changing the Story Bible.'},400);
      if(typeof body.approvedBudgetUsd!=='number'||body.approvedBudgetUsd!==chosen.quote.maximumUsd)return json({error:'Approve the displayed cost for this correction.'},400);
      const prompt=fixPrompt(chosen.target,finding,snapshot,decision);
      if(fixQuote(prompt).maximumUsd>body.approvedBudgetUsd)return json({error:'Prepare the correction again to approve its current cost.'},409);
      if(!process.env.OPENAI_API_KEY)throw new Error('The correction editor is not configured.');
      const start=Date.now();
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6.1-terra',input:prompt,reasoning:{effort:'low'},text:{format:{type:'json_object'}},max_output_tokens:FIX_OUTPUT_LIMIT,store:false,service_tier:'default'}),signal:AbortSignal.timeout(240000),redirect:'error'});
      const raw=await response.json(),usage=raw.usage;
      if(usage){const i=usage.input_tokens??0,o=usage.output_tokens??0,cached=Math.min(i,usage.input_tokens_details?.cached_tokens??0),write=Math.min(i-cached,usage.input_tokens_details?.cache_write_tokens??0);diagnostic={inputTokens:i,outputTokens:o,costUsd:(i-cached-write+write*1.25+cached*.05+o*5)/1e6,durationMs:Date.now()-start};}
      if(!response.ok||raw.status!=='completed'||raw.incomplete_details)throw new Error('The correction did not finish. No changes or automatic retry were made.');
      const output=(raw.output??[]).flatMap((x:{content?:{type:string;text?:string}[]})=>x.content??[]).filter((x:{type:string})=>x.type==='output_text').map((x:{text?:string})=>x.text??'').join('\n');
      const result=JSON.parse(output);
      if(typeof result.needsDecision==='string')return json({error:result.needsDecision,diagnostic,needsDecision:true},422);
      if(typeof result.replacement!=='string'||!result.replacement.trim()||result.replacement===chosen.target.original)throw new Error('The editor did not propose a changed replacement. Your manuscript is unchanged.');
      const changed=patchReviewTarget(snapshot,chosen.target,result.replacement);patch=changed;
      undo={storyId:body.storyId,target:chosen.target,before:changed.before,after:changed.after};dirty=chosen.target.chapterNumber??Math.min(...snapshot.chapters.map(c=>c.number));
    }
    const dirtyFrom=saved.story_state?.continuityDirtyFromChapter;
    const state={...saved.story_state,...(Number.isFinite(dirty)?{continuityDirtyFromChapter:Math.min(dirtyFrom??dirty,dirty)}:{})};
    const {data:updated,error:saveError}=await db.from('stories').update({chapters:patch.chapters,form:patch.storyBible,story_state:state,updated_at:new Date().toISOString()}).eq('id',body.storyId).eq('user_id',auth.user.id).eq('updated_at',saved.updated_at).select('*').maybeSingle();
    if(saveError)throw new Error('The correction could not be saved. It was not submitted again.');
    if(!updated)return json({error:'The manuscript changed while the correction was running. Your newer edits were preserved; the correction was not applied.',diagnostic},409);
    return json({savedStory:updated,undo:undo??null,diagnostic});
  }catch(e){return json({error:e instanceof Error&&e.name==='TimeoutError'?'The correction timed out. Check the manuscript before starting another request; there was no automatic retry.':e instanceof Error?e.message:'The correction failed.',diagnostic},502);}
}
