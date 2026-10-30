import {tooSimilar} from './social-strategy';
import type {ContentMetadata,StrategyAssignment,StrategySettings} from './social-strategy';
import type {AiDay,PlanBook} from './social-planner';
import type {CalendarPost,SocialPlatform} from './social-calendar';
export const HOOK_TYPES=['premise','forbidden','jealousy','possessive','emotional','comic','curiosity','reader_opinion','relatable','choice','romantic','spicy','rivalry','other'] as const;
export type StrategyCopy={creativeBrief:string;hookType:string;topic:string;factAnchors:string[]};
export function validateStrategyCopy(days:AiDay[],assignments:StrategyAssignment[],books:PlanBook[],settings:StrategySettings,recent:Pick<CalendarPost,'platform'|'caption'|'title'>[]){
 const checked=new Map<string,{metadata:ContentMetadata;brief:string;book:PlanBook|null;postType:string}>();
 const prior=[...recent];
 const shared=new Map<string,{brief:string;hook:string;topic:string}>();
 for(const day of days){
  const assignment=assignments.find(a=>a.dayIndex===day.dayIndex);
  if(!assignment?.variants)throw Error('The content strategy assignment is missing.');
  for(const copy of day.posts){
   const plan=assignment.variants.find(v=>v.platform===copy.platform);
   if(!plan)throw Error('The strategy did not assign this platform.');
   const detail=copy as typeof copy&StrategyCopy;
   if(typeof detail.creativeBrief!=='string'||!detail.creativeBrief.trim()||detail.creativeBrief.length>3500||!HOOK_TYPES.includes(detail.hookType as typeof HOOK_TYPES[number])||typeof detail.topic!=='string'||!detail.topic.trim()||detail.topic.length>180||!Array.isArray(detail.factAnchors)||detail.factAnchors.length>6)throw Error('The AI returned incomplete content labels.');
   const book=plan.book?books.find(b=>b.slug===plan.book):null;
   if(plan.book&&!book)throw Error('The assigned book is missing.');
   const facts=book?[book.blurb,...book.tropes].join('\n').toLowerCase():'';
   if(book&&!detail.factAnchors.length||detail.factAnchors.some(anchor=>typeof anchor!=='string'||anchor.trim().length<4||anchor.length>500||anchor.trim().length<12&&!book?.tropes.some(t=>t.toLowerCase()===anchor.toLowerCase().trim())||!facts.includes(anchor.toLowerCase().trim()))||!book&&detail.factAnchors.length)throw Error('A book claim has no matching source fact. Review this batch before regenerating.');
   const text=[copy.title,copy.caption,detail.creativeBrief,detail.topic].join('\n');
   if(settings.blocked_topics.some(topic=>text.toLowerCase().includes(topic.toLowerCase())))throw Error('This batch includes a blocked topic. No posts from this batch were saved.');
   if(prior.some(previous=>previous.platform===copy.platform&&tooSimilar(copy.caption,previous.caption)))throw Error('This batch repeats a recent caption or opening. Other saved batches are kept.');
   prior.push(copy);
   const key=[day.dayIndex,plan.family,plan.book,plan.visual].join(':');
   const concept=shared.get(key)??{brief:detail.creativeBrief,hook:detail.hookType,topic:detail.topic};shared.set(key,concept);
   checked.set(day.dayIndex+':'+copy.platform,{book:book??null,postType:plan.postType,brief:`Layout: ${plan.visual}. ${concept.brief}${plan.family==='book_promotion'?' Preserve the exact genuine cover.':' No book cover, Kindle/device, book-sales footer or sales CTA. Original social text, never attribute it as a book extract.'}`,metadata:{version:2,origin:'planned_v2',family:plan.family,objective:plan.family==='book_promotion'?'conversion':'discovery',hook_type:concept.hook,visual_type:plan.visual,caption_style:plan.captionStyle,includes_question:copy.caption.includes('?')||concept.brief.includes('?'),includes_cover:plan.family==='book_promotion',book_specific:Boolean(book),topic:concept.topic,fact_anchors:detail.factAnchors,attribution:plan.family==='original_quote'?'original_social_line':'none'}});
  }
 }
 return checked;
}
