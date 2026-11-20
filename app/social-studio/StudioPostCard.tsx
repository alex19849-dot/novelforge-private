'use client';
import {useState} from 'react';
import type {CalendarPost} from '../../lib/social-calendar';
import {supabase} from '../../lib/supabaseClient';
import {londonTime} from '../../lib/social-calendar';
import {postSection} from '../../lib/social-workspace';
export default function StudioPostCard({posts,states,onEdit,disabled=false}:{posts:CalendarPost[];states:Record<string,string>;onEdit:(post:CalendarPost)=>void;disabled?:boolean}){
 const [chosen,setChosen]=useState(posts[0].id),[copied,setCopied]=useState(false);
 const post=posts.find(p=>p.id===chosen)??posts[0],section=postSection(post,states[post.id]);
 const url=post.media_path?supabase.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl:null;
 const date=post.scheduled_at?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short'}).format(new Date(post.scheduled_at))+' · '+londonTime(post.scheduled_at)+' UK':'Date not chosen';
 const label=section==='issues'?'Needs attention':section==='scheduled'?(post.status==='publishing'?'Sending':'Scheduled'):section==='history'?'Published':'Draft';
 return <article className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/70">
  <div className="flex items-center justify-between gap-3 px-4 py-3"><span className="truncate text-sm font-medium text-neutral-300">{date}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${section==='issues'?'bg-amber-400/15 text-amber-200':section==='history'?'bg-emerald-400/10 text-emerald-200':'bg-white/10 text-neutral-200'}`}>{label}</span></div>
  <div className="flex h-[360px] items-center justify-center border-y border-white/5 bg-black/40 sm:h-[420px]">{url?(post.media_type==='video'?<video src={url} controls playsInline preload="metadata" aria-label={`${post.book_title||'Post'} video preview`} className="h-full w-full object-contain"/>:<img src={url} alt={post.title||`${post.book_title} artwork`} loading="lazy" className="h-full w-full object-contain"/>):<div className="max-w-xs p-8 text-center"><p className="text-3xl text-neutral-600" aria-hidden="true">▧</p><p className="mt-3 text-sm text-neutral-400">{post.planned_media_type?'Artwork still needed':'Text post'}</p><p className="mt-4 text-xl font-semibold leading-relaxed">{post.title||post.caption.split('\n')[0]||'Your draft starts here'}</p></div>}</div>
  <div className="p-4 sm:p-5"><h3 className="text-lg font-semibold">{post.book_title||'Reader conversation'}</h3>
   <div className="mt-3 flex flex-wrap gap-2" aria-label="Platform previews">{posts.map(item=><button key={item.id} type="button" aria-pressed={item.id===post.id} onClick={()=>{setChosen(item.id);setCopied(false);}} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${item.id===post.id?'border-rose-300/40 bg-rose-300/10 text-rose-100':'border-white/10 text-neutral-400 hover:text-white'}`}>{item.platform}</button>)}</div>
   <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{post.caption.slice(0,220)||'Caption to write'}{post.caption.length>220?'…':''}</p>
   {post.quality_notes&&<p className="mt-3 rounded-lg bg-amber-300/10 p-3 text-sm text-amber-100">{post.quality_notes}</p>}
   <div className="mt-4 flex flex-wrap gap-2">{['draft','approved'].includes(post.status)&&<button type="button" disabled={disabled} onClick={()=>onEdit(post)} className="rounded-xl bg-rose-200 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-rose-100 disabled:opacity-40">{post.status==='draft'?'Review draft':'Edit post'}</button>}<details className="min-w-0 flex-1"><summary className="cursor-pointer rounded-xl border border-white/10 px-3 py-2.5 text-center text-sm text-neutral-300">Full caption &amp; downloads</summary><div className="mt-3 space-y-3 text-sm"><p className="whitespace-pre-wrap leading-6 text-neutral-300">{post.caption}</p><p className="break-words text-rose-200">{post.hashtags.join(' ')}</p><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText([post.caption,post.hashtags.join(' ')].join('\n\n'));setCopied(true);}catch{setCopied(false);}}} className="underline">{copied?'Copied':'Copy caption'}</button>{url&&<a href={url} download target="_blank" rel="noreferrer" className="ml-4 underline">Download {post.media_type==='video'?'video':'image'}</a>}</div></details></div>
  </div>
 </article>;
}
