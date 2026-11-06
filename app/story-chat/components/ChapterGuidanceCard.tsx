"use client";
import { useEffect, useRef, useState } from 'react';
import type { StoryState } from '../types';

type Props = {
  draft: NonNullable<StoryState['chapterGuidanceDraft']>;
  busy: boolean;
  hasPendingChapter: boolean;
  onSave: (text: string) => Promise<void>;
  onConfirm: (text: string) => Promise<void>;
};
export default function ChapterGuidanceCard({ draft, busy, hasPendingChapter, onSave, onConfirm }: Props) {
  const [text, setText] = useState(draft.text);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useEffect(() => { setText(draft.text); setError(''); }, [draft.text, draft.updatedAt]);
  async function act(confirm: boolean) {
    if (busy || inFlight.current || !text.trim()) return;
    inFlight.current = true; setWorking(true); setError('');
    try { await (confirm ? onConfirm : onSave)(text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : 'The guidance could not be saved.'); }
    finally { inFlight.current = false; setWorking(false); }
  }
  return <section aria-label="Chapter guidance awaiting confirmation" className="mx-5 mb-5 rounded-2xl border border-pink-500/40 bg-neutral-900 p-4">
    <h2 className="font-semibold text-pink-300">Review chapter guidance</h2>
    <p className="mt-2 text-sm text-neutral-400">Edit below, or send changes in chat. Chapter prose starts when you confirm. Saving guidance does not generate prose.</p>
    <textarea aria-label="Chapter guidance" value={text} disabled={busy || working} onChange={e => setText(e.target.value)} rows={14} className="mt-3 w-full resize-y whitespace-pre-wrap break-words rounded-xl bg-neutral-950 p-3 text-base leading-6 text-neutral-200" />
    {hasPendingChapter && <p className="mt-2 text-sm text-amber-300">Your unfinished draft will be kept in Previous drafts before the approved chapter starts.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-3">
      <button type="button" disabled={busy || working || !text.trim()} onClick={() => void act(false)} className="rounded-xl border border-white/20 px-4 py-3 text-white disabled:opacity-40">Save guidance</button>
      <button type="button" disabled={busy || working || !text.trim()} onClick={() => void act(true)} className="rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white disabled:opacity-40">{working ? 'Saving...' : 'Confirm guidance and write'}</button>
    </div>
  </section>;
}
