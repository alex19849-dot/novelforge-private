import type { CalendarPost } from './social-calendar';

export function readyForApproval(post:CalendarPost,now=Date.now()) {
  if(post.status!=='draft'||!post.scheduled_at||Date.parse(post.scheduled_at)<=now||!Number.isFinite(Date.parse(post.scheduled_at))||!post.caption.trim()) return false;
  if((post.platform!=='facebook'||post.planned_media_type)&&(!post.media_path||!post.media_type)) return false;
  const length=[post.caption,post.hashtags.join(' ')].join('\n\n').length;
  const limit=post.platform==='instagram'?2196:post.platform==='tiktok'?(post.media_type==='video'?2200:4000):5000;
  return length<=limit;
}
