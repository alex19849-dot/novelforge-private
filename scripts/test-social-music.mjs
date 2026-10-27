import http from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const sharp=createRequire(root+'/package.json')('sharp');
const {renderSocialMedia}=await import(root+'/lib/social-render.ts');
const {musicForPath}=await import(root+'/lib/social-music.ts');
const {soundtrackSocialVideo,socialTrackAudio}=await import(root+'/lib/social-music-render.ts');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const dir=await mkdtemp(join(tmpdir(),'social-music-test-'));
const original=await sharp({create:{width:1080,height:1920,channels:3,background:'#cb2361'}}).composite([{input:await sharp({create:{width:100,height:1920,channels:3,background:'#ffff00'}}).png().toBuffer(),left:0,top:0}]).jpeg().toBuffer();
const silent=await renderSocialMedia(original,true,true,'contain');
const tables={social_generation_runs:[],social_generation_tasks:[],social_posts:[]},files=new Map();
function post(overrides={}){const id=randomUUID();const row={id,campaign_id:randomUUID(),user_id:uid,book_slug:'fixture',book_title:'Fixture',post_type:'premise_hook',platform:'tiktok',status:'approved',version:3,caption:'Keep this approved caption',hashtags:['#BookTok'],scheduled_at:'2099-11-06T20:00:00.000Z',planned_media_type:'image',media_type:'image',media_path:`${uid}/calendar/${id}.jpg`,...overrides};tables.social_posts.push(row);files.set(row.media_path,original);return row;}
const image=post(),edited=post(),video=post({media_type:'video',planned_media_type:'video'});files.set(video.media_path,silent);
const foreign=post({user_id:other,media_path:`${other}/calendar/foreign.jpg`}),published=post({status:'published'}),past=post({scheduled_at:'2020-01-01T12:00:00.000Z'});
const snapshots=new Map(tables.social_posts.map(p=>[p.id,structuredClone(p)]));
let aiCalls=0;
function reply(res,data,status=200,headers={}){res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(data===null?'':JSON.stringify(data));}
const mock=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);let body;try{body=raw.length?JSON.parse(raw.toString()):undefined;}catch{}
 if(url.pathname==='/auth/v1/user')return reply(res,{id:uid,aud:'authenticated',role:'authenticated'});
 if(url.pathname.startsWith('/v1/responses')){aiCalls++;return reply(res,{error:'Music must not call AI'},500);}
 if(url.pathname.startsWith('/rest/v1/')){
  const table=tables[url.pathname.split('/').at(-1)];if(!table)return reply(res,{error:'Unknown table'},404);
  const match=row=>[...url.searchParams].every(([k,v])=>{
   if(['select','order','limit'].includes(k))return true;
   if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
   if(v.startsWith('neq.'))return String(row[k])!==v.slice(4);
   if(v==='is.null')return row[k]==null;if(v==='not.is.null')return row[k]!=null;
   if(v.startsWith('gt.'))return row[k]>v.slice(3);if(v.startsWith('gte.'))return row[k]>=v.slice(4);
   if(v.startsWith('lt.'))return row[k]<v.slice(3);if(v.startsWith('in.'))return v.slice(3).replace(/[()]/g,'').split(',').includes(row[k]);
   return true;
  });let rows=table.filter(match);
  if(req.method==='POST'){rows=(Array.isArray(body)?body:[body]).map(r=>({id:randomUUID(),status:'pending',response_id:null,version:1,created_at:new Date().toISOString(),completed_tasks:0,created_count:0,total_tasks:0,error_message:'',cancel_requested:false,result:{},...r}));table.push(...rows);return reply(res,req.headers.prefer?.includes('return=representation')?rows:null,201);}
  if(req.method==='PATCH'){for(const row of rows)Object.assign(row,body,{version:row.version+1});return reply(res,req.headers.prefer?.includes('return=representation')?rows:null);}
  const order=url.searchParams.get('order');if(order){const [field,sort]=order.split('.');rows.sort((a,b)=>String(a[field]).localeCompare(String(b[field]))*(sort==='desc'?-1:1));}
  const count=rows.length;if(url.searchParams.has('limit'))rows=rows.slice(0,+url.searchParams.get('limit'));
  const select=url.searchParams.get('select');if(select&&select!=='*')rows=rows.map(r=>Object.fromEntries(select.split(',').map(k=>[k,r[k]])));
  return reply(res,req.headers.accept?.includes('application/vnd.pgrst.object+json')?(rows[0]??null):rows,200,{'Content-Range':`0-${Math.max(0,count-1)}/${count}`});
 }
 if(url.pathname.startsWith('/storage/v1/object/list/')){const prefix=body.prefix+'/';return reply(res,[...files.keys()].filter(k=>k.startsWith(prefix)&&k.slice(prefix.length).includes(body.search??'')).map(k=>({name:k.slice(prefix.length),id:randomUUID()})));}
 if(url.pathname.startsWith('/storage/v1/object/social-media/')){const path=decodeURIComponent(url.pathname.slice('/storage/v1/object/social-media/'.length));if(req.method==='GET'){if(!files.has(path))return reply(res,{error:'Not found'},404);res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(files.get(path));return;}if(files.has(path))return reply(res,{statusCode:'409',error:'Duplicate'},409);files.set(path,raw);return reply(res,{Key:path,Id:randomUUID()});}
 return reply(res,{error:'Unexpected '+req.method+' '+url.pathname},404);
}catch(error){console.error(error);reply(res,{error:error.message},500);}});
await new Promise(r=>mock.listen(3401,'127.0.0.1',r));
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3402','-H','127.0.0.1'],{cwd:root,env:{...process.env,WORKFLOW_LOCAL_DATA_DIR:join(dir,'workflow'),WORKFLOW_LOCAL_BASE_URL:'http://127.0.0.1:3402',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3401',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-anon',SUPABASE_SERVICE_ROLE_KEY:'mock-service',OPENAI_API_KEY:'',OPENAI_BASE_URL:'http://127.0.0.1:3401/v1'}});
let logs='';app.stdout.on('data',b=>{logs+=b;process.stdout.write(b);});app.stderr.on('data',b=>{logs+=b;process.stderr.write(b);});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=(path,body,auth=true)=>fetch('http://127.0.0.1:3402'+path,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer fixture-user'}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
const run=promisify(execFile),ffmpeg=root+'/node_modules/@ffmpeg-installer/linux-x64/ffmpeg';
async function inspect(bytes,name){const file=join(dir,name);await writeFile(file,bytes);let info='';try{await run(ffmpeg,['-hide_banner','-i',file],{maxBuffer:128*1024});}catch(e){info=e.stderr;}assert.match(info,/Video: h264.*1080x1920/);assert.match(info,/Audio: aac/);assert.match(info,/Duration: 00:00:08/);const {stdout}=await run(ffmpeg,['-v','error','-i',file,'-frames:v','1','-f','image2pipe','-c:v','png','-'],{encoding:'buffer',maxBuffer:10*1024*1024});return stdout;}
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:3402/social-studio',{signal:AbortSignal.timeout(1000)});break;}catch{await wait(250);}}
 assert.equal((await request('/api/social-studio/music',{runId:randomUUID()},false)).status,401);
 const runId=randomUUID(),before=Date.now(),response=await request('/api/social-studio/music',{runId,start:'2099-11-01'});const queued=await response.json();assert.equal(response.status,202,JSON.stringify(queued));assert.ok(Date.now()-before<5000);
 edited.caption='Edited after enqueue';edited.version++;
 console.log('PASS: music enqueued immediately, without an AI key. No browser requests while it runs.');
 for(let i=0;i<140;i++){if(tables.social_generation_runs[0]?.status!=='generating')break;await wait(500);}
 assert.equal(tables.social_generation_runs[0].status,'completed',JSON.stringify(tables.social_generation_tasks));
 assert.equal(tables.social_generation_tasks.length,3);assert.equal(tables.social_generation_runs[0].completed_tasks,3);
 for(const row of [image,video]){assert.ok(musicForPath(row.media_path));assert.equal(row.media_type,'video');assert.equal(row.status,'approved');assert.equal(row.caption,snapshots.get(row.id).caption);assert.equal(row.scheduled_at,snapshots.get(row.id).scheduled_at);assert.ok(files.has(snapshots.get(row.id).media_path));await inspect(files.get(row.media_path),row.id+'.mp4');}
 assert.equal(edited.media_path,snapshots.get(edited.id).media_path);assert.equal(edited.caption,'Edited after enqueue');assert.equal(tables.social_generation_tasks[1].status,'skipped');
 for(const row of [foreign,published,past])assert.deepEqual(row,snapshots.get(row.id));
 assert.equal(aiCalls,0);
 const size=files.size;await request('/api/social-studio/music',{runId,start:'2099-11-01'});assert.equal(files.size,size);
 const status=await(await request('/api/social-studio/jobs')).json();assert.equal(status.job.operation,'music');assert.ok(!('config' in status.job));
 console.log('PASS: actual H.264/AAC exports, approvals/captions/times kept, originals retained, concurrent edit skipped, wrong owner/past/published excluded, repeat start idempotent.');
 const output=files.get(video.media_path);
 async function awaitAudio(){return await socialTrackAudio(musicForPath(video.media_path));}
 const audio=await awaitAudio();await assert.rejects(()=>soundtrackSocialVideo(output,audio),/already has audio/);
 const first=await inspect(files.get(image.media_path),'framing.mp4');const pixel=await sharp(await sharp(first).extract({left:0,top:500,width:40,height:100}).toBuffer()).stats();assert.ok(pixel.channels[0].mean>180&&pixel.channels[1].mean>180,'Left edge of approved art remains visible');
 assert.equal((await request('/story-chat')).status,200);
 console.log('PASS: existing audio is protected, poster framing retained, Story Chat still serves.');
}catch(error){console.error(error);console.error(logs.slice(-14000));process.exitCode=1;}
finally{app.kill('SIGTERM');await new Promise(r=>app.on('exit',r));await new Promise(r=>mock.close(r));await rm(dir,{recursive:true,force:true});}
