import { jobAdmin } from '../lib/social-job-db';
import type { ChapterJobInput } from '../lib/chapter-job';
import type { StoryWorkspace, GenerationDiagnostic, StoryChapter, StoryChatResponse } from '../app/story-chat/types';
import { ApiRequestError, readApiJson, isLedgerResponse, isQualityResponse, isWriterResponse, getContractWordRange, getStoryStateBeforeChapter, applyGeneratedChapter, qualityReviewWarnings, EMPTY_STORY_STATE, type PendingChapterGeneration } from '../app/story-chat/generation';
import { POST as planChapter } from '../app/api/story-chat/route';
import { POST as writeChapter } from '../app/api/story-chat/write/route';
import { POST as reviewChapter } from '../app/api/story-chat/quality/route';
import { POST as ledgerChapter } from '../app/api/story-chat/ledger/route';

type Phase = 'prepare' | 'preledger' | 'plan' | 'write' | 'specialist' | 'quality' | 'ledger' | 'ready';
type Checkpoint = {
  story: StoryWorkspace;
  pending?: PendingChapterGeneration;
  phase: Phase;
  diagnostics: GenerationDiagnostic[];
  ledgerBatches?: StoryChapter[][];
  ledgerIndex?: number;
  lastGeneratedSection?: string;
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

export async function advanceChapterJob(id: string): Promise<boolean> {
  'use step';
  const job = await getJob(id);
  if (job.status !== 'generating') return true;
  const input = job.input as ChapterJobInput;
  const state: Checkpoint = job.checkpoint?.phase ? job.checkpoint : {
    story: input.story, pending: input.pending, phase: 'prepare', diagnostics: input.pending?.diagnostics ?? [],
  };
  console.log('Chapter background stage', id, state.phase);
  if (!['prepare', 'ready'].includes(state.phase)) {
    const { data, error } = await jobAdmin().from('story_generation_jobs').update({ model_call_in_flight: true }).eq('id', id).eq('status', 'generating').eq('model_call_in_flight', false).select('id').maybeSingle();
    if (error || !data) throw new Error('The previous model call could not be confirmed after an interruption. Saved progress is kept; it was not automatically submitted again.');
  }
  try {
    if (state.phase === 'prepare') {
      if (input.operation === 'generate') {
        const dirty = state.story.storyState.continuityDirtyFromChapter;
        const missing = !state.story.storyState.chapterLedger?.length;
        if (state.story.chapters.length && (missing || dirty !== undefined)) {
          state.ledgerBatches = ledgerBatches(state.story.chapters, missing ? undefined : dirty);
          state.ledgerIndex = 0;
          state.story = { ...state.story, storyState: missing ? { ...EMPTY_STORY_STATE } : getStoryStateBeforeChapter(state.story.storyState, dirty!) };
          state.phase = 'preledger';
        } else state.phase = 'plan';
      } else {
        if (!state.pending) throw new Error('A saved chapter draft is required.');
        if (input.operation === 'complete') {
          state.phase = !state.pending.draft.trim() ? 'write' : state.pending.draft.includes('[[AION_SCENE_') ? 'specialist' : 'quality';
        } else state.phase = state.pending.draft.includes('[[AION_SCENE_') ? 'specialist' : 'write';
      }
    } else if (state.phase === 'preledger' || state.phase === 'ledger') {
      const index = state.ledgerIndex ?? 0;
      const batch = state.ledgerBatches?.[index];
      if (batch?.length) {
        const data = await readApiJson(await ledgerChapter(request({ storyBible: state.story.storyBible, storyState: state.story.storyState, chapters: batch, chapter: batch.at(-1), rebuildMode: 'batch' })));
        if (!isLedgerResponse(data)) throw new Error('The continuity worker returned an invalid ledger.');
        state.story = { ...state.story, storyState: { ...data.storyState, chapterPlans: state.story.storyState.chapterPlans ?? [] } };
        state.diagnostics.push(...data.diagnostics);
        state.ledgerIndex = index + 1;
      }
      if (!state.ledgerBatches?.[state.ledgerIndex ?? 0]) {
        if (state.phase === 'preledger') state.phase = 'plan';
        else {
          state.story = { ...state.story, storyState: { ...state.story.storyState, lastGenerationDiagnostics: state.diagnostics }, messages: [...state.story.messages, { id: Date.now(), role: 'assistant', content: 'Chapter completed and continuity updated.' }], updatedAt: new Date().toISOString() };
          state.pending = undefined;
          state.phase = 'ready';
        }
      }
    } else if (state.phase === 'plan') {
      const data = await readApiJson(await planChapter(request({ stage: 'plan', story: state.story, chatOnly: false }))) as StoryChatResponse;
      if (!data.story || !Array.isArray(data.story.chapters)) throw new Error('The planner returned an invalid workspace.');
      state.story = data.story;
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
      const pending = state.pending!;
      const specialist = state.phase === 'specialist';
      const action = specialist ? 'start' : input.operation === 'generate' || !pending.draft.trim() ? 'start' : input.action ?? 'continue';
      const replacement = pending.generatedChapter.replaceChapterNumber;
      const data = await readApiJson(await writeChapter(request({
        ...(specialist ? { phase: 'fill_specialist' } : {}), action,
        storyBible: state.story.storyBible, storyState: getStoryStateBeforeChapter(state.story.storyState, replacement),
        recentChapters: (replacement === null ? state.story.chapters : state.story.chapters.filter(chapter => chapter.number < replacement)).slice(-2),
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
      state.pending = { ...pendingReset(pending), draft, lastSection: state.lastGeneratedSection, repetitionWarnings: data.warnings, diagnostics: state.diagnostics, savedAt: new Date().toISOString() };
      state.phase = draft.includes('[[AION_SCENE_') ? 'specialist' : 'ready';
    } else if (state.phase === 'quality') {
      const pending = state.pending!;
      const override = pending.qualityOverrideReady === true && pending.qualityCheckedDraft === pending.draft;
      if (!override) {
        const data = await readApiJson(await reviewChapter(request({ storyBible: state.story.storyBible, storyState: getStoryStateBeforeChapter(state.story.storyState, pending.generatedChapter.replaceChapterNumber), chapterBrief: pending.chapterBrief, chapterTitle: pending.generatedChapter.title, povCharacter: pending.generatedChapter.povCharacter, chapterContent: pending.draft, minimumWordCount: pending.minimumWordCount, maximumWordCount: pending.maximumWordCount })));
        if (!isQualityResponse(data)) throw new Error('The quality worker returned an invalid review.');
        state.diagnostics.push(...data.diagnostics);
        if (!data.accepted || data.quality.findings.length) {
          state.pending = { ...pending, qualityReview: data.quality, qualityCheckedDraft: pending.draft, qualityOverrideReady: true, qualityTechnicalError: undefined, repetitionWarnings: qualityReviewWarnings(data.quality), diagnostics: state.diagnostics };
          state.phase = 'ready';
          await saveCheckpoint(id, state);
          return true;
        }
      }
      const replacement = pending.generatedChapter.replaceChapterNumber;
      const before = state.story;
      const completed = applyGeneratedChapter(before, pending, pending.draft);
      const number = replacement ?? Math.max(0, ...before.chapters.map(chapter => chapter.number)) + 1;
      const rebuild = !before.storyState.chapterLedger?.length || replacement !== null && replacement < Math.max(0, ...before.chapters.map(chapter => chapter.number));
      state.story = completed;
      state.ledgerBatches = rebuild ? ledgerBatches(completed.chapters) : [[completed.chapters.find(chapter => chapter.number === number)!]];
      state.ledgerIndex = 0;
      if (rebuild) state.story = { ...completed, storyState: { ...EMPTY_STORY_STATE, chapterPlans: before.storyState.chapterPlans ?? [], voiceProfiles: before.storyState.voiceProfiles ?? [] } };
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
    state.story = { ...input.story, messages: [...state.story.messages, { id: Date.now(), role: 'assistant', content: `I couldn't complete that: ${state.error} Your saved draft is preserved.` }], storyState: { ...input.story.storyState, lastGenerationDiagnostics: state.diagnostics }, updatedAt: new Date().toISOString() };
    state.phase = 'ready';
    await saveCheckpoint(id, state);
    return true;
  }
}
// Model submissions are never replayed automatically after an ambiguous crash.
advanceChapterJob.maxRetries = 0;

export async function finishChapterJob(id: string) {
  'use step';
  console.log('Saving chapter background result', id);
  const job = await getJob(id);
  if (job.status !== 'generating') return;
  const state = job.checkpoint as Checkpoint;
  const result = { story: state.story, pending: state.pending ?? null, recoveryPending: state.pending ?? (job.input as ChapterJobInput).pending ?? null };
  const { error } = await jobAdmin().from('story_generation_jobs').update({ result, error_message: state.error ?? '', stage: 'ready', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('The generated chapter could not be saved.');
  const { error: persistError } = await jobAdmin().rpc('finish_story_generation_job', { p_job_id: id });
  if (persistError) throw new Error('The chapter result is retained, but automatic story saving failed.');
}

export async function failChapterJob(id: string, message: string) {
  'use step';
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
