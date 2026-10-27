'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabaseClient';
import type {CalendarPost} from '../../lib/social-calendar';
type Entry={post_id:string;state:string;attempt:number;external_link?:string;next_check_at?:string;last_error:string;safe_to_retry:boolean;provider_post_id?:string;published_at?:string};
type Settings={enabled:boolean;channels:Record<string,{name:string}>;preflight_at?:string;heartbeat_at?:string;last_error:string};
const button='rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40';
export default function PublishingPanel({posts,onEnabledChange,onReload}:{posts:CalendarPost[];onEnabledChange:(enabled:boolean)=>void;onReload:()=>void}) {
  const [settings,setSettings]=useState<Settings|null>(null),[entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [showAll,setShowAll]=useState(false);
  const account=useRef<string|null>(null);
  const callbacks=useRef({onEnabledChange,onReload});callbacks.current={onEnabledChange,onReload};
  async function load() {
    try {
      const {data}=await supabase.auth.getSession();
      if(!data.session){account.current=null;setSettings(null);setEntries([]);callbacks.current.onEnabledChange(false);return;}
      const owner=data.session.user.id;account.current=owner;
      const response=await fetch('/api/social-studio/publishing',{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
      const result=await response.json();if(account.current!==owner)return;if(!response.ok){if(response.status===401||response.status===403){setSettings(null);setEntries([]);callbacks.current.onEnabledChange(false);}throw new Error(result.error);}
      setSettings(result.settings);setEntries(result.publications);callbacks.current.onEnabledChange(Boolean(result.settings?.enabled));setError('');
    }catch(error){setError(error instanceof Error?error.message:'Publishing status could not be loaded.');}
  }
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session||account.current&&account.current!==session.user.id){account.current=null;setSettings(null);setEntries([]);callbacks.current.onEnabledChange(false);}});return()=>{window.clearInterval(timer);data.subscription.unsubscribe();};},[]);
  async function action(action:string,postId?:string) {
    setBusy(true);setError('');
    try {
      const {data}=await supabase.auth.getSession();if(!data.session) throw new Error('Sign in again first.');
      const response=await fetch('/api/social-studio/publishing',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,postId}),signal:AbortSignal.timeout(55000)});
      const result=await response.json();if(!response.ok) throw new Error(result.error);
      await load();callbacks.current.onReload();
    }catch(error){setError(error instanceof Error?error.message:'Publishing could not be updated.');}
    finally{setBusy(false);}
  }
  const next=posts.filter(post=>post.status==='approved'&&post.scheduled_at&&Date.parse(post.scheduled_at)>Date.now()).sort((a,b)=>a.scheduled_at!.localeCompare(b.scheduled_at!))[0];
  const attention=entries.filter(entry=>['failed','attention','uncertain'].includes(entry.state));
  const history=[...attention,...entries.filter(entry=>!attention.includes(entry))].slice(0,showAll?300:30);
  return <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4" aria-labelledby="publishing-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="publishing-title" className="font-bold">Automatic publishing: {settings?.enabled?'ON':'OFF'}</h3>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!settings?.preflight_at} onClick={()=>void action(settings?.enabled?'pause':'enable')} className={`${button} ${settings?.enabled?'':'bg-emerald-600'}`}>{busy?'Updating...':settings?.enabled?'Pause publishing':'Enable automatic publishing'}</button><button type="button" disabled={busy} onClick={()=>void action('check')} className={button}>Check publishing status</button></div>
    </div>
    <p className="mt-2 text-sm text-neutral-300">Approved posts stay editable here until their posting time, then NovelForge sends them to Buffer automatically. You can close this page. Pausing prevents new posts from starting; a post already being sent may finish.</p>
    {settings?.channels&&<p className="mt-2 text-xs text-emerald-300">{Object.entries(settings.channels).map(([platform,channel])=>`${platform}: ${channel.name}`).join(' · ')}</p>}
    {settings?.enabled&&next&&<p className="mt-2 text-sm">Next: {next.platform} · {new Date(next.scheduled_at!).toLocaleString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} UK · {next.book_title}</p>}
    {settings?.enabled&&settings.heartbeat_at&&Date.now()-Date.parse(settings.heartbeat_at)>15*60_000&&<p className="mt-2 text-sm text-amber-200">The publisher has not checked in recently. Pause and enable it again to restart.</p>}
    {(error||settings?.last_error)&&<p role="alert" className="mt-2 text-sm text-amber-200">{error||settings?.last_error}</p>}
    {entries.length>0&&<details className="mt-3" open={attention.length>0}><summary className="cursor-pointer text-sm font-semibold">Publishing history ({entries.filter(entry=>entry.state==='published').length} published{attention.length?`, ${attention.length} need attention`:''})</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{history.map(entry=>{const post=posts.find(post=>post.id===entry.post_id);return <div key={entry.post_id} className="rounded-lg border border-white/10 p-3 text-sm">
        <p className="font-semibold capitalize">{post?.platform} · {post?.book_title||'Calendar post'} · {entry.state==='accepted'?'Publishing':entry.state==='retry'?'Retry scheduled':entry.state==='attention'?'Needs attention':entry.state}</p>
        {entry.last_error&&<p className="mt-2 text-amber-200">{entry.last_error}</p>}
        {entry.next_check_at&&entry.state==='retry'&&<p className="mt-1 text-neutral-400">Automatic retry: {new Date(entry.next_check_at).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})} UK</p>}
        {entry.external_link&&<a href={entry.external_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-pink-300 underline">View published post</a>}
        {entry.state==='failed'&&entry.safe_to_retry&&!entry.provider_post_id&&<button type="button" disabled={busy} onClick={()=>void action('draft',entry.post_id)} className={`${button} mt-2`}>Return to draft / reschedule</button>}
      </div>;})}</div>
      {entries.length>30&&<button type="button" onClick={()=>setShowAll(value=>!value)} className={`${button} mt-3`}>{showAll?'Show recent only':`Show all ${entries.length} records`}</button>}
    </details>}
  </div>;
}
