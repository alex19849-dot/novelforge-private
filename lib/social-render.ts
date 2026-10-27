import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run=promisify(execFile);
/** Server-side equivalents of the existing feed/portrait export sizes. */
export async function renderSocialMedia(source:Buffer,portrait:boolean,video:boolean,fit:'cover'|'contain'='cover',audio?:Buffer):Promise<Buffer> {
  const width=1080,height=portrait?1920:1350;
  const poster=await sharp(source).resize(width,height,{fit,position:'centre',background:'#07090d'}).jpeg({quality:92}).toBuffer();
  if(!video) return poster;
  const directory=await mkdtemp(join(tmpdir(),'novelforge-social-'));
  try {
    const image=join(directory,'poster.jpg'),output=join(directory,'video.mp4');
    await writeFile(image,poster);
    const ffmpeg=join(process.cwd(),'node_modules','@ffmpeg-installer','linux-x64','ffmpeg');
    // A subtle slow push keeps all approved artwork legible, with a clean loop.
    const audioInput=join(directory,'music.m4a');
    if(audio) await writeFile(audioInput,audio);
    await run(ffmpeg,['-y','-loop','1','-i',image,...(audio?['-stream_loop','-1','-i',audioInput]:[]),'-vf',`scale=2160:${height*2},zoompan=z='1+0.025*sin(PI*on/239)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=240:s=${width}x${height}:fps=30`,'-t','8','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p',...(audio?['-map','0:v:0','-map','1:a:0','-af','afade=t=in:st=0:d=0.35,afade=t=out:st=7.4:d=0.6','-c:a','aac','-ar','48000','-b:a','120k']:[]),'-movflags','+faststart','-threads','2',output],{timeout:180000,maxBuffer:1024*1024});
    return await readFile(output);
  } finally { await rm(directory,{recursive:true,force:true}); }
}
