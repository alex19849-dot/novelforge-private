import {addDays} from './social-calendar';
import type {SocialPlatform,CalendarPost} from './social-calendar';
import type {PlanBook} from './social-planner';

export const FAMILIES = ['book_hook','relationship_hook','reader_question','reader_humour','hot_take','this_or_that','original_quote','book_promotion'] as const;
export type ContentFamily=typeof FAMILIES[number];
export const FAMILY_LABELS:Record<ContentFamily,string>={book_hook:'Book hooks',relationship_hook:'Relationship hooks',reader_question:'Reader questions',reader_humour:'Reader humour',hot_take:'Romance debates',this_or_that:'This or that',original_quote:'Original social lines',book_promotion:'Book promotion'};
export const FAMILY_POST_TYPES:Record<ContentFamily,string>={book_hook:'premise_hook',relationship_hook:'character_conflict',reader_question:'reader_question',reader_humour:'humour',hot_take:'romance_hot_take',this_or_that:'this_or_that',original_quote:'original_quote',book_promotion:'book_promotion'};
export const VISUALS:Record<ContentFamily,string[]>={book_hook:['dramatic_typography','object_scene','split_hook'],relationship_hook:['split_hook','dramatic_typography','object_scene'],reader_question:['question_card','large_type','conversation_card'],reader_humour:['meme_card','large_type','reader_checklist'],hot_take:['statement_card','large_type','debate_card'],this_or_that:['split_choice','versus_card'],original_quote:['quote_card','editorial_type','atmospheric_type'],book_promotion:['cover_hero','kindle_mockup','trope_card']};
export const BASE_WEIGHTS:Record<ContentFamily,number>={book_hook:12,relationship_hook:12,reader_question:12,reader_humour:12,hot_take:6,this_or_that:6,original_quote:5,book_promotion:35};
export type ContentMetadata={version:2;origin:'planned_v2'|'edited_v2';family:ContentFamily;objective:'discovery'|'conversion';hook_type:string;visual_type:string;caption_style:string;includes_question:boolean;includes_cover:boolean;book_specific:boolean;topic:string;fact_anchors:string[];attribution:'original_social_line'|'none';};
export type StrategySettings={adaptive:boolean;promotion_percent:number;disabled_families:ContentFamily[];blocked_topics:string[];priority_book:string;priority_until:string;};
export const DEFAULT_STRATEGY:StrategySettings={adaptive:true,promotion_percent:35,disabled_families:[],blocked_topics:[],priority_book:'',priority_until:''};
export type AttributeScore={attribute:string;value:string;discovery:number|null;conversion:number|null;posts:number;days:number;ready:boolean};
export type PlatformLearning={platform:SocialPlatform;eligible_posts:number;attributes:AttributeScore[];weights:Record<string,number>;summary:string;};
export type LearningReport={version:1;updated_at:string;source_updated_at?:string|null;snapshot_posts:number;platforms:PlatformLearning[];};
export type StrategyVariant={platform:SocialPlatform;family:ContentFamily;book:string;postType:string;visual:string;captionStyle:string};
export type StrategyAssignment={dayIndex:number;date:string;postType:string;book:string;variants?:StrategyVariant[]};
export function cleanStrategy(value:unknown):StrategySettings {
 const v=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const pct=Number(v.promotion_percent??35);
 if(!Number.isFinite(pct)||pct<0||pct>70)throw Error('Choose a promotion share between 0 and 70 percent.');
 const disabled=Array.isArray(v.disabled_families)?v.disabled_families:[];
 if(disabled.some(x=>!FAMILIES.includes(x as ContentFamily))||disabled.length>=FAMILIES.length)throw Error('Keep at least one content family enabled.');
 const topics=Array.isArray(v.blocked_topics)?v.blocked_topics:[];
 if(topics.length>40||topics.some(x=>typeof x!=='string'||x.length>160))throw Error('Use up to 40 blocked topics, each under 160 characters.');
 const book=typeof v.priority_book==='string'?v.priority_book.slice(0,180):'';
 const until=typeof v.priority_until==='string'?v.priority_until:'';
 if(book&&(!/^\d{4}-\d{2}-\d{2}$/.test(until)||!Number.isFinite(Date.parse(until+'T12:00:00Z'))))throw Error('Choose an end date for the book priority.');
 return {adaptive:v.adaptive!==false,promotion_percent:Math.round(pct),disabled_families:[...new Set(disabled)] as ContentFamily[],blocked_topics:[...new Set(topics.map(x=>(x as string).trim()).filter(Boolean))],priority_book:book,priority_until:book?until:''};
}
export function familyWeights(settings:StrategySettings,learning?:PlatformLearning):Record<ContentFamily,number> {
 const allowed=FAMILIES.filter(f=>!settings.disabled_families.includes(f));
 const weights=Object.fromEntries(FAMILIES.map(f=>[f,allowed.includes(f)?BASE_WEIGHTS[f]:0])) as Record<ContentFamily,number>;
 const hasPromotion=allowed.includes('book_promotion'),discovery=allowed.filter(f=>f!=='book_promotion');
 let promo=hasPromotion?settings.promotion_percent:0;
 // Five posts over three dates are required per attribute; twelve per platform.
 // Move at most five percentage points from the author's chosen starting mix.
 if(settings.adaptive&&learning&&learning.eligible_posts>=12&&hasPromotion&&discovery.length){
  const advert=learning.attributes.find(a=>a.attribute==='family'&&a.value==='book_promotion'&&a.ready);
  if(advert?.conversion!=null)promo+=Math.max(-5,Math.min(5,advert.conversion*5));
 }
 if(!discovery.length)promo=100;
 for(const f of discovery){
  const score=settings.adaptive?learning?.attributes.find(a=>a.attribute==='family'&&a.value===f&&a.ready):undefined;
  const factor=learning&&learning.eligible_posts>=12&&score?.discovery!=null?Math.exp(Math.max(-.35,Math.min(.35,score.discovery))):1;
  weights[f]=BASE_WEIGHTS[f]*factor;
 }
 const total=discovery.reduce((sum,f)=>sum+weights[f],0);
 for(const f of discovery)weights[f]=total?(100-promo)*weights[f]/total:0;
 weights.book_promotion=promo;
 // Exploration floor and a discovery-family ceiling, with redistribution.
 if(discovery.length>1)for(let pass=0;pass<8;pass++){
  const ceiling=Math.max(30,(100-promo)/discovery.length);
  const capped=discovery.filter(f=>weights[f]>ceiling),extra=capped.reduce((s,f)=>s+weights[f]-ceiling,0);
  if(!extra)break;for(const f of capped)weights[f]=ceiling;
  const others=discovery.filter(f=>!capped.includes(f));for(const f of others)weights[f]+=extra/others.length;
 }
 return weights;
}
function checksum(text:string){let h=0;for(const c of text)h=(h*31+c.charCodeAt(0))>>>0;return h;}
export function createStrategyAssignments(start:string,platforms:SocialPlatform[],books:PlanBook[],settings:StrategySettings,report:LearningReport|null,recent:Pick<CalendarPost,'platform'|'book_slug'|'content_metadata'>[]=[]):StrategyAssignment[] {
 if(!books.length)throw Error('Choose at least one published book.');
 const sequences=new Map<SocialPlatform,StrategyVariant[]>();
 for(const platform of platforms){
  const learning=report?.platforms.find(p=>p.platform===platform),weights=familyWeights(settings,learning);
  const used:Record<string,number>={},bookUsed:Record<string,number>={},visualUsed:Record<string,number>={},styleUsed:Record<string,number>={};
  const bookTargets=books.map(book=>{
   const evidence=settings.adaptive?learning?.attributes.find(a=>a.attribute==='book'&&a.value===book.slug&&a.ready):undefined;
   const score=evidence?.conversion??evidence?.discovery??0;
   return {book,weight:Math.exp(Math.max(-.2,Math.min(.2,score)))};
  });
  // Carry a bounded exposure credit across batches so quieter books do not
  // repeatedly lose the same rounding slots at the end of every month.
  for(const book of books)bookUsed[book.slug]=Math.min(2,recent.filter(p=>p.platform===platform&&p.book_slug===book.slug).length);
  const out:StrategyVariant[]=[];
  for(let dayIndex=0;dayIndex<30;dayIndex++){
   const ordered=FAMILIES.filter(f=>weights[f]>0).sort((a,b)=>{
    const need=(f:string)=>weights[f]*(dayIndex+1)/100-(used[f]??0)-(out.at(-1)?.family===f?0.65:0);
    return need(b)-need(a)||checksum(start+a)-checksum(start+b);
   });
   const family=ordered[0];if(!family)throw Error('Enable a content family for the selected mix.');used[family]=(used[family]??0)+1;
   const needsBook=['book_hook','relationship_hook','book_promotion'].includes(family);
   let book='';
   if(needsBook){
    const targetWeight=(b:typeof bookTargets[number])=>b.weight*(b.book.slug===settings.priority_book&&settings.priority_until>=addDays(start,dayIndex)?3:1);
    const total=bookTargets.reduce((s,b)=>s+targetWeight(b),0),count=Object.values(bookUsed).reduce((s,n)=>s+n,0)+1;
    const previous=out.filter(p=>p.book).at(-1)?.book??recent.find(p=>p.platform===platform&&p.book_slug)?.book_slug;
    bookTargets.sort((a,b)=>(targetWeight(b)/total*count-(bookUsed[b.book.slug]??0)-(b.book.slug===previous?0.75:0))-(targetWeight(a)/total*count-(bookUsed[a.book.slug]??0)-(a.book.slug===previous?0.75:0)));
    book=bookTargets[0].book.slug;bookUsed[book]=(bookUsed[book]??0)+1;
   }
   const layouts=VISUALS[family];const visual=[...layouts].sort((a,b)=>{
    const score=(v:string)=>{const e=learning?.attributes.find(s=>s.attribute==='visual'&&s.value===v&&s.ready);return (visualUsed[v]??0)+(out.at(-1)?.visual===v?1:0)-(settings.adaptive&&e?.discovery!=null?Math.max(-.25,Math.min(.25,e.discovery)):0);};
    return score(a)-score(b)||checksum(start+a)-checksum(start+b);
   })[0];visualUsed[visual]=(visualUsed[visual]??0)+1;
   const styles=platform==='facebook'?['conversational_question','short_story_hook','playful_one_liner']:platform==='tiktok'?['immediate_booktok_hook','pov_opening','reader_confession']:['concise_visual_caption','reader_confession','short_question'];
   const captionStyle=styles.sort((a,b)=>{const cost=(v:string)=>{const e=learning?.attributes.find(s=>s.attribute==='caption'&&s.value===v&&s.ready);return (styleUsed[v]??0)-(settings.adaptive&&e?.discovery!=null?Math.max(-.35,Math.min(.35,e.discovery)):0);};return cost(a)-cost(b);})[0];styleUsed[captionStyle]=(styleUsed[captionStyle]??0)+1;
   out.push({platform,family,book,postType:FAMILY_POST_TYPES[family],visual,captionStyle});
  }
  sequences.set(platform,out);
 }
 return Array.from({length:30},(_,dayIndex)=>{const variants=platforms.map(p=>sequences.get(p)![dayIndex]);return {dayIndex,date:addDays(start,dayIndex),postType:variants[0].postType,book:variants[0].book,variants};});
}
export function textTokens(text:string){return text.toLowerCase().normalize('NFKC').replace(/https?:\/\/\S+/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/).filter(Boolean);}
export function tooSimilar(a:string,b:string){
 const x=textTokens(a),y=textTokens(b);if(x.length<5||y.length<5)return false;
 if(x.slice(0,7).join(' ')===y.slice(0,7).join(' '))return true;
 const grams=(tokens:string[])=>new Set(tokens.slice(0,-2).map((_,i)=>tokens.slice(i,i+3).join(' ')));
 const left=grams(x),right=grams(y),intersection=[...left].filter(t=>right.has(t)).length;
 return intersection/Math.max(1,left.size+right.size-intersection)>.55;
}
export function editedMetadata(post:CalendarPost,changes:{post_type:string;caption:string;title:string;creative_brief:string;book_slug:string}):Partial<ContentMetadata> {
 const family=FAMILIES.find(f=>FAMILY_POST_TYPES[f]===changes.post_type);
 const original=post.content_metadata as Partial<ContentMetadata>|undefined;
 if(!['planned_v2','edited_v2'].includes(original?.origin??'')&&changes.post_type===post.post_type)return {};
 // Never keep inferred visual/angle labels after a human rewrites the idea.
 return {version:2,origin:'edited_v2',...(family?{family}:{}),objective:family==='book_promotion'?'conversion':'discovery',book_specific:Boolean(changes.book_slug),includes_question:changes.caption.includes('?'),attribution:family==='original_quote'?'original_social_line':'none',...(changes.post_type===post.post_type&&changes.caption===post.caption&&changes.title===post.title&&changes.creative_brief===(post.creative_brief??'')&&changes.book_slug===post.book_slug?original:{})};
}

export function learnedPostingHours(report:LearningReport|null|undefined,platform:SocialPlatform,adaptive=true){return adaptive?(report?.platforms.find(p=>p.platform===platform)?.attributes??[]).filter(a=>a.attribute==='uk_hour'&&a.ready&&(a.discovery??0)>.1).sort((a,b)=>(b.discovery??0)-(a.discovery??0)).slice(0,2).map(a=>Number(a.value)).filter(n=>Number.isInteger(n)&&n>=0&&n<=23):[];}
