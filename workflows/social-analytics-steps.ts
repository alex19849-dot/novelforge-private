import {FatalError} from 'workflow';
import {jobAdmin} from '../lib/social-job-db';
import {queueAnalytics} from '../lib/social-analytics-server';
import {readPostMetricsBatch} from '../lib/social-analytics-provider';
import {buildLearningReport} from '../lib/social-learning';
import type {PerformancePost,MetricSnapshot} from '../lib/social-learning';
import {cleanStrategy} from '../lib/social-strategy';
async function active(owner:string,token:string){
 const db=jobAdmin(),{data,error}=await db.from('social_learning_state').select('collection_token').eq('user_id',owner).single();
 if(error)throw Error('Analytics progress could not be checked.');
 if(data.collection_token!==token)throw new FatalError('A newer analytics collection replaced this run.');
 return db;
}
export async function queueAnalyticsRefresh(owner:string){
 'use step';
 try{await queueAnalytics(owner);}catch{console.warn('Analytics will retry independently; publishing continues.');}
}
export async function prepareAnalytics(owner:string,token:string){
 'use step';
 const db=await active(owner,token);
 const settings=await db.from('social_publishing_settings').select('channels').eq('user_id',owner).maybeSingle();
 if(settings.error)throw Error('Analytics channels could not be checked.');
 const platforms=Object.keys(settings.data?.channels??{});
 if(!platforms.length)return [] as string[];
 const ids:string[]=[];
 for(let offset=0;offset<10000;offset+=250){
  const page=await db.from('social_publications').select('provider_post_id,content_snapshot').eq('user_id',owner).eq('state','published').gte('published_at',new Date(Date.now()-31*86400000).toISOString()).not('provider_post_id','is',null).order('post_id').range(offset,offset+249);
  if(page.error)throw Error('Published posts could not be loaded for analytics.');
  for(const post of page.data)if(platforms.includes(post.content_snapshot?.platform))ids.push(post.provider_post_id);
  if(page.data.length<250)return ids;
 }
 throw new FatalError('Analytics history exceeds the supported pagination window.');
}
export async function collectAnalyticsBatch(owner:string,token:string,ids:string[]){
 'use step';
 const db=await active(owner,token);
 const batch=await readPostMetricsBatch(ids);
 let usable=0;
 const {data:publications,error}=await db.from('social_publications').select('post_id,provider_post_id,published_at').eq('user_id',owner).eq('state','published').in('provider_post_id',ids);
 if(error)throw Error('Analytics ownership could not be checked.');
 for(const row of batch.posts){
  const publication=publications.find(p=>p.provider_post_id===row.id);
  const timestamp=Date.parse(row.metricsUpdatedAt??'');
  if(!publication||!Number.isFinite(timestamp)||timestamp<Date.parse(publication.published_at)||timestamp>Date.now()+300000||!Object.keys(row.metrics).length)continue;
  const {error}=await db.from('social_metric_snapshots').upsert({post_id:publication.post_id,user_id:owner,provider_updated_at:row.metricsUpdatedAt,metrics:row.metrics,source:'buffer_experimental'},{onConflict:'post_id,provider_updated_at',ignoreDuplicates:true});
  if(error)throw Error('Real analytics could not be saved.');
  usable++;
 }
 return {requested:ids.length,received:batch.posts.length,usable,issues:batch.issues};
}
export type AnalyticsCoverage={requested:number;received:number;usable:number;issues:{id:string;code:string}[]};
export async function finishAnalytics(owner:string,token:string,coverage?:AnalyticsCoverage){
 'use step';
 const db=await active(owner,token);
 const since=new Date(Date.now()-90*86400000).toISOString();
 const [history,preferences]=await Promise.all([
  db.from('social_publications').select('post_id,published_at,scheduled_at,content_snapshot').eq('user_id',owner).eq('state','published').gte('published_at',since).limit(1000),
  db.from('social_strategy_settings').select('settings').eq('user_id',owner).maybeSingle(),
 ]);
 const snapshots:MetricSnapshot[]=[];
 for(let offset=0;offset<12000;offset+=1000){const page=await db.from('social_metric_snapshots').select('post_id,provider_updated_at,metrics').eq('user_id',owner).gte('observed_at',since).order('observed_at',{ascending:false}).range(offset,offset+999);if(page.error)throw Error('Performance snapshots could not be loaded.');snapshots.push(...page.data as MetricSnapshot[]);if(page.data.length<1000)break;}
 if(history.error||preferences.error)throw Error('The learning evidence could not be loaded.');
 // Bound the history explicitly; never silently present a truncated baseline.
 if(history.data.length===1000||snapshots.length===12000)throw new FatalError('Analytics history needs pagination before this larger account can be scored.');
 const posts:PerformancePost[]=history.data.map(p=>({...p.content_snapshot,id:p.post_id,published_at:p.published_at,scheduled_at:p.scheduled_at}));
 const report=buildLearningReport(posts,snapshots,cleanStrategy(preferences.data?.settings));
 const available=report.snapshot_posts>0;
 const checkedAt=new Date().toISOString();
 const usable=coverage?.usable??(available?1:0),partial=Boolean(coverage?.issues.length);
 const message=partial?`Analytics partially refreshed: ${coverage!.received}/${coverage!.requested} posts retrieved, ${coverage!.usable} usable. Unavailable posts keep their previous measurements; missing data is not zero.`:usable?'':'Buffer has not supplied usable current post metrics yet. Historical results are retained.';
 const {error}=await db.from('social_learning_state').update({...(usable?{last_collected_at:checkedAt}:{}),next_collect_at:new Date(Date.now()+(partial?6:24)*3600000).toISOString(),collecting_until:null,status:usable?'ready':partial?'error':'unavailable',last_error:message,report,coverage:{...coverage,checked_at:checkedAt,complete:!partial}}).eq('user_id',owner).eq('collection_token',token);
 if(error)throw Error('The measured strategy could not be saved.');
}
export async function failAnalytics(owner:string,token:string){
 'use step';
 const {error}=await jobAdmin().from('social_learning_state').update({status:'error',collecting_until:null,next_collect_at:new Date(Date.now()+6*3600000).toISOString(),last_error:'Buffer analytics is unavailable or its permissions/schema changed. Publishing continues. Collection will retry; no missing results are invented.'}).eq('user_id',owner).eq('collection_token',token);
 if(error)throw Error('The analytics error could not be saved.');
}
