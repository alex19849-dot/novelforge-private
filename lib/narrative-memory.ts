import type { ChapterLedgerEntry, StoryChapter, StoryState } from "../app/story-chat/types";

export const MEMORY_VERSION = 1;
export const MEMORY_KINDS = ["character", "fact", "relationship", "intimacy", "conflict", "location", "object", "injury", "clothing", "promise", "secret", "lie", "discovery", "decision", "conversation", "thread", "emotion", "revelation", "world_rule", "timeline", "knowledge", "pattern", "divergence"] as const;
export const MEMORY_STATUSES = ["CURRENT", "OPEN", "DEVELOPING", "RESOLVED", "ABANDONED", "KNOWS", "BELIEVES", "SUSPECTS", "MISUNDERSTANDS", "DOES_NOT_KNOW", "AVOID", "MOTIF"] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemoryStatus = typeof MEMORY_STATUSES[number];
export type MemoryEvidence = { chapterNumber: number; sourceHash: string; quote: string; start: number; end: number };
export type NarrativeMemoryItem = {
  id: string; key: string; kind: MemoryKind; subject: string; claim: string;
  characters: string[]; location: string; status: MemoryStatus; importance: "HIGH" | "NORMAL";
  eventTime: string; learnedTime: string; evidence: MemoryEvidence;
};
export type ChapterNarrativeMemory = { version: 1; sourceHash: string; records: NarrativeMemoryItem[]; rejectedEvidence: number };
export type MemoryCorrection = { targetId: string; replacement: string; suppressed: boolean; kind: MemoryKind; characters: string[]; chapterNumber: number; subject?: string; status?: MemoryStatus; eventTime?: string; learnedTime?: string; learnedChapter?: number | null; updatedAt: string };
export type ProjectedMemoryItem = NarrativeMemoryItem & { introducedChapter: number; lastReferencedChapter: number; resolvedChapter: number | null; learnedChapter: number | null; references: number; manual: boolean };
export type MemoryQuery = { pov?: string; guidance?: string; location?: string; beforeChapter?: number; maxCharacters?: number };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean) : [];
const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (value: string) => new Set(normalise(value).split(" ").filter(w => w.length > 2));

// Content identity, not a security hash. Runs identically in browser and server.
export function memorySourceHash(content: string): string {
  let hash = 14695981039346656037n;
  for (let i = 0; i < content.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(content.charCodeAt(i))) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}

export const narrativeRecordsSchema = {
  type: "array", maxItems: 48, items: {
    type: "object", additionalProperties: false,
    required: ["key", "kind", "subject", "claim", "characters", "location", "status", "importance", "eventTime", "learnedTime", "quote"],
    properties: {
      key: { type: "string" }, kind: { type: "string", enum: MEMORY_KINDS }, subject: { type: "string" }, claim: { type: "string" },
      characters: { type: "array", maxItems: 12, items: { type: "string" } }, location: { type: "string" },
      status: { type: "string", enum: MEMORY_STATUSES }, importance: { type: "string", enum: ["HIGH", "NORMAL"] },
      eventTime: { type: "string" }, learnedTime: { type: "string" }, quote: { type: "string" },
    },
  },
} as const;

export const NARRATIVE_EXTRACTION_INSTRUCTION = `
NARRATIVE MEMORY RECORDS
For each supplied chapter, add narrativeRecords: selective structured changes established by THAT chapter's completed prose, not by the Bible or earlier summaries. Never invent a fact to fill a category. Preserve the existing summary fields too. Usually 8 to 24 records suffice; 48 is an upper bound, not a target.
Each record requires an exact, distinctive quote copied verbatim from that chapter (12 to 600 characters, enough to support the assertion). Do not quote a plan, a different chapter or a paraphrase. Unsupported or ambiguous evidence is discarded. Keep claim concise and factual; distinguish objective fact from a character's belief, fear, fantasy, lie or suspicion. A character's thought does not establish an objective fact about somebody else.
Use stable semantic keys for the same proposition, relationship dimension, milestone, thread or pattern across chapters. Reuse keys from EXISTING MEMORY KEYS when updating them, including when closing a thread. Different milestones or propositions require different keys. A new key should describe its subject and topic, not its sentence wording or chapter number.
Track relevant character traits/descriptions, relationships, attraction, trust, hostility, jealousy, private/public status, intimate milestones, conflicts, locations, objects, injuries, necessary clothing, promises, secrets, lies, discoveries, decisions, unresolved conversations, plot threads, emotional changes, revelations, world rules, timeline and meaningful repetition. Do not store routine props or every gesture.
For knowledge records, subject is the individual character (or @reader for reader-only knowledge), claim is the proposition known/believed, and status is KNOWS, BELIEVES, SUSPECTS, MISUNDERSTANDS or DOES_NOT_KNOW. Use DOES_NOT_KNOW only when prose explicitly establishes ignorance. Missing evidence is UNKNOWN, not proof of ignorance. State eventTime when the event happened and learnedTime when this character learned it; leave either empty when unestablished. This chapter is the source of the learning event, not necessarily the original event. Never transfer private narration to another character. Record how the source passage establishes their knowledge.
Use thread/promise/secret/lie/conversation/conflict records with OPEN, DEVELOPING, RESOLVED or ABANDONED where applicable. Keep resolved issues resolved unless new evidence genuinely reopens them. Retain the same key so introduction and resolution remain traceable. Do not resolve a thread merely because it is absent from this chapter.
Use relationship records for concrete current changes, not numeric statistics. Intimacy records distinguish genuine firsts, established activities, initiative/role changes and consequences without forcing escalation. An earlier first is not new again. Pattern records use AVOID for accidental recurring choreography, reassurance, arguments, attraction observations, clothing palettes, sentence structures or environmental filler; use MOTIF for deliberate meaningful recurrence. Only create AVOID records with evidence of repetition, not one ordinary gesture. Mark approved manuscript/Bible conflicts as divergence with both claims explained; never overwrite the Bible.
Manual corrections are authoritative. Do not undo them or turn them into invented scenes. A quote proves the passage exists; your claim must also be supported by its meaning.
`;

export function groundNarrativeRecords(raw: unknown, chapter: Pick<StoryChapter, "number" | "content">): ChapterNarrativeMemory {
  const sourceHash = memorySourceHash(chapter.content);
  const records: NarrativeMemoryItem[] = [];
  let rejectedEvidence = 0;
  const seen = new Set<string>();
  for (const value of Array.isArray(raw) ? raw.slice(0, 48) : []) {
    if (!value || typeof value !== "object") { rejectedEvidence++; continue; }
    const r = value as Record<string, unknown>;
    const quote = text(r.quote), claim = text(r.claim), key = normalise(text(r.key)).replaceAll(" ", ":").slice(0, 160);
    const start = quote ? chapter.content.indexOf(quote) : -1;
    const kind = r.kind as MemoryKind, status = r.status as MemoryStatus;
    if (!key || !claim || quote.length < 12 || quote.length > 600 || start < 0 || chapter.content.indexOf(quote, start + 1) >= 0 || !MEMORY_KINDS.includes(kind) || !MEMORY_STATUSES.includes(status)) { rejectedEvidence++; continue; }
    if (kind === "knowledge" && (!text(r.subject) || !["KNOWS", "BELIEVES", "SUSPECTS", "MISUNDERSTANDS", "DOES_NOT_KNOW"].includes(status))) { rejectedEvidence++; continue; }
    const id = kind === "knowledge" ? `${kind}:${normalise(text(r.subject)).replaceAll(" ", ":")}:${key}` : `${kind}:${key}`;
    if (seen.has(id)) { rejectedEvidence++; continue; }
    seen.add(id);
    records.push({ id, key, kind, status, subject: text(r.subject).slice(0, 180), claim: claim.slice(0, 700), characters: strings(r.characters).slice(0, 12), location: text(r.location).slice(0, 180), importance: r.importance === "HIGH" ? "HIGH" : "NORMAL", eventTime: text(r.eventTime).slice(0, 220), learnedTime: text(r.learnedTime).slice(0, 220), evidence: { chapterNumber: chapter.number, sourceHash, quote, start, end: start + quote.length } });
  }
  return { version: MEMORY_VERSION, sourceHash, records, rejectedEvidence };
}

export function projectNarrativeMemory(state: Partial<StoryState>, beforeChapter = Infinity): ProjectedMemoryItem[] {
  const boundary = Math.min(beforeChapter, state.continuityDirtyFromChapter ?? Infinity);
  const byId = new Map<string, ProjectedMemoryItem>();
  for (const entry of [...(state.chapterLedger ?? [])].filter(e => e.chapterNumber < boundary).sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    if (entry.narrativeMemory?.version !== MEMORY_VERSION) continue;
    for (const record of entry.narrativeMemory.records ?? []) {
      if (!record?.id || !record.evidence || record.evidence.chapterNumber !== entry.chapterNumber) continue;
      const previous = byId.get(record.id);
      byId.set(record.id, { ...record, introducedChapter: previous?.introducedChapter ?? entry.chapterNumber, lastReferencedChapter: entry.chapterNumber, resolvedChapter: record.status === "RESOLVED" ? previous?.status === "RESOLVED" ? previous.resolvedChapter : entry.chapterNumber : null, learnedChapter: record.kind === "knowledge" && record.status !== "DOES_NOT_KNOW" ? previous?.status === record.status ? previous.learnedChapter ?? entry.chapterNumber : entry.chapterNumber : null, learnedTime: record.learnedTime || (record.kind === "knowledge" && previous?.status === record.status ? previous.learnedTime : "") || "", references: (previous?.references ?? 0) + 1, manual: false });
    }
  }
  for (const correction of state.memoryCorrections ?? []) {
    // Author corrections are separate from model snapshots and survive rebuilds.
    if (correction.chapterNumber >= beforeChapter) continue;
    const previous = byId.get(correction.targetId);
    if (correction.suppressed) { byId.delete(correction.targetId); continue; }
    byId.set(correction.targetId, { ...(previous ?? { id: correction.targetId, key: correction.targetId, kind: correction.kind, subject: correction.characters.join(", "), characters: correction.characters, location: "", status: "CURRENT" as const, importance: "HIGH" as const, eventTime: "", learnedTime: "", evidence: { chapterNumber: correction.chapterNumber, sourceHash: "author", quote: "Author correction", start: -1, end: -1 }, introducedChapter: correction.chapterNumber, lastReferencedChapter: correction.chapterNumber, resolvedChapter: null, learnedChapter: null, references: 0 }), claim: correction.replacement, kind: correction.kind, ...(correction.subject ? { subject: correction.subject } : {}), ...(correction.status ? { status: correction.status } : {}), ...(correction.eventTime !== undefined ? { eventTime: correction.eventTime } : {}), ...(correction.learnedTime !== undefined ? { learnedTime: correction.learnedTime } : {}), ...(correction.learnedChapter !== undefined ? { learnedChapter: correction.learnedChapter } : {}), manual: true });
  }
  return [...byId.values()];
}

export function memoryCoverage(state: Partial<StoryState>, chapters: StoryChapter[]) {
  const dirty = state.continuityDirtyFromChapter ?? Infinity;
  const ordered = [...chapters].sort((a, b) => a.number - b.number);
  let complete = 0;
  for (const chapter of ordered) {
    if (chapter.number >= dirty || !state.chapterLedger?.some(e => e.chapterNumber === chapter.number && e.narrativeMemory?.version === MEMORY_VERSION && e.narrativeMemory.sourceHash === memorySourceHash(chapter.content))) break;
    complete++;
  }
  return { complete, total: chapters.length, needsBuild: complete !== chapters.length, fromChapter: ordered[complete]?.number, remaining: ordered.slice(complete) };
}

function relevantScore(value: string, query: MemoryQuery, chapter = 0): number {
  const set = words(value), requested = words(`${query.guidance ?? ""} ${query.location ?? ""}`);
  let score = Math.min(3, chapter / 20);
  for (const word of requested) if (set.has(word)) score += 1;
  const pov = words(query.pov ?? "");
  for (const word of pov) if (set.has(word)) score += 5;
  return score;
}

export function retrieveNarrativeMemory(state: Partial<StoryState>, query: MemoryQuery = {}): { records: ProjectedMemoryItem[]; text: string } {
  const budget = Math.max(600, query.maxCharacters ?? 10000);
  const records = projectNarrativeMemory(state, query.beforeChapter);
  const ranked = records.map(r => ({ record: r, score: relevantScore(`${r.subject} ${r.characters.join(" ")} ${r.location} ${r.claim}`, query, r.lastReferencedChapter) + (r.manual ? 100 : 0) + (r.importance === "HIGH" ? 3 : 0) + (r.kind === "knowledge" && normalise(r.subject) === normalise(query.pov ?? "") ? 15 : 0) })).sort((a, b) => b.score - a.score || b.record.lastReferencedChapter - a.record.lastReferencedChapter);
  const picked: ProjectedMemoryItem[] = [];
  const counts = new Map<string, number>();
  const lines = ["RELEVANT STORY MEMORY", "Only accepted on-page evidence is history. Plans are not completed facts. Knowledge belongs only to its named subject; @reader is not POV knowledge. Absence of a knowledge record is unknown. Completed manuscript events/progression govern what has actually happened; planned future events in the Bible are not history. Keep serious fixed-canon divergences visible for author resolution. Author corrections take precedence. MOTIF is deliberate, not a ban. Keep closed threads closed unless new events change them."];
  for (const { record, score } of ranked) {
    const group = record.kind === "knowledge" ? "knowledge" : ["thread", "promise", "secret", "lie", "conversation", "conflict"].includes(record.kind) ? "threads" : record.kind;
    const limit = group === "knowledge" ? 10 : group === "threads" ? 8 : group === "pattern" ? 5 : 8;
    if ((counts.get(group) ?? 0) >= limit && !record.manual) continue;
    if (score < 2 && !record.manual) continue;
    const reference = record.manual ? "AUTHOR CORRECTION" : `Ch${record.evidence.chapterNumber}, chars ${record.evidence.start}-${record.evidence.end}`;
    const line = `${record.kind.toUpperCase()} ${record.id} [${record.status}; introduced Ch${record.introducedChapter}; last Ch${record.lastReferencedChapter}${record.resolvedChapter ? `; resolved Ch${record.resolvedChapter}` : ""}]: ${record.subject}: ${record.claim}${record.eventTime ? ` Event time: ${record.eventTime}.` : ""}${record.learnedChapter ? ` Learned in Ch${record.learnedChapter}.` : ""}${record.learnedTime ? ` Learned: ${record.learnedTime}.` : ""} (${reference})${record.manual ? "" : ` Evidence: ${record.evidence.quote.slice(0, 160)}`}`;
    if (lines.join("\n").length + line.length + 1 > budget) continue;
    picked.push(record); lines.push(line); counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  if (!picked.length) lines.push("No verified structured records matched. Use the selected legacy notes and recent prose cautiously; do not invent missing history.");
  return { records: picked, text: lines.join("\n").slice(0, budget) };
}

// One shared projection for every model-facing path. Raw chapter snapshots and
// unbounded cumulative lists must not be serialized into generation prompts.
export function narrativeContext(value: unknown, query: MemoryQuery = {}): Record<string, unknown> {
  let state = value && typeof value === "object" ? value as Partial<StoryState> : {};
  const boundary = Math.min(query.beforeChapter ?? Infinity, state.continuityDirtyFromChapter ?? Infinity);
  if ((state.chapterLedger ?? []).some(e => e.chapterNumber >= boundary)) {
    const earlier = (state.chapterLedger ?? []).filter(e => e.chapterNumber < boundary);
    const last = earlier.at(-1);
    state = { ...state, chapterLedger: earlier, importantFacts: earlier.flatMap(e => e.newFacts), characterStates: [], relationshipStates: last?.relationshipShift ? [last.relationshipShift] : [], unresolvedThreads: last?.unresolvedThreads ?? [], characterKnowledge: earlier.flatMap(e => e.characterKnowledgeChanges ?? []), repetitionWarnings: earlier.flatMap(e => e.repeatedBeats), timeline: last ? [`CURRENT CLOCK: ${last.endingTime}`] : [], latestChapterEnding: last?.endingExcerpt ?? "", currentScene: undefined };
  }
  const budget = Math.max(1200, query.maxCharacters ?? 18000);
  const structured = retrieveNarrativeMemory(state, { ...query, maxCharacters: Math.min(10000, Math.floor(budget * 0.6)) });
  const limit = (input: unknown, maximum = 8) => strings(input).map((claim, i) => ({ claim, score: relevantScore(claim, query, i) })).sort((a, b) => b.score - a.score).slice(0, maximum).map(v => v.claim.slice(0, 350));
  const covered = new Set((state.chapterLedger ?? []).filter(e => e.narrativeMemory?.version === MEMORY_VERSION).map(e => e.chapterNumber));
  const latest = (state.chapterLedger ?? []).filter(e => e.chapterNumber < (query.beforeChapter ?? Infinity) && e.chapterNumber < (state.continuityDirtyFromChapter ?? Infinity)).slice(-2);
  const fullyStructured = Boolean(state.chapterLedger?.length) && state.chapterLedger!.every(e => e.narrativeMemory?.version === MEMORY_VERSION) && state.continuityDirtyFromChapter === undefined;
  const result: Record<string, unknown> = {
    relevantStoryMemory: structured.text,
    legacyNotesAreUnverifiedSummaries: true,
    importantFacts: limit(state.importantFacts), characterStates: limit(state.characterStates, 5), relationshipStates: limit(state.relationshipStates, 5),
    unresolvedThreads: limit(state.unresolvedThreads, 8), characterKnowledge: limit(state.characterKnowledge, 8), repetitionWarnings: limit(state.repetitionWarnings, 6),
    timeline: [...limit((state.timeline ?? []).filter(t => !t.startsWith("CURRENT CLOCK:")), 3), ...(state.timeline ?? []).filter(t => t.startsWith("CURRENT CLOCK:")).slice(-1)],
    locations: limit(state.locations, 4), activePOV: query.pov || state.activePOV || "",
    currentScene: state.currentScene ?? null,
    chapterLedger: latest.map(e => ({ chapterNumber: e.chapterNumber, summary: e.summary, endingLocation: e.endingLocation, endingTime: e.endingTime, relationshipShift: e.relationshipShift, intimacyMilestone: e.intimacyMilestone, repeatedBeats: e.repeatedBeats.slice(0, 6), structuredMemoryAvailable: covered.has(e.chapterNumber) })),
    latestChapterEnding: text(state.latestChapterEnding).slice(-2200),
    voiceProfiles: (state.voiceProfiles ?? []).filter(p => !query.pov || normalise(p.characterName).includes(normalise(query.pov)) || normalise(query.pov).includes(normalise(p.characterName))).slice(0, 2),
  };
  const legacyKeys = ["importantFacts", "characterStates", "relationshipStates", "unresolvedThreads", "characterKnowledge", "repetitionWarnings", "locations"];
  if (fullyStructured) for (const key of legacyKeys) result[key] = [];
  for (const key of [...legacyKeys, "chapterLedger", "voiceProfiles"]) {
    const values = result[key] as unknown[];
    while (JSON.stringify(result).length > budget && values.length) values.pop();
  }
  if (JSON.stringify(result).length > budget) result.currentScene = null;
  while (JSON.stringify(result).length > budget && String(result.relevantStoryMemory).length > 100) result.relevantStoryMemory = String(result.relevantStoryMemory).slice(0, Math.floor(String(result.relevantStoryMemory).length * 0.8));
  return result;
}

export function memoryBuildEstimate(chapters: StoryChapter[]): { lowUsd: number; highUsd: number; batches: number } {
  const batches = Math.ceil(chapters.length / 3);
  const inputTokens = chapters.reduce((sum, chapter) => sum + Math.ceil(chapter.content.length / 3), 0) + batches * 18000;
  // Planning estimate, not a provider quote: cumulative legacy ledger and new
  // structured extraction output vary. Display uncertainty before starting.
  return { lowUsd: (inputTokens * 1.25 + chapters.length * 1200 * 7.5) / 1e6, highUsd: (inputTokens * 2 * 1.25 + batches * 32000 * 7.5) / 1e6, batches };
}
