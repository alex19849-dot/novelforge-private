export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];
export const POST_TYPES = ['premise_hook', 'trope_hook', 'character_conflict', 'reader_question', 'humour', 'book_promotion', 'new_release', 'video', 'reader_engagement','romance_hot_take','this_or_that','original_quote'] as const;
export const POST_LABELS: Record<string, string> = {
  premise_hook: 'Premise hook', trope_hook: 'Trope hook', character_conflict: 'Character / conflict',
  reader_question: 'Reader question', humour: 'Funny / spicy', book_promotion: 'Book promotion',
  romance_hot_take:'Romance debate',this_or_that:'This or that',original_quote:'Original social line',
  new_release: 'New release', video: 'Video / reel', reader_engagement: 'Reader engagement',
};
export type CalendarSeed = {
  book_slug: string; book_title: string; platform: SocialPlatform; title: string;
  caption: string; hashtags: string[]; mediaSource?: string; media_type: 'image' | 'video' | null;
  mimeType?: string; mediaBlob?: Blob;
};
export type CalendarPost = {
  id: string; campaign_id: string; user_id: string; book_slug: string; book_title: string;
  platform: SocialPlatform; post_type: string; title: string; caption: string; hashtags: string[];
  media_path: string | null; media_type: 'image' | 'video' | null; scheduled_at: string | null;
  status: string; content_metadata?: Record<string,unknown>; creative_brief?: string; planned_media_type?: 'image' | 'video' | null; quality_notes?: string; generation_run_id?: string | null; version: number; created_at: string; updated_at: string;
};
export function londonDate(value: Date | string = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function londonTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function calendarDays(start: string) { return Array.from({ length: 30 }, (_, i) => addDays(start, i)); }
export function londonSchedule(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid date and time.');
  const base = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(base)) throw new Error('Choose a valid date and time.');
  const candidates = [-60, 0, 60].map(minutes => new Date(base + minutes * 60_000))
    .filter(value => londonDate(value) === date && londonTime(value.toISOString()) === time);
  if (candidates.length !== 1) throw new Error('That UK time is skipped or repeated when the clocks change. Choose another time.');
  return candidates[0].toISOString();
}
export function calendarError(error: { message?: string; code?: string } | null) {
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'The calendar database needs its setup migration. Your existing writing workspace is unaffected.';
  if (error?.code === '23505') return 'This post is already saved. Refresh the calendar before adding it again.';
  return error?.message || 'The calendar could not be saved. Your editor is still open.';
}
