import type {CalendarPost} from './social-calendar';
import {londonDate,londonSchedule} from './social-calendar';
import {testingPostingHours,TIMING_POLICY} from './social-posting-times';

/** Reuse approved portrait video, without a paid generation or new book claims. */
export function youtubeCopy(post:CalendarPost){
  if(post.platform!=='tiktok'||post.media_type!=='video'||!post.media_path||!post.scheduled_at)throw Error('Choose an existing TikTok video.');
  const title=(post.book_title?`${post.book_title} | ${post.title}`:post.title).slice(0,100);
  const caption=post.caption.replace(/\\n/g,'\n').replace(/\b(link in (?:my |the )?bio|bio link)\b/gi,'channel profile link');
  const cta=post.book_title?`Find ${post.book_title} through the books link on my channel profile.`:'Follow for MM romance books and reader talk.';
  const date=londonDate(post.scheduled_at),hour=testingPostingHours(date,'youtube')[0];
  return {campaign_id:post.campaign_id,user_id:post.user_id,book_slug:post.book_slug,book_title:post.book_title,platform:'youtube',post_type:post.post_type,title,caption:caption+'\n\n'+cta,hashtags:post.hashtags.filter(t=>!/^#(?:booktok|mmbooktok)$/i.test(t)).concat('#Shorts').slice(0,5),media_path:post.media_path,media_type:'video',planned_media_type:'video',creative_brief:post.creative_brief??'',quality_notes:post.quality_notes??'',generation_run_id:post.generation_run_id??null,content_metadata:{...post.content_metadata,repurposed_from:post.id,timing_policy:TIMING_POLICY},scheduled_at:londonSchedule(date,String(hour).padStart(2,'0')+':00'),status:'draft'};
}
