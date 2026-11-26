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
const {finishSceneCopy}=await import('../lib/social-scene-quality.ts');
const qualityPlan={format:'scene-slides',sourceMode:'premise',hook:'A clear romantic hook',cast:['one','two'],slides:[{text:'He came to apologise—but leaving is harder.',imagePrompt:'first',sourceQuote:''},{text:'He wants his rival. Now his rival knows.',imagePrompt:'second',sourceQuote:''}]};
assert.equal(finishSceneCopy(qualityPlan).slides[0].text,'He came to apologise, but leaving is harder.');
assert.throws(()=>finishSceneCopy({...qualityPlan,slides:[{...qualityPlan.slides[0],text:Array(25).fill('word').join(' ')},qualityPlan.slides[1]]}),/too dense/);
assert.equal(finishSceneCopy({...qualityPlan,sourceMode:'excerpt'}).slides[0].text,qualityPlan.slides[0].text,'Exact excerpts are never rewritten');
const backgroundA=await sharp({create:{width:1080,height:1920,channels:3,background:'#7a4330'}}).jpeg().toBuffer();
const backgroundB=await sharp({create:{width:1080,height:1920,channels:3,background:'#234c70'}}).jpeg().toBuffer();
const revealA=await composeSceneCover(photo,{...book,title:'Holiday Hookup'},5,backgroundA);
const revealB=await composeSceneCover(photo,{...book,title:'Holiday Hookup'},5,backgroundB);
assert.notDeepEqual(revealA,revealB,'Final reveal uses the actual scene photograph');
const screen=await sharp(await sharp(revealA).extract({left:330,top:385,width:400,height:940}).toBuffer()).stats();
assert.ok(Math.abs(screen.channels[0].mean-119)<8,'Large Kindle screen retains the original cover');
console.log('PASS: shorter premise copy, exact-excerpt preservation, actual scene-backed cover reveal, large original-cover insertion.');
const {sceneTimings}=await import('../lib/social-scene-slides.ts');
assert.deepEqual(sceneTimings(['A short romantic scene with about the same reading time.','Another short romantic scene with about the same reading time.']),[6,6,3]);
assert.equal(sceneTimings([Array(24).fill('word').join(' '),Array(24).fill('word').join(' ')]).reduce((a,b)=>a+b),15);
assert.ok(sceneTimings([Array(46).fill('word').join(' '),Array(46).fill('word').join(' ')]).reduce((a,b)=>a+b)>15,'Long exact extracts keep enough reading time');
for(const [top,height] of [[100,210],[1480,190]]) {
  const {data,info}=await sharp(revealA).extract({left:0,top,width:1080,height}).raw().toBuffer({resolveWithObject:true});
  let left=1080,right=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
    const i=(y*info.width+x)*info.channels;
    if(data[i]>230&&data[i+1]>225&&data[i+2]>215){left=Math.min(left,x);right=Math.max(right,x);}
  }
  assert.ok(right>left,'Final-slide lettering is visible');
  assert.ok(Math.abs((left+right)/2-540)<12,'Title and CTA share the Kindle centre line');
}
console.log('PASS: 15-second default pace and centred final-slide title/Kindle/CTA; long exact excerpts remain readable.');
