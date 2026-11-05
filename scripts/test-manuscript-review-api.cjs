const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(id=>id in mocks?mocks[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',mocks):require(id),m,m.exports);return m.exports;}
const owner='11111111-1111-4111-8111-111111111111',other='44444444-4444-4444-8444-444444444444',storyId='22222222-2222-4222-8222-222222222222',jobId='33333333-3333-4333-8333-333333333333';
const snapshot={title:'Test',storyBible:{premise:'Two adults',notes:[]},chapters:[{id:'c1',number:1,title:'First',povCharacter:'Sam',content:'I don’t know.'}]};
const stories=[{id:storyId,user_id:owner,title:'Test',form:snapshot.storyBible,chapters:snapshot.chapters}];
const original=JSON.stringify(stories);
let jobs=[],starts=0,providerCalls=0,workerMode='complete';
const db={from(table){let filters=[],patch,insert,limit=Infinity,ordered=false,columns='*';const query={select(c='*'){columns=c;return query},eq(k,v){filters.push([k,v]);return query},is(k,v){filters.push([k,v]);return query},order(){ordered=true;return query},limit(n){limit=n;return query},insert(v){insert=v;return query},update(v){assert.notEqual(table,'stories');patch=v;return query},single(){return run(true)},maybeSingle(){return run(true)},then(resolve,reject){return run(false).then(resolve,reject)}};async function run(single){let rows=table==='stories'?stories:jobs;if(insert){const row={status:'generating',report:null,diagnostic:null,dismissed_ids:[],model_call_in_flight:false,error_message:'',workflow_run_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...insert};rows.push(row);return {data:null,error:null};}let matches=rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(ordered)matches=matches.slice().reverse();matches=matches.slice(0,limit);if(patch)matches.forEach(r=>Object.assign(r,patch));const selected=matches.map(r=>columns==='*'?{...r}:Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));return {data:single?selected[0]??null:selected,error:null};}return query;}};
const core=load('lib/manuscript-review.ts');
const mocks={
 '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>({data:{user:token==='owner'?{id:owner}:token==='other'?{id:other}:null},error:null})}})},
 'next/server':{NextResponse:{json:(v,opts)=>new Response(JSON.stringify(v),{status:opts?.status??200})}},
 'workflow/api':{start:async()=>{starts++;return {runId:'run1'}},getRun:()=>({status:Promise.resolve('completed')})},
 '../../../../lib/social-job-db':{jobAdmin:()=>db},
 '../../../../workflows/manuscript-review':{reviewManuscriptJob:()=>{}},
};
const api=load('app/api/story-chat/review/route.ts',mocks);
function req(method,token,body){return new Request('http://test/review?storyId='+storyId,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
(async()=>{
 const key=await core.reviewSourceKey(snapshot);
 let body={storyId,sourceKey:key,action:'estimate'};
 assert.equal((await api.POST(req('POST',null,body))).status,401);
 assert.equal((await api.GET(req('GET',null))).status,401);
 assert.equal((await api.POST(req('POST','other',body))).status,404);
 assert.equal((await api.POST(req('POST','owner',{...body,sourceKey:'stale'}))).status,409);
 let r=await api.POST(req('POST','owner',body));assert.equal(r.status,200);const quote=(await r.json()).quote;assert.equal(starts,0);assert.equal(jobs.length,0);
 body={...body,id:jobId,action:'start'};assert.equal((await api.POST(req('POST','owner',body))).status,400);assert.equal(starts,0);
 body.approvedBudgetUsd=quote.maximumUsd;assert.equal((await api.POST(req('POST','owner',body))).status,202);assert.equal(starts,1);
 assert.equal((await api.POST(req('POST','owner',body))).status,202);assert.equal(starts,1);
 assert.equal((await api.POST(req('POST','owner',{...body,id:'55555555-5555-4555-8555-555555555555'}))).status,202);assert.equal(starts,1);
 r=await api.GET(req('GET','other'));assert.deepEqual((await r.json()).jobs,[]);
 const view=(await (await api.GET(req('GET','owner'))).json()).jobs[0];assert(!('input' in view));assert(!('workflow_run_id' in view));
 const prepared=core.prepareManuscriptReview(snapshot);
 const findings=core.checkManuscriptReport({findings:[{id:'F1',kind:'possible_issue',severity:'minor',category:'Dialogue',explanation:'Consider context.',correctionDirection:'Check it.',evidence:[{sourceId:'chapter_1',paragraphId:'p1',quote:'I don’t know.'}]}],strengths:[],limitations:[]},prepared);
 const steps=load('workflows/manuscript-review-steps.ts',{'../lib/social-job-db':{jobAdmin:()=>db},'../lib/manuscript-review-provider':{requestManuscriptReview:async()=>{providerCalls++;if(workerMode==='crash')throw new Error('ambiguous crash');return {report:findings,diagnostic:null};}}});
 assert.equal(steps.runManuscriptReview.maxRetries,0);
 await steps.runManuscriptReview(jobId);assert.equal(providerCalls,1);assert.equal(jobs[0].status,'completed');
 await steps.runManuscriptReview(jobId);assert.equal(providerCalls,1);
 let d={id:jobId,findingId:'F1',dismissed:true};
 assert.equal((await api.PATCH(req('PATCH','other',d))).status,404);
 assert.equal((await api.PATCH(req('PATCH','owner',{...d,findingId:'not-real'}))).status,400);
 assert.equal((await api.PATCH(req('PATCH','owner',d))).status,200);assert.deepEqual(jobs[0].dismissed_ids,['F1']);
 assert.equal((await api.PATCH(req('PATCH','owner',{...d,dismissed:false}))).status,200);assert.deepEqual(jobs[0].dismissed_ids,[]);
 jobs[0].status='generating';jobs[0].model_call_in_flight=true;await assert.rejects(()=>steps.runManuscriptReview(jobId),/not submitted again/);assert.equal(providerCalls,1);
 await steps.failManuscriptReview(jobId,'Stopped');assert.equal(jobs[0].status,'failed');assert.equal(providerCalls,1);
 assert.equal(JSON.stringify(stories),original);
 console.log('PASS: owner isolation, estimate without charge, approval/stale guards, idempotency, active deduplication, private inputs excluded, saved dismiss/restore, durable worker duplicate prevention and no story writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
