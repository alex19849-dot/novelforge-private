'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabaseClient';
import type {CalendarPost} from '../../lib/social-calendar';
type Entry={post_id:string;state:string;attempt:number;external_link?:string;next_check_at?:string;last_error:string;safe_to_retry:boolean;provider_post_id?:string;published_at?:string};
type Settings={enabled:boolean;channels:Record<string,{name:string}>;preflight_at?:string;heartbeat_at?:string;updated_at?:string;maintenance_checked_at?:string;last_error:string};
const button='rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40';
export default function PublishingPanel({posts,onEnabledChange,onStatesChange,onReload,mode='compact',onManage,demo=false}:{mode?:'compact'|'settings'|'issues'|'history';onManage?:()=>void;demo?:boolean;posts:CalendarPost[];onStatesChange:(states:Record<string,string>)=>void;onEnabledChange:(enabled:boolean)=>void;onReload:()=>void}) {
  const [settings,setSettings]=useState<Settings|null>(null),[entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const account=useRef<string|null>(null);
  const callbacks=useRef({onEnabledChange,onStatesChange,onReload});callbacks.current={onEnabledChange,onStatesChange,onReload};
  async function load() {
    if(demo){setSettings({enabled:false,channels:{},last_error:''});return;}
    try {
      const {data}=await supabase.auth.getSession();
      if(!data.session){account.current=null;setSettings(null);setEntries([]);callbacks.current.onStatesChange({});callbacks.current.onEnabledChange(false);return;}
      const owner=data.session.user.id;account.current=owner;
      const response=await fetch('/api/social-studio/publishing',{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
      const result=await response.json();if(account.current!==owner)return;if(!response.ok){if(response.status===401||response.status===403){setSettings(null);setEntries([]);callbacks.current.onStatesChange({});callbacks.current.onEnabledChange(false);}throw new Error(result.error);}
      setSettings(result.settings);setEntries(result.publications);callbacks.current.onStatesChange(Object.fromEntries(result.publications.map((entry:Entry)=>[entry.post_id,entry.state])));callbacks.current.onEnabledChange(Boolean(result.settings?.enabled));setError('');
    }catch(error){setError(error instanceof Error?error.message:'Publishing status could not be loaded.');}
  }
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session||account.current&&account.current!==session.user.id){account.current=null;setSettings(null);setEntries([]);callbacks.current.onStatesChange({});callbacks.current.onEnabledChange(false);}});return()=>{window.clearInterval(timer);data.subscription.unsubscribe();};},[]);
  async function action(action:string,postId?:string) {
    if(demo)return;
    setBusy(true);setError('');
    try {
      const {data}=await supabase.auth.getSession();if(!data.session) throw new Error('Sign in again first.');
      const response=await fetch('/api/social-studio/publishing',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,postId}),signal:AbortSignal.timeout(55000)});
      const result=await response.json();if(!response.ok) throw new Error(result.error);
      await load();callbacks.current.onReload();
    }catch(error){setError(error instanceof Error?error.message:'Publishing could not be updated.');}
    finally{setBusy(false);}
  }
  const activePosts=new Map(posts.filter(p=>p.status!=='cancelled').map(p=>[p.id,p]));
  const visibleEntries=entries.filter(entry=>activePosts.has(entry.post_id));
  const attention=visibleEntries.filter(entry=>['failed','attention','uncertain'].includes(entry.state));
  const stale=Boolean(settings?.enabled&&Date.now()-Date.parse(settings.heartbeat_at??settings.updated_at??'2000-01-01')>8*60_000);
  const recoveryStale=Boolean(settings?.enabled&&Date.now()-Date.parse(settings.maintenance_checked_at??'2000-01-01')>6*60_000);
  const unhealthy=Boolean(error||settings?.last_error||stale||recoveryStale);
  const label=error?'Publishing status unavailable':!settings?'Checking publishing…':!settings.enabled?'Publishing paused':unhealthy?'Publishing needs attention':'Automatic publishing is on';
  if(mode==='compact'||mode==='history')return <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm"><span className="flex items-center gap-2 text-neutral-300"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${unhealthy?'bg-amber-300':settings?.enabled?'bg-emerald-300':'bg-neutral-500'}`}/>{label}</span><button type="button" onClick={onManage} className="rounded-lg px-2 py-1 text-xs text-neutral-400 underline underline-offset-4 hover:text-white">Manage publishing</button></div>;
  if(mode==='issues')return attention.length||unhealthy?<div className="mb-6 space-y-3">{unhealthy&&<p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-300/5 p-4 text-sm text-amber-100">{error||settings?.last_error||'The publishing health check needs attention.'}<button type="button" onClick={onManage} className="ml-3 underline">Open publishing settings</button></p>}{attention.map(entry=><div key={entry.post_id} className="rounded-xl border border-amber-400/20 bg-amber-300/5 p-4"><p className="text-sm font-semibold">{activePosts.get(entry.post_id)?.book_title} · {activePosts.get(entry.post_id)?.platform}</p><p className="mt-2 text-sm leading-6 text-neutral-300">{entry.last_error||'Publication has not been confirmed yet.'}</p>{entry.state==='failed'&&entry.safe_to_retry&&!entry.provider_post_id&&<button type="button" disabled={busy} onClick={()=>void action('draft',entry.post_id)} className={`${button} mt-3`}>Return to drafts</button>}</div>)}</div>:null;
  return <section aria-labelledby="publishing-title" className="mb-5 rounded-2xl border border-white/10 bg-neutral-900/60 p-5">
   <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 id="publishing-title" className="text-xl font-semibold">Publishing</h2><p className="mt-2 text-sm text-neutral-400">{label}. Only approved posts are sent.</p></div><button type="button" disabled={busy||demo||!settings?.preflight_at} onClick={()=>void action(settings?.enabled?'pause':'enable')} className="rounded-xl bg-rose-200 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-40">{busy?'Updating…':settings?.enabled?'Pause publishing':'Enable publishing'}</button></div>
   {settings?.channels&&<div className="mt-4 flex flex-wrap gap-2">{Object.entries(settings.channels).map(([platform,channel])=><span key={platform} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-300"><span className="capitalize">{platform}</span> · {channel.name}</span>)}</div>}
   {(error||settings?.last_error)&&<p role="alert" className="mt-3 text-sm text-amber-100">{error||settings?.last_error}</p>}
   <p className="mt-4 text-xs leading-5 text-neutral-500">Pausing stops new submissions. Anything already being sent may finish. Recovery checks run independently when publishing is enabled.</p>
   <details className="mt-4 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm text-neutral-300">Connection tools &amp; status checks</summary><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||demo} onClick={()=>void action('check')} className={button}>Refresh current publishing issues</button></div></details>
  </section>;
}
