import {bufferEnvelope} from './buffer-publishing';
import {normaliseMetrics} from './social-learning';
export type ProviderMetrics={id:string;metricsUpdatedAt:string|null;metrics:Record<string,number>};
export type MetricIssue={id:string;code:string};
export type MetricBatch={posts:ProviderMetrics[];issues:MetricIssue[]};
export async function readPostMetricsBatch(ids:string[]):Promise<MetricBatch> {
 if(!ids.length)return {posts:[],issues:[]};
 if(ids.length>20||ids.some(id=>!id||id.length>150))throw Error('Invalid analytics batch.');
 const declarations=ids.map((_,i)=>`$id${i}:PostId!`).join(',');
 const selections=ids.map((_,i)=>`p${i}:post(input:{id:$id${i}}){id metricsUpdatedAt metrics{type value unit}}`).join('\n');
 try{
  const response=await bufferEnvelope<Record<string,{id:string;metricsUpdatedAt:string|null;metrics:unknown}|null>>(`query NovelForgePostMetrics(${declarations}){${selections}}`,Object.fromEntries(ids.map((id,i)=>['id'+i,id])));
  const posts:ProviderMetrics[]=[],issues:MetricIssue[]=[];
  const global=response.errors?.find(e=>!e.path?.length);
  for(let i=0;i<ids.length;i++){
   const row=response.data?.['p'+i];
   if(row?.id===ids[i])posts.push({id:row.id,metricsUpdatedAt:row.metricsUpdatedAt,metrics:normaliseMetrics(row.metrics)});
   else{
    const error=response.errors?.find(e=>e.path?.[0]==='p'+i)??global;
    issues.push({id:ids[i],code:error?.extensions?.code??'UNAVAILABLE'});
   }
  }
  // A non-null GraphQL resolver can erase its siblings. Split read-only
  // batches to isolate that post, but never fan out an account-wide auth error.
  if(!posts.length&&ids.length>1&&!response.errors?.some(e=>['UNAUTHORIZED','FORBIDDEN','RATE_LIMIT_EXCEEDED'].includes(e.extensions?.code??'')&&!e.path?.length)){
   const middle=Math.ceil(ids.length/2);
   const left=await readPostMetricsBatch(ids.slice(0,middle));
   const right=await readPostMetricsBatch(ids.slice(middle));
   return {posts:[...left.posts,...right.posts],issues:[...left.issues,...right.issues]};
  }
  return {posts,issues};
 }catch{
  return {posts:[],issues:ids.map(id=>({id,code:'TRANSPORT_ERROR'}))};
 }
}
export async function readPostMetrics(ids:string[]):Promise<ProviderMetrics[]>{return (await readPostMetricsBatch(ids)).posts;}
