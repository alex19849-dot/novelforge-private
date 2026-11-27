import { NextResponse } from 'next/server';
import { jobAdmin } from '../../../../lib/social-job-db';
import { styleUser, loadStyleProfile } from '../../../../lib/author-style-server';
import { memorySourceHash, narrativeContext } from '../../../../lib/narrative-memory';
import { STYLE_MODEL, STYLE_OUTPUT_LIMIT, cleanStyleRules, activateSupportedStyleRules, stylePrompt, styleQuote, groundedStyleSuggestions, groundedStyleFindings, type StyleEdit } from '../../../../lib/author-style';
export const runtime='nodejs';
export const maxDuration=180;
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export async function GET(request:Request){
  const user=await styleUser(request);if(!user)return json({error:'Sign in to NovelForge first.'},401);
  try{
    const profile=await loadStyleProfile(user.id);
    const {count,error}=await jobAdmin().from('author_style_edits').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('status','pending');
    if(error)throw new Error('Saved corrections could not be counted.');
    return json({profile,pendingCount:count??0});
  }catch(e){return json({error:(e as Error).message},503);}
}
export async function POST(request:Request){
  const user=await styleUser(request);if(!user)return json({error:'Sign in to NovelForge first.'},401);
  const db=jobAdmin();let lease:string|null=null;let diagnostic:unknown=null;
  try{
    const body=await request.json();
    let profile=await loadStyleProfile(user.id);
    if(body.action==='record'){
      if(!profile.enabled)return json({recorded:false});
      if(!uuid(body.storyId)||typeof body.chapterId!=='string'||typeof body.before!=='string'||typeof body.after!=='string'||body.before.length>6000||body.after.length>6000||body.before===body.after||typeof body.instruction!=='string'||body.instruction.length>2000)return json({error:'Invalid correction example.'},400);
      const {data:owned}=await db.from('stories').select('id').eq('id',body.storyId).eq('user_id',user.id).maybeSingle();
      if(!owned)return json({error:'This story is not in your account.'},404);
      const beforeHash=memorySourceHash(body.before),afterHash=memorySourceHash(body.after);
      // Undoing a correction withdraws it from the pending evidence, not a preference in the opposite direction.
      const {data:inverse}=await db.from('author_style_edits').select('id').eq('user_id',user.id).eq('story_id',body.storyId).eq('chapter_id',body.chapterId).eq('before_hash',afterHash).eq('after_hash',beforeHash).neq('status','ignored').limit(1);
      if(inverse?.length){await db.from('author_style_edits').update({status:'ignored'}).eq('user_id',user.id).eq('id',inverse[0].id);return json({recorded:false,undone:true});}
      const {count}=await db.from('author_style_edits').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('status','pending');
      if((count??0)>=100)return json({recorded:false,notice:'100 corrections are waiting. Analyse them before collecting more.'});
      const {error}=await db.from('author_style_edits').upsert({user_id:user.id,story_id:body.storyId,chapter_id:body.chapterId,before_text:body.before,after_text:body.after,before_hash:beforeHash,after_hash:afterHash,instruction:body.instruction},{onConflict:'user_id,story_id,chapter_id,before_hash,after_hash',ignoreDuplicates:true});
      if(error)throw new Error('The correction was saved in the manuscript, but could not be added to style learning.');
      return json({recorded:true});
    }
    if(body.action==='discard_examples'){
      const {error}=await db.from('author_style_edits').update({status:'ignored'}).eq('user_id',user.id).eq('status','pending');
      if(error)throw new Error('Collected examples could not be discarded.');
      return json({saved:true});
    }
    // Initialise once, without overwriting an existing profile on another device.
    const {error:initError}=await db.from('author_style_profiles').upsert({user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true});
    if(initError)throw new Error('Your writing style profile could not be opened.');
    profile=await loadStyleProfile(user.id);
    if(body.action==='sync_preferences'){
      const candidates=profile.rules.filter(r=>r.status==='suggested');
      if(!candidates.length||profile.rules.filter(r=>r.status==='approved').length>=16)return json({activated:0});
      const ids=[...new Set(candidates.flatMap(r=>r.evidenceIds))];
      if(!ids.length)return json({activated:0});
      const {data:evidence,error:evidenceError}=await db.from('author_style_edits').select('id').eq('user_id',user.id).neq('status','ignored').in('id',ids);
      if(evidenceError)throw new Error('Saved preference evidence could not be checked.');
      const rules=activateSupportedStyleRules(profile.rules,new Set((evidence??[]).map(e=>e.id)));
      const activated=rules.filter((r,i)=>r.status==='approved'&&profile.rules[i].status==='suggested').length;
      if(!activated)return json({activated:0});
      const {data,error}=await db.from('author_style_profiles').update({rules,revision:profile.revision+1}).eq('user_id',user.id).eq('revision',profile.revision).select('revision').maybeSingle();
      if(error||!data)return json({error:'Preferences changed while updating. Refresh to load the latest version.'},409);
      return json({activated});
    }
    if(body.action==='settings'||body.action==='rule'){
      if(body.revision!==profile.revision)return json({error:'Preferences changed on another device. Reload them first.'},409);
      let rules=profile.rules;let enabled=profile.enabled;
      if(body.action==='settings'){if(typeof body.enabled!=='boolean')return json({error:'Choose whether to collect corrections.'},400);enabled=body.enabled;}
      else{
        if(!['approved','ignored'].includes(body.status)||typeof body.ruleId!=='string')return json({error:'Choose a preference to approve or ignore.'},400);
        if(!rules.some(r=>r.id===body.ruleId))return json({error:'That preference no longer exists.'},409);
        if(body.status==='approved'&&rules.filter(r=>r.status==='approved'&&r.id!==body.ruleId).length>=16)return json({error:'Keep at most sixteen active preferences. Remove an older preference first.'},400);
        rules=rules.map(r=>r.id===body.ruleId?{...r,status:body.status}:r);
      }
      const {data,error}=await db.from('author_style_profiles').update({rules,enabled,revision:profile.revision+1}).eq('user_id',user.id).eq('revision',profile.revision).select('revision').maybeSingle();
      if(error||!data)return json({error:'Preferences changed while saving. Reload and try again.'},409);
      return json({saved:true});
    }
    if(!['quote','run'].includes(body.action)||!['analyse','check'].includes(body.task))return json({error:'Choose style analysis or a chapter check.'},400);
    const task=body.task as 'analyse'|'check';let edits:StyleEdit[]=[];let chapter: {content:string;bible:unknown;memory:unknown}|undefined;
    if(task==='analyse'){
      if(profile.rules.length>=60)return json({error:'Your preference history is full. No analysis was started.'},400);
      const {data,error}=await db.from('author_style_edits').select('id,story_id,chapter_id,before_text,after_text,instruction').eq('user_id',user.id).eq('status','pending').order('created_at',{ascending:false}).limit(8);
      if(error)throw new Error('Saved corrections could not be read.');edits=data??[];
      if(edits.length<2)return json({error:'Make at least two corrections before analysing preferences.'},400);
    }else{
      if(!uuid(body.storyId)||typeof body.chapterId!=='string')return json({error:'Choose a saved chapter.'},400);
      const {data:saved,error}=await db.from('stories').select('form,chapters,story_state').eq('id',body.storyId).eq('user_id',user.id).maybeSingle();
      if(error||!saved)return json({error:'This story is not available.'},404);
      const selected=saved.chapters.find((c:{id:string})=>c.id===body.chapterId);
      if(!selected)return json({error:'Save the chapter before checking it.'},400);
      if(typeof selected.content!=='string'||selected.content.length>60000)return json({error:'This check supports chapters up to 60,000 characters.'},400);
      chapter={content:selected.content,bible:JSON.stringify(saved.form).slice(0,18000),memory:narrativeContext(saved.story_state,{beforeChapter:selected.number,pov:selected.povCharacter,maxCharacters:8000})};
    }
    const prompt=stylePrompt(task,profile,edits,chapter);
    const quote=styleQuote(prompt),sourceKey=memorySourceHash(prompt+profile.revision);
    if(body.action==='quote')return json({quote,sourceKey,examples:edits.length});
    if(body.sourceKey!==sourceKey||body.approvedBudgetUsd!==quote.maximumUsd)return json({error:'The evidence changed. Review the updated cost before running.'},409);
    if(!process.env.OPENAI_API_KEY)throw new Error('The style analyst is not configured.');
    const today=new Date().toISOString().slice(0,10);
    const {data:current}=await db.from('author_style_profiles').select('runs_day,runs_count').eq('user_id',user.id).single();
    const count=current?.runs_day===today?current.runs_count:0;
    if(count>=6)return json({error:'Six analyses or checks have already started today. Try again tomorrow.'},429);
    lease=crypto.randomUUID();
    const {data:locked,error:lockError}=await db.from('author_style_profiles').update({lock_id:lease,lock_until:new Date(Date.now()+180000).toISOString(),revision:profile.revision+1,runs_day:today,runs_count:count+1}).eq('user_id',user.id).eq('revision',profile.revision).or(`lock_until.is.null,lock_until.lt.${new Date().toISOString()}`).select('revision').maybeSingle();
    if(lockError||!locked){lease=null;return json({error:'Another analysis or preference update is running. Reload before trying again.'},409);}
    const started=Date.now();
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:STYLE_MODEL,input:[{role:'system',content:'Return an editorial JSON report. Never rewrite the manuscript or approve preferences.'},{role:'user',content:prompt}],reasoning:{effort:'low'},text:{format:{type:'json_object'}},max_output_tokens:STYLE_OUTPUT_LIMIT,service_tier:'default',store:false}),signal:AbortSignal.timeout(120000),redirect:'error'});
    const raw=await response.json();const i=raw.usage?.input_tokens??0,o=raw.usage?.output_tokens??0;
    diagnostic={model:STYLE_MODEL,inputTokens:i,outputTokens:o,costUsd:(i*.75+o*4.5)/1e6,costType:'standard-rate estimate; complimentary usage not verified',durationMs:Date.now()-started};
    if(!response.ok||raw.status!=='completed'||raw.incomplete_details)throw new Error('The analyst did not finish. No automatic retry or manuscript change was made.');
    const output=(raw.output??[]).flatMap((x:{content?:{type:string;text?:string}[]})=>x.content??[]).filter((x:{type:string})=>x.type==='output_text').map((x:{text?:string})=>x.text??'').join('\n');
    const parsed=JSON.parse(output);
    if(task==='check')return json({findings:groundedStyleFindings(parsed,chapter!.content),diagnostic});
    const suggestions=groundedStyleSuggestions(parsed,edits).map(r=>({...r,id:crypto.randomUUID(),status:'suggested' as const}));
    const {data:latest}=await db.from('author_style_profiles').select('rules,revision').eq('user_id',user.id).eq('lock_id',lease).single();
    if(!latest)throw new Error('The analysis lock expired; no preferences were saved.');
    const existing=cleanStyleRules(latest.rules);
    const {data:stillPending,error:evidenceError}=await db.from('author_style_edits').select('id').eq('user_id',user.id).eq('status','pending').in('id',edits.map(e=>e.id));
    if(evidenceError)throw new Error('Correction evidence could not be rechecked.');
    const eligible=new Set((stillPending??[]).map(e=>e.id));
    const next=suggestions.filter(r=>r.evidenceIds.every(id=>eligible.has(id))&&!existing.some(e=>e.instruction.toLowerCase()===r.instruction.toLowerCase())).slice(0,Math.max(0,60-existing.length));
    const rules=activateSupportedStyleRules([...existing,...next].slice(0,60),eligible);
    const learned=next.filter(r=>rules.some(saved=>saved.id===r.id&&saved.status==='approved')).length;
    const {data:stored,error:saveError}=await db.from('author_style_profiles').update({rules,revision:latest.revision+1}).eq('user_id',user.id).eq('lock_id',lease).eq('revision',latest.revision).select('revision').maybeSingle();
    if(saveError||!stored)throw new Error('The preferences could not be saved. No automatic retry was started.');
    const used=[...new Set(next.flatMap(r=>r.evidenceIds))];
    if(used.length){const {error:markError}=await db.from('author_style_edits').update({status:'analysed'}).eq('user_id',user.id).in('id',used).eq('status','pending');
    if(markError)throw new Error('Suggestions were saved, but some evidence is still pending. Reload before analysing again.');}
    return json({suggestions:next.length,activated:learned,deferred:next.length-learned,diagnostic});
  }catch(e){return json({error:e instanceof Error&&e.name==='TimeoutError'?'The analyst timed out. No automatic retry was started.':e instanceof Error?e.message:'Style analysis failed.',diagnostic},502);}
  finally{if(lease)await db.from('author_style_profiles').update({lock_id:null,lock_until:null}).eq('user_id',user.id).eq('lock_id',lease);}
}
