// Run once inside Vercel after a tested publisher deployment is READY.
// Provider tests are drafts with a future fallback date, always deleted before enabling.
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {start} from 'workflow/api';
import {checkBufferConnection} from '../lib/buffer.ts';
import {chooseMarlowChannels,bufferPayload,createBufferPost,readBufferPost,deleteBufferDraft,recentBufferPosts} from '../lib/buffer-publishing.ts';
const owner=process.env.SOCIAL_STUDIO_OWNER_ID;
const deploymentId=process.env.SOCIAL_PUBLISHING_DEPLOYMENT_ID;
if(!owner||!deploymentId) throw new Error('Select the configured Social Studio owner and tested deployment.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const channels=chooseMarlowChannels((await checkBufferConnection()).channels);
const {data:old,error:oldError}=await db.from('social_publishing_settings').select('*').eq('user_id',owner).maybeSingle();
if(oldError) throw new Error('The publishing configuration could not be read.');
if(old?.enabled) {console.log('Automatic publishing is already enabled. No test posts were created.');process.exit(0);}
let tests=[...(old?.test_drafts??[])];
for(const id of tests) await deleteBufferDraft(id);
tests=[];
const saveTests=async()=>{const {error}=await db.from('social_publishing_settings').update({test_drafts:tests}).eq('user_id',owner);if(error)throw new Error('Test-draft cleanup progress could not be saved.');};
const {error:settingsError}=await db.from('social_publishing_settings').upsert({user_id:owner,enabled:false,channels,connection_checked_at:new Date().toISOString(),test_drafts:[],last_error:''},{onConflict:'user_id'});
if(settingsError) throw new Error('Publishing settings could not be saved.');
const {data:posts,error}=await db.from('social_posts').select('*').eq('user_id',owner).eq('status','approved').gt('scheduled_at',new Date().toISOString()).order('scheduled_at');
if(error||!posts.length) throw new Error('No approved future posts were available for the connection test.');
// Existing independently scheduled copies must not be published a second time.
for(const platform of ['facebook','instagram','tiktok']) {
 const channel=channels[platform];
 const recent=await recentBufferPosts(channel.organizationId,channel.id,new Date(Date.now()-30*86400_000).toISOString());
 const active=recent.filter(post=>['scheduled','sending'].includes(post.status));
 for(const post of posts.filter(post=>post.platform===platform)) {
  const url=post.media_path?db.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl:'';
  const payload=bufferPayload(post,channel,url);
  if(active.some(other=>other.text?.replace(/\s+/g,' ').trim()===payload.text.replace(/\s+/g,' ').trim())) throw new Error(`A matching ${platform} post is already scheduled in Buffer. Resolve that copy before enabling.`);
 }
 console.log(JSON.stringify({platform,channel:channel.name,existingBufferScheduled:active.length}));
}
const samples=[];
for(const platform of ['facebook','instagram','tiktok']) {
 const kinds=platform==='facebook'?[null,'image','video']:platform==='instagram'?['image','video']:['video'];
 for(const type of kinds) {const post=posts.find(post=>post.platform===platform&&post.media_type===type);if(post)samples.push(post);}
}
try {
 for(const post of samples) {
  const url=post.media_path?db.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl:'';
  const input={...bufferPayload(post,channels[post.platform],url),text:'NovelForge connection test. Private draft only, do not publish.',mode:'customScheduled',dueAt:new Date(Date.now()+7*86400_000).toISOString(),saveToDraft:true};
  const created=await createBufferPost(input);tests.push(created.id);await saveTests();
  try {
   if(created.status!=='draft'||(await readBufferPost(created.id)).status!=='draft') throw new Error('Buffer did not save the connection test as a draft. Publishing remains off.');
   console.log(JSON.stringify({platform:post.platform,format:post.media_type??'text',draftWriteAndRead:'passed'}));
  } finally {await deleteBufferDraft(created.id);tests=tests.filter(id=>id!==created.id);await saveTests();}
 }
}catch(error){await db.from('social_publishing_settings').update({enabled:false,last_error:error.message}).eq('user_id',owner);throw error;}
if(tests.length) throw new Error('Test drafts still need cleanup. Publishing remains off.');
const {error:passedError}=await db.from('social_publishing_settings').update({preflight_at:new Date().toISOString(),last_error:''}).eq('user_id',owner);
if(passedError) throw new Error('The connection test result could not be saved.');
if(process.env.SOCIAL_PUBLISHING_ENABLE!=='1') {console.log('Buffer tests passed. Publishing remains off.');process.exit(0);}
const lease=crypto.randomUUID();
const {error:enableError}=await db.from('social_publishing_settings').update({enabled:true,lease,generation:0,workflow_run_id:null,heartbeat_at:null}).eq('user_id',owner);
if(enableError) throw new Error('Publishing could not be enabled.');
try {
 const manifest=JSON.parse(await readFile('.next/diagnostics/workflows-manifest.json','utf8'));
 const reference=manifest.workflows['workflows/social-publishing.ts']?.publishSocialCalendar;
 if(!reference?.workflowId) throw new Error('The publisher workflow is missing from the tested build.');
 const run=await start({workflowId:reference.workflowId},[owner,lease,0],{deploymentId});
 const {error}=await db.from('social_publishing_settings').update({workflow_run_id:run.runId}).eq('user_id',owner).eq('lease',lease);
 if(error) throw new Error('The publisher reference could not be saved.');
 console.log(JSON.stringify({enabled:true,approvedFuturePosts:posts.length,workflowRunId:run.runId,channels:Object.fromEntries(Object.entries(channels).map(([platform,channel])=>[platform,channel.name])),testDraftsRemaining:0}));
}catch(error){await db.from('social_publishing_settings').update({enabled:false,last_error:error.message}).eq('user_id',owner).eq('lease',lease);throw error;}
