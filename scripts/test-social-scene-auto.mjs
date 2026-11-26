import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
registerHooks({resolve(s,c,n){
  if(s==='server-only') return {url:'data:text/javascript,export{}',shortCircuit:true};
  if(s.endsWith('/social-job-db'))return {url:'data:text/javascript,export function jobAdmin(){return globalThis.sceneSourceDb}',shortCircuit:true};
  if(s.startsWith('.')&&c.parentURL&&existsSync(fileURLToPath(new URL(s+'.ts',c.parentURL))))return n(s+'.ts',c);
  return n(s,c);
}});
const {loadSceneStory,sceneStoryMatches}=await import('../lib/social-scene-source.ts');
const {nextSceneDirection,scenePlanRepeats,SCENE_STYLES}=await import('../lib/social-scene-design.ts');
const {composeSceneFrame,composeSceneCover,sceneText}=await import('../lib/social-scene-render.ts');
const rows=[{id:'empty',user_id:'owner',title:'Holiday Hookup',form:{characters:['An old incomplete draft']},chapters:[]},
{id:'story',user_id:'owner',title:'Holiday Hookup',form:{premise:'Travis and Cody find romance in a shared cabin.',characters:['Travis, 29, dark hair, muscular.','Cody, 26, sandy-blond, athletic.']},chapters:Array.from({length:10},(_,i)=>({id:'chapter-'+i,number:i+1,title:i===9?'Epilogue':'Chapter '+(i+1),content:('Chapter '+(i+1)+': Travis looks at Cody across the cabin. '.repeat(15)).repeat(2)}))},
{id:'foreign',user_id:'someone-else',title:'Holiday Hookup',form:{characters:['PRIVATE OTHER ACCOUNT']},chapters:[]}];
const queries=[];
class Q {
 constructor(){this.filters=[];}
 select(){return this;} eq(k,v){this.filters.push([k,v]);return this;} order(){return this;} limit(){return this;}
 async execute(single){queries.push(this.filters);const result=rows.filter(r=>this.filters.every(([k,v])=>r[k]===v));return {data:single?result[0]:result,error:null};}
 maybeSingle(){return this.execute(true);}then(a,b){return this.execute(false).then(a,b);}
}
globalThis.sceneSourceDb={from(table){assert.equal(table,'stories');return new Q();}};
const book={slug:'holiday-hookup',title:'Holiday Hookup',kindleUnlimited:true};
assert.ok(sceneStoryMatches('HOLIDAY HOOKUP',book));
assert.ok(sceneStoryMatches('Holiday Hookup: A Christmas Romance',book));
assert.ok(!sceneStoryMatches('Holiday Reunion',book));
const history=[];
for(let i=0;i<6;i++){
 const source=await loadSceneStory('owner',book,history,String(i));
 assert.equal(source.kind,'manuscript');assert.equal(source.storyId,'story');
 assert.ok(source.chapterNumber<=6,'Ending chapters are not selected');
 assert.ok(!history.some(r=>r.recipe.storySource.sourceKey===source.sourceKey),'Different manuscript section until pool exhausted');
 assert.match(JSON.stringify(source.bible),/Travis/);assert.ok(!JSON.stringify(source).includes('PRIVATE OTHER'));
 history.unshift({recipe:{storySource:source}});
}
assert.notEqual((await loadSceneStory("owner",book,history,"again")).sourceKey,history[0].recipe.storySource.sourceKey);
assert.ok(queries.every(q=>q.some(([k,v])=>k==='user_id'&&v==='owner')),'Every story read is scoped to authenticated owner');
assert.equal((await loadSceneStory('owner',{...book,title:'Unmatched',slug:'unmatched'},[],'x')).kind,'catalogue');
const visualHistory=[];
for(let i=0;i<60;i++){
 const d=nextSceneDirection(visualHistory,i*73);
 assert.ok(!visualHistory.some(r=>r.recipe.sceneDirection.key===d.key));
 assert.ok(!visualHistory.slice(0,2).some(r=>r.recipe.sceneDirection.look===d.look));
 assert.ok(!visualHistory.slice(0,3).some(r=>r.recipe.sceneDirection.angle===d.angle));
 visualHistory.unshift({recipe:{sceneDirection:d}});
}
const p={hook:'He is closer than he should be',slides:[{text:'His rival steps closer. Neither man moves away.',imagePrompt:'A close reaction shot at the cabin doorway.'}]};
assert.ok(scenePlanRepeats(p,[{recipe:{scenePlan:p}}]));
assert.ok(!scenePlanRepeats({...p,hook:'A very different hook',slides:[{text:'A quiet act of kindness catches him completely off guard.',imagePrompt:'A wide shot outdoors beside a snowy forest trail at dawn.'}]},[{recipe:{scenePlan:p}}]));
const photo=await sharp({create:{width:1080,height:1920,channels:3,background:'#777777'}}).jpeg().toBuffer();
const signatures=new Set();
function luminance(hex){const cs=hex.match(/\w\w/g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return cs[0]*.2126+cs[1]*.7152+cs[2]*.0722;}
for(let design=0;design<SCENE_STYLES.length;design++) {
 const style=SCENE_STYLES[design],a=luminance(style.ink),b=luminance(style.panel);
 assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>7,'Text contrast exceeds 7:1');
 const frame=await composeSceneFrame(photo,'He is supposed to be my rival. So why does every step closer feel like coming home?',design);
 const meta=await sharp(frame).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1920);
 signatures.add(frame.toString('base64').slice(-500));
 await sceneText('One small moment. Everything changes.',510,68,design);
 await composeSceneCover(photo,{...book,title:'Holiday Hookup'},design);
}
assert.ok(signatures.size>3,'Distinct treatments produce different rendered slides');
console.log('PASS: automatic owner-scoped manuscript/bible selection; exact book matching; complete draft preferred; no ending chapters; source-section rotation; catalogue fallback without manual input; 60 fresh visual directions; repeat detection; six real rendered font/colour treatments with >7:1 text contrast.');
