const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require(process.env.NOVELFORGE_TEST_TYPESCRIPT||'typescript');
function load(file,mocks={}){file=path.resolve(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(id=>id in mocks?mocks[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',mocks):require(id),m,m.exports);return m.exports;}
const protect=load('lib/author-prose-protection.ts'),editor=load('lib/prose-editorial.ts');
const before='I leave the keys on the counter.\n\nThe old generated explanation.\n\nHe waits beside the door.';
const after=before.replace('The old generated explanation.','My own revised thought belongs here.');
let locks=protect.protectAuthorChanges(before,after);
assert.equal(locks.ranges.length,1);assert.equal(locks.ranges[0].text,'My own revised thought belongs here.');assert(protect.validAuthorProtection(after,locks));
const nearby=after.replace('I leave the keys on the counter.','I set the keys down by the kettle.');
const mapped=protect.assertAuthorChangesKept(after,nearby,locks);assert.equal(mapped.ranges[0].text,locks.ranges[0].text);
assert.throws(()=>protect.assertAuthorChangesKept(after,before,locks),/author-edited passage/);
const appended=after+'\n\nNew writer prose.';const continued=protect.protectAuthorChanges(after,appended,locks,false);
assert.equal(continued.ranges.length,1,'New machine prose is not an author edit');
const editedAgain=appended.replace('My own revised thought belongs here.','A second deliberate author revision.');
locks=protect.protectAuthorChanges(appended,editedAgain,continued);assert.deepEqual(locks.ranges.map(r=>r.text),['A second deliberate author revision.']);
const deleted='I leave the keys on the counter.\n\nHe waits beside the door.';
const deletionLocks=protect.protectAuthorChanges(before,deleted);assert(deletionLocks.ranges.length>0,'A deletion protects its new join, not the removed text');assert(!deletionLocks.ranges.some(r=>r.text.includes('old generated')));
assert.equal(protect.protectAuthorChanges(before,before).ranges.length,0);
assert.equal(protect.protectAuthorChanges('',after).ranges.length,3,'Missing legacy baseline protects current author text conservatively');
const m=editor.editorialEvidence(after,[]);
const findings=['p1','p2','p3'].map((id,i)=>({id:'f'+i,category:'sentence_pattern',paragraphIds:[id],evidence:[{sourceId:id,quote:m.paragraphs[i].text}],reason:'A supported test issue.',direction:'Only repair this test issue.'}));
const raw={findings,signalAssessments:[],preservation:[],overflow:false};
const report=editor.validateEditorialReport(raw,m),protectedText=protect.protectAuthorChanges(before,after);
const targets=editor.editorialTargets(after,m.paragraphs,report,[],protectedText);
assert.equal(targets.length,2);assert(targets.every(t=>!t.original.includes('My own revised')));
const replacements=Object.fromEntries(targets.map(t=>[t.id,t.original+' A small clarification.']));
const result=editor.applyEditorialEdits(after,targets,replacements,protectedText);assert(result.content.includes('My own revised thought belongs here.'));
assert.throws(()=>editor.applyEditorialEdits(after,[{id:'unsafe',start:m.paragraphs[1].start,end:m.paragraphs[1].end,original:m.paragraphs[1].text,writer:'astra',findings:[]}],{unsafe:'A replacement that overwrites the author’s chosen thought.'},protectedText),/targets your edited text/);
const disjoint=editor.validateEditorialReport({...raw,findings:[{...findings[0],paragraphIds:['p3','p1','p3']}]},m);
const disjointTargets=editor.editorialTargets(after,m.paragraphs,disjoint);assert.equal(disjointTargets.length,2);assert(disjointTargets.every(t=>!t.original.includes('My own revised')),'Do not include an unflagged paragraph between disjoint addresses');
// The frontend's three author-controlled save paths all mark accepted text.
const page=fs.readFileSync('app/story-chat/page.tsx','utf8');assert(page.includes('protectAuthorChanges(latestPending.draft,content,latestPending.authorProtection)'));assert(page.includes('protectAuthorChanges(pending.draft,content,pending.authorProtection)'));assert(page.includes('protectAuthorChanges(pendingGeneration.draft,content,pendingGeneration.authorProtection)'));

const owner='11111111-1111-4111-8111-111111111111',storyId='22222222-2222-4222-8222-222222222222',jobId='33333333-3333-4333-8333-333333333333';
const metadata={title:'Chapter 1',povCharacter:'Sam',kind:'chapter',replaceChapterNumber:null,content:''};
const story={id:storyId,title:'Test',storyBible:{},chapters:[],storyState:{},messages:[]};
let history=[{baseline:before,chapter:metadata}],inserted,queries=[],starts=0;
const db={from(table){const filters=[],q={select(s){q.selection=s;return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},limit:async()=>{queries.push({table,selection:q.selection,filters});return{data:history,error:null};},update(){return q;},is(){return q;},insert(v){inserted=v;return q;},single:async()=>({data:{form:{},chapters:[],story_state:{},updated_at:'now'},error:null}),maybeSingle:async()=>({data:null,error:null}),then(ok,no){return Promise.resolve({data:inserted??null,error:null}).then(ok,no);}};return q;}};
const api=load('app/api/story-chat/jobs/route.ts',{'../../../../lib/author-style-server':{approvedStyleFor:async()=>''},'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}})},'next/server':{NextResponse:{json:(v,o)=>new Response(JSON.stringify(v),{status:o?.status??200})}},'../../../../lib/background-queue':{startBackground:async()=>{starts++;return{runId:'queue:test'};},backgroundStatus:async()=>''},'../../../../lib/social-job-db':{jobAdmin:()=>db}});
async function submit(content,protection){inserted=undefined;return api.POST(new Request('http://test',{method:'POST',headers:{authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({id:jobId,input:{operation:'complete',story,pending:{storyId,generatedChapter:metadata,chapterBrief:'{}',draft:content,authorProtection:protection}},sourceFingerprint:load('lib/chapter-job.ts').chapterSourceFingerprint(story)})}));}
(async()=>{
 assert.equal((await submit(after)).status,202);assert.equal(inserted.input.pending.authorProtection.ranges[0].text,'My own revised thought belongs here.');assert.equal(inserted.input.pending.draft,after);
 assert(queries[0].filters.some(([k,v])=>k==='user_id'&&v===owner));assert(queries[0].filters.some(([k,v])=>k==='story_id'&&v===storyId));assert.equal(queries[0].selection,'baseline:checkpoint->pending->>draft,chapter:checkpoint->pending->generatedChapter');
 const count=queries.length;assert.equal((await submit(after,protectedText)).status,202);assert.equal(queries.length,count,'New clients with valid author locks do not need a history read');
 history=[];assert.equal((await submit(after)).status,202);assert.equal(inserted.input.pending.authorProtection.ranges.length,3);assert.equal(starts,3);
 console.log('PASS: manual edits, accepted rewrites and undo protected verbatim; deletion joins, continuation and neighbouring automatic edits; overlapping/disjoint findings; legacy owner-scoped baseline recovery and no baseline guessing. No live model/database calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
