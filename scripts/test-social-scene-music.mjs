import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SOCIAL_TRACKS, SCENE_MOODS, inferSceneMusicMood, chooseSceneTrack, musicForPath } from '../lib/social-music.ts';
const manifest = JSON.parse(await readFile('assets/social-music/manifest.json','utf8'));
assert.equal(SOCIAL_TRACKS.filter(t => !t.legacy).length,14);
for (const mood of SCENE_MOODS) {
  const pool=SOCIAL_TRACKS.filter(t => !t.legacy && t.mood===mood.id), history=[];
  assert.ok(pool.length>=3);
  for(let i=0;i<pool.length;i++) {
    const chosen=chooseSceneTrack(mood.id,'same-campaign',history);
    assert.ok(!history.includes(chosen.id),'No reuse until this mood is exhausted');
    history.unshift(chosen.id);
  }
  assert.notEqual(chooseSceneTrack(mood.id,'same-campaign',history).id,history[0]);
  const excluded=[];
  for(let i=0;i<pool.length*2;i++) {
    const chosen=chooseSceneTrack(mood.id,'preview',[],excluded);
    assert.notEqual(chosen.id,excluded.at(-1),'Change track always changes the previous choice');
    excluded.push(chosen.id);
  }
  assert.equal(chooseSceneTrack(mood.id,'stable').id,chooseSceneTrack(mood.id,'stable').id);
}
assert.equal(inferSceneMusicMood({slides:[{text:'He leans in, lips brushing mine in a breathless kiss.'}]}),'sensual');
assert.equal(inferSceneMusicMood({slides:[{text:'My rival knows my secret. The risk is too great.'}]}),'tension');
assert.equal(inferSceneMusicMood({slides:[{text:'We flirt and laugh, his grin giving him away.'}]}),'playful');
assert.equal(inferSceneMusicMood({slides:[{text:'I finally tell him how much he means to me.'}]}),'romantic');
for (const t of SOCIAL_TRACKS) {
  const bytes=await readFile('assets/social-music/'+t.file), stored=manifest.tracks.find(x=>x.id===t.id);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),stored.sha256,'Bundled audio matches provenance: '+t.id);
  assert.equal(musicForPath('account/video-music-v1-'+t.id+'.mp4')?.id,t.id);
  let info='';
  try {execFileSync('node_modules/@ffmpeg-installer/linux-x64/ffmpeg',['-hide_banner','-i','assets/social-music/'+t.file],{stdio:'pipe'});} catch(e){info=e.stderr.toString();}
  assert.match(info,/Audio: aac/);
  if(!t.legacy) assert.match(info,/Duration: 00:00:40\./,'New excerpt covers the full three-slide video without a short loop');
}
console.log('PASS: 14 licensed scene tracks, four moods, deterministic selection, owner-history rotation rules, change-track cycling, real 40-second AAC assets and provenance hashes, legacy export compatibility.');
