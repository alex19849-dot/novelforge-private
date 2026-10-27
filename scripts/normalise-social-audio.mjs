// Scoped compatibility pass for our own soundtrack exports; never publishes.
import {createClient} from '@supabase/supabase-js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {socialTrackAudio} from '../lib/social-music-render.ts';
import {musicForPath} from '../lib/social-music.ts';
const owner=process.env.SOCIAL_MUSIC_OWNER_ID;
if(!owner) throw new Error('Select the owner first.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:posts,error}=await db.from('social_posts').select('*').eq('user_id',owner).eq('platform','tiktok').in('status',['draft','approved']).gt('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(180);
if(error) throw new Error('Soundtracked posts could not be loaded.');
const execute=promisify(execFile),ffmpeg=join(process.cwd(),'node_modules','@ffmpeg-installer','linux-x64','ffmpeg');
let checked=0,normalised=0;
for(const post of posts) {
 if(!post.media_path?.startsWith(`${owner}/calendar/music/`)||!musicForPath(post.media_path)) continue;
 const directory=await mkdtemp(join(tmpdir(),'social-audio-compat-'));
 try {
  const {data:source,error}=await db.storage.from('social-media').download(post.media_path);
  if(error||!source||source.size>50*1024*1024) throw new Error('The soundtrack export could not be loaded.');
  const input=join(directory,'input.mp4'),output=join(directory,'output.mp4');
  await writeFile(input,Buffer.from(await source.arrayBuffer()));
  let info='';try {await execute(ffmpeg,['-hide_banner','-i',input],{timeout:10000,maxBuffer:128*1024});}catch(error){info=String(error.stderr??'');}
  checked++;
  if(/Audio: aac.*48000 Hz/.test(info)) continue;
  if(!/Audio: aac/.test(info)) throw new Error('The expected licensed soundtrack is missing.');
  const track=join(directory,'track.m4a');await writeFile(track,await socialTrackAudio(musicForPath(post.media_path)));
  const match=info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):0;
  if(duration<=0||duration>60) throw new Error('The video duration could not be checked.');
  await execute(ffmpeg,['-y','-i',input,'-stream_loop','-1','-i',track,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',`afade=t=in:st=0:d=0.35,afade=t=out:st=${Math.max(0,duration-0.6)}:d=0.6`,'-t',String(duration),'-c:a','aac','-ar','48000','-b:a','120k','-movflags','+faststart',output],{timeout:60000,maxBuffer:1024*1024});
  const name=post.media_path.split('/').at(-1),path=`${owner}/calendar/music/compat48/${name}`;
  const {error:uploadError}=await db.storage.from('social-media').upload(path,await readFile(output),{contentType:'video/mp4',upsert:false});
  if(uploadError&&String(uploadError.statusCode)!=='409') throw new Error('The compatible export could not be uploaded.');
  const {data:saved,error:saveError}=await db.from('social_posts').update({media_path:path}).eq('id',post.id).eq('user_id',owner).eq('version',post.version).eq('media_path',post.media_path).in('status',['draft','approved']).select('id');
  if(saveError) throw new Error('The compatible export could not be attached.');
  normalised+=saved.length;
 } finally {await rm(directory,{recursive:true,force:true});}
}
console.log(JSON.stringify({checked,normalised,audio:'AAC stereo, 48 kHz, 120 kbps',message:'Video pictures and posting content retained. Nothing published.'}));
