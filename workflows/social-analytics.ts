import {prepareAnalytics,collectAnalyticsBatch,finishAnalytics,failAnalytics} from './social-analytics-steps';
export async function collectSocialAnalytics(owner:string,token:string){
 'use workflow';
 try{
  const ids=await prepareAnalytics(owner,token);
  for(let index=0;index<ids.length;index+=20)await collectAnalyticsBatch(owner,token,ids.slice(index,index+20));
  await finishAnalytics(owner,token);
 }catch{
  await failAnalytics(owner,token);
 }
}
