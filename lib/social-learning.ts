import {BASE_WEIGHTS,FAMILIES,familyWeights} from './social-strategy';
import type {ContentMetadata,LearningReport,PlatformLearning,AttributeScore,StrategySettings} from './social-strategy';
import type {SocialPlatform} from './social-calendar';
export type MetricValue={type:string;value:number;unit:string;name?:string};
export type PerformancePost={id:string;platform:SocialPlatform;media_type:string|null;book_slug:string;published_at:string;scheduled_at:string;content_metadata?:Partial<ContentMetadata>;};
export type MetricSnapshot={post_id:string;provider_updated_at:string;metrics:Record<string,number>;};
export function normaliseMetrics(values:unknown):Record<string,number> {
 const result:Record<string,number>={};
 if(!Array.isArray(values))return result;
 for(const item of values as MetricValue[]){
  if(typeof item?.type!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(item.type)||typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0||!['count','percentage'].includes(item.unit)||item.unit==='percentage'&&item.value>100)continue;
  result[item.type]=item.value;
 }
 return result;
}
const HOUR=3600000;
export function maturityBucket(hours:number){return hours>=24&&hours<72?'1-3d':hours>=72&&hours<168?'3-7d':hours>=168&&hours<336?'7-14d':hours>=336&&hours<=744?'14-31d':null;}
function median(values:{value:number;weight:number}[]){
 const sorted=[...values].sort((a,b)=>a.value-b.value),total=sorted.reduce((s,v)=>s+v.weight,0);let cumulative=0;
 for(const item of sorted){cumulative+=item.weight;if(cumulative>=total/2)return item.value;}return 0;
}
const clamp=(v:number)=>Math.max(-Math.log(3),Math.min(Math.log(3),v));
type Observation={post:PerformancePost;snapshot:MetricSnapshot;bucket:string;weight:number;};
type Measured={post:PerformancePost;discovery:number|null;conversion:number|null;weight:number};
function relativeMetric(observation:Observation,peers:Observation[],metric:string,smoothing:number){
 const value=observation.snapshot.metrics[metric];if(value==null)return null;
 const comparisons=peers.filter(p=>p.snapshot.metrics[metric]!=null);
 if(new Set(comparisons.map(p=>p.post.id)).size<5)return null;
 const baseline=median(comparisons.map(p=>({value:p.snapshot.metrics[metric],weight:p.weight})));
 return clamp(Math.log((value+smoothing)/(baseline+smoothing)));
}
export function buildLearningReport(posts:PerformancePost[],snapshots:MetricSnapshot[],settings:StrategySettings,now=new Date()):LearningReport {
 const byId=new Map(posts.map(p=>[p.id,p]));
 const latest=new Map<string,Observation>(),available=new Set<string>();let newest=0;
 for(const snapshot of snapshots){
  const post=byId.get(snapshot.post_id);if(!post)continue;
  const published=Date.parse(post.published_at),asOf=Date.parse(snapshot.provider_updated_at);
  if(!Number.isFinite(published)||!Number.isFinite(asOf)||asOf>now.getTime()+300000||asOf<published||now.getTime()-published>90*24*HOUR)continue;
  if(Object.keys(snapshot.metrics).length){available.add(post.id);newest=Math.max(newest,asOf);}
  const bucket=maturityBucket((asOf-published)/HOUR);if(!bucket||!Object.keys(snapshot.metrics).length)continue;
  const key=post.id+':'+bucket,previous=latest.get(key);
  if(!previous||Date.parse(previous.snapshot.provider_updated_at)<asOf)latest.set(key,{post,snapshot,bucket,weight:Math.pow(.5,Math.max(0,(now.getTime()-published)/(30*24*HOUR)))});
 }
 const observations=[...latest.values()];
 const platforms:PlatformLearning[]=[];
 for(const platform of ['facebook','instagram','tiktok'] as SocialPlatform[]){
  const measured=new Map<string,Measured>();
  const current=observations.filter(p=>p.post.platform===platform).sort((a,b)=>Date.parse(a.snapshot.provider_updated_at)-Date.parse(b.snapshot.provider_updated_at));
  for(const item of current){
   const peers=current.filter(p=>p.post.id!==item.post.id&&p.bucket===item.bucket&&p.post.media_type===item.post.media_type);
   const pieces:{value:number;weight:number}[]=[];
   // Never compare different exposure metrics or different networks as raw counts.
   for(const metric of ['reach','views','impressions']){const score=relativeMetric(item,peers,metric,10);if(score!=null){pieces.push({value:score,weight:.65});break;}}
   const engagements:{value:number;weight:number}[]=[];
   for(const [metric,weight] of [['comments',3],['shares',3],['saves',2],['reactions',1]] as const){const score=relativeMetric(item,peers,metric,2);if(score!=null)engagements.push({value:score,weight});}
   if(engagements.length)pieces.push({value:engagements.reduce((s,e)=>s+e.value*e.weight,0)/engagements.reduce((s,e)=>s+e.weight,0),weight:.35});
   const discovery=pieces.length?pieces.reduce((s,p)=>s+p.value*p.weight,0)/pieces.reduce((s,p)=>s+p.weight,0):null;
   // API-reported post/link clicks are a click signal, never a purchase or royalty.
   let conversion:number|null=null;
   for(const metric of ['linkClicks','clicks']){conversion=relativeMetric(item,peers,metric,2);if(conversion!=null)break;}
   if(discovery!=null||conversion!=null)measured.set(item.post.id,{post:item.post,discovery,conversion,weight:item.weight});
  }
  const groups=new Map<string,{attribute:string;value:string;items:Measured[]}>();
  for(const item of measured.values()){
   const meta=item.post.content_metadata??{},attributes:[string,string][]=[['media',item.post.media_type??'text']];
   if(item.post.book_slug)attributes.push(['book',item.post.book_slug]);
   const date=new Date(item.post.scheduled_at);
   if(Number.isFinite(date.getTime()))attributes.push(['uk_hour',new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(date)]);
   if(['planned_v2','edited_v2'].includes(meta.origin??'')){
    if(meta.family)attributes.push(['family',meta.family]);
    if(meta.hook_type)attributes.push(['hook',meta.hook_type]);
    if(meta.visual_type)attributes.push(['visual',meta.visual_type]);
    if(meta.caption_style)attributes.push(['caption',meta.caption_style]);
    if(typeof meta.includes_question==='boolean')attributes.push(['question',String(meta.includes_question)]);
    if(typeof meta.includes_cover==='boolean')attributes.push(['cover',String(meta.includes_cover)]);
   }
   for(const [attribute,value] of attributes){const key=attribute+':'+value;const group=groups.get(key)??{attribute,value,items:[]};group.items.push(item);groups.set(key,group);}
  }
  const attributes:AttributeScore[]=[...groups.values()].map(group=>{
   const days=new Set(group.items.map(i=>i.post.published_at.slice(0,10))).size;
   const mean=(field:'discovery'|'conversion')=>{const rows=group.items.filter(i=>i[field]!=null);if(rows.length<5||new Set(rows.map(i=>i.post.published_at.slice(0,10))).size<3)return null;const value=rows.reduce((s,i)=>s+i[field]!*i.weight,0)/rows.reduce((s,i)=>s+i.weight,0);return value*rows.length/(rows.length+8);};
   return {attribute:group.attribute,value:group.value,discovery:mean('discovery'),conversion:mean('conversion'),posts:group.items.length,days,ready:measured.size>=12&&group.items.length>=5&&days>=3};
  });
  const winners=attributes.filter(a=>a.attribute==='family'&&a.ready&&a.discovery!=null).sort((a,b)=>b.discovery!-a.discovery!);
  const summary=winners.length?`Evidence is influencing future ${platform} batches. Patterns are associations, not proof of cause.`:`Collecting evidence: ${measured.size} comparable posts. No performance-led changes yet.`;
  const result:PlatformLearning={platform,eligible_posts:measured.size,attributes,weights:{...BASE_WEIGHTS},summary};
  result.weights=familyWeights(settings,result);platforms.push(result);
 }
 return {version:1,updated_at:now.toISOString(),source_updated_at:newest?new Date(newest).toISOString():null,snapshot_posts:available.size,platforms};
}
