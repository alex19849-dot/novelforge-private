"use client";

import { useMemo, useState } from "react";
import type { StoryWorkspace } from "../types";
import { MEMORY_KINDS, MEMORY_STATUSES, memoryBuildEstimate, memoryCoverage, projectNarrativeMemory, type MemoryCorrection, type MemoryKind, type MemoryStatus } from "../../../lib/narrative-memory";

type Props = { story: StoryWorkspace; busy: boolean; onCorrections: (corrections: MemoryCorrection[]) => void; onBuild: () => void };
const labels: Record<string, string> = { all: "All memory", character: "Characters", relationship: "Relationships", timeline: "Timeline", thread: "Open and closed threads", knowledge: "Character knowledge", fact: "Important facts", intimacy: "Intimacy progression", pattern: "Repetition patterns", divergence: "Bible divergences" };

export default function MemoryPanel({ story, busy, onCorrections, onBuild }: Props) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [kind, setKind] = useState("all");
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [editing, setEditing] = useState<MemoryCorrection | null>(null);
  const corrections = story.storyState.memoryCorrections ?? [];
  const records = useMemo(() => projectNarrativeMemory(story.storyState), [story.storyState]);
  const coverage = useMemo(() => memoryCoverage(story.storyState, story.chapters), [story.storyState, story.chapters]);
  const estimate = useMemo(() => memoryBuildEstimate(coverage.remaining), [coverage]);
  const visible = records.filter(r => {
    const isKind = kind === "all" || r.kind === kind || kind === "thread" && ["promise", "secret", "lie", "conversation", "conflict"].includes(r.kind);
    return isKind && `${r.subject} ${r.characters.join(" ")} ${r.claim} ${r.status} ${r.eventTime} ${r.learnedTime}`.toLowerCase().includes(search.toLowerCase());
  });
  const save = () => {
    if (!editing || !editing.replacement.trim() || busy) return;
    onCorrections([...corrections.filter(c => c.targetId !== editing.targetId), { ...editing, replacement: editing.replacement.trim(), updatedAt: new Date().toISOString() }]);
    setEditing(null);
  };
  const inputClass = "rounded-lg border border-white/15 bg-neutral-900 p-3 text-white disabled:opacity-40";
  const buttonClass = "rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40";
  return <section className="flex-1 overflow-y-auto px-4 py-6 pb-32 text-neutral-200 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <header><h2 className="text-2xl font-semibold text-white">Narrative memory</h2><p className="mt-2 text-sm text-neutral-400">Accepted manuscript history, separate from the Story Bible. Your corrections take precedence over extraction.</p></header>
      <div className="rounded-xl border border-white/10 p-4">
        <p>{coverage.complete} of {coverage.total} chapters have current, source-backed memory.</p>
        {(story.storyState.chapterLedger ?? []).some(e => e.narrativeMemory?.rejectedEvidence) && <p className="mt-2 text-sm text-neutral-400">{(story.storyState.chapterLedger ?? []).reduce((sum, e) => sum + (e.narrativeMemory?.rejectedEvidence ?? 0), 0)} proposed records were discarded because their evidence could not be verified. They are not treated as facts.</p>}
        {coverage.needsBuild && <p className="mt-2 text-sm text-neutral-400">Older continuity notes remain available to the writer. Build structured memory once for this manuscript; later accepted chapters update it automatically. Edited chapters require a rebuild.</p>}
        {coverage.needsBuild && !confirmBuild && <button className={`${buttonClass} mt-3`} disabled={busy || !story.chapters.length} onClick={() => setConfirmBuild(true)}>Build or refresh memory</button>}
        {confirmBuild && <div className="mt-3 space-y-3 text-sm">
          <p>This analyses {coverage.remaining.length} remaining accepted chapters in {estimate.batches} background batches using the existing continuity model. Estimated model cost: <strong>${estimate.lowUsd.toFixed(2)} to ${estimate.highUsd.toFixed(2)} USD</strong>. This uses NovelForge’s configured token rates and is an estimate, not a fixed quote or spending cap; actual usage is recorded in generation diagnostics. No chapter prose will be regenerated.</p>
          <div className="flex gap-2"><button className={buttonClass} disabled={busy} onClick={() => { setConfirmBuild(false); onBuild(); }}>Approve cost and start build</button><button className={buttonClass} onClick={() => setConfirmBuild(false)}>Cancel</button></div>
        </div>}
        {busy && <p className="mt-3 text-sm text-pink-300">An operation is running. Memory edits and new builds are paused until it finishes.</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search narrative memory" className={`${inputClass} min-w-48 flex-1`} placeholder="Search characters, facts, threads or phrases" value={search} onChange={e => { setSearch(e.target.value); setLimit(100); }} />
        <select aria-label="Memory category" className={inputClass} value={kind} onChange={e => setKind(e.target.value)}>{["all", ...MEMORY_KINDS].map(k => <option key={k} value={k}>{labels[k] ?? k.replaceAll("_", " ")}</option>)}</select>
        <button className={buttonClass} disabled={busy} onClick={() => setEditing({ targetId: `author:${crypto.randomUUID()}`, replacement: "", suppressed: false, kind: "fact", subject: "", characters: [], chapterNumber: Math.max(0, ...story.chapters.map(c => c.number)), status: "CURRENT", eventTime: "", learnedTime: "", learnedChapter: null, updatedAt: new Date().toISOString() })}>Add author correction</button>
      </div>
      {editing && <div className="space-y-3 rounded-xl border border-pink-400/40 p-4">
        <h3 className="font-semibold">Author correction</h3>
        <label className="block text-sm">Character or subject<input className={`${inputClass} mt-1 w-full`} value={editing.subject ?? ""} onChange={e => setEditing({ ...editing, subject: e.target.value, characters: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} /></label>
        <div className="flex gap-3"><select aria-label="Correction category" className={inputClass} value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as MemoryKind })}>{MEMORY_KINDS.map(k => <option key={k} value={k}>{labels[k] ?? k}</option>)}</select><select aria-label="Correction status" className={inputClass} value={editing.status ?? "CURRENT"} onChange={e => setEditing({ ...editing, status: e.target.value as MemoryStatus })}>{MEMORY_STATUSES.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">When it happened (leave blank if unknown)<input className={`${inputClass} mt-1 w-full`} value={editing.eventTime ?? ""} onChange={e => setEditing({ ...editing, eventTime: e.target.value })} /></label><label className="text-sm">When it was learned<input className={`${inputClass} mt-1 w-full`} value={editing.learnedTime ?? ""} onChange={e => setEditing({ ...editing, learnedTime: e.target.value })} /></label></div>
        {editing.kind === "knowledge" && <label className="block text-sm">Learned in chapter<input type="number" min={1} max={Math.max(1, ...story.chapters.map(c => c.number))} className={`${inputClass} ml-3 w-24`} value={editing.learnedChapter ?? ""} onChange={e => setEditing({ ...editing, learnedChapter: e.target.value ? Number(e.target.value) : null })} /></label>}
        <label className="block text-sm">Correct memory<textarea className={`${inputClass} mt-1 min-h-28 w-full`} value={editing.replacement} onChange={e => setEditing({ ...editing, replacement: e.target.value })} /></label>
        <div className="flex gap-2"><button className={buttonClass} disabled={busy || !editing.replacement.trim()} onClick={save}>Save correction</button><button className={buttonClass} onClick={() => setEditing(null)}>Cancel</button></div>
      </div>}
      <p className="text-sm text-neutral-400">{visible.length} matching records. Missing knowledge means unknown, not proof of ignorance.</p>
      {visible.slice(0, limit).map(record => <article key={record.id} className="space-y-2 rounded-xl border border-white/10 p-4">
        <p className="text-xs uppercase tracking-wide text-pink-300">{labels[record.kind] ?? record.kind} · {record.status.replaceAll("_", " ")}{record.manual ? " · Your correction" : ""}</p>
        <h3 className="font-semibold">{record.subject || record.characters.join(", ")}</h3><p className="whitespace-pre-wrap">{record.claim}</p>
        <p className="text-xs text-neutral-400">Introduced chapter {record.introducedChapter}. Last referenced chapter {record.lastReferencedChapter}.{record.resolvedChapter ? ` Resolved chapter ${record.resolvedChapter}.` : ""}{record.eventTime ? ` Event: ${record.eventTime}.` : ""}{record.learnedChapter ? ` Learned in chapter ${record.learnedChapter}.` : ""}{record.learnedTime ? ` Learned: ${record.learnedTime}.` : ""}</p>
        {record.evidence.start >= 0 && <details className="text-sm text-neutral-400"><summary className="cursor-pointer">Source: chapter {record.evidence.chapterNumber}, characters {record.evidence.start} to {record.evidence.end}</summary><blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-white/20 pl-3">{record.evidence.quote}</blockquote></details>}
        <div className="flex gap-2"><button className={buttonClass} disabled={busy} onClick={() => setEditing({ targetId: record.id, replacement: record.claim, suppressed: false, kind: record.kind, subject: record.subject, characters: record.characters, status: record.status, eventTime: record.eventTime, learnedTime: record.learnedTime, learnedChapter: record.learnedChapter, chapterNumber: record.evidence.chapterNumber, updatedAt: new Date().toISOString() })}>Correct</button><button className={buttonClass} disabled={busy} onClick={() => onCorrections([...corrections.filter(c => c.targetId !== record.id), { targetId: record.id, replacement: record.claim, suppressed: true, kind: record.kind, characters: record.characters, chapterNumber: record.evidence.chapterNumber, updatedAt: new Date().toISOString() }])}>Ignore this memory</button></div>
      </article>)}
      {visible.length > limit && <button className={buttonClass} onClick={() => setLimit(value => value + 100)}>Show more records</button>}
      {!records.length && <p className="text-neutral-400">No structured records yet. Existing summaries have not been relabelled as verified evidence.</p>}
      {corrections.length > 0 && <details className="rounded-xl border border-white/10 p-4"><summary className="cursor-pointer">Author corrections and ignored memories ({corrections.length})</summary>{corrections.map(c => <div key={c.targetId} className="mt-3 flex items-start justify-between gap-3 border-t border-white/10 pt-3"><p className="text-sm">{c.suppressed ? "Ignored: " : "Corrected: "}{c.replacement}</p><button className={buttonClass} disabled={busy} onClick={() => onCorrections(corrections.filter(item => item.targetId !== c.targetId))}>Remove override</button></div>)}</details>}
      <p className="text-xs text-neutral-500">Source quotes make memory inspectable; extraction can still misinterpret a passage. Correct an error here rather than maintaining a separate database.</p>
    </div>
  </section>;
}
