"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { reviewSourceKey, type ReviewQuote, type ReviewKind, type SavedReview } from '../../../lib/manuscript-review';
import type { StoryWorkspace } from '../types';

const kindLabels: Record<ReviewKind, string> = { clear_error: 'Clear error', possible_issue: 'Possible issue', editorial_opinion: 'Editorial opinion' };
const button = 'rounded-lg border border-white/20 px-4 py-2 text-sm font-medium disabled:opacity-40';
const money = (value: number) => `$${value.toFixed(value < 0.01 ? 4 : 2)} USD`;

export default function ManuscriptReviewPanel({ story, busy }: { story: StoryWorkspace; busy: boolean }) {
  const [jobs, setJobs] = useState<SavedReview[]>([]);
  const [selected, setSelected] = useState('');
  const [quote, setQuote] = useState<ReviewQuote | null>(null);
  const [sourceKey, setSourceKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
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

  const api = useCallback(async (method: string, body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sign in to NovelForge first.');
    const response = await fetch(`/api/story-chat/review${method === 'GET' ? `?storyId=${encodeURIComponent(story.id)}` : ''}`, { method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
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
      {error && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm text-red-200">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Saved reviews<select className="w-full rounded-lg border border-white/15 bg-neutral-900 p-3" value={job?.id ?? ''} onChange={e => setSelected(e.target.value)}>{!jobs.length && <option value="">{loading ? 'Loading…' : 'No reviews yet'}</option>}{jobs.map(j => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status}</option>)}</select></label>
        <button className={button} onClick={() => void refresh().then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'Refresh failed.'))}>Refresh saved reviews</button>
      </div>
      {job && <div className="space-y-3 rounded-xl border border-white/10 p-4">
        {job.status === 'generating' && <p role="status" className="text-pink-200">Review running in the background. You can leave the tab or app.</p>}
        {job.status === 'failed' && <p className="text-red-200">{job.error_message} A charge may have occurred even without a complete report. Starting another review is a new paid request.</p>}
        {stale && <p className="text-amber-200">This report refers to an earlier manuscript or Story Bible version. Quotations refer to that saved version.</p>}
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
          <div className="flex flex-wrap gap-3"><button className={button} disabled={decisionBusy} onClick={() => void dismiss(f.id, !job.dismissed_ids.includes(f.id))}>{job.dismissed_ids.includes(f.id) ? 'Restore finding' : 'Dismiss finding'}</button><button className={button} disabled={!f.evidenceChecked || stale || !sourceKey} onClick={() => { if (!navigator.clipboard) { setError('Clipboard access is unavailable. Select and copy the suggestion directly.'); return; } void navigator.clipboard.writeText(`${f.evidence.map(e => `${e.chapterId ? `Chapter ${e.chapterNumber}` : 'Story Bible'} (${e.paragraphId}):\n${e.quote}`).join('\n\n')}\n\nReview suggestion (judge against the current text): ${f.correctionDirection}`).then(() => setNotice('Rewrite guidance copied. Paste it into the existing passage guidance box when you want to make a change.')).catch(() => setError('Clipboard access failed. You can select and copy the suggestion directly.')); }}>Copy rewrite guidance</button></div>
        </article>)}
      </>}
    </div>
  </section>;
}
