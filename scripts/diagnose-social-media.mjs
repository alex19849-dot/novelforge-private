import OpenAI from 'openai';
import {createClient} from '@supabase/supabase-js';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:30000,maxRetries:0});
const runId=process.env.SOCIAL_DIAGNOSTIC_RUN_ID;
if(!runId) throw new Error('Set SOCIAL_DIAGNOSTIC_RUN_ID to the failed job to inspect.');
const {data:tasks,error}=await db.from('social_generation_tasks').select('id,response_id,result').eq('run_id',runId).eq('status','failed');
if(error) throw new Error('Diagnostic task lookup failed.');
let checked=0;
for(const task of tasks){
  const response=await ai.responses.retrieve(task.response_id);
  const diagnostic={status:response.status,error:response.error,incomplete_details:response.incomplete_details,output:response.output.map(item=>({type:item.type,status:item.status,error:item.error,hasImage:typeof item.result==='string'&&item.result.length>0,content:item.type==='message'?item.content.map(c=>({type:c.type,text:(c.text||c.refusal||'').slice(0,1600)})):undefined}))};
  const {error:saveError}=await db.from('social_generation_tasks').update({result:{...task.result,provider_diagnostic:diagnostic}}).eq('id',task.id).eq('status','failed');
  if(saveError) throw new Error('Diagnostic result could not be recorded.');
  checked++;
}
console.log('Saved provider diagnostics for '+checked+' failed media tasks. No new images requested.');
