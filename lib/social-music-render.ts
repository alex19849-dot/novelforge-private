import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SocialTrack } from './social-music';
const run=promisify(execFile);
export function socialTrackAudio(track: SocialTrack) {
  // Bundled, fixed licensed files; never fetch arbitrary audio URLs at publish time.
  return readFile(join(process.cwd(),'assets','social-music',track.file));
}
/** Attach a licensed track to an existing silent AI video without re-encoding its pictures. */
export async function soundtrackSocialVideo(source:Buffer,audio:Buffer):Promise<Buffer> {
  const directory=await mkdtemp(join(tmpdir(),'novelforge-music-'));
  try {
    const input=join(directory,'source.mp4'),track=join(directory,'music.m4a'),output=join(directory,'finished.mp4');
    await Promise.all([writeFile(input,source),writeFile(track,audio)]);
    const ffmpeg=join(process.cwd(),'node_modules','@ffmpeg-installer','linux-x64','ffmpeg');
    let description='';
    try { await run(ffmpeg,['-hide_banner','-i',input],{timeout:10000,maxBuffer:128*1024}); }
    catch(error) { description=String((error as {stderr?:string}).stderr??''); }
    if(/Stream #.*Audio:/.test(description)) throw new Error('This video already has audio. Its original soundtrack was kept.');
    const match=description.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    const duration=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):0;
    if(duration<=0||duration>60) throw new Error('Automatic backing music supports silent videos up to 60 seconds.');
    await run(ffmpeg,['-y','-i',input,'-stream_loop','-1','-i',track,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',`afade=t=in:st=0:d=0.35,afade=t=out:st=${Math.max(0,duration-0.6)}:d=0.6`,'-c:a','aac','-ar','48000','-b:a','120k','-t',String(duration),'-movflags','+faststart',output],{timeout:60000,maxBuffer:1024*1024});
    return await readFile(output);
  } finally { await rm(directory,{recursive:true,force:true}); }
}
