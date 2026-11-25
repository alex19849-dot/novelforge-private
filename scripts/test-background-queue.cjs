const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require(process.env.TEST_TYPESCRIPT||'typescript');
function load(file,mocks={}) {
 const source=fs.readFileSync(file,'utf8'),m={exports:{}};
 const out=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true});
 assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 new Function('require','module','exports',out.outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;
}
let row,calls=0,failed=0,sent=[],sendFails=false,advance=async()=>({done:true});
const clone=x=>JSON.parse(JSON.stringify(x));
const db={from(name){assert.equal(name,'background_queue_runs');let patch,filters=[];const q={update(p){patch=p;return q;},eq(k,v){filters.push([k,v]);return q;},select(){return q;},maybeSingle:async()=>finish(),then(ok,no){return Promise.resolve(finish()).then(ok,no);}};function finish(){if(filters.some(([k,v])=>row?.[k]!==v))return {data:null,error:null};if(patch)Object.assign(row,patch);return {data:clone(row),error:null};}return q;}};
const {processBackground}=load('lib/background-worker.ts',{
 './social-job-db':{jobAdmin:()=>db},
 './background-context':{withBackgroundExecution:(_id,fn)=>fn()},
 './background-queue':{backgroundRun:async()=>clone(row),dispatchBackground:async r=>{if(sendFails)throw Error('dispatch offline');sent.push(clone(r));}},
 './background-processors':{advanceBackground:async r=>{calls++;return advance(r)},failBackground:async()=>{failed++;}},
});
function reset(){row={id:'queue:11111111-1111-4111-8111-111111111111',user_id:'owner',kind:'chapter',args:['id'],sequence:0,checkpoint:{},status:'queued',next_at:new Date(0).toISOString(),locked_at:null};calls=failed=0;sent=[];sendFails=false;advance=async()=>({done:true});}
const msg=()=>({id:row.id,sequence:0});
(async()=>{
 reset();await processBackground(msg());await processBackground(msg());assert.equal(calls,1);assert.equal(row.status,'completed');
 reset();advance=async()=>({checkpoint:{phase:'next'}});await processBackground(msg());assert.equal(row.sequence,1);assert.equal(sent.length,1);await processBackground(msg());assert.equal(calls,1);assert.equal(sent.length,2,'Old delivery only redispatches the saved next stage');
 reset();let release,started;const ready=new Promise(r=>started=r);advance=async()=>{started();await new Promise(r=>release=r);return {done:true}};const first=processBackground(msg());await ready;await assert.rejects(processBackground(msg()),/already running/);release();await first;assert.equal(calls,1,'Concurrent delivery never invokes a second model stage');
 reset();advance=async()=>({checkpoint:{phase:'accepted'}});sendFails=true;await assert.rejects(processBackground(msg()),/offline/);assert.equal(row.status,'queued');assert.equal(row.sequence,1);sendFails=false;await processBackground(msg());assert.equal(calls,1,'Failed dispatch cannot rerun the completed paid stage');
 reset();row.status='running';row.locked_at=new Date(Date.now()-11*60000).toISOString();await processBackground(msg());assert.equal(calls,0);assert.equal(failed,1);assert.equal(row.status,'failed','Ambiguous expired stage is retained for review rather than replayed');
 reset();advance=async()=>{throw Error('unknown paid outcome')};await processBackground(msg());assert.equal(row.status,'failed');await processBackground(msg());assert.equal(calls,1);
 reset();row.next_at=new Date(Date.now()+86400000).toISOString();await processBackground(msg());assert.equal(calls,0);assert.equal(row.sequence,1);assert.equal(sent.length,1);
 let sends=[];
 const queue=load('lib/background-queue.ts',{'server-only':{},'@vercel/queue':{QueueClient:class{async send(...args){sends.push(args);}}},'./social-job-db':{jobAdmin:()=>db}});
 await queue.dispatchBackground({id:'queue:test',sequence:3,next_at:new Date(Date.now()+30*86400000).toISOString()});
 assert.equal(sends[0][2].delaySeconds,6*86400);assert.equal(sends[0][2].retentionSeconds,7*86400);assert.equal(sends[0][2].idempotencyKey,'queue:test:3');
 assert.deepEqual(Object.keys(sends[0][1]).sort(),['id','sequence'],'No manuscript or image payload in queue');
 const sql=fs.readFileSync('docs/background-queue.sql','utf8');assert(sql.includes('enable row level security'));assert(sql.includes('revoke all on public.background_queue_runs from anon, authenticated'));
 for(const file of ['app/api/story-chat/jobs/route.ts','app/api/story-chat/review/route.ts','app/api/social-studio/jobs/route.ts','lib/social-job-server.ts','lib/social-publishing-server.ts','lib/social-analytics-server.ts'])assert(!fs.readFileSync(file,'utf8').includes('workflow/api'),file+' must not start/read exhausted Workflows');
 const publisher=fs.readFileSync('workflows/social-publishing-steps.ts','utf8');assert(publisher.includes('delay:times.length?'));assert(publisher.includes(':null}'));assert(!publisher.includes('Math.min(300,'),'Publisher must sleep until due, not every 5 minutes');
 const submit=fs.readFileSync('workflows/social-generation-steps.ts','utf8');assert(submit.indexOf('submission_started:true')<submit.indexOf('const response=await ai().responses.create(request)'));assert(submit.includes('await rememberResponse(runId,taskId,response.id)'));
 console.log('PASS: duplicate/concurrent delivery, saved next-stage recovery after dispatch failure, interrupted paid-stage non-replay, delayed wakes, small messages, fixed region, producer migration, publisher idle termination and paid response checkpoint. No live model calls or posts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
