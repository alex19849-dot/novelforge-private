import { memoryCoverage, memorySourceHash } from "../lib/narrative-memory";
import { protectAuthorChanges, assertAuthorChangesKept } from '../lib/author-prose-protection';
import { EDITORIAL_VERSION, editorialPassed, editorialTargets, updateWriterRegions, applyEditorialEdits, reserveEditorialBudget, reconcileEditorialCost, type EditorialTarget, type EditorialEdit } from '../lib/prose-editorial';
import { buildEditorialReview, buildEditorialRepair, parseEditorialRepairs, readEditorialReview, executeEditorialCall, editorialLimit, type EditorialContext } from '../lib/prose-editorial-server';
import { priorProseContext } from '../lib/prose-history';
import { jobAdmin } from '../lib/social-job-db';
import type { ChapterJobInput } from '../lib/chapter-job';
import type { StoryWorkspace, GenerationDiagnostic, StoryChapter, StoryChatResponse } from '../app/story-chat/types';
import { ApiRequestError, readApiJson, isLedgerResponse, isQualityResponse, isWriterResponse, getContractWordRange, getStoryStateBeforeChapter, applyGeneratedChapter, qualityReviewWarnings, EMPTY_STORY_STATE, type PendingChapterGeneration } from '../app/story-chat/generation';
import { POST as planChapter } from '../app/api/story-chat/route';
import { POST as writeChapter } from '../app/api/story-chat/write/route';
import { POST as reviewChapter } from '../app/api/story-chat/quality/route';
import { POST as ledgerChapter } from '../app/api/story-chat/ledger/route';

type Phase = 'prepare' | 'preledger' | 'plan' | 'write' | 'specialist' | 'editorial' | 'editorial_repair' | 'editorial_verify' | 'quality' | 'ledger' | 'ready';
type Checkpoint = {
  story: StoryWorkspace;
  pending?: PendingChapterGeneration;
  phase: Phase;
  diagnostics: GenerationDiagnostic[];
  ledgerBatches?: StoryChapter[][];
  ledgerIndex?: number;
  lastGeneratedSection?: string;
  editorialWork?: { sourceHash: string; contextHash: string; reservedUsd: number; targets: EditorialTarget[]; replacements: Record<string, string>; candidate?: string; edits?: EditorialEdit[] };
  error?: string;
};

function request(body: unknown): Request {
  return new Request('http://novelforge.internal/generation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function getJob(id: string) {
  const { data, error } = await jobAdmin().from('story_generation_jobs').select('*').eq('id', id).single();
  if (error || !data) throw new Error('The saved chapter job could not be loaded.');
  return data;
}
async function saveCheckpoint(id: string, state: Checkpoint) {
  const { data, error } = await jobAdmin().from('story_generation_jobs').update({ checkpoint: state, stage: state.phase, model_call_in_flight: false, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'generating').select('id').maybeSingle();
  if (error || !data) throw new Error('Chapter progress could not be saved. The model call will not be automatically repeated.');
}
function pendingReset(pending: PendingChapterGeneration): PendingChapterGeneration {
  return { ...pending, lastSection: undefined, qualityReview: undefined, qualityCheckedDraft: undefined, qualityOverrideReady: undefined, qualityTechnicalError: undefined };
}
function ledgerBatches(chapters: StoryChapter[], from?: number) {
  const selected = from === undefined ? chapters : chapters.filter(chapter => chapter.number >= from);
  return Array.from({ length: Math.ceil(selected.length / 3) }, (_, i) => selected.slice(i * 3, i * 3 + 3));
}

function editorialContext(state: Checkpoint, input: ChapterJobInput, content = state.pending!.draft): EditorialContext {
  const pending = state.pending!;
  const boundary = pending.generatedChapter.kind === 'prologue' ? 0 : pending.generatedChapter.replaceChapterNumber;
  return { content, chapters: state.story.chapters.filter(c => boundary === null || c.number < boundary), storyBible: state.story.storyBible,
    storyState: getStoryStateBeforeChapter(state.story.storyState, boundary), chapterBrief: pending.chapterBrief,
    pov: pending.generatedChapter.povCharacter, authorStyleContext: input.authorStyleContext ?? '',
    authorProtection: content === pending.draft ? pending.authorProtection : assertAuthorChangesKept(pending.draft,content,pending.authorProtection) };
}
function editorialContextHash(context: EditorialContext): string {
  const { lastGenerationDiagnostics: _diagnostics, workspaceMetadata: _metadata, authorStyleContext: _style, parkedChapterDrafts: _parked, chapterGuidanceDraft: _guidance, ...state } = context.storyState as StoryWorkspace['storyState'] & { workspaceMetadata?: unknown };
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([,x]) => x !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k,stable(x)])) : v;
  return memorySourceHash(JSON.stringify(stable({ chapters: context.chapters.map(c => [c.number, memorySourceHash(c.content)]), bible: context.storyBible, brief: context.chapterBrief, pov: context.pov, style: context.authorStyleContext, protection: context.authorProtection?.ranges.map(r => r.text), state })));
}
function acceptEditorial(state: Checkpoint, input: ChapterJobInput, contextHash: string) {
  const pending = state.pending!, work = state.editorialWork;
  const content = work?.candidate ?? pending.draft;
  let regions = pending.writerRegions ?? [];
  // Recompute provenance using only the precise bounded replacements.
  let intermediate = pending.draft;
  for (const edit of [...(work?.edits ?? [])].sort((a,b) => b.start - a.start)) {
    const next = intermediate.slice(0,edit.start) + edit.replacement + intermediate.slice(edit.start + edit.original.length);
    regions = updateWriterRegions(intermediate,next,regions,edit.writer); intermediate = next;
  }
  let lastSection = pending.lastSection;
  if (lastSection && content !== pending.draft) {
    const start = pending.draft.lastIndexOf(lastSection), end = start + lastSection.length;
    const edits = work?.edits ?? [];
    const crossing = edits.some(e => e.start < start && e.start + e.original.length > start || e.start < end && e.start + e.original.length > end);
    const shift = (offset: number) => edits.filter(e => e.start + e.original.length <= offset).reduce((n,e) => n + e.replacement.length - e.original.length, 0);
    lastSection = start < 0 || crossing ? undefined : content.slice(start + shift(start), end + shift(end));
  }
  state.pending = { ...pending, draft: content, lastSection,
    writerRegions: regions, writerRegionsSourceHash: memorySourceHash(content), diagnostics: state.diagnostics, savedAt: new Date().toISOString(),
    authorProtection: assertAuthorChangesKept(pending.draft,content,pending.authorProtection), editorialReviewRecovery: undefined,
    automaticEditorial: { version: EDITORIAL_VERSION, status: 'passed', originalHash: work?.sourceHash ?? memorySourceHash(content), checkedHash: memorySourceHash(content), contextHash,
      edits: work?.edits ?? [], reservedUsd: work?.reservedUsd ?? 0 } };
  delete state.editorialWork;
  state.phase = input.operation === 'complete' ? 'quality' : 'ready';
}

export async function advanceChapterJob(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (job.status !== 'generating') return true;
  const input = job.input as ChapterJobInput;
  const state: Checkpoint = job.checkpoint?.phase ? job.checkpoint : {
    story: input.story, pending: input.pending, phase: 'prepare', diagnostics: input.pending?.diagnostics ?? [],
  };
  // A deployment can resume a pre-editorial writer checkpoint from the old worker.
  if (state.phase === 'ready' && state.pending && !state.error && input.operation !== 'memory' && state.lastGeneratedSection && !editorialPassed(state.pending.automaticEditorial,state.pending.draft,editorialContextHash(editorialContext(state,input)))) state.phase = 'editorial';
  console.log('Chapter background stage', id, state.phase);
  if (!['prepare', 'ready'].includes(state.phase)) {
    const { data, error } = await jobAdmin().from('story_generation_jobs').update({ model_call_in_flight: true }).eq('id', id).eq('status', 'generating').eq('model_call_in_flight', false).select('id').maybeSingle();
    if (error || !data) throw new Error('The previous model call could not be confirmed after an interruption. Saved progress is kept; it was not automatically submitted again.');
  }
  try {
    if (state.phase === 'prepare') {
      if (input.operation === 'memory') {
        if (!input.memoryBuildApproved) throw new Error('Memory build approval is required.');
        const coverage = memoryCoverage(state.story.storyState, state.story.chapters);
        if (!coverage.needsBuild) { state.phase = 'ready'; return true; }
        state.ledgerBatches = ledgerBatches(state.story.chapters, coverage.fromChapter);
        state.ledgerIndex = 0;
        state.diagnostics = [];
        state.story = { ...state.story, storyState: { ...getStoryStateBeforeChapter(state.story.storyState, coverage.fromChapter!), memoryCorrections: input.story.storyState.memoryCorrections ?? [], chapterPlans: input.story.storyState.chapterPlans ?? [], voiceProfiles: input.story.storyState.voiceProfiles ?? [] } };
        state.phase = 'ledger';
      } else if (input.operation === 'generate') {
        const dirty = state.story.storyState.continuityDirtyFromChapter;
        const missing = !state.story.storyState.chapterLedger?.length;
        if (state.story.chapters.length && (missing || dirty !== undefined)) {
          state.ledgerBatches = ledgerBatches(state.story.chapters, missing ? undefined : dirty);
          state.ledgerIndex = 0;
          state.story = { ...state.story, storyState: missing ? { ...EMPTY_STORY_STATE, memoryCorrections: input.story.storyState.memoryCorrections ?? [] } : getStoryStateBeforeChapter(state.story.storyState, dirty!) };
          state.phase = 'preledger';
        } else state.phase = 'plan';
      } else {
        if (!state.pending) throw new Error('A saved chapter draft is required.');
        if (state.pending.writerRegionsSourceHash !== memorySourceHash(state.pending.draft)) state.pending = { ...state.pending, writerRegions: undefined };
        if (input.operation === 'complete') {
          state.phase = !state.pending.draft.trim() ? 'write' : state.pending.draft.includes('[[AION_SCENE_') ? 'specialist' : 'editorial';
        } else state.phase = state.pending.draft.includes('[[AION_SCENE_') ? 'specialist' : 'write';
      }
    } else if (state.phase === 'preledger' || state.phase === 'ledger') {
      const index = state.ledgerIndex ?? 0;
      const batch = state.ledgerBatches?.[index];
      if (batch?.length) {
        const data = await readApiJson(await ledgerChapter(request({ storyBible: state.story.storyBible, storyState: state.story.storyState, chapters: batch, chapter: batch.at(-1), rebuildMode: 'batch' })));
        if (!isLedgerResponse(data)) throw new Error('The continuity worker returned an invalid ledger.');
        state.story = { ...state.story, storyState: { ...data.storyState, memoryCorrections: input.story.storyState.memoryCorrections ?? [], chapterPlans: state.story.storyState.chapterPlans ?? [] } };
        state.diagnostics.push(...data.diagnostics);
        state.ledgerIndex = index + 1;
      }
      if (!state.ledgerBatches?.[state.ledgerIndex ?? 0]) {
        delete state.story.storyState.continuityDirtyFromChapter;
        if (state.phase === 'preledger') state.phase = 'plan';
        else {
          state.story = { ...state.story, storyState: { ...state.story.storyState, lastGenerationDiagnostics: state.diagnostics }, messages: [...state.story.messages, { id: Date.now(), role: 'assistant', content: input.operation === 'memory' ? 'Narrative memory built from the accepted chapters. Your manuscript and Story Bible are unchanged.' : 'Chapter completed and continuity updated.' }], updatedAt: new Date().toISOString() };
          if (input.operation !== 'memory') state.pending = undefined;
          state.phase = 'ready';
        }
      }
    } else if (state.phase === 'plan') {
      const data = await readApiJson(await planChapter(request({ stage: 'plan', story: state.story, chatOnly: false, authorStyleContext: input.authorStyleContext ?? '' }))) as StoryChatResponse;
      if (!data.story || !Array.isArray(data.story.chapters)) throw new Error('The planner returned an invalid workspace.');
      state.story = data.story;
      delete state.story.storyState.authorStyleContext;
      state.diagnostics.push(...(data.diagnostics ?? []));
      if (!data.generatedChapter) state.phase = 'ready';
      else {
        const range = getContractWordRange(data.chapterBrief);
        const next = Math.max(0, ...data.story.chapters.map(chapter => chapter.number)) + 1;
        const generated = data.generatedChapter;
        const replacement = generated.replaceChapterNumber === next && !data.story.chapters.some(chapter => chapter.number === next)
          ? { ...generated, replaceChapterNumber: null } : generated;
        state.pending = { storyId: state.story.id, generatedChapter: replacement, chapterBrief: data.chapterBrief, latestUserMessage: input.story.messages.at(-1)?.content ?? '', draft: '', minimumWordCount: range?.minimum ?? 2000, maximumWordCount: range?.maximum ?? 4000, diagnostics: state.diagnostics };
        state.phase = 'write';
      }
    } else if (state.phase === 'write' || state.phase === 'specialist') {
      let pending = state.pending!;
      const specialist = state.phase === 'specialist';
      const action = specialist ? 'start' : input.operation === 'generate' || !pending.draft.trim() ? 'start' : input.action ?? 'continue';
      if ((action === 'continue' || specialist) && input.sectionInstruction?.trim()) {
        // Keep the original guidance lossless while carrying the author's new
        // direction into this call and the later chapter review.
        const brief = JSON.parse(pending.chapterBrief);
        pending = { ...pending, chapterBrief: JSON.stringify({ ...brief, continuationGuidance: input.sectionInstruction.trim() }) };
        state.pending = pending;
      }
      const replacement = pending.generatedChapter.kind === 'prologue' ? 0 : pending.generatedChapter.replaceChapterNumber;
      const data = await readApiJson(await writeChapter(request({
        ...(specialist ? { phase: 'fill_specialist' } : {}), action, authorStyleContext: input.authorStyleContext ?? '',
        storyBible: state.story.storyBible, storyState: getStoryStateBeforeChapter(state.story.storyState, replacement),
        recentChapters: (replacement === null ? state.story.chapters : state.story.chapters.filter(chapter => chapter.number < replacement)).slice(-2),
        priorWritingContext: priorProseContext(state.story.chapters, state.story.storyState, { beforeChapter: replacement ?? undefined, pov: pending.generatedChapter.povCharacter }),
        chapterBrief: pending.chapterBrief, chapterTitle: pending.generatedChapter.title, povCharacter: pending.generatedChapter.povCharacter,
        chapterDraft: pending.draft, sectionToRewrite: action === 'rewrite' ? pending.lastSection ?? '' : '', sectionInstruction: input.sectionInstruction ?? '', latestUserMessage: pending.latestUserMessage,
      })));
      if (!isWriterResponse(data) || data.action !== action) throw new Error('The chapter writer returned an invalid response.');
      const section = data.section.trim();
      let draft = section;
      if (!specialist && action === 'continue') draft = `${pending.draft.trim()}\n\n${section}`.trim();
      if (!specialist && action === 'rewrite') {
        const old = pending.lastSection ?? '';
        const start = old ? pending.draft.lastIndexOf(old) : -1;
        if (start < 0) throw new Error('The section changed and could not be replaced safely.');
        draft = (pending.draft.slice(0, start) + section + pending.draft.slice(start + old.length)).trim();
      }
      if (specialist && draft === pending.draft.trim()) throw new Error('Aion returned an unchanged chapter draft.');
      state.diagnostics.push(...data.diagnostics);
      state.lastGeneratedSection = specialist || action === 'start' ? draft : section;
      const aion = specialist || data.diagnostics.some(d => d.provider === 'openrouter' && d.model === 'aion-labs/aion-3.5');
      state.pending = { ...pendingReset(pending), automaticEditorial: undefined, editorialReviewRecovery: undefined,
        authorProtection: protectAuthorChanges(pending.draft,draft,pending.authorProtection,false), writerRegions: updateWriterRegions(pending.draft,draft,pending.writerRegions,aion ? 'aion' : 'astra'), writerRegionsSourceHash: memorySourceHash(draft), draft, lastSection: state.lastGeneratedSection, repetitionWarnings: data.warnings, diagnostics: state.diagnostics, savedAt: new Date().toISOString() };
      delete state.editorialWork;
      state.phase = draft.includes('[[AION_SCENE_') ? 'specialist' : 'editorial';
    } else if (state.phase === 'editorial') {
      const context = editorialContext(state,input), contextHash = editorialContextHash(context);
      if (editorialPassed(state.pending?.automaticEditorial, context.content, contextHash)) {
        state.phase = input.operation === 'complete' ? 'quality' : 'ready';
      } else {
        const review = buildEditorialReview(context), sourceHash = memorySourceHash(context.content);
        const recovery = state.pending?.editorialReviewRecovery;
        const reusable = recovery?.sourceHash === sourceHash && recovery.contextHash === contextHash;
        state.editorialWork = { sourceHash, contextHash, reservedUsd: reusable ? recovery.reservedUsd : reserveEditorialBudget(0,review.call.ceilingUsd,editorialLimit()), targets: [], replacements: {} };
        const raw = reusable ? recovery.report : await executeEditorialCall(review.call,state.diagnostics);
        const previousCheck = state.diagnostics.at(-1);
        if (!reusable) state.editorialWork.reservedUsd = reconcileEditorialCost(state.editorialWork.reservedUsd,review.call.ceilingUsd,previousCheck?.costUsd);
        else if (previousCheck?.stage === 'automatic_prose_check' && typeof previousCheck.costUsd === 'number' && previousCheck.costUsd >= 0 && previousCheck.costUsd <= recovery.reservedUsd) state.editorialWork.reservedUsd = previousCheck.costUsd;
        // Retain an unusable report too, so an address-format fix can validate
        // it later without billing the analyst again for unchanged source.
        state.pending = { ...state.pending!, editorialReviewRecovery: { sourceHash, contextHash, report: raw, reservedUsd: state.editorialWork.reservedUsd } };
        const report = readEditorialReview(raw,review.material);
        state.editorialWork.targets = editorialTargets(context.content,review.material.paragraphs,report,state.pending?.writerRegions,state.pending?.authorProtection);
        if (!state.editorialWork.targets.length) acceptEditorial(state,input,contextHash);
        else state.phase = 'editorial_repair';
      }
    } else if (state.phase === 'editorial_repair') {
      const work = state.editorialWork;
      if (!work || memorySourceHash(state.pending!.draft) !== work.sourceHash) throw Error('The saved draft changed during automatic editing. No replacement was applied.');
      const remaining = work.targets.filter(t => !Object.hasOwn(work.replacements,t.id));
      const writer = remaining[0]?.writer;
      if (!writer) throw Error('The automatic repair checkpoint is incomplete.');
      const targets = remaining.filter(t => t.writer === writer);
      const repair = buildEditorialRepair(editorialContext(state,input),targets,writer);
      work.reservedUsd = reserveEditorialBudget(work.reservedUsd,repair.ceilingUsd,editorialLimit());
      const raw = await executeEditorialCall(repair,state.diagnostics);
      work.reservedUsd = reconcileEditorialCost(work.reservedUsd,repair.ceilingUsd,state.diagnostics.at(-1)?.costUsd);
      const replacements = parseEditorialRepairs(raw,targets);
      work.replacements = { ...work.replacements, ...replacements };
      if (work.targets.every(t => Object.hasOwn(work.replacements,t.id))) {
        const result = applyEditorialEdits(state.pending!.draft,work.targets,work.replacements,state.pending!.authorProtection);
        work.candidate = result.content; work.edits = result.edits;
        state.phase = 'editorial_verify';
      }
    } else if (state.phase === 'editorial_verify') {
      const work = state.editorialWork;
      if (!work?.candidate || !work.edits?.length || memorySourceHash(state.pending!.draft) !== work.sourceHash) throw Error('The saved repair could not be verified against its source.');
      const context = editorialContext(state,input,work.candidate);
      const review = buildEditorialReview(context,work.edits);
      work.reservedUsd = reserveEditorialBudget(work.reservedUsd,review.call.ceilingUsd,editorialLimit());
      const raw = await executeEditorialCall(review.call,state.diagnostics);
      work.reservedUsd = reconcileEditorialCost(work.reservedUsd,review.call.ceilingUsd,state.diagnostics.at(-1)?.costUsd);
      const report = readEditorialReview(raw,review.material,work.edits);
      if (report.overflow || editorialTargets(work.candidate,review.material.paragraphs,report,[],context.authorProtection).length || report.preservation.some(p => !p.preserved)) throw Error('The automatic edit did not pass its recheck. The original draft is saved; it has not been marked ready or submitted for another paid rewrite.');
      acceptEditorial(state,input,work.contextHash);
    } else if (state.phase === 'quality') {
      const pending = state.pending!;
      // Also covers legacy saved quality checkpoints and the old manual override.
      if (!editorialPassed(pending.automaticEditorial,pending.draft,editorialContextHash(editorialContext(state,input)))) {
        state.phase = 'editorial'; await saveCheckpoint(id,state); return false;
      }
      const override = pending.qualityOverrideReady === true && pending.qualityCheckedDraft === pending.draft;
      if (!override) {
        const data = await readApiJson(await reviewChapter(request({ storyBible: state.story.storyBible, storyState: getStoryStateBeforeChapter(state.story.storyState, pending.generatedChapter.kind === 'prologue' ? 0 : pending.generatedChapter.replaceChapterNumber), chapterBrief: pending.chapterBrief, chapterTitle: pending.generatedChapter.title, povCharacter: pending.generatedChapter.povCharacter, chapterContent: pending.draft, minimumWordCount: pending.minimumWordCount, maximumWordCount: pending.maximumWordCount })));
        if (!isQualityResponse(data)) throw new Error('The quality worker returned an invalid review.');
        state.diagnostics.push(...data.diagnostics);
        if (!data.accepted || data.quality.findings.length) {
          state.pending = { ...pending, qualityReview: data.quality, qualityCheckedDraft: pending.draft, qualityOverrideReady: true, qualityTechnicalError: undefined, repetitionWarnings: qualityReviewWarnings(data.quality), diagnostics: state.diagnostics };
          state.phase = 'ready';
          await saveCheckpoint(id, state);
          return true;
        }
      }
      const replacement = pending.generatedChapter.kind === 'prologue' ? 0 : pending.generatedChapter.replaceChapterNumber;
      const before = state.story;
      const completed = applyGeneratedChapter(before, pending, pending.draft);
      const number = pending.generatedChapter.kind === 'prologue' ? 0 : replacement ?? Math.max(0, ...before.chapters.map(chapter => chapter.number)) + 1;
      const rebuild = !before.storyState.chapterLedger?.length || replacement !== null && replacement < Math.max(0, ...before.chapters.map(chapter => chapter.number));
      state.story = completed;
      state.ledgerBatches = rebuild ? ledgerBatches(completed.chapters) : [[completed.chapters.find(chapter => chapter.number === number)!]];
      state.ledgerIndex = 0;
      if (rebuild) state.story = { ...completed, storyState: { ...EMPTY_STORY_STATE, memoryCorrections: before.storyState.memoryCorrections ?? [], chapterPlans: before.storyState.chapterPlans ?? [], voiceProfiles: before.storyState.voiceProfiles ?? [] } };
      state.phase = 'ledger';
    }
    await saveCheckpoint(id, state);
    return state.phase === 'ready';
  } catch (error) {
    if (error instanceof ApiRequestError) {
      state.diagnostics.push(...error.diagnostics);
      if (state.pending && error.preservedDraft !== undefined) state.pending = { ...pendingReset(state.pending), draft: error.preservedDraft };
    }
    if (state.pending) state.pending = { ...state.pending, diagnostics: state.diagnostics, savedAt: new Date().toISOString() };
    state.error = error instanceof Error ? error.message : 'Chapter generation failed.';
    if (state.phase === 'quality' && state.pending) state.pending = { ...state.pending, qualityCheckedDraft: state.pending.draft, qualityOverrideReady: true, qualityTechnicalError: state.error, repetitionWarnings: [`QA could not run: ${state.error}`, 'The draft is preserved. Press Complete chapter to accept it anyway, or edit the draft and press Complete chapter to retry QA.'] };
    const recoveryStory = input.operation === 'memory' ? state.story : input.story;
    state.story = { ...recoveryStory, messages: [...state.story.messages, { id: Date.now(), role: 'assistant', content: `I couldn't complete that: ${state.error} Your saved draft is preserved.` }], storyState: { ...recoveryStory.storyState, lastGenerationDiagnostics: state.diagnostics }, updatedAt: new Date().toISOString() };
    state.phase = 'ready';
    await saveCheckpoint(id, state);
    return true;
  }
}
// Model submissions are never replayed automatically after an ambiguous crash.
advanceChapterJob.maxRetries = 0;

export async function finishChapterJob(id: string) {
  console.log('Saving chapter background result', id);
  const job = await getJob(id);
  if (job.status !== 'generating') return;
  const state = job.checkpoint as Checkpoint;
  if (!state.error && state.pending && (state.lastGeneratedSection || (job.input as ChapterJobInput).operation === 'complete') && !editorialPassed(state.pending.automaticEditorial,state.pending.draft,editorialContextHash(editorialContext(state,job.input as ChapterJobInput)))) throw Error('The chapter has not passed automatic editing. Its draft is saved, but it is not ready.');
  // Recovery copies are workspace metadata, not prose/continuity input.
  const parked = (job.input as ChapterJobInput).story.storyState.parkedChapterDrafts;
  if (parked && !state.story.storyState.parkedChapterDrafts) state.story = { ...state.story, storyState: { ...state.story.storyState, parkedChapterDrafts: parked } };
  const result = { story: state.story, pending: state.pending ?? null, recoveryPending: state.pending ?? (job.input as ChapterJobInput).pending ?? null };
  const { error } = await jobAdmin().from('story_generation_jobs').update({ result, error_message: state.error ?? '', stage: 'ready', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('The generated chapter could not be saved.');
  const { error: persistError } = await jobAdmin().rpc('finish_story_generation_job', { p_job_id: id });
  if (persistError) throw new Error('The chapter result is retained, but automatic story saving failed.');
}

export async function failChapterJob(id: string, message: string) {
  console.error('Chapter background job stopped', id, message);
  const job = await getJob(id);
  if (job.status !== 'generating') return;
  const state = job.checkpoint as Checkpoint | undefined;
  const result = job.result ?? (state?.story ? { story: (job.input as ChapterJobInput).story, pending: state.pending ?? null } : { story: (job.input as ChapterJobInput).story, pending: (job.input as ChapterJobInput).pending ?? null });
  const { error } = await jobAdmin().from('story_generation_jobs').update({ error_message: message + ' Saved progress is kept. No model call was automatically repeated.', result, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'generating');
  if (error) throw new Error('The stopped chapter job could not be recorded.');
  const { error: persistError } = await jobAdmin().rpc('finish_story_generation_job', { p_job_id: id });
  if (persistError) await jobAdmin().from('story_generation_jobs').update({ status: 'failed' }).eq('id', id).eq('status', 'generating');
}




