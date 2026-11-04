import {checkBufferConnection} from '../../../../lib/buffer';
import {chooseMarlowChannels,bufferPayload,createBufferPost,deleteBufferDraft} from '../../../../lib/buffer-publishing';
import {youtubeCopy} from '../../../../lib/social-youtube';
import type {CalendarPost} from '../../../../lib/social-calendar';
import {jobUser,jobJson,jobAdmin} from '../../../../lib/social-job-server';
import {publishingOwner,enablePublisher,wakePublisher} from '../../../../lib/social-publishing-server';
export const runtime='nodejs';
export const maxDuration=60;
async function user(request:Request) {
  const account=await jobUser(request);
  return account&&publishingOwner(account.id)?account:null;
}
export async function GET(request:Request) {
  const account=await user(request);if(!account) return jobJson({error:'Sign in with the Social Studio owner account.'},401);
  try {
    const db=jobAdmin();
    const [settings,publications]=await Promise.all([
      db.from('social_publishing_settings').select('enabled,channels,preflight_at,heartbeat_at,last_error').eq('user_id',account.id).maybeSingle(),
      db.from('social_publications').select('post_id,state,attempt,poll_count,provider_post_id,external_link,next_check_at,published_at,last_error,safe_to_retry,updated_at').eq('user_id',account.id).order('updated_at',{ascending:false}).limit(300),
    ]);
    if(settings.error||publications.error) throw new Error('The automatic publisher is being set up. Refresh shortly.');
    return jobJson({settings:settings.data,publications:publications.data});
  }catch(error){return jobJson({error:error instanceof Error?error.message:'Publishing status could not be loaded.'},503);}
}
export async function POST(request:Request) {
  const account=await user(request);if(!account) return jobJson({error:'Sign in with the Social Studio owner account.'},401);
  try {
    const body=await request.json(),db=jobAdmin();
    if(body.action==='youtube') {
      const channels=chooseMarlowChannels((await checkBufferConnection()).channels);
      const {data:videos,error:videoError}=await db.from('social_posts').select('*').eq('user_id',account.id).eq('platform','tiktok').eq('status','approved').gt('scheduled_at',new Date(Date.now()+3600000).toISOString()).eq('media_type','video').order('scheduled_at').limit(60);
      if(videoError||!videos?.length)throw Error('No future approved TikTok videos are available to prepare for YouTube.');
      const copies=(videos as CalendarPost[]).map(youtubeCopy).filter(post=>Date.parse(post.scheduled_at)>Date.now()+3600000);
      if(!copies.length)throw Error('No future YouTube times are available.');
      const sample={...videos[0],...copies[0]} as CalendarPost;
      const url=db.storage.from('social-media').getPublicUrl(sample.media_path!).data.publicUrl;
      const draft=await createBufferPost({...bufferPayload(sample,channels.youtube,url),saveToDraft:true,mode:'addToQueue',source:'novelforge:youtube-preflight'});
      if(draft.status!=='draft')throw Error('Buffer did not confirm a safe test draft. Check Buffer before continuing.');
      await deleteBufferDraft(draft.id);
      // Keep existing post approvals and media; YouTube copies are reviewed drafts.
      const {error:copyError}=await db.from('social_posts').upsert(copies,{onConflict:'user_id,campaign_id,platform',ignoreDuplicates:true});
      if(copyError)throw Error('YouTube drafts could not be saved. Existing publishing is unchanged.');
      const {error:pauseError}=await db.from('social_publishing_settings').update({enabled:false}).eq('user_id',account.id);
      if(pauseError)throw Error('Publishing could not be paused for the channel switch.');
      const {error:manualError}=await db.from('social_posts').update({status:'draft'}).eq('user_id',account.id).eq('platform','instagram').eq('status','approved').gt('scheduled_at',new Date().toISOString());
      if(manualError)throw Error('Instagram could not be moved to manual drafts. Publishing is paused.');
      return jobJson({ok:true,prepared:copies.length,runId:await enablePublisher(account.id,['facebook','tiktok','youtube'])});
    }
    if(body.action==='enable') return jobJson({ok:true,runId:await enablePublisher(account.id)});
    if(body.action==='pause') {
      const {error}=await db.from('social_publishing_settings').update({enabled:false,last_error:'',updated_at:new Date().toISOString()}).eq('user_id',account.id);
      if(error) throw new Error('Publishing could not be paused.');
      return jobJson({ok:true});
    }
    if(body.action==='wake'||body.action==='check') {
      if(body.action==='check') {
        const {data,error}=await db.from('social_publications').select('post_id,provider_post_id').eq('user_id',account.id).eq('state','attention');
        if(error) throw new Error('Publishing history could not be checked.');
        for(const item of data) {
          const {error}=await db.from('social_publications').update({state:item.provider_post_id?'accepted':'uncertain',poll_count:0,next_check_at:new Date().toISOString()}).eq('post_id',item.post_id).eq('user_id',account.id).eq('state','attention');
          if(error) throw new Error('This status check could not be queued.');
        }
      }
      await wakePublisher(account.id);return jobJson({ok:true});
    }
    if(body.action==='draft'&&typeof body.postId==='string') {
      const {data:publication,error}=await db.from('social_publications').select('*').eq('post_id',body.postId).eq('user_id',account.id).maybeSingle();
      if(error||publication&&(!publication.safe_to_retry||publication.provider_post_id||publication.state!=='failed')) throw new Error('Check this post in Buffer first. Its publication outcome is not safe to retry.');
      const {data:saved,error:saveError}=await db.from('social_posts').update({status:'draft'}).eq('id',body.postId).eq('user_id',account.id).eq('status','failed').select('id');
      if(saveError||!saved.length) throw new Error('This post is no longer a failed draft. Refresh first.');
      if(publication) {
        const {error}=await db.from('social_publications').delete().eq('post_id',body.postId).eq('user_id',account.id).eq('state','failed').is('provider_post_id',null);
        if(error) throw new Error('The old failure could not be cleared.');
      }
      return jobJson({ok:true});
    }
    return jobJson({error:'Choose a valid publishing action.'},400);
  }catch(error){return jobJson({error:error instanceof Error?error.message:'Publishing could not be updated.'},503);}
}

