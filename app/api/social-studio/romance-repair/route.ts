import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { jobAdmin } from '../../../../lib/social-job-db';
import concepts from '../../../../content-revisions/2026-11-04-romance/concepts.json';

export const runtime='nodejs';
export const maxDuration=300;
const digest='1220fe1b3be4d54b4fdfc3ff98184bb9bc14aee17125499c4a7f2e153b0fa6be';
const expires=1793814340789;
const owner='c8fcb780-183a-4301-ab38-051a5ec7755f';
const style='One portrait cinematic background plate for a Marlow Quinn adult MM romance promotion. Preserve the established black, charcoal, silver-white and electric magenta romance campaign. Rich photographic textures, sensuous cinematic lighting, tension expressed through closeness of objects and atmospheric setting. The main objects occupy the lower middle 45 percent; leave the upper 35 percent naturally dark for later typography and the bottom 15 percent dark. NO PEOPLE whatsoever: no figures, faces, bodies, hands, silhouettes, statues, human reflections or people in photographs. No text, letters, numbers, logos, book covers, mockups, generic corporate slides or business presentation layouts. This is an evocative book-specific romantic film still, not a product advert.';
export async function POST(req:Request){
  if(Date.now()>expires)return new Response('Maintenance complete',{status:410});
  const token=req.headers.get('x-content-token')??'';
  if(token.length!==64||createHash('sha256').update(token).digest('hex')!==digest)return new Response('Unauthorized',{status:401});
  const input=await req.json().catch(()=>null);
  const slug=input?.slug;
  if(typeof slug!=='string'||!Object.hasOwn(concepts,slug))return new Response('Unknown asset',{status:400});
  const concept=concepts[slug as keyof typeof concepts];
  const key=createHash('sha256').update(style+concept).digest('hex').slice(0,16);
  const directory=`${owner}/calendar/romance-v3/backgrounds`;
  const file=`${slug}-${key}.jpg`,path=`${directory}/${file}`;
  const db=jobAdmin();
  const {data:existing,error:listError}=await db.storage.from('social-media').list(directory,{search:file,limit:1});
  if(listError)return new Response('Storage check failed',{status:503});
  if(existing.some(f=>f.name===file))return Response.json({path,cached:true});
  // An immutable claim prevents double paid submissions, including after a timeout.
  const claim=await db.storage.from('social-media').upload(`${directory}/${key}.claim.json`,Buffer.from(JSON.stringify({slug,requested_at:new Date().toISOString()})),{contentType:'application/json',upsert:false});
  if(claim.error)return new Response('This asset has already been requested. Inspect it before retrying.',{status:409});
  try{
    const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:240000,maxRetries:0});
    const image=await ai.images.generate({model:'gpt-image-2',prompt:style+' '+concept,size:'1024x1536',quality:'medium',output_format:'jpeg'});
    const encoded=image.data?.[0]?.b64_json;
    if(!encoded)return new Response('No image returned. Do not automatically resubmit.',{status:502});
    const bytes=Buffer.from(encoded,'base64');
    const saved=await db.storage.from('social-media').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
    if(saved.error)return new Response('Image completed but storage failed. Inspect before retrying.',{status:503});
    return Response.json({path,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
  }catch(error){
    return Response.json({error:'Generation could not be confirmed. Inspect before retrying.',status:error instanceof OpenAI.APIError?error.status:0},{status:502});
  }
}
