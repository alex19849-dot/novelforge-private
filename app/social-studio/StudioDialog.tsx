'use client';
import {useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
export default function StudioDialog({children,onClose,busy=false}:{children:ReactNode;onClose:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current,previous=document.body.style.overflow;dialog?.showModal();document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=previous;};},[]);
 return <dialog ref={ref} aria-label="Post editor" onCancel={event=>{event.preventDefault();if(!busy)onClose();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-[880px] overflow-y-auto rounded-3xl border border-white/15 bg-neutral-950 p-0 text-white shadow-2xl backdrop:bg-black/75"><div className="sticky top-0 z-10 flex justify-end border-b border-white/10 bg-neutral-950/95 px-4 py-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-40" aria-label="Close post editor">Close ✕</button></div>{children}</dialog>;
}
