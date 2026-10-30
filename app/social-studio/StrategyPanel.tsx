'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabaseClient';
import {DEFAULT_STRATEGY,FAMILIES,FAMILY_LABELS,familyWeights} from '../../lib/social-strategy';
import type {ContentFamily,StrategySettings,LearningReport} from '../../lib/social-strategy';
type State={status:string;last_collected_at:string|null;last_error:string;report:LearningReport|Record<string,never>};
const input='mt-1 w-full rounded-xl border border-white/15 bg-neutral-950 px-3 py-2';
export default function StrategyPanel({books}:{books:{slug:string;title:string}[]}){
 const [settings,setSettings]=useState<StrategySettings>(DEFAULT_STRATEGY),[state,setState]=useState<State|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const account=useRef<string|null>(null),dirty=useRef(false),mounted=useRef(true),epoch=useRef(0);
 const load=useCallback(async()=>{
  const version=epoch.current;
  try{
   const {data}=await supabase.auth.getSession();if(!data.session||version!==epoch.current)return;
   const owner=data.session.user.id;account.current=owner;
   const response=await fetch('/api/social-studio/strategy',{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store'}),body=await response.json();
   if(!response.ok)throw Error(body.error||'Strategy could not be loaded.');
   if(mounted.current&&version===epoch.current&&account.current===owner){if(!dirty.current)setSettings(body.settings);setState(body.state);setReady(true);setError('');}
  }catch(error){if(mounted.current&&version===epoch.current)setError(error instanceof Error?error.message:'Strategy could not be loaded.');}
 },[]);
 useEffect(()=>{mounted.current=true;void load();const timer=window.setInterval(()=>void load(),60000);const {data}=supabase.auth.onAuthStateChange((_event,session)=>{epoch.current++;if(!session||account.current&&session.user.id!==account.current){account.current=null;dirty.current=false;setReady(false);setState(null);setSettings(DEFAULT_STRATEGY);setMessage('');setError('');}if(session)void load();});const changed=()=>{dirty.current=false;void load();};window.addEventListener('social-strategy-updated',changed);return()=>{mounted.current=false;clearInterval(timer);data.subscription.unsubscribe();window.removeEventListener('social-strategy-updated',changed);};},[load]);
 async function action(kind:'save'|'refresh'){
  setBusy(true);setError('');setMessage('');
  try{
   const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in first.');const owner=data.session.user.id;
   const response=await fetch('/api/social-studio/strategy',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:kind,settings})}),body=await response.json();
   if(!response.ok)throw Error(body.error||'Strategy could not be updated.');
   if(account.current===owner&&mounted.current){if(kind==='save'){dirty.current=false;setSettings(body.settings);}setMessage(kind==='save'?'Saved for future batches.':body.message);await load();}
  }catch(error){if(mounted.current)setError(error instanceof Error?error.message:'Strategy could not be updated.');}finally{if(mounted.current)setBusy(false);}
 }
 function change(patch:Partial<StrategySettings>){dirty.current=true;setSettings(previous=>({...previous,...patch}));}
 const report=state?.report?.version===1?state.report as LearningReport:null;
 return <section aria-labelledby="strategy-title" className="mt-5 rounded-2xl border border-white/10 bg-neutral-900/60 p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="strategy-title" className="text-xl font-bold">Your content strategy</h3><p className="mt-1 text-sm text-neutral-300">Reader entertainment, real book hooks and selective promotion.</p></div><button type="button" disabled={!ready||busy||state?.status==='collecting'} onClick={()=>void action('refresh')} className="rounded-xl border border-white/15 px-3 py-2 text-sm disabled:opacity-40">{state?.status==='collecting'?'Collecting analytics…':'Refresh analytics'}</button></div>
  <p className="mt-3 text-sm text-pink-200">{report?`${report.snapshot_posts} published posts have real performance data.`:'Waiting for the first analytics collection.'} {settings.adaptive?'Future batches adapt once there is enough evidence.':'Performance-led adjustments are paused.'}</p>
  {report&&<div className="mt-3 grid gap-3 sm:grid-cols-3">{report.platforms.map(platform=>{
   const patterns=platform.attributes.filter(a=>a.ready&&a.attribute==='family'&&(a.discovery!=null||a.conversion!=null)).sort((a,b)=>(b.discovery??0)-(a.discovery??0)).slice(0,2);
   const weights=familyWeights(settings,platform);
   return <div key={platform.platform} className="rounded-xl bg-black/25 p-3"><h4 className="font-semibold capitalize">{platform.platform}</h4>{patterns.length?patterns.map(pattern=><p key={pattern.value} className="mt-2 text-sm">{FAMILY_LABELS[pattern.value as ContentFamily]??pattern.value}: {pattern.discovery!=null?`${Math.round((Math.exp(pattern.discovery)-1)*100)}% relative discovery`: 'Discovery unavailable'}{pattern.conversion!=null?`; ${Math.round((Math.exp(pattern.conversion)-1)*100)}% relative clicks`:''}. <span className="text-neutral-400">{pattern.posts} posts.</span></p>):<p className="mt-2 text-sm text-neutral-400">Collecting evidence. No winners declared yet.</p>}<p className="mt-2 text-xs text-neutral-400">Next mix: about {Math.round(weights.book_promotion)}% direct promotion.</p></div>;
  })}</div>}
  <p className="mt-3 text-xs text-neutral-400">Buffer metrics are experimental and may arrive a day later. Unavailable metrics stay unknown. Clicks do not prove book sales. Older posts help baselines; their missing content labels are not guessed. Comparisons use the same platform, media format and post-age group; patterns need 12 comparable posts overall and 5 examples across 3 dates.</p>
  {state?.last_collected_at&&<p className="mt-1 text-xs text-neutral-500">Last checked: {new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(new Date(state.last_collected_at))} UK time.</p>}
  {report?.source_updated_at&&Date.now()-Date.parse(report.source_updated_at)>72*3600000&&<p className="mt-2 text-sm text-amber-200">The latest provider measurements are over three days old. Treat these patterns as historical.</p>}
  {state?.last_error&&<p role="status" className="mt-2 text-sm text-amber-200">{state.last_error}</p>}
  <details className="mt-4"><summary className="cursor-pointer font-semibold">Change strategy and exclusions</summary><form onSubmit={event=>{event.preventDefault();void action('save');}} className="mt-3 space-y-4">
   <fieldset disabled={!ready||busy} className="space-y-4">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.adaptive} onChange={event=>change({adaptive:event.target.checked})}/>Let measured results influence future batches</label>
    <label className="block text-sm">Starting direct promotion share: {settings.promotion_percent}%<input type="range" min="0" max="70" step="5" value={settings.promotion_percent} onChange={event=>change({promotion_percent:Number(event.target.value)})} className="mt-2 block w-full"/></label>
    <fieldset><legend className="mb-2 text-sm">Content families to generate</legend><div className="grid gap-2 sm:grid-cols-2">{FAMILIES.map(family=><label key={family} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!settings.disabled_families.includes(family)} onChange={event=>change({disabled_families:event.target.checked?settings.disabled_families.filter(f=>f!==family):[...settings.disabled_families,family]})}/>{FAMILY_LABELS[family]}</label>)}</div></fieldset>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Temporarily prioritise a book<select value={settings.priority_book} onChange={event=>change({priority_book:event.target.value})} className={input}><option value="">No priority</option>{books.map(book=><option key={book.slug} value={book.slug}>{book.title}</option>)}</select></label><label className="text-sm">Priority ends<input type="date" value={settings.priority_until} onChange={event=>change({priority_until:event.target.value})} className={input}/></label></div>
    <label className="block text-sm">Topics, jokes or styles to avoid, one per line<textarea rows={4} value={settings.blocked_topics.join('\n')} onChange={event=>change({blocked_topics:event.target.value.split('\n')})} className={input}/></label>
    <p className="text-xs text-neutral-400">These controls affect future generation. Existing approved posts stay as you approved them. Book priorities still rotate the catalogue.</p>
    <button type="submit" className="rounded-xl bg-pink-500 px-4 py-2 font-semibold disabled:opacity-40">{busy?'Saving…':'Save strategy'}</button>
   </fieldset>
  </form></details>
  <div aria-live="polite">{message&&<p className="mt-3 text-sm text-emerald-300">{message}</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}</div>
 </section>;
}
