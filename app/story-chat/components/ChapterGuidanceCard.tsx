"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StoryState } from '../types';

type Props = {
  draft: NonNullable<StoryState['chapterGuidanceDraft']>;
  busy: boolean;
  hasPendingChapter: boolean;
  onSave: (text: string) => Promise<void>;
  onConfirm: (text: string) => Promise<void>;
  onDiscard: () => Promise<void>;
};
export default function ChapterGuidanceCard({ draft, busy, hasPendingChapter, onSave, onConfirm, onDiscard }: Props) {
  const [text, setText] = useState(draft.text);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  useEffect(() => { setText(draft.text); setError(''); }, [draft.text, draft.updatedAt]);
  useLayoutEffect(() => {
    const field = editor.current;
    if (field) { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; }
  }, [text, editing]);
  async function act(action: 'save' | 'confirm' | 'discard') {
    if (busy || inFlight.current || action !== 'discard' && !text.trim()) return;
    inFlight.current = true; setWorking(action); setError('');
    try {
      if (action === 'discard') await onDiscard();
      else { await (action === 'confirm' ? onConfirm : onSave)(text.trim()); setEditing(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'The guidance could not be saved.'); }
    finally { inFlight.current = false; setWorking(''); }
  }
  const disabled = busy || Boolean(working);
  return <section aria-label="Chapter guidance awaiting confirmation" className="relative min-w-0 rounded-2xl border border-pink-500/30 bg-neutral-900">
    <div className="sticky top-0 z-20 rounded-t-2xl border-b border-white/10 bg-neutral-900 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-pink-300">Chapter guidance</h2><p className="mt-1 text-xs text-neutral-400">{editing ? 'Edit in place. Save or confirm when ready.' : 'Read through, ask for changes in chat, or confirm to write.'}</p></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" disabled={disabled} onClick={() => { if (editing) setText(draft.text); setEditing(!editing); setError(''); }} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-40">{editing ? 'Cancel edits' : 'Edit guidance'}</button>
          {editing && <button type="button" disabled={disabled || !text.trim()} onClick={() => void act('save')} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-40">Save changes</button>}
          <button type="button" disabled={disabled} onClick={() => void act('discard')} className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 disabled:opacity-40">Discard guidance</button>
          <button type="button" disabled={disabled || !text.trim()} onClick={() => void act('confirm')} className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{working === 'confirm' ? 'Starting...' : 'Confirm and write'}</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      {editing ? <textarea ref={editor} aria-label="Chapter guidance" value={text} disabled={disabled} onChange={e => setText(e.target.value)} rows={1} className="block min-h-40 w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-base leading-7 text-neutral-200 outline-none focus:ring-1 focus:ring-pink-500" /> :
        <div className="max-w-3xl space-y-5 text-base leading-7 text-neutral-200">{text.split(/\n\s*\n/).map((block, index) => <p key={index} className="whitespace-pre-wrap break-words">{block}</p>)}</div>}
      {hasPendingChapter && <p className="mt-5 border-t border-white/10 pt-3 text-sm text-neutral-400">Your unfinished chapter will be kept in Previous drafts.</p>}
    </div>
  </section>;
}
