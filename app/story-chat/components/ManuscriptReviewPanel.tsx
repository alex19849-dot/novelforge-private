"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { reviewSourceKey, type ReviewQuote, type ReviewKind, type SavedReview } from '../../../lib/manuscript-review';
import type { ReviewFixTarget, ReviewFixUndo } from '../../../lib/manuscript-review-fix';
import type { StoryWorkspace } from '../types';

const kindLabels: Record<ReviewKind, string> = { clear_error: 'Clear error', possible_issue: 'Possible issue', editorial_opinion: 'Editorial opinion' };
const button = 'rounded-lg border border-white/20 px-4 py-2 text-sm font-medium disabled:opacity-40';
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
  const [fixBusy, setFixBusy] = useState(false);
  const fixLock = useRef(false);
  const correctionDialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (correction) { correctionDialog.current?.focus(); correctionDialog.current?.scrollIntoView?.({ block: "center" }); } }, [correction?.findingId]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ReviewKind>('all');
  const [showDismissed, setShowDismissed] = useState(false);
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
        setQuote(null); setSelected(data.job?.id ?? id);
        if (data.job) setJobs(old => [data.job, ...old.filter(j => j.id !== data.job.id)]);
        setNotice('Review running in the background. You can leave this tab and return to Review manuscript for the saved report.');
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
      if (mounted.current) { setFixUndo(data.undo); setCorrection(null); setNotice(undo ? 'Correction undone and saved.' : `Correction applied and saved.${data.diagnostic?.costUsd != null ? ` Estimated model cost ${money(data.diagnostic.costUsd)}.` : ''}`); }
    } catch (e) { if (mounted.current) setError(`${e instanceof Error ? e.message : 'The correction could not be applied.'} No automatic retry was sent.`); }
    finally { fixLock.current = false; if (mounted.current) setFixBusy(false); }
  }
  return <section className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-32 text-neutral-200 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <header><h2 className="text-2xl font-semibold text-white">Review manuscript</h2><p className="mt-2 text-sm text-neutral-400">Terra reviews your saved chapters with the Story Bible. Findings are proposals for you to judge. Reviewing never changes your manuscript.</p></header>
      <div className="space-y-3 rounded-xl border border-white/10 p-4">
        <p>{story.chapters.length} saved chapters. Unsaved drafts are excluded.</p>
        <p className="text-sm text-neutral-400">One screening run checks continuity, repetition, dialogue and prose across the supplied book. It cannot guarantee that every problem will be found. Numerical word targets are not assumed for saved chapters.</p>
        <button className={`${button} border-pink-400/50 text-pink-200`} disabled={loading || busy || submitting || !!active || !sourceKey || !story.chapters.length} onClick={() => void prepare()}>{submitting ? 'Preparing…' : 'Prepare review and show cost'}</button>
        {busy && <p className="text-sm text-neutral-400">Wait for the current writing operation to finish before preparing a review.</p>}
        {quote && <div className="space-y-3 rounded-lg bg-white/5 p-4 text-sm">
          <p>Review {quote.chapterCount} chapters ({quote.wordCount.toLocaleString()} words) using Terra 6.1.</p>
          <p>Indicative model cost: <strong>{money(quote.estimatedUsd)}</strong>. Conservative model-charge ceiling: <strong>{money(quote.maximumUsd)}</strong>. The ceiling assumes a much higher token count and long-context rates. These are USD model charges, excluding currency conversion or tax.</p>
          <p>Your saved manuscript and Bible will be sent to the existing OpenAI service for this review. No automatic model retries or rewrites.</p>
          <div className="flex flex-wrap gap-3"><button className={`${button} bg-pink-500/15`} disabled={submitting || busy || quote.sourceKey !== sourceKey || !!active} onClick={() => void start()}>Approve cost and start review</button><button className={button} disabled={submitting} onClick={() => setQuote(null)}>Cancel</button></div>
        </div>}
      </div>
      {notice && <p role="status" className="rounded-xl border border-pink-400/30 p-4 text-sm text-pink-200">{notice}</p>}
      {fixUndo && <div className="rounded-xl border border-white/15 p-4"><button className={button} disabled={fixBusy || busy || !sourceKey} onClick={() => void applyCorrection(true)}>Undo last correction</button><p className="mt-2 text-xs text-neutral-400">Undo is available here until you leave this screen. It will refuse to overwrite newer edits.</p></div>}
      {correction && (() => { const selectedTarget = correction.options.find(o => o.target.id === correction.targetId)!; return <div ref={correctionDialog} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="review-fix-title" className="space-y-3 rounded-xl border border-pink-400/50 bg-neutral-900 p-5">
        <h3 id="review-fix-title" className="text-lg font-semibold">Confirm correction</h3>
        <p className="text-sm">Terra will apply the finding’s suggested correction directly to the selected text. The rest of the manuscript stays as it is.</p>
        <label className="block text-sm">Text to fix<select className="mt-1 w-full rounded border border-white/15 bg-neutral-950 p-2" value={correction.targetId} disabled={fixBusy} onChange={e => setCorrection({ ...correction, targetId: e.target.value })}>{correction.options.map(o => <option key={o.target.id} value={o.target.id}>{o.target.label}</option>)}</select></label>
        <details><summary className="cursor-pointer text-sm">Original text to be replaced</summary><p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-sm">{selectedTarget.target.original}</p></details>
        <label className="block text-sm">{selectedTarget.target.kind === 'bible' ? 'Which fact should be kept? Required for a Bible change.' : 'Optional author decision, if the finding needs one.'}<textarea className="mt-1 w-full rounded border border-white/15 bg-neutral-950 p-2" rows={2} maxLength={2000} value={correction.decision} disabled={fixBusy} onChange={e => setCorrection({ ...correction, decision: e.target.value })} /></label>
        <p className="text-sm">One Terra correction call. Indicative cost {money(selectedTarget.quote.estimatedUsd)}; conservative model-charge allowance {money(selectedTarget.quote.maximumUsd)} at configured rates, excluding tax/conversion. Undo does not use a model.</p>
        {correction.sourceKey !== sourceKey && <p className="text-sm text-amber-200">The story changed after this correction was prepared. Cancel and prepare it again.</p>}
        <div className="flex flex-wrap gap-3"><button className={`${button} bg-pink-500/20`} disabled={fixBusy || busy || correction.sourceKey !== sourceKey || (selectedTarget.target.kind === 'bible' && !correction.decision.trim())} onClick={() => void applyCorrection(false)}>{fixBusy ? 'Applying…' : 'Confirm cost and apply fix'}</button><button className={button} disabled={fixBusy} onClick={() => setCorrection(null)}>Cancel correction</button></div>
      </div>; })()}
      {error && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm text-red-200">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Saved reviews<select className="w-full rounded-lg border border-white/15 bg-neutral-900 p-3" value={job?.id ?? ''} onChange={e => setSelected(e.target.value)}>{!jobs.length && <option value="">{loading ? 'Loading…' : 'No reviews yet'}</option>}{jobs.map(j => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status}</option>)}</select></label>
        <button className={button} onClick={() => void refresh().then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'Refresh failed.'))}>Refresh saved reviews</button>
      </div>
      {job && <div className="space-y-3 rounded-xl border border-white/10 p-4">
        {job.status === 'generating' && <p role="status" className="text-pink-200">Review running in the background. You can leave the tab or app.</p>}
        {job.status === 'failed' && <p className="text-red-200">{job.error_message} A charge may have occurred even without a complete report. Starting another review is a new paid request.</p>}
        {stale && <p className="text-amber-200">This report refers to an earlier manuscript or Story Bible version. Quotations refer to that saved version. Unchanged passages can still be fixed individually; changed targets will be blocked.</p>}
        {job.diagnostic && <p className="text-sm text-neutral-400">Terra 6.1 · {(job.diagnostic.durationMs / 1000).toFixed(1)} seconds · {job.diagnostic.inputTokens.toLocaleString()} input tokens · {job.diagnostic.outputTokens.toLocaleString()} output tokens · {job.diagnostic.costUsd === null ? 'Cost unavailable' : `Estimated model cost ${money(job.diagnostic.costUsd)}`}</p>}
      </div>}
      {report && <>
        <div className="space-y-3 rounded-xl border border-white/10 p-4">
          <h3 className="font-semibold">{report.findings.length} findings from {report.suppliedChapterCount} supplied chapters</h3>
          {report.findings.length === 0 && <p>No changes were proposed. This does not establish that the manuscript is flawless.</p>}
          {report.unverifiedFindings > 0 && <p className="text-amber-200">{report.unverifiedFindings} findings contain unverified quotations or locations. Check them before using the suggestions.</p>}
          <details><summary className="cursor-pointer text-sm">Measured chapter lengths</summary><ul className="mt-3 space-y-1 text-sm text-neutral-400">{report.measuredLengths.map(c => <li key={c.chapterId}>Chapter {c.number}: {c.title} · {c.words.toLocaleString()} words · no target supplied</li>)}</ul></details>
          {!!report.strengths.length && <details><summary className="cursor-pointer text-sm">Strengths</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{report.strengths.map((s,i) => <li key={i}>{s}</li>)}</ul></details>}
          <details><summary className="cursor-pointer text-sm">Scope and limitations</summary><p className="mt-3 text-sm text-neutral-400">All saved chapters were supplied together. This is not a verified line-by-line audit. Exact quotation checks establish wording and location, not that an interpretation is correct. Other books in a series are not included.</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-400">{report.limitations.map((s,i) => <li key={i}>{s}</li>)}</ul></details>
        </div>
        <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Findings<select className="ml-2 rounded-lg border border-white/15 bg-neutral-900 p-2" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">All types</option>{Object.entries(kindLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} />Show dismissed</label></div>
        {visible.map(f => <article key={f.id} className="space-y-3 rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-white/10 px-2 py-1">{kindLabels[f.kind]}</span><span className="rounded bg-white/10 px-2 py-1">{f.severity}</span>{job.dismissed_ids.includes(f.id) && <span className="rounded bg-white/10 px-2 py-1">Dismissed</span>}</div>
          <h3 className="font-semibold text-white">{f.category}</h3><p className="whitespace-pre-wrap text-sm">{f.explanation}</p>
          {!f.evidenceChecked && <p className="text-sm text-amber-200">Evidence needs verification. This finding is not treated as an established error.</p>}
          {f.evidence.map((e,i) => <div key={i} className="border-l-2 border-pink-400/40 pl-3"><p className="mb-1 text-xs text-neutral-400">{e.chapterId ? `Chapter ${e.chapterNumber}: ${e.chapterTitle}` : e.sourceId === 'bible' ? 'Story Bible' : e.sourceId} · {e.paragraphId} · {e.verified ? 'Exact quotation found' : 'Quotation/location not verified'}</p><blockquote className="whitespace-pre-wrap break-words text-sm italic">{e.quote}</blockquote></div>)}
          <p className="whitespace-pre-wrap text-sm"><strong>Suggested direction:</strong> {f.correctionDirection}</p>
          <div className="flex flex-wrap gap-3"><button className={button} disabled={decisionBusy} onClick={() => void dismiss(f.id, !job.dismissed_ids.includes(f.id))}>{job.dismissed_ids.includes(f.id) ? 'Restore finding' : 'Dismiss finding'}</button><button className={button} disabled={!onApplyCorrection || !f.evidenceChecked || !sourceKey || busy || fixBusy} onClick={() => void prepareCorrection(f.id)}>Apply fix</button></div>
        </article>)}
      </>}
    </div>
  </section>;
}
