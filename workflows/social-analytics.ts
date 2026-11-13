import {prepareAnalytics,collectAnalyticsBatch,finishAnalytics,failAnalytics} from './social-analytics-steps';
export async function collectSocialAnalytics(owner:string,token:string){
 'use workflow';
 try{
  const ids=await prepareAnalytics(owner,token);
  const coverage={requested:0,received:0,usable:0,issues:[] as {id:string;code:string}[]};
  for(let index=0;index<ids.length;index+=20){
   const batch=ids.slice(index,index+20);
   try{
    const result=await collectAnalyticsBatch(owner,token,batch);
    coverage.requested+=result.requested;coverage.received+=result.received;coverage.usable+=result.usable;coverage.issues.push(...result.issues);
   }catch{
    coverage.requested+=batch.length;coverage.issues.push(...batch.map(id=>({id,code:'COLLECTION_ERROR'})));
   }
  }
  // A failing post/batch must never leave the entire report stuck on an old date.
  await finishAnalytics(owner,token,coverage);
 }catch{
  await failAnalytics(owner,token);
 }
}
