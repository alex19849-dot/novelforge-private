import {PGlite} from '@electric-sql/pglite';
import http from 'node:http';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),dir=await mkdtemp(join(tmpdir(),'social-publisher-runtime-')),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
for(const file of (await readdir(root+'/supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(root+'/supabase/migrations/'+file,'utf8'));
const owner=randomUUID(),other=randomUUID();await db.query('insert into auth.users values($1),($2)',[owner,other]);
const channels=['facebook','instagram','tiktok'].map(service=>({id:service,service,name:service==='instagram'?'marlowquinnauthor':service==='tiktok'?'marlow.quinn':'Marlow Quinn',organizationId:'org',isDisconnected:false,isLocked:false,isQueuePaused:false}));
await db.query('insert into social_publishing_settings(user_id,channels,preflight_at,connection_checked_at) values($1,$2,now(),now())',[owner,JSON.stringify(Object.fromEntries(channels.map(c=>[c.service,c])))]);
async function add(platform,offset=-10,status='approved',user=owner){return(await db.query("insert into social_posts(campaign_id,user_id,platform,caption,media_path,media_type,status,scheduled_at) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,now()+make_interval(secs=>$7)) returning *",[user,platform,'Approved '+platform,platform==='facebook'?null:user+'/calendar/fixture.'+(platform==='tiktok'?'mp4':'jpg'),platform==='facebook'?null:platform==='tiktok'?'video':'image',status,offset])).rows[0];}
const fb=await add('facebook'),ig=await add('instagram'),tt=await add('tiktok'),future=await add('facebook',3600),draft=await add('facebook',-10,'draft'),foreign=await add('facebook',-10,'approved',other);
const provider=new Map(),calls={facebook:0,instagram:0,tiktok:0};let rejectIg=true,ambiguousFb=true;
const reply=(res,data,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(data==null?'':JSON.stringify(data));};
const mock=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);const body=raw.length?JSON.parse(raw):null;
 if(url.pathname==='/auth/v1/user')return reply(res,{id:req.headers.authorization?.includes('other')?other:owner,aud:'authenticated',role:'authenticated'});
 if(url.pathname==='/buffer'){
  const query=body.query,v=body.variables??{};
  if(query.includes('NovelForgeBufferAccount'))return reply(res,{data:{account:{organizations:[{id:'org',name:'Marlow'}]}}});
  if(query.includes('NovelForgeBufferChannels'))return reply(res,{data:{channels}});
  if(query.includes('NovelForgeCreatePost')){
   const input=v.input,platform=input.channelId;calls[platform]++;
   if(platform==='instagram'&&rejectIg){rejectIg=false;return reply(res,{},429,{'Retry-After':'60'});}
   const id=randomUUID(),post={id,status:'sending',channelId:platform,text:input.text,createdAt:new Date().toISOString(),via:'api',assets:input.assets.map(a=>({source:(a.image??a.video).url,mimeType:a.video?'video/mp4':'image/jpeg'})),externalLink:'https://example.com/post/'+id};provider.set(id,post);
   if(platform==='facebook'&&ambiguousFb){ambiguousFb=false;res.destroy();return;}
   return reply(res,{data:{createPost:{__typename:'PostActionSuccess',post}}});
  }
  if(query.includes('NovelForgeReconcile'))return reply(res,{data:{posts:{edges:[...provider.values()].filter(p=>p.channelId===v.input.filter.channelIds[0]).map(node=>({node})),pageInfo:{hasNextPage:false}}}});
  if(query.includes('NovelForgePost')){const post=provider.get(v.id);if(!post)return reply(res,{errors:[{message:'Not found'}]});post.status='sent';post.sentAt=new Date().toISOString();return reply(res,{data:{post}});}
  return reply(res,{errors:[{message:'Unexpected query'}]},400);
 }
 if(url.pathname.startsWith('/rest/v1/rpc/')){
  const name=url.pathname.split('/').at(-1);if(!/^social_\w+$/.test(name))throw Error('Bad RPC');
  const entries=Object.entries(body),params=entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v);
  const rows=(await db.query(`select * from ${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')})`,params)).rows;
  return reply(res,['social_register_publisher','social_publication_result'].includes(name)?rows[0][name]:rows);
 }
 if(url.pathname.startsWith('/rest/v1/')){
  const table=url.pathname.split('/').at(-1);if(!['social_posts','social_publications','social_publishing_settings','social_generation_runs'].includes(table))throw Error('Bad table');
  const params=[],clauses=[],bind=v=>{params.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return '$'+params.length;};
  for(const [key,raw] of url.searchParams){if(['select','order','limit','on_conflict'].includes(key))continue;if(!/^\w+$/.test(key))throw Error('Bad field');let expression;
   if(raw==='is.null')expression=`${key} is null`;else if(raw==='not.is.null')expression=`${key} is not null`;else if(raw.startsWith('in.'))expression=`${key}=any(${bind(raw.slice(3).replace(/[()\"]/g,'').split(','))})`;else{const dot=raw.indexOf('.'),op={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='}[raw.slice(0,dot)];if(!op)throw Error('Bad operator '+raw);expression=`${key}${op}${bind(raw.slice(dot+1))}`;}clauses.push(expression);
  }
  const where=clauses.length?' where '+clauses.join(' and '):'';let rows;
  if(req.method==='PATCH'){const assignments=Object.entries(body).map(([k,v])=>`${k}=${bind(v)}`);rows=(await db.query(`update ${table} set ${assignments.join(',')}${where} returning *`,params)).rows;}
  else if(req.method==='DELETE')rows=(await db.query(`delete from ${table}${where} returning *`,params)).rows;
  else if(req.method==='POST'){const keys=Object.keys(body),values=keys.map(k=>bind(body[k]));const conflict=req.headers.prefer?.includes('resolution=merge-duplicates')?` on conflict(${url.searchParams.get('on_conflict')??'post_id'}) do update set ${keys.map(k=>`${k}=excluded.${k}`).join(',')}`:'';rows=(await db.query(`insert into ${table}(${keys.join(',')}) values(${values.join(',')})${conflict} returning *`,params)).rows;}
  else{const select=url.searchParams.get('select')??'*';if(!/^[\w,*]+$/.test(select))throw Error('Bad projection');const order=url.searchParams.get('order')?.split('.'),orderSql=order?` order by ${order[0]} ${order[1]==='desc'?'desc':'asc'}`:'';const limit=url.searchParams.get('limit');rows=(await db.query(`select ${select} from ${table}${where}${orderSql}${limit?' limit '+Number(limit):''}`,params)).rows;}
  const wantsSingle=req.headers.accept?.includes('application/vnd.pgrst.object+json');return reply(res,req.method==='HEAD'?null:wantsSingle?(rows[0]??null):rows,200,{'Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length}`});
 }
 return reply(res,{error:'Unexpected request'},404);
}catch(error){console.error('Mock API error',error);reply(res,{message:error.message,code:error.code},500);}});
await new Promise(r=>mock.listen(3401,'127.0.0.1',r));
const preload=join(dir,'buffer-preload.mjs');await writeFile(preload,"const original=globalThis.fetch;globalThis.fetch=(input,options)=>original(String(input)==='https://api.buffer.com'?'http://127.0.0.1:3401/buffer':input,options);");
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3402','-H','127.0.0.1'],{cwd:root,env:{...process.env,NODE_OPTIONS:`--import=${preload}`,WORKFLOW_LOCAL_DATA_DIR:join(dir,'workflow'),WORKFLOW_LOCAL_BASE_URL:'http://127.0.0.1:3402',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3401',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-anon',SUPABASE_SERVICE_ROLE_KEY:'mock-service',SOCIAL_STUDIO_OWNER_ID:owner,BUFFER_API_KEY:'fixture-only'}});
let logs='';app.stdout.on('data',b=>{logs+=b;process.stdout.write(b);});app.stderr.on('data',b=>{logs+=b;process.stderr.write(b);});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const request=(action,auth='owner')=>fetch('http://127.0.0.1:3402/api/social-studio/publishing',{method:action?'POST':'GET',headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},body:action?JSON.stringify({action}):undefined});
async function until(predicate,label){for(let i=0;i<100;i++){if(await predicate())return;await wait(250);}throw Error('Timed out: '+label+' '+JSON.stringify((await db.query('select * from social_publications')).rows));}
async function wake(){await db.exec("update social_publications set next_check_at=now()-interval '1 second' where state in ('retry','accepted','uncertain')");const res=await request('wake');assert.equal(res.status,200,await res.text());}
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:3402/social-studio');break;}catch{await wait(250);}}
 assert.equal((await request('enable','')).status,401);assert.equal((await request('enable','other')).status,401);
 const enabled=await request('enable');assert.equal(enabled.status,200,await enabled.text());
 await until(async()=>(await db.query('select count(*) n from social_publications')).rows[0].n===3,'initial dispatch');
 await until(async()=>(await db.query("select count(*) n from social_publications where state in ('uncertain','retry','accepted')")).rows[0].n===3,'initial outcomes');
 assert.equal(calls.facebook,1);assert.equal(calls.instagram,1);assert.equal(calls.tiktok,1);assert.equal(provider.size,2);
 assert.equal((await db.query('select status from social_posts where id=$1',[future.id])).rows[0].status,'approved');assert.equal((await db.query('select status from social_posts where id=$1',[draft.id])).rows[0].status,'draft');assert.equal((await db.query('select status from social_posts where id=$1',[foreign.id])).rows[0].status,'approved');
 console.log('PASS: durable worker sends only due approved owner posts; 429 waits and an ambiguous acceptance is held.');
 await wake();await until(async()=>(await db.query("select count(*) n from social_publications where state='published'")).rows[0].n>=1,'first confirmation');
 await wake();await until(async()=>(await db.query("select count(*) n from social_publications where state='published'")).rows[0].n===3,'all confirmations');
 assert.equal(calls.facebook,1,'Ambiguous accepted post must not be created twice');assert.equal(calls.instagram,2,'Only the rejected 429 is retried');assert.equal(calls.tiktok,1);assert.equal(provider.size,3);
 console.log('PASS: background reconciliation finds the accepted post, retries only 429, and confirms actual publication.');
 assert.equal((await request('pause')).status,200);const paused=await add('facebook');await wait(1000);assert.equal(provider.size,3);assert.equal((await request('enable')).status,200);await until(async()=>(await db.query('select status from social_posts where id=$1',[paused.id])).rows[0].status==='publishing','resume');
 await db.query("update social_posts set caption='Edited before publication',scheduled_at=now()-interval '1 second' where id=$1",[future.id]);await wake();await until(async()=>[...provider.values()].some(p=>p.text==='Edited before publication'),'rescheduled edit');
 assert.equal((await request()).status,200);const state=await(await request()).json();assert.equal(state.settings.enabled,true);assert.ok(state.publications.filter(p=>p.state==='published').length>=3);
 assert.equal((await fetch('http://127.0.0.1:3402/story-chat')).status,200);
 console.log('PASS: pause/resume, edits and earlier rescheduling, private status/history, and existing Story Chat.');
}catch(error){console.error(error);console.error(logs.slice(-10000));process.exitCode=1;}
finally{app.kill('SIGTERM');await new Promise(r=>app.on('exit',r));await new Promise(r=>mock.close(r));await db.close();await rm(dir,{recursive:true,force:true});}
