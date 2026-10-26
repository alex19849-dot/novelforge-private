import { addDays, londonSchedule, POST_TYPES } from './social-calendar';
import type { SocialPlatform } from './social-calendar';
export const CONTENT_MIX = [
  'premise_hook','reader_question','character_conflict','trope_hook','humour','video','book_promotion',
  'reader_engagement','premise_hook','humour','trope_hook','character_conflict','video','reader_question',
  'book_promotion','premise_hook','humour','reader_engagement','character_conflict','trope_hook','video',
  'reader_question','premise_hook','humour','book_promotion','character_conflict','trope_hook','reader_question','video','premise_hook',
];
export type PlanBook = { slug: string; title: string; blurb: string; tropes: string[]; subgenre: string; kindleUnlimited: boolean; amazonUrl: string; coverUrl: string };
export type AiDay = { dayIndex: number; hook: string; creativeBrief: string; posts: { platform: SocialPlatform; title: string; caption: string; hashtags: string[] }[] };
export function validateAiDays(value: unknown, platforms: SocialPlatform[], indices: number[] = Array.from({length:30}, (_,i) => i)): AiDay[] {
  const days = (value as {days?: AiDay[]})?.days;
  if (!Array.isArray(days) || days.length !== indices.length) throw new Error('The AI did not return all 30 days. No drafts were saved.');
  const seen = new Set<number>();
  for (const day of days) {
    if (!Number.isInteger(day.dayIndex) || !indices.includes(day.dayIndex) || seen.has(day.dayIndex)) throw new Error('The AI repeated or omitted a day. No drafts were saved.');
    seen.add(day.dayIndex);
    if (!day.hook?.trim() || !day.creativeBrief?.trim() || day.creativeBrief.length > 5000 || !Array.isArray(day.posts) || day.posts.length !== platforms.length) throw new Error('The AI returned an incomplete campaign. No drafts were saved.');
    const found = new Set<string>();
    for (const post of day.posts) {
      if (!platforms.includes(post.platform) || found.has(post.platform) || !post.caption?.trim() || !post.title?.trim() || post.title.length > 240 || post.caption.length > 1800 || !Array.isArray(post.hashtags) || post.hashtags.length !== 5 || post.hashtags.some(tag => typeof tag !== 'string' || tag.length > 40 || !/^#[\p{L}\p{N}_]+$/u.test(tag))) throw new Error('The AI returned invalid platform copy. No drafts were saved.');
      found.add(post.platform);
    }
  }
  return days.sort((a,b) => a.dayIndex - b.dayIndex);
}
export function plannedTime(start: string, index: number, platform: SocialPlatform) {
  return londonSchedule(addDays(start,index), platform === 'facebook' ? '18:00' : platform === 'instagram' ? '19:00' : '20:00');
}
export function plannedFormat(type: string, platform: SocialPlatform): 'image' | 'video' | null {
  if (!POST_TYPES.includes(type as typeof POST_TYPES[number])) throw new Error('Invalid post type.');
  return type === 'video' ? 'video' : platform === 'facebook' && ['reader_question','reader_engagement'].includes(type) ? null : 'image';
}
