// Scoped maintenance: re-export at most two already-generated original-cover posters.
import OpenAI from 'openai';
import {createClient} from '@supabase/supabase-js';
import {completedImage} from '../lib/social-image-result.ts';
import {compositeOriginalCover,originalCoverBytes} from '../lib/social-cover-artwork.ts';
import {renderSocialMedia} from '../lib/social-render.ts';
const runId=process.env.SOCIAL_RECOVERY_RUN_ID;
if(!runId) throw new Error('Select the completed recovery job first.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:30000,maxRetries:0});
const {data:job,error:jobError}=await db.from('social_generation_runs').select('*').eq('id',runId).eq('job_type','media').eq('status','completed').single();
if(jobError||!job) throw new Error('Completed recovery job not found.');
const {data:tasks,error}=await db.from('social_generation_tasks').select('*').eq('run_id',runId).eq('user_id',job.user_id).eq('status','completed');
if(error||tasks.length<1||tasks.length>2) throw new Error('Framing repair is limited to the two recovered images.');
let repaired=0;
for(const task of tasks){
  if(task.request.asset_mode!=='original_cover_overlay'||task.result.framing_repaired) continue;
  const first=task.request.posts[0];
  if(first.planned_media_type!=='image') throw new Error('This repair accepts still posters only.');
  const book=job.config.books.find(b=>b.slug===first.book_slug);
  const response=await ai.responses.retrieve(task.response_id);
  const image=completedImage(response);
  if(!image?.result) throw new Error('The original generated image is unavailable.');
  const source=await compositeOriginalCover(Buffer.from(image.result,'base64'),await originalCoverBytes(book.coverUrl),first.platform==='tiktok');
  const poster=await renderSocialMedia(source,first.platform==='tiktok',false,'contain');
  const path=`${job.user_id}/calendar/${task.id}-full-frame.jpg`;
  const {error:uploadError}=await db.storage.from('social-media').upload(path,poster,{contentType:'image/jpeg',upsert:true});
  if(uploadError) throw new Error('The full-frame poster could not be uploaded.');
  const {data:saved,error:saveError}=await db.from('social_posts').update({media_path:path}).eq('user_id',job.user_id).eq('media_path',task.result.path).eq('status','draft').select('id');
  if(saveError) throw new Error('The full-frame poster could not be attached.');
  const {error:recordError}=await db.from('social_generation_tasks').update({result:{...task.result,path,framing_repaired:true,framing_saved:saved.length}}).eq('id',task.id).eq('user_id',job.user_id);
  if(recordError) throw new Error('The framing repair could not be recorded.');
  repaired++;
}
console.log('Re-exported '+repaired+' recovered posters without cropping. No new AI images requested.');
