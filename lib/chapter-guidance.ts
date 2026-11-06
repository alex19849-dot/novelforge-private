import type { StoryWorkspace } from '../app/story-chat/types';
import { chapterSourceFingerprint } from './chapter-job';

export function requestsChapterGuidance(message: string): boolean {
  return /\b(?:guidance|guidence|plan|outline)\b[\s\S]{0,100}\bchapter\b|\bchapter\b[\s\S]{0,100}\b(?:guidance|guidence|plan|outline)\b/i.test(message);
}
export function revisesChapterGuidance(message: string): boolean {
  return /^(?:please\s+)?(?:change|revise|redo|adjust|add|remove|make|keep|instead|less|more|don't|do not)\b/i.test(message.trim());
}
export async function chapterGuidanceSourceKey(story: StoryWorkspace): Promise<string> {
  const { chapterGuidanceDraft: _draft, parkedChapterDrafts: _parked, ...state } = story.storyState;
  const bytes = new TextEncoder().encode(chapterSourceFingerprint({ ...story, storyState: state }));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function parkChapterDraft(story: StoryWorkspace, pending: import('../app/story-chat/generation').PendingChapterGeneration | null | undefined) {
  const parked = story.storyState.parkedChapterDrafts ?? [];
  if (!pending || pending.storyId !== story.id || !pending.draft.trim()) return parked;
  if (parked.some(item => item.pending.draft === pending.draft && item.pending.chapterBrief === pending.chapterBrief)) return parked;
  return [...parked, { id: crypto.randomUUID(), parkedAt: new Date().toISOString(), pending }];
}
