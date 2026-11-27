import { memorySourceHash } from './narrative-memory';

export const EDITORIAL_VERSION = 1;
export const EDITORIAL_MODEL = 'gpt-5.4-mini-2026-03-17';
export type ProseAuthor = 'astra' | 'aion';
export type WriterRegion = { start: number; end: number; writer: ProseAuthor };
export type EditorialEdit = { id: string; start: number; original: string; replacement: string; writer: ProseAuthor };
export type EditorialReceipt = { version: number; originalHash: string; checkedHash: string; contextHash: string; status: 'passed'; edits: EditorialEdit[]; reservedUsd: number };
export type ProseParagraph = { id: string; start: number; end: number; text: string };
export type ProseEvidence = { id: string; text: string };
export type ProseSignal = { id: string; category: string; evidenceIds: string[]; reason: string };
export type EditorialFinding = { id: string; category: string; paragraphIds: string[]; evidence: { sourceId: string; quote: string }[]; reason: string; direction: string };
export type EditorialReport = { findings: EditorialFinding[]; signalAssessments: { id: string; disposition: 'repair' | 'intentional' | 'not_problem'; reason: string }[]; preservation: { id: string; preserved: boolean; reason: string }[]; overflow: boolean };
export type EditorialTarget = { id: string; start: number; end: number; original: string; writer: ProseAuthor; findings: EditorialFinding[] };

export function proseParagraphs(content: string): ProseParagraph[] {
  return [...content.matchAll(/\S[^\n]*(?:\n(?!\s*\n)[^\n]*)*/g)].map((m, i) => ({ id: `p${i + 1}`, start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}
export function editorialPassed(receipt: EditorialReceipt | undefined, content: string, contextHash?: string): boolean {
  return receipt?.version === EDITORIAL_VERSION && receipt.status === 'passed' && receipt.checkedHash === memorySourceHash(content) && (contextHash === undefined || receipt.contextHash === contextHash);
}
export function restoreEditorialOriginal(content: string, receipt: EditorialReceipt): string {
  if (!editorialPassed(receipt,content)) throw Error('The chapter changed after automatic editing. Recovery would overwrite newer edits.');
  let delta = 0;
  const mapped = receipt.edits.slice().sort((a,b) => a.start - b.start).map(e => {
    const start = e.start + delta; delta += e.replacement.length - e.original.length;
    return { ...e, start };
  });
  let original = content;
  for (const e of mapped.reverse()) {
    if (original.slice(e.start,e.start + e.replacement.length) !== e.replacement) throw Error('The saved correction no longer matches this chapter.');
    original = original.slice(0,e.start) + e.original + original.slice(e.start + e.replacement.length);
  }
  if (memorySourceHash(original) !== receipt.originalHash) throw Error('The saved original could not be verified.');
  return original;
}

/** Keep provenance from actual returned prose, not guesses about its vocabulary. */
export function updateWriterRegions(before: string, after: string, regions: WriterRegion[] = [], writer: ProseAuthor): WriterRegion[] {
  let left = 0, a = before.length, b = after.length;
  while (left < Math.min(a, b) && before[left] === after[left]) left++;
  while (a > left && b > left && before[a - 1] === after[b - 1]) { a--; b--; }
  if (left === a && left === b) return regions;
  const old = regions.length ? regions : before ? [{ start: 0, end: before.length, writer: 'astra' as const }] : [];
  const shift = b - a;
  const result: WriterRegion[] = [];
  for (const r of old) {
    if (r.start < left) result.push({ ...r, end: Math.min(r.end, left) });
    if (r.end > a) result.push({ ...r, start: Math.max(r.start, a) + shift, end: r.end + shift });
  }
  if (b > left) result.push({ start: left, end: b, writer });
  return result.filter(r => r.end > r.start).sort((x, y) => x.start - y.start);
}

const habits: Array<[string, RegExp]> = [
  ['neck touch', /\b(?:nape|behind (?:my|his|your|the) neck|back of (?:my|his|your|the) neck)\b/i],
  ['jaw reaction', /\bjaw\b[^.!?\n]{0,35}\b(?:tight|clench|lock|tick)|\b(?:tight|clench|lock)\w*[^.!?\n]{0,25}\bjaw\b/i],
  ['thumb stroke', /\bthumb\w*\b[^.!?\n]{0,50}\b(?:brush|rub|stroke|sweep|circl)\w*|\b(?:brush|rub|stroke|sweep)\w*[^.!?\n]{0,30}\bthumb\b/i],
  ['withheld joke', /\b(?:no joke|not joking|nothing (?:funny|clever)|don.t (?:make|have) (?:a|the) joke)\b/i],
  ['evasion and concession', /\b(?:not what I asked|no,? it (?:isn.t|is not)|that.s not (?:an answer|the question))\b/i],
  ['routine cleanup', /\b(?:warm|wet|damp)\b[^.!?\n]{0,25}\b(?:cloth|washcloth)|\b(?:covers|blanket)\b[^.!?\n]{0,35}\b(?:both of us|over us)|\bhouse\b[^.!?\n]{0,25}\b(?:ticks|settles)\b/i],
];
const waking = /\b(?:I wake|I.m awake|I open my eyes|I roll (?:over|out of bed)|alarm (?:rings|buzzes)|wakes me)\b/i;
const calendar = /^(?:(?:It.s |By |On )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|December|November|January|February|March|April|May|June|July|August|September|October)\b|(?:The )?(?:next|following) (?:morning|day)\b|(?:Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+) days? later\b)/i;
const transition = /^(?:After(?:ward|wards)?\b|Later\b)/i;
const intimacy = /\b(?:cock|condom|lube|orgasm|climax|naked|undress|sex|kiss|bed)\b/i;

/** Actual book excerpts, including every earlier opening/ending within a bounded prompt. */
export function editorialEvidence(content: string, chapters: Array<{ number: number; content: string }>) {
  const paragraphs = proseParagraphs(content), evidence: ProseEvidence[] = [];
  const prior = chapters.slice().sort((a, b) => b.number - a.number);
  // Keep complete, identified excerpts. Never cut JSON/text and pretend it is a complete manuscript review.
  const add = (id: string, text: string) => { if (text.trim()) evidence.push({ id, text }); };
  for (const c of prior) {
    const ps = proseParagraphs(c.content);
    add(`ch${c.number}:opening`, ps.slice(0, 2).map(p => p.text).join('\n\n').slice(0, 850));
    add(`ch${c.number}:ending`, ps.slice(-2).map(p => p.text).join('\n\n').slice(-850));
    for (const [label, pattern] of habits) {
      const matches = ps.filter(p => pattern.test(p.text));
      for (const p of matches.slice(-2)) add(`ch${c.number}:${label}:${p.id}`, p.text.slice(0, 900));
    }
    const aftermaths = ps.filter((p,i) => transition.test(p.text) && ps.slice(Math.max(0,i - 5),i).some(q => intimacy.test(q.text)));
    for (const p of aftermaths.slice(-2)) add(`ch${c.number}:aftermath:${p.id}`, p.text.slice(0, 900));
  }
  const signals: ProseSignal[] = [];
  const signal = (category: string, ids: string[], reason: string) => signals.push({ id: `s${signals.length + 1}`, category, evidenceIds: ids, reason });
  const opening = paragraphs.slice(0, 2).map(p => p.text).join('\n\n');
  for (const [label, pattern] of [['waking opening', waking], ['calendar opening', calendar]] as const) {
    const similar = evidence.filter(e => e.id.endsWith(':opening') && pattern.test(e.text));
    if (pattern.test(opening) && similar.length >= 2) signal(label, [paragraphs[0].id, ...similar.slice(0, 3).map(e => e.id)], 'Possible repeated entry structure. Check author timing and purpose; orientation or waking is not automatically wrong.');
  }
  for (const p of paragraphs) {
    const chained = p.text.match(/,\s+and\s+(?:I|he|his|my|we|the|it|a)\b/gi) ?? [];
    if (p.text.split(/(?<=[.!?])\s+/).some(s => (s.match(/,\s+and\s+(?:I|he|his|my|we|the|it|a)\b/gi) ?? []).length >= 2) || chained.length >= 4) signal('clause chain', [p.id], 'Possible succession of independent movements/thoughts. Inspect rhythm, not the number of ordinary and conjunctions.');
    if (transition.test(p.text) && paragraphs.slice(Math.max(0, paragraphs.indexOf(p) - 5), paragraphs.indexOf(p)).some(q => intimacy.test(q.text))) {
      const earlier = evidence.filter(e => /aftermath|ending/.test(e.id) && transition.test(e.text));
      if (earlier.length >= 2) signal('aftermath transition', [p.id, ...earlier.slice(0, 3).map(e => e.id)], 'Compare the aftermath construction and emotional function, not only its first word.');
    }
  }
  // Retrieve recurring wording from the body of earlier chapters as well as
  // openings/endings. The reviewer decides whether the recurrence is purposeful.
  const ordinary = new Set('i he his him my me the a an and but or to of in on at for with is it that this as was were be we you your not so says said have has had do does did'.split(' '));
  const windows = (value: string) => {
    const words = value.toLowerCase().replace(/[‘’]/g,"'").match(/[a-z']+/g) ?? [];
    return new Set(words.slice(0,-5).map((_,i) => words.slice(i,i + 6)).filter(ws => ws.filter(w => !ordinary.has(w)).length >= 3).map(ws => ws.join(' ')));
  };
  const currentWindows = new Map<string,string>();
  for (const p of paragraphs) for (const phrase of windows(p.text)) if (!currentWindows.has(phrase)) currentWindows.set(phrase,p.id);
  const matches: Array<{ current: string; id: string; text: string }> = [];
  for (const c of prior) for (const p of proseParagraphs(c.content)) {
    const phrase = [...windows(p.text)].find(w => currentWindows.has(w));
    if (phrase) {
      const at = p.text.toLowerCase().replace(/[‘’]/g,"'").match(new RegExp(phrase.split(' ').join('\\s+')))?.index ?? 0;
      matches.push({ current: currentWindows.get(phrase)!, id: `ch${c.number}:wording:${p.id}`, text: p.text.slice(Math.max(0,at - 250),at + 950) });
    }
  }
  const seenMatches = new Set<string>();
  for (const m of matches) {
    if (seenMatches.has(m.current) || seenMatches.size >= 6) continue;
    seenMatches.add(m.current); add(m.id,m.text);
    signal('recurring wording',[m.current,m.id],'Matching substantial wording in an earlier chapter body. Check whether this is an intentional callback or accidental reuse.');
  }
  for (const [label, pattern] of habits) {
    const current = paragraphs.filter(p => pattern.test(p.text));
    const earlier = evidence.filter(e => e.id.includes(`:${label}:`));
    if (current.length && current.length + earlier.length >= 3) signal(label, [...current.slice(0, 3).map(p => p.id), ...earlier.slice(0, 3).map(e => e.id)], 'Possible repeated small action or dialogue mechanism. Keep purposeful touch, natural responses and intentional motifs.');
  }
  const duplicate = new Map<string, string>();
  for (const p of paragraphs) {
    const key = p.text.toLowerCase().replace(/\s+/g, ' ');
    if (key.length < 110) continue;
    if (duplicate.has(key)) signal('duplicate paragraph', [duplicate.get(key)!, p.id], 'Exact substantial repeated paragraph. Determine which occurrence is accidental.');
    else duplicate.set(key, p.id);
  }
  // Prioritise the evidence explicitly referenced by signals, then recent book samples.
  const required = new Set(signals.flatMap(s => s.evidenceIds));
  const ordered = [...evidence.filter(e => required.has(e.id)), ...evidence.filter(e => !required.has(e.id))];
  let used = 0;
  const selected = ordered.filter(e => { if (used + e.text.length > 26000) return false; used += e.text.length; return true; });
  const ids = new Set([...paragraphs.map(p => p.id), ...selected.map(e => e.id)]);
  return { paragraphs, evidence: selected, signals: signals.map(s => ({ ...s, evidenceIds: s.evidenceIds.filter(id => ids.has(id)) })), priorChapterCount: prior.length, sampledChapterCount: new Set(selected.map(e => e.id.split(':')[0])).size };
}

export function validateEditorialReport(raw: unknown, material: ReturnType<typeof editorialEvidence>, changes: EditorialEdit[] = []): EditorialReport {
  const r = raw as EditorialReport;
  if (!r || !Array.isArray(r.findings) || !Array.isArray(r.signalAssessments) || !Array.isArray(r.preservation) || typeof r.overflow !== 'boolean' || r.findings.length > 8) throw Error('The editorial check returned an invalid report.');
  const sources = new Map([...material.paragraphs.map(p => [p.id, p.text] as const), ...material.evidence.map(e => [e.id, e.text] as const)]);
  const found = new Set<string>(), occupied = new Set<string>();
  const categories = ['opening', 'aftermath', 'sentence_pattern', 'gesture', 'dialogue_pattern', 'repeated_emotional_work', 'duplicate'];
  for (const f of r.findings) {
    if (!f || typeof f.id !== 'string' || found.has(f.id) || !categories.includes(f.category) || !Array.isArray(f.paragraphIds) || !f.paragraphIds.length || f.paragraphIds.length > 3 || !Array.isArray(f.evidence) || !f.evidence.length || !f.reason?.trim() || !f.direction?.trim()) throw Error('The editorial report contains an invalid finding.');
    found.add(f.id);
    const indexes = f.paragraphIds.map(id => material.paragraphs.findIndex(p => p.id === id));
    if (indexes.some((n, i) => n < 0 || occupied.has(f.paragraphIds[i]) || i > 0 && n !== indexes[i - 1] + 1)) throw Error('Editorial passages overlap or do not match this draft.');
    f.paragraphIds.forEach(id => occupied.add(id));
    if (f.evidence.some(e => typeof e?.quote !== 'string' || e.quote.length < 8 || !sources.get(e.sourceId)?.includes(e.quote))) throw Error('The editorial finding has no matching manuscript evidence.');
    if (!f.evidence.some(e => f.paragraphIds.includes(e.sourceId))) throw Error('The editorial finding does not quote the affected passage.');
    if (['opening','aftermath','gesture','dialogue_pattern','repeated_emotional_work'].includes(f.category) && new Set(f.evidence.map(e => `${e.sourceId}:${e.quote}`)).size < 2) throw Error('A recurring pattern needs more than one supporting example.');
  }
  const assessments = new Map(r.signalAssessments.map(a => [a?.id, a]));
  if (assessments.size !== r.signalAssessments.length || assessments.size !== material.signals.length || material.signals.some(s => { const a = assessments.get(s.id); return !a || !['repair','intentional','not_problem'].includes(a.disposition) || !a.reason?.trim() || a.disposition === 'repair' && !r.findings.some(f => f.evidence.some(e => s.evidenceIds.includes(e.sourceId))); })) throw Error('The editorial check did not account for every repetition signal.');
  if (r.preservation.length !== changes.length || new Set(r.preservation.map(p => p?.id)).size !== changes.length || changes.some(c => !r.preservation.some(p => p?.id === c.id && typeof p.preserved === 'boolean' && p.reason?.trim()))) throw Error('The editorial recheck did not verify every changed passage.');
  return r;
}

export function editorialTargets(content: string, paragraphs: ProseParagraph[], report: EditorialReport, regions: WriterRegion[] = []): EditorialTarget[] {
  if (report.overflow) throw Error('The editorial check found more problems than the bounded automatic repair can handle.');
  return report.findings.map(f => {
    const first = paragraphs.find(p => p.id === f.paragraphIds[0])!, last = paragraphs.find(p => p.id === f.paragraphIds.at(-1))!;
    // Legacy drafts lack provenance. Route intimate prose to Aion rather than the general editor.
    const sourceRegions = regions.filter(r => r.end > first.start && r.start < last.end);
    const original = content.slice(first.start, last.end);
    const writer = sourceRegions.some(r => r.writer === 'aion') || !regions.length && /\b(?:cock|condom|lube|orgasm|rimming|penetrat\w*)\b/i.test(original) ? 'aion' : 'astra';
    return { id: f.id, start: first.start, end: last.end, original, writer, findings: [f] };
  });
}
export function applyEditorialEdits(content: string, targets: EditorialTarget[], replacements: Record<string, string>): { content: string; edits: EditorialEdit[] } {
  let result = content;
  const edits: EditorialEdit[] = [];
  let lastStart = content.length;
  for (const t of targets.slice().sort((a,b) => b.start - a.start)) {
    const replacement = replacements[t.id];
    if (t.end > lastStart || content.slice(t.start, t.end) !== t.original || typeof replacement !== 'string' || !replacement.trim() || /\[\[AION_SCENE_|<END_SECTION>|```|<\/?think\b/i.test(replacement)) throw Error('An editorial replacement did not match its saved source passage.');
    if (replacement === t.original) throw Error('The editorial writer returned the unchanged faulty passage.');
    // A length floor catches obvious summaries. The semantic recheck also compares every action, thought and detail.
    if (replacement.trim().split(/\s+/).length < t.original.trim().split(/\s+/).length * .8) throw Error('An editorial replacement removed too much of the original passage.');
    edits.push({ id: t.id, start: t.start, original: t.original, replacement: replacement.trim(), writer: t.writer });
    result = result.slice(0, t.start) + replacement.trim() + result.slice(t.end);
    lastStart = t.start;
  }
  return { content: result, edits: edits.sort((a,b) => a.start - b.start) };
}

export function maximumEditorialCost(prompt: string, outputTokens: number, writer: 'mini' | ProseAuthor): number {
  // UTF-8 bytes conservatively bound text tokens. Add framing/schema allowance; never assume free/cached traffic.
  const input = new TextEncoder().encode(prompt).length + 2400;
  const rates = writer === 'mini' ? [.75, 4.5] : writer === 'aion' ? [3, 6] : [8, 40];
  return Math.ceil((input * rates[0] + outputTokens * rates[1]) / 1e6 * 1e6) / 1e6;
}
export function reserveEditorialBudget(spent: number, next: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(next) || next <= 0 || spent + next > limit + 1e-9) throw Error('The automatic editing cost limit was reached. The draft is saved; no further paid request was started.');
  return Math.round((spent + next) * 1e6) / 1e6;
}
