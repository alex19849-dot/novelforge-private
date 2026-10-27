// Server-only provider operations. No credentials or provider requests enter the browser.
import type { CalendarPost } from './social-calendar';
import type { BufferChannel } from './buffer';
export class BufferPublishError extends Error {
  kind:'retry'|'rejected'|'unknown';
  retryAfter:number;
  constructor(message:string,kind:'retry'|'rejected'|'unknown',retryAfter=300){super(message);this.kind=kind;this.retryAfter=retryAfter;}
}
export type ProviderPost={id:string;status:string;channelId:string;text:string;createdAt:string;sentAt?:string;externalLink?:string;via?:string;assets:{source:string;mimeType:string}[];error?:{message:string;supportUrl?:string}};
const fields='id status channelId text createdAt sentAt externalLink via assets { source mimeType } error { message supportUrl }';
export async function bufferRequest<T>(document:string,variables:unknown={},mutating=false):Promise<T> {
  const key=process.env.BUFFER_API_KEY?.trim();
  if(!key) throw new BufferPublishError('BUFFER_API_KEY is missing from this deployment.','rejected');
  let response:Response;
  try {response=await fetch('https://api.buffer.com',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:document,variables}),cache:'no-store',signal:AbortSignal.timeout(20000)});}
  catch {throw new BufferPublishError(mutating?'Buffer did not confirm this request. Checking its history before doing anything else.':'Buffer could not be reached. Retrying automatically.',mutating?'unknown':'retry');}
  if(response.status===429) throw new BufferPublishError('Buffer rate-limited the request. Retrying automatically.','retry',Math.max(60,Math.min(3600,Number(response.headers.get('retry-after'))||300)));
  if([400,401,403,422].includes(response.status)) throw new BufferPublishError('Buffer rejected this request. Check the connection and API permissions.','rejected');
  if(!response.ok) throw new BufferPublishError('Buffer is temporarily unavailable.',mutating?'unknown':'retry');
  let result:{data?:T;errors?:unknown[]};
  try {result=await response.json();}catch{throw new BufferPublishError('Buffer returned an unreadable response.',mutating?'unknown':'retry');}
  if(result.errors?.length||!result.data) throw new BufferPublishError('Buffer could not confirm the operation. Check API permissions and the saved publishing error.',mutating?'unknown':'retry');
  return result.data;
}
export function chooseMarlowChannels(channels:BufferChannel[],allowUnhealthy=false) {
  const selected:Record<string,BufferChannel>={};
  for(const platform of ['facebook','instagram','tiktok']) {
    const expected=platform==='instagram'?'marlowquinnauthor':'marlowquinn';
    const candidates=channels.filter(channel=>channel.service===platform&&channel.name.toLowerCase().replace(/[^a-z0-9]/g,'')===expected);
    if(candidates.length!==1) throw new Error(`Choose one unambiguous Marlow Quinn ${platform} connection in Buffer.`);
    const channel=candidates[0];
    if(!allowUnhealthy&&(channel.isDisconnected||channel.isLocked||channel.isQueuePaused)) throw new Error(`The ${platform} connection needs attention in Buffer (disconnected, locked or paused).`);
    selected[platform]=channel;
  }
  return selected;
}
export function bufferPayload(post:CalendarPost,channel:BufferChannel,storageUrl:string) {
  const text=[post.caption.trim(),post.hashtags.join(' ').trim()].filter(Boolean).join('\n\n');
  if(!text||text.length>(post.platform==='facebook'?10000:2200)) throw new Error(`${post.platform} caption and hashtags exceed its publishing limit.`);
  if(post.platform!=='facebook'&&!post.media_path) throw new Error(`${post.platform} needs media before publishing.`);
  if(post.media_path&&!post.media_path.startsWith(`${post.user_id}/calendar/`)) throw new Error('The attached media does not belong to this calendar.');
  const assets=post.media_path?[post.media_type==='video'?{video:{url:storageUrl,metadata:{thumbnailOffset:1000}}}:{image:{url:storageUrl}}]:[];
  const generated=Boolean(post.generation_run_id);
  const metadata=post.platform==='instagram'?{instagram:{type:post.media_type==='video'?'reel':'post',shouldShareToFeed:true,isAiGenerated:generated}}:post.platform==='tiktok'?{tiktok:post.media_type==='video'?{isAiGenerated:generated}:{title:post.title}}:{facebook:{type:'post'}};
  return {channelId:channel.id,text,assets,metadata,mode:'shareNow',schedulingType:'automatic',needsApproval:false,saveToDraft:false,aiAssisted:generated,source:`novelforge:${post.id}`};
}
export async function createBufferPost(input:Record<string,unknown>):Promise<ProviderPost> {
  const {createPost}=await bufferRequest<{createPost:{__typename:string;post?:ProviderPost;message?:string}}>(`mutation NovelForgeCreatePost($input:CreatePostInput!){ createPost(input:$input){__typename ... on PostActionSuccess {post{${fields}}} ... on MutationError {message}}}`,{input},true);
  if(!createPost.post) throw new BufferPublishError((createPost.message||'Buffer rejected the post.').slice(0,1000),'rejected');
  return createPost.post;
}
export async function readBufferPost(id:string):Promise<ProviderPost> {
  const result=await bufferRequest<{post:ProviderPost}>(`query NovelForgePost($id:PostId!){post(input:{id:$id}){${fields}}}`,{id});
  return result.post;
}
export async function deleteBufferDraft(id:string) {
  const {deletePost}=await bufferRequest<{deletePost:{__typename:string;message?:string}}>('mutation NovelForgeDeleteDraft($id:PostId!){deletePost(input:{id:$id}){__typename ... on MutationError {message}}}',{id},true);
  if(deletePost.message||/Error$/.test(deletePost.__typename)) throw new Error(deletePost.message||'The test draft could not be removed.');
}
export async function recentBufferPosts(organizationId:string,channelId:string,since:string):Promise<ProviderPost[]> {
  const {posts}=await bufferRequest<{posts:{edges:{node:ProviderPost}[];pageInfo:{hasNextPage:boolean}}}>(`query NovelForgeReconcile($input:PostsInput!){posts(input:$input,first:100){edges{node{${fields}}}pageInfo{hasNextPage}}}`,{input:{organizationId,filter:{channelIds:[channelId],createdAt:{start:since}},sort:[{field:'createdAt',direction:'desc'}]}});
  if(posts.pageInfo.hasNextPage) throw new Error('Buffer returned too many possible matches. Check publishing history before retrying.');
  return posts.edges.map(edge=>edge.node);
}
export function matchingBufferPosts(posts:ProviderPost[],payload:any,since:string) {
  const sources=(payload.assets??[]).map(asset=>(asset.video??asset.image)?.url).sort();
  return posts.filter(post=>post.channelId===payload.channelId&&post.text===payload.text&&post.via==='api'&&post.status!=='draft'&&Date.parse(post.createdAt)>=Date.parse(since)&&JSON.stringify((post.assets??[]).map(asset=>asset.source).sort())===JSON.stringify(sources));
}
