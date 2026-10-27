const fs=require('fs');const path=require('path');const assert=require('node:assert/strict');const ts=require('typescript');
function load(file,mocks={}){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',mocks):require(id),m,m.exports);return m.exports;}
const fp=load('lib/chapter-job.ts').chapterSourceFingerprint;
const owner='11111111-1111-4111-8111-111111111111',storyId='22222222-2222-4222-8222-222222222222',jobId='33333333-3333-4333-8333-333333333333';
const story={id:storyId,title:'Test',storyBible:{},chapters:[],storyState:{},messages:[{id:1,role:'user',content:'Write Chapter 1.'}]};
const saved={id:storyId,user_id:owner,form:{},chapters:[],story_state:{},updated_at:'2026-10-27T12:00:00Z'};
let jobs=[],starts=0;
const db={from:table=>{let filters=[],update,insert;const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},is:(k,v)=>{filters.push([k,v]);return q;},insert:v=>{insert=v;return q;},update:v=>{update=v;return q;},single:()=>q.maybeSingle(),maybeSingle:async()=>{const rows=table==='stories'?[saved]:jobs;if(insert){jobs.push(insert);return {data:insert,error:null};}const data=rows.find(r=>filters.every(([k,v])=>r[k]===v))??null;if(data&&update)Object.assign(data,update);return {data,error:null};},then:(resolve,reject)=>q.maybeSingle().then(resolve,reject)};return q;}};
const api=load('app/api/story-chat/jobs/route.ts',{
  '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>({data:{user:{id:token==='owner'?owner:'other'}},error:null})}})},
  'next/server':{NextResponse:{json:(data,o)=>new Response(JSON.stringify(data),{status:o?.status??200})}},
  'workflow/api':{start:async()=>{starts++;return {runId:'workflow'};}},
  '../../../../lib/social-job-db':{jobAdmin:()=>db},
  '../../../../workflows/chapter-generation':{generateChapterJob:()=>{}},
});
const req=(token,body)=>new Request('http://test/jobs',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
const body={id:jobId,input:{operation:'generate',story},sourceFingerprint:fp(story)};
(async()=>{
 assert.equal((await api.POST(req(null,body))).status,401);
 assert.equal((await api.POST(req('other',body))).status,404);
 assert.equal((await api.POST(req('owner',{...body,sourceFingerprint:'changed'}))).status,409);
 assert.equal(starts,0);
 assert.equal((await api.POST(req('owner',body))).status,202);
 assert.equal(starts,1);assert.equal(jobs[0].user_id,owner);
 assert.equal((await api.POST(req('owner',body))).status,202);assert.equal(starts,1);
 assert.equal((await api.POST(req('owner',{...body,id:'44444444-4444-4444-8444-444444444444'}))).status,202);assert.equal(starts,1);
 console.log('PASS: authenticated owner-only submission, stale-source rejection, durable request storage, request-ID idempotency and active-story deduplication.');
})().catch(error=>{console.error(error);process.exitCode=1;});
