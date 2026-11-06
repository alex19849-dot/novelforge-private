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

export function isGuidanceProposal(text: string): boolean {
  return /^\s*(?:RE)?WRITE CHAPTER \d+\s*\r?\n[\s\S]*?\bPOV:/i.test(text);
}
export function guidanceMessageIndex(messages: StoryWorkspace['messages'], text: string): number {
  const heading = text.match(/^\s*((?:RE)?WRITE CHAPTER \d+)\b/i)?.[1].toUpperCase();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && (message.content.trim() === text.trim() || heading && isGuidanceProposal(message.content) && message.content.match(/^\s*((?:RE)?WRITE CHAPTER \d+)\b/i)?.[1].toUpperCase() === heading)) return i;
  }
  return -1;
}
export function withoutChapterGuidance(story: StoryWorkspace): StoryWorkspace {
  const draft = story.storyState.chapterGuidanceDraft;
  if (!draft) return story;
  const index = guidanceMessageIndex(story.messages, draft.text);
  const { chapterGuidanceDraft: _draft, ...state } = story.storyState;
  return { ...story, storyState: state, messages: story.messages.filter((_, i) => i !== index), updatedAt: new Date().toISOString() };
}
export function discardsChapterGuidance(message: string): boolean {
  return /^(?:please\s+)?(?:discard|delete|clear|remove|scrap)\s+(?:(?:the|this|current)\s+)*(?:chapter\s+)?(?:guidance|guidence|outline|plan)[.!\s]*$/i.test(message.trim());
}
