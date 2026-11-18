'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { StoryWorkspace } from '../types';
import type { StyleProfile, StyleFinding } from '../../../lib/author-style';
type Quote = { task:'analyse'|'check'; chapterId?:string; maximumUsd:number; sourceKey:string; examples:number };
export default function AuthorStylePanel({story,busy}:{story:StoryWorkspace;busy:boolean}) {
  const [profile,setProfile]=useState<StyleProfile|null>(null),[pending,setPending]=useState(0),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[findings,setFindings]=useState<StyleFinding[]|null>(null),[checkedTitle,setCheckedTitle]=useState('');
  const [chapterId,setChapterId]=useState(story.chapters.at(-1)?.id??'');
  async function api(body?:Record<string,unknown>){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Sign in to load your writing preferences.');
    const r=await fetch('/api/story-chat/style',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();if(!r.ok)throw new Error(data.error??'Writing preferences could not be loaded.');return data;
  }
  async function reload(){const data=await api();setProfile(data.profile);setPending(data.pendingCount);}
  useEffect(()=>{let live=true;api().then(data=>{if(live){setProfile(data.profile);setPending(data.pendingCount);}}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[story.id]); // account-scoped, never another story's canon
  async function run(body:Record<string,unknown>){if(working||busy)return;setWorking(true);setMessage('');try{
    const data=await api(body);
    if(body.action==='quote'){setQuote({task:body.task as Quote['task'],chapterId:body.chapterId as string|undefined,...data.quote,sourceKey:data.sourceKey,examples:data.examples});}
    else if(body.action==='run'){
      setQuote(null);
      if(body.task==='check'){setFindings(data.findings);setCheckedTitle(story.chapters.find(c=>c.id===body.chapterId)?.title??'Selected chapter');setMessage('Chapter check complete. Your manuscript is unchanged.');}
      else setMessage(`${data.suggestions} suggested preference${data.suggestions===1?'':'s'} found. Review before using across books.`);
      if(data.diagnostic)setMessage(previous=>previous+` Standard-rate estimate: $${data.diagnostic.costUsd.toFixed(4)} USD. Free-token discount is not verified here.`);
      await reload();
    }else{setQuote(null);await reload();}
  }catch(e){setMessage(e instanceof Error?e.message:'The request failed.');}finally{setWorking(false);}}
  const disabled=busy||working;const button='rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40';
  return <section className="space-y-4 rounded-2xl border border-pink-400/30 bg-neutral-900/50 p-4 sm:p-5">
    <div><h2 className="text-lg font-semibold text-pink-300">Your writing style</h2><p className="mt-1 text-sm text-neutral-300">Preferences shared across your books. Astra and AION still write the prose. GPT-5.4 mini analyses corrections and checks chapters.</p></div>
    {!profile?<button className={button} disabled={disabled} onClick={()=>{setWorking(true);reload().catch(e=>setMessage(e.message)).finally(()=>setWorking(false));}}>Reload preferences</button>:<>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={profile.enabled} disabled={disabled} onChange={e=>void run({action:'settings',enabled:e.target.checked,revision:profile.revision})}/><span>Collect corrections for style learning. Saving examples makes no model calls. Turning this off pauses collection; approved preferences still apply.</span></label>
      <p className="text-sm text-neutral-400">{pending} correction examples waiting. Collection starts with new manual edits and passage rewrites in saved chapters. Bulk replacements are skipped. One edit never becomes an automatic rule.</p>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled||pending<2} onClick={()=>void run({action:'quote',task:'analyse'})}>Analyse my corrections</button><button className={button} disabled={disabled||!pending} onClick={()=>void run({action:"discard_examples"})}>Discard collected examples</button><button className={button} disabled={disabled} onClick={()=>{setWorking(true);reload().catch(e=>setMessage(e.message)).finally(()=>setWorking(false));}}>Refresh</button></div>
      <div className="space-y-2 border-t border-white/10 pt-4"><label className="block text-sm" htmlFor="style-check-chapter">Routine chapter check</label><div className="flex flex-wrap gap-2"><select id="style-check-chapter" value={chapterId} onChange={e=>{setChapterId(e.target.value);setQuote(null);setFindings(null);}} disabled={disabled} className="max-w-full rounded-lg border border-white/15 bg-neutral-950 p-2">{story.chapters.map(c=><option key={c.id} value={c.id}>Chapter {c.number}: {c.title}</option>)}</select><button className={button} disabled={disabled||!chapterId} onClick={()=>void run({action:'quote',task:'check',storyId:story.id,chapterId})}>Check chapter</button></div><p className="text-xs text-neutral-400">Checks clarity, repetition, supported continuity and approved preferences. Reports issues without changing prose. This does not replace the full manuscript review.</p></div>
      {quote&&<div className="space-y-3 rounded-xl border border-pink-400/30 p-4"><p className="text-sm">{quote.task==='analyse'?`Analyse up to ${quote.examples} corrections`:'Check the saved chapter'} using GPT-5.4 mini. Maximum standard-rate estimate: <strong>${quote.maximumUsd.toFixed(4)} USD</strong>. Eligible usage may be free, but this app cannot confirm your remaining allowance. No automatic retries.</p><div className="flex flex-wrap gap-2"><button className={button} disabled={disabled} onClick={()=>void run({action:'run',task:quote.task,storyId:story.id,chapterId:quote.chapterId,sourceKey:quote.sourceKey,approvedBudgetUsd:quote.maximumUsd})}>Confirm and {quote.task==='analyse'?'analyse':'check'}</button><button className={button} disabled={working} onClick={()=>setQuote(null)}>Cancel</button></div></div>}
      {profile.rules.filter(r=>r.status!=='ignored').map(r=><article key={r.id} className="space-y-2 rounded-xl border border-white/10 p-3"><p className="text-xs font-semibold text-pink-300">{r.status==='approved'?'Active across books':'Suggested, not applied'}</p><p>{r.instruction}</p><p className="text-sm text-neutral-400">{r.reason}</p><div className="flex flex-wrap gap-2">{r.status==='suggested'&&<button className={button} disabled={disabled} onClick={()=>void run({action:'rule',ruleId:r.id,status:'approved',revision:profile.revision})}>Approve preference</button>}<button className={button} disabled={disabled} onClick={()=>void run({action:'rule',ruleId:r.id,status:'ignored',revision:profile.revision})}>{r.status==='approved'?'Remove preference':'Ignore suggestion'}</button></div></article>)}
      {!profile.rules.some(r=>r.status==='approved')&&<p className="text-sm text-neutral-400">No learned preferences are active yet. Existing writing instructions remain in place.</p>}
      {findings&&<div className="space-y-3"><h3 className="font-semibold">Check: {checkedTitle}</h3>{!findings.length?<p>No supported issues found in this check.</p>:findings.map((f,i)=><article key={i} className="space-y-2 rounded-xl border border-white/10 p-3"><blockquote className="whitespace-pre-wrap border-l-2 border-pink-400/40 pl-3 text-sm">{f.quote}</blockquote><p>{f.issue}</p><p className="text-sm text-neutral-300">{f.suggestion}</p></article>)}</div>}
    </>}
    {message&&<p role="status" className="whitespace-pre-wrap text-sm text-pink-200">{message}</p>}
  </section>;
}
