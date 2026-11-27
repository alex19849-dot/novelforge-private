"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { reviewSourceKey, type ReviewQuote, type ReviewKind, type SavedReview } from '../../../lib/manuscript-review';
import { targetRange, type ReviewFixTarget, type ReviewFixUndo } from '../../../lib/manuscript-review-fix';
import type { StoryWorkspace } from '../types';

const kindLabels: Record<ReviewKind, string> = { clear_error: 'Clear error', possible_issue: 'Possible issue', editorial_opinion: 'Editorial opinion' };
const button = 'min-h-11 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const primary = `${button} border-pink-500 bg-pink-500 text-white hover:bg-pink-600`;
const money = (value: number) => `$${value.toFixed(value < 0.01 ? 4 : 2)} USD`;

type ApplyCorrection = (body: Record<string, unknown>) => Promise<{ undo: ReviewFixUndo | null; diagnostic?: { costUsd: number | null } | null }>;
export default function ManuscriptReviewPanel({ story, busy, onApplyCorrection }: { story: StoryWorkspace; busy: boolean; onApplyCorrection?: ApplyCorrection }) {
  const [jobs, setJobs] = useState<SavedReview[]>([]);
  const [selected, setSelected] = useState('');
  const [quote, setQuote] = useState<ReviewQuote | null>(null);
  const [sourceKey, setSourceKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [correction, setCorrection] = useState<{ reviewId: string; findingId: string; sourceKey: string; options: { target: ReviewFixTarget; quote: { maximumUsd: number; estimatedUsd: number } }[]; targetId: string; decision: string } | null>(null);
  const [fixUndo, setFixUndo] = useState<ReviewFixUndo | null>(null);
  const [savedEdit, setSavedEdit] = useState<{ reviewId: string; findingId: string; text: string } | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const fixLock = useRef(false);
  const correctionDialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (correction) { correctionDialog.current?.focus(); correctionDialog.current?.scrollIntoView?.({ block: "center" }); } }, [correction?.findingId]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ReviewKind>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [newReview, setNewReview] = useState(false);
  const [findingId, setFindingId] = useState('');
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const requestId = useRef<string | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setSourceKey('');
    setQuote(null);
    void reviewSourceKey(story).then(key => { if (!cancelled) setSourceKey(key); }).catch(() => { if (!cancelled) setError('The manuscript version could not be checked.'); });
    return () => { cancelled = true; };
  }, [story.title, story.storyBible, story.chapters]);

  const api = useCallback(async (method: string, body?: unknown, fix = false) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sign in to NovelForge first.');
    const response = await fetch(`/api/story-chat/review${fix ? '/fix' : ''}${method === 'GET' ? `?storyId=${encodeURIComponent(story.id)}` : ''}`, { method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'The review request failed.');
    return value;
  }, [story.id]);

  const refresh = useCallback(async () => {
    const data = await api('GET');
    if (mounted.current) { setJobs(data.jobs ?? []); setLoading(false); }
  }, [api]);

  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try { await refresh(); }
      catch (e) { if (!stopped) { setError(e instanceof Error ? e.message : 'Saved reviews could not be loaded.'); setLoading(false); } }
      if (!stopped) timer = setTimeout(check, 5000);
    };
    const wake = () => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined); };
    void check();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); };
  }, [refresh]);

  const active = jobs.find(job => job.status === 'generating');
  const job = jobs.find(job => job.id === selected) ?? jobs[0];
  const stale = !!job && !!sourceKey && job.source_key !== sourceKey;
  const report = job?.report;
  const visible = report?.findings.filter(f => (filter === 'all' || filter === f.kind) && (showDismissed || !job.dismissed_ids.includes(f.id))) ?? [];

  const finding = visible.find(f => f.id === findingId) ?? visible[0];
  const findingIndex = finding ? visible.indexOf(finding) : -1;
  const editing = !!report && !newReview && !active;
  const chosenTarget = correction?.options.find(o => o.target.id === correction.targetId);
  function moveFinding(offset: number) {
    if (fixBusy) return;
    setCorrection(null); setError(''); setNotice('');
    setFindingId(visible[(findingIndex + offset + visible.length) % visible.length]?.id ?? '');
  }

  async function prepare() {
    if (submitLock.current || !sourceKey || busy || active) return;
    submitLock.current = true; setSubmitting(true); setError(''); setNotice('');
    try {
      const data = await api('POST', { action: 'estimate', storyId: story.id, sourceKey });
      if (mounted.current) { setQuote(data.quote); requestId.current = crypto.randomUUID(); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'The review could not be prepared.'); }
    finally { submitLock.current = false; if (mounted.current) setSubmitting(false); }
  }
  async function start() {
    if (submitLock.current || !quote || quote.sourceKey !== sourceKey || active || busy) return;
    submitLock.current = true; setSubmitting(true); setError('');
    const id = requestId.current ?? crypto.randomUUID(); requestId.current = id;
    try {
      const data = await api('POST', { action: 'start', id, storyId: story.id, sourceKey: quote.sourceKey, approvedBudgetUsd: quote.maximumUsd });
      if (mounted.current) {
        setQuote(null); setNewReview(false); setCorrection(null); setFindingId(''); setSelected(data.job?.id ?? id);
        if (data.job) setJobs(old => [data.job, ...old.filter(j => j.id !== data.job.id)]);
        setNotice('Your book is being checked. You can leave the app and return to Manuscript editor for the results.');
      }
    } catch (e) {
      if (mounted.current) setError(`${e instanceof Error ? e.message : 'The review could not be confirmed.'} Refresh saved reviews before starting again; no automatic retry was sent.`);
      void refresh().catch(() => undefined);
    } finally { submitLock.current = false; if (mounted.current) setSubmitting(false); }
  }
  async function dismiss(findingId: string, dismissed: boolean) {
    if (!job || decisionBusy) return;
    setDecisionBusy(true); setError('');
    try {
      const data = await api('PATCH', { id: job.id, findingId, dismissed });
      if (mounted.current) setJobs(old => old.map(j => j.id === data.job.id ? data.job : j));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'The decision could not be saved.'); }
    finally { if (mounted.current) setDecisionBusy(false); }
  }
  async function prepareCorrection(findingId: string) {
    if (!job || !sourceKey || busy || fixLock.current) return;
    fixLock.current = true; setFixBusy(true); setError('');
    try {
      const data = await api('POST', { action: 'prepare', storyId: story.id, reviewId: job.id, findingId, currentSourceKey: sourceKey }, true);
      const options = data.targets as { target: ReviewFixTarget; quote: { maximumUsd: number; estimatedUsd: number } }[];
      if (!options.length) throw new Error('The reviewed text has changed or has no bounded correction target. No model call was made.');
      const preferred = options.filter(o => o.target.kind === 'chapter').at(-1) ?? options[0];
      if (mounted.current) setCorrection({ reviewId: job.id, findingId, sourceKey, options, targetId: preferred.target.id, decision: '' });
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'The correction could not be prepared.'); }
    finally { fixLock.current = false; if (mounted.current) setFixBusy(false); }
  }
  async function applyCorrection(undo = false) {
    if (!onApplyCorrection || fixLock.current || busy || !sourceKey || (!undo && !correction) || (undo && !fixUndo)) return;
    fixLock.current = true; setFixBusy(true); setError('');
    try {
      const chosen = correction?.options.find(o => o.target.id === correction.targetId);
      const body = undo ? { action: 'undo', storyId: story.id, currentSourceKey: sourceKey, undo: fixUndo } : { action: 'apply', storyId: story.id, reviewId: correction!.reviewId, findingId: correction!.findingId, targetId: chosen!.target.id, currentSourceKey: correction!.sourceKey, decision: correction!.decision, approvedBudgetUsd: chosen!.quote.maximumUsd };
      const data = await onApplyCorrection(body);
      if (mounted.current) {
        setFixUndo(data.undo);
        if (undo) setSavedEdit(null);
        else if (data.undo && correction) {
          let text = data.undo.after;
          if (data.undo.target.kind === 'chapter') {
            const range = targetRange(data.undo.before, data.undo.target);
            text = data.undo.after.slice(range.start, data.undo.after.length - (data.undo.before.length - range.end));
          }
          setSavedEdit({ reviewId: correction.reviewId, findingId: correction.findingId, text });
        }
        setCorrection(null);
        setNotice(undo ? 'Correction undone and saved.' : `Edit applied and saved. Read the updated passage below, then move to the next suggestion.${data.diagnostic?.costUsd != null ? ` Estimated model cost ${money(data.diagnostic.costUsd)}.` : ''}`);
      }
    } catch (e) { if (mounted.current) setError(`${e instanceof Error ? e.message : 'The correction could not be applied.'} No automatic retry was sent.`); }
    finally { fixLock.current = false; if (mounted.current) setFixBusy(false); }
  }
  return <section aria-label="Manuscript editor" className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24 text-neutral-200 sm:px-6">
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-300">{story.title}</p>
        <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Manuscript editor</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">Check your saved book, then choose which suggestions to use. Nothing is rewritten until you confirm an edit.</p>
      </header>

      <ol aria-label="Editing steps" className="grid grid-cols-3 gap-2 border-b border-white/10 pb-5 text-sm">
        {['Check cost', 'Review book', 'Choose edits'].map((label, index) => {
          const current = active ? 1 : editing ? 2 : 0;
          return <li key={label} aria-current={current === index ? 'step' : undefined} className={`flex flex-col gap-2 sm:flex-row sm:items-center ${current === index ? 'text-white' : 'text-neutral-500'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${current === index ? 'bg-pink-500 text-white' : 'bg-white/5'}`}>{index + 1}</span>{label}
          </li>;
        })}
      </ol>

      {loading && <p role="status" className="py-8 text-neutral-400">Loading your saved reviews…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm leading-relaxed text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-pink-400/30 bg-pink-400/5 p-4 text-sm leading-relaxed text-pink-200">{notice}</p>}

      {!loading && !active && (!job || newReview || (!report && job.status !== 'generating')) && <div className="space-y-5 rounded-2xl border border-white/10 bg-neutral-900/60 p-5 sm:p-6">
        <div><h3 className="text-xl font-semibold text-white">{report ? 'Review the updated book' : 'Start with a book review'}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">The editor checks continuity, repeated wording, dialogue and prose using your Story Bible and {story.chapters.length} saved chapters. Unsaved drafts are not included.</p>
        </div>
        {!quote ? <>
          <p className="text-sm">First, check the price. This button does not start a paid review.</p>
          <button className={primary} disabled={busy || submitting || !sourceKey || !story.chapters.length} onClick={() => void prepare()}>{submitting ? 'Checking cost…' : 'Check review cost'}</button>
          {!story.chapters.length && <p className="text-sm text-amber-200">Save a chapter before reviewing your book.</p>}
          {busy && <p className="text-sm text-neutral-400">Your current writing request needs to finish first.</p>}
        </> : <div className="space-y-4 border-t border-white/10 pt-4">
          <p className="text-sm">{quote.chapterCount} chapters · {quote.wordCount.toLocaleString()} words</p>
          <p>Expected cost: <strong className="text-white">{money(quote.estimatedUsd)}</strong></p>
          <p className="text-sm text-neutral-400">Approval allowance: {money(quote.maximumUsd)}. This is a conservative estimate, not the expected charge. Tax and currency conversion are extra.</p>
          <details className="text-sm text-neutral-400"><summary className="cursor-pointer py-1">What will be sent?</summary><p className="mt-2 leading-relaxed">Your saved chapters and Story Bible go to the existing OpenAI service for one Terra 6.1 review. Reviewing does not rewrite your book. No automatic paid retries are made.</p></details>
          <div className="flex flex-wrap gap-3"><button className={primary} disabled={submitting || busy || quote.sourceKey !== sourceKey} onClick={() => void start()}>{submitting ? 'Starting review…' : 'Confirm cost and review book'}</button><button className={button} disabled={submitting} onClick={() => setQuote(null)}>Cancel</button></div>
        </div>}
        {report && <button className="text-sm text-pink-300 underline underline-offset-4" disabled={submitting} onClick={() => { setNewReview(false); setQuote(null); }}>Back to suggestions</button>}
      </div>}

      {active && <div role="status" className="space-y-3 rounded-2xl border border-pink-400/30 bg-pink-400/5 p-6">
        <h3 className="text-xl font-semibold text-white">Your book is being reviewed</h3>
        <p className="text-sm leading-relaxed text-neutral-300">You can leave this tab or app. Return to Manuscript editor when you are ready. Your results will appear here automatically.</p>
        <p className="text-sm text-neutral-400">There is no need to start another review.</p>
      </div>}
      {job?.status === 'failed' && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm leading-relaxed text-red-200">{job.error_message} A charge may have occurred even without a complete report. Checking a new price is free; starting another review is a new paid request.</p>}

      {report && !newReview && <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h3 className="text-xl font-semibold text-white">Your suggested edits</h3><p className="mt-1 text-sm text-neutral-400">{report.findings.length} suggestions · {report.suppliedChapterCount} chapters reviewed</p></div>
          <button className={button} disabled={!!active || busy || fixBusy} onClick={() => { setNewReview(true); setQuote(null); setCorrection(null); setError(''); setNotice(''); }}>Review updated book</button>
        </div>
        {stale && <p className="text-sm leading-relaxed text-amber-200">You have edited the book since this review. Unchanged passages can still be fixed; passages that have changed will be checked before any rewrite.</p>}
        <p className="text-sm leading-relaxed text-neutral-400">Read one suggestion at a time. <strong className="text-neutral-200">Review this fix</strong> shows the passage and cost before you decide. <strong className="text-neutral-200">Keep my text</strong> saves your decision to ignore it. <strong className="text-neutral-200">Next suggestion</strong> leaves it undecided.</p>

        {fixUndo && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-400/25 bg-pink-400/5 p-4">
          <p className="text-sm">Your last correction is saved. You can undo it for free until you leave this editor.</p>
          <button className={button} disabled={fixBusy || busy || !sourceKey} onClick={() => void applyCorrection(true)}>Undo last correction</button>
        </div>}

        {finding ? <article aria-label="Current suggestion" className="space-y-6 rounded-2xl border border-white/15 bg-neutral-900/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <p className="text-sm text-neutral-400">Suggestion {findingIndex + 1} of {visible.length}</p>
            <span className="text-xs text-pink-200">{kindLabels[finding.kind]}{job.dismissed_ids.includes(finding.id) ? ' · Kept original' : ''}</span>
          </div>
          <div><h4 className="text-xl font-semibold text-white">{finding.category}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{finding.explanation}</p></div>
          <div className="space-y-3"><h5 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Passage in your book</h5>
            {finding.evidence.map((e, i) => <div key={i} className="border-l-2 border-pink-400/50 pl-4">
              <p className="mb-2 text-xs text-neutral-400">{e.chapterId ? `Chapter ${e.chapterNumber}: ${e.chapterTitle}` : e.sourceId === 'bible' ? 'Story Bible' : e.sourceId}{!e.verified ? ' · Quotation needs checking' : ''}</p>
              <blockquote className="whitespace-pre-wrap break-words text-base leading-relaxed text-neutral-200">{e.quote}</blockquote>
            </div>)}
          </div>
          <div><h5 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Proposed change</h5><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{finding.correctionDirection}</p></div>
          {!finding.evidenceChecked && <p className="text-sm leading-relaxed text-amber-200">The editor could not verify this quotation. Check it in your chapter; an automatic fix is not available for this suggestion.</p>}

          {savedEdit?.reviewId === job.id && savedEdit.findingId === finding.id && <div className="space-y-3 border-t border-pink-400/30 pt-5"><h5 className="font-semibold text-pink-200">Saved edit</h5><p className="whitespace-pre-wrap break-words text-base leading-relaxed">{savedEdit.text}</p><p className="text-sm text-neutral-400">This passage is now in your manuscript. Use Undo last correction to put the original back.</p></div>}

          {savedEdit?.reviewId === job.id && savedEdit.findingId === finding.id ? null : correction && correction.findingId === finding.id && chosenTarget ? <div ref={correctionDialog} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="review-fix-title" className="space-y-4 border-t border-pink-400/30 pt-5 outline-none">
            <div><h5 id="review-fix-title" className="text-lg font-semibold text-white">Apply this edit?</h5><p className="mt-2 text-sm leading-relaxed text-neutral-400">The editor will rewrite only the passage below and save it in your manuscript. Everything outside it stays as it is.</p></div>
            {correction.options.length > 1 ? <label className="block text-sm">Choose the passage to change<select className="mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-neutral-950 p-3" value={correction.targetId} disabled={fixBusy} onChange={e => setCorrection({ ...correction, targetId: e.target.value })}>{correction.options.map(o => <option key={o.target.id} value={o.target.id}>{o.target.label}</option>)}</select></label> : <p className="text-sm font-medium">{chosenTarget.target.label}</p>}
            <details open><summary className="cursor-pointer text-sm text-neutral-400">Text that will be replaced</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{chosenTarget.target.original}</p></details>
            {chosenTarget.target.kind === 'bible' ? <label className="block text-sm">Which fact should the Story Bible keep? <span className="text-pink-300">Required</span><textarea className="mt-2 w-full rounded-xl border border-white/15 bg-neutral-950 p-3" rows={3} maxLength={2000} value={correction.decision} disabled={fixBusy} onChange={e => setCorrection({ ...correction, decision: e.target.value })} /></label> : <details><summary className="cursor-pointer text-sm text-neutral-400">Add instructions for this fix (optional)</summary><label className="mt-3 block text-sm">Tell the editor what you want kept or changed<textarea className="mt-2 w-full rounded-xl border border-white/15 bg-neutral-950 p-3" rows={3} maxLength={2000} value={correction.decision} disabled={fixBusy} onChange={e => setCorrection({ ...correction, decision: e.target.value })} /></label></details>}
            <p className="text-sm">Expected edit cost: <strong>{money(chosenTarget.quote.estimatedUsd)}</strong><span className="mt-1 block text-xs text-neutral-400">Approval allowance {money(chosenTarget.quote.maximumUsd)} USD, excluding tax and currency conversion. Cancel and undo do not use a model.</span></p>
            {correction.sourceKey !== sourceKey && <p className="text-sm text-amber-200">The book changed while this edit was being prepared. Cancel, then review the fix again.</p>}
            <div className="flex flex-col gap-3 sm:flex-row"><button className={primary} disabled={fixBusy || busy || correction.sourceKey !== sourceKey || (chosenTarget.target.kind === 'bible' && !correction.decision.trim())} onClick={() => void applyCorrection(false)}>{fixBusy ? 'Applying edit…' : 'Confirm cost and apply edit'}</button><button className={button} disabled={fixBusy} onClick={() => setCorrection(null)}>Cancel edit</button></div>
          </div> : <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row">
            <button className={primary} disabled={!onApplyCorrection || !finding.evidenceChecked || !sourceKey || busy || fixBusy || !!active} onClick={() => void prepareCorrection(finding.id)}>{fixBusy ? 'Preparing edit…' : 'Review this fix'}</button>
            <button className={button} disabled={decisionBusy || fixBusy} onClick={() => void dismiss(finding.id, !job.dismissed_ids.includes(finding.id))}>{decisionBusy ? 'Saving decision…' : job.dismissed_ids.includes(finding.id) ? 'Reconsider this suggestion' : 'Keep my text'}</button>
          </div>}
        </article> : <div className="space-y-2 rounded-2xl border border-white/10 p-6"><h4 className="text-lg font-semibold text-white">{report.findings.length === 0 ? 'No edits were suggested' : 'No suggestions left in this list'}</h4><p className="text-sm leading-relaxed text-neutral-400">{report.findings.length === 0 ? 'You can read the review notes below. A final proofread is still worthwhile.' : 'Use the options below to see suggestions you kept, or change the filter.'}</p></div>}

        {visible.length > 1 && <nav aria-label="Suggestion navigation" className="flex items-center justify-between gap-3"><button className={button} disabled={fixBusy || decisionBusy || !!correction || findingIndex <= 0} onClick={() => moveFinding(-1)}>Previous</button><button className={button} disabled={fixBusy || decisionBusy || !!correction || findingIndex >= visible.length - 1} onClick={() => moveFinding(1)}>Next suggestion</button></nav>}
        <details className="border-t border-white/10 pt-4"><summary className="cursor-pointer py-2 text-sm text-neutral-400">Filter suggestions and show kept text</summary><div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="text-sm">Suggestion type<select className="mt-2 block w-full rounded-xl border border-white/15 bg-neutral-900 p-3" value={filter} disabled={fixBusy || !!correction} onChange={e => { setFilter(e.target.value as typeof filter); setFindingId(''); }}><option value="all">All suggestions</option>{Object.entries(kindLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDismissed} disabled={fixBusy || !!correction} onChange={e => { setShowDismissed(e.target.checked); setFindingId(''); }} />Include suggestions where I kept my text</label>
        </div></details>
        <details className="border-t border-white/10 pt-4"><summary className="cursor-pointer py-2 text-sm text-neutral-400">Review notes and chapter lengths</summary><div className="mt-3 space-y-4 text-sm leading-relaxed text-neutral-400">
          {!!report.strengths.length && <div><h4 className="font-semibold text-neutral-200">What works well</h4><ul className="mt-2 list-disc space-y-2 pl-5">{report.strengths.map((s,i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.unverifiedFindings > 0 && <p className="text-amber-200">{report.unverifiedFindings} suggestions have quotations or locations that need checking.</p>}
          <div><h4 className="font-semibold text-neutral-200">Chapter lengths</h4><ul className="mt-2 space-y-2">{report.measuredLengths.map(c => <li key={c.chapterId}>Chapter {c.number}: {c.title} · {c.words.toLocaleString()} words</li>)}</ul></div>
          <p>All saved chapters were supplied together. This review can miss problems, and other books in the series are not included. A verified quotation confirms the wording, not whether the editor's interpretation is right.</p>
          {!!report.limitations.length && <ul className="list-disc space-y-2 pl-5">{report.limitations.map((s,i) => <li key={i}>{s}</li>)}</ul>}
        </div></details>
      </>}

      {!!jobs.length && <details className="border-t border-white/10 pt-4"><summary className="cursor-pointer py-2 text-sm text-neutral-400">Previous reviews and technical details</summary><div className="mt-3 space-y-4">
        <label className="block text-sm">Choose a saved review<select className="mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-neutral-900 p-3" value={job?.id ?? ''} disabled={fixBusy || submitting || decisionBusy} onChange={e => { setSelected(e.target.value); setFindingId(''); setCorrection(null); setQuote(null); setNewReview(false); setNotice(''); setError(''); }}>{jobs.map(j => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status === 'completed' ? 'Ready' : j.status === 'generating' ? 'Reviewing' : 'Not completed'}</option>)}</select></label>
        <button className={button} onClick={() => void refresh().then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'Refresh failed.'))}>Refresh saved reviews</button>
        {job?.diagnostic && <p className="text-xs leading-relaxed text-neutral-500">Terra 6.1 · {(job.diagnostic.durationMs / 1000).toFixed(1)} seconds · {job.diagnostic.inputTokens.toLocaleString()} input tokens · {job.diagnostic.outputTokens.toLocaleString()} output tokens · {job.diagnostic.costUsd === null ? 'Cost unavailable' : `Estimated model cost ${money(job.diagnostic.costUsd)}`}</p>}
      </div></details>}
    </div>
  </section>;
}
