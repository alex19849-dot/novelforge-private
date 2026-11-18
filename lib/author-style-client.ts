import { supabase } from './supabaseClient';
import { changedStylePassage } from './author-style';
export async function recordStyleCorrection(input:{storyId:string;chapterId:string;before:string;after:string;instruction?:string},onError:(message:string)=>void) {
  const changed=changedStylePassage(input.before,input.after);if(!changed)return;
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)return;
    const response=await fetch('/api/story-chat/style',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'record',storyId:input.storyId,chapterId:input.chapterId,before:changed.before,after:changed.after,instruction:(input.instruction??'').slice(0,2000)})});
    const data=await response.json();if(!response.ok)throw new Error(data.error??'The style example could not be saved.');if(data.notice)onError(data.notice);
  }catch(e){onError(e instanceof Error?e.message:'The edit is saved, but its style example could not be recorded.');}
}
