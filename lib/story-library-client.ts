import type { StoryBible, StoryChapter, StoryState, ChatMessage } from '../app/story-chat/types';
export type LibrarySession = { access_token?: string; expires_at?: number; user?: { id?: string; email?: string } | null };
export type StoryListRow = { id: string; title: string; created_at: string; updated_at: string };
export type SavedStoryRow = StoryListRow & { form: StoryBible; story_state: StoryState; messages: ChatMessage[]; chapters: StoryChapter[]; custom_rewrite: string | null };
export async function bounded<T>(promise: PromiseLike<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The saved-story connection timed out. Retry the connection; your local copy will not overwrite the server.')), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export async function readStoryLibrary(token: string, expectedUserId: string, storyId?: string) {
  const response = await fetch(`/api/story-chat/library${storyId ? `?storyId=${encodeURIComponent(storyId)}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const body = await response.json() as { error?: string; account?: { id: string; email: string }; stories?: StoryListRow[]; story?: SavedStoryRow };
  if (!response.ok) throw new Error(body.error ?? 'Saved stories could not be loaded. Retry the connection.');
  if (body.account?.id !== expectedUserId) throw new Error('Your sign-in changed. Sign in again with the account that owns your stories.');
  if (storyId ? !body.story || body.story.id !== storyId : !Array.isArray(body.stories)) throw new Error('The saved-story response was incomplete. Your local copy has not replaced it.');
  return body;
}
