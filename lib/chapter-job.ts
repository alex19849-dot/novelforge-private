import type { StoryWorkspace } from '../app/story-chat/types';
import type { PendingChapterGeneration, SectionAction } from '../app/story-chat/generation';

export type ChapterJobInput = {
  story: StoryWorkspace;
  pending?: PendingChapterGeneration;
  operation: 'generate' | 'write' | 'complete';
  action?: SectionAction;
  sectionInstruction?: string;
};

// Ignore transport-only metadata, but never silently overwrite changed prose,
// Bible, or continuity. Sorting makes JSON object key order irrelevant.
export function chapterSourceFingerprint(story: StoryWorkspace): string {
  const { workspaceMetadata: _metadata, lastGenerationDiagnostics: _diagnostics, ...state } = story.storyState as Record<string, unknown>;
  const sort = (value: unknown): unknown => Array.isArray(value)
    ? value.map(sort)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sort(v)]))
      : value;
  return JSON.stringify(sort({ bible: story.storyBible, chapters: story.chapters, state }));
}
