const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true } }).outputText;
  const m = { exports:{} };
  new Function('require','module','exports',js)(id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.resolve(path.dirname(file),id)+'.ts',mocks) : require(id),m,m.exports);
  return m.exports;
}
const shared = load('app/story-chat/generation.ts');
const story = { id:'story', title:'Test', storyBible:{},storyState:{...shared.EMPTY_STORY_STATE},chapters:[],messages:[{ id:1,role:'user',content:'Write Chapter 1.' }],createdAt:'2026-10-27',updatedAt:'2026-10-27' };
const pending = { storyId:'story',generatedChapter:{title:'Test',povCharacter:'Sam',replaceChapterNumber:null},chapterBrief:JSON.stringify({targetWordRange:{minimum:500,preferred:600,maximum:800}}),latestUserMessage:'Write chapter.',draft:'',minimumWordCount:500,maximumWordCount:800,diagnostics:[] };
const clone = x => JSON.parse(JSON.stringify(x));
const diagnostic = stage => ({ stage,provider:'openai',model:'mock',status:'succeeded',inputTokens:1,outputTokens:1,totalTokens:2,costUsd:0,costType:'reported',durationMs:1,attempt:1 });
function harness(input, options={}) {
  const row = { id:'job',status:'generating',input:clone(input),checkpoint:null,result:null,model_call_in_flight:false };
  const calls=[];
  const writerRequests=[];
  const db={ from:() => {
    let updates, filters=[];
    const q={ select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},update:value=>{updates=value;return q;},
      single:async()=>({data:clone(row),error:null}),maybeSingle:async()=>{
        if (!filters.every(([k,v])=>row[k]===v)) return {data:null,error:null};
        if(updates) Object.assign(row,clone(updates));
        return {data:clone(row),error:null};
      },then:(resolve,reject)=>q.maybeSingle().then(resolve,reject),
    };return q;
  },rpc:async()=>{row.status=options.conflict?'conflict':row.error_message?'failed':'completed';return {error:null};} };
  const response = data => new Response(JSON.stringify(data),{status:200});
  let fills=0;
  const routes={
    '../app/api/story-chat/route':{POST:async req=>{calls.push('plan');return response({story:input.story,generatedChapter:pending.generatedChapter,chapterBrief:pending.chapterBrief,diagnostics:[diagnostic('plan')]});}},
    '../app/api/story-chat/write/route':{POST:async req=>{
      const body=await req.json();writerRequests.push(body);calls.push(body.phase==='fill_specialist'?'specialist':'write');
      if(options.failWrite) return new Response(JSON.stringify({error:'Truncated.',preservedDraft:'Preserved new draft.',diagnostics:[{...diagnostic('write'),status:'failed'}]}),{status:502});
      let section='New prose.';
      if(body.phase==='fill_specialist')section=++fills===1?'Opening. First saved scene. [[AION_SCENE_2]]':'Opening. First saved scene. Second saved scene.';
      else if(options.markers)section='Opening. [[AION_SCENE_1]] [[AION_SCENE_2]]';
      return response({section,wordCount:600,warnings:[],action:body.action,diagnostics:[diagnostic('write')]});
    }},
    '../app/api/story-chat/quality/route':{POST:async()=>{
      calls.push('quality');const quality={passed:false,overallStatus:'needs_attention',hardFailures:[],repairInstructions:[],summary:'Review.',findings:[{category:'test',severity:'minor',message:'Review this.',beatOrder:null}],beatAssessments:[],guidanceAdherence:{missingBeats:[],orderViolations:[],endpointViolations:[],inventedMajorEvents:[],exclusionViolations:[]},wordCountCompliance:{actual:600,minimum:500,maximum:800,withinRange:true},scores:{continuity:5,plotMovement:5,relationshipProgression:5,voiceDistinctiveness:5,povAndTense:5,repetitionControl:5,hookStrength:5}};
      return response({accepted:false,chapterContent:'Draft.',repaired:false,quality,diagnostics:[diagnostic('quality')]});
    }},
    '../app/api/story-chat/ledger/route':{POST:async()=>{calls.push('ledger');return response({storyState:{...shared.EMPTY_STORY_STATE},diagnostics:[diagnostic('ledger')]});}},
  };
  const steps=load('workflows/chapter-generation-steps.ts',{'../lib/social-job-db':{jobAdmin:()=>db},'../app/story-chat/generation':shared,...routes});
  const workflow=load('workflows/chapter-generation.ts',{'./chapter-generation-steps':steps});
  return {row,calls,steps,workflow,writerRequests};
}
(async()=>{
  let h=harness({operation:'generate',story},{markers:true});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['plan','write','specialist','specialist']);
  assert.equal(h.row.status,'completed');
  assert.equal(h.row.result.pending.draft,'Opening. First saved scene. Second saved scene.');
  assert.equal(h.row.result.pending.diagnostics.length,4);
  assert.equal(h.steps.advanceChapterJob.maxRetries,0);
  h=harness({operation:'write',action:'start',story,pending},{failWrite:true});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['write']);
  assert.equal(h.row.status,'failed');
  assert.equal(h.row.result.pending.draft,'Preserved new draft.');
  h=harness({operation:'write',action:'continue',story,pending:{...pending,draft:'Opening. [[AION_SCENE_2]]'}});
  // One remaining marker: return the final result on this resumed call.
  await h.steps.advanceChapterJob('job');
  assert.equal(h.row.checkpoint.phase,'specialist');
  assert.deepEqual(h.calls,[],'Resume must not submit Astra again');
  h=harness({operation:'complete',story,pending:{...pending,draft:'Finished draft.',qualityOverrideReady:true,qualityCheckedDraft:'Finished draft.'}});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['ledger']);
  assert.equal(h.row.result.pending,null);
  assert.equal(h.row.result.story.chapters[0].content,'Finished draft.');
  h=harness({operation:'complete',story,pending:{...pending,draft:'Review this draft.'}});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['quality']);
  assert.equal(h.row.result.pending.qualityOverrideReady,true);
  assert.equal(h.row.result.pending.draft,'Review this draft.');
  h=harness({operation:'write',action:'start',story,pending});
  await h.steps.advanceChapterJob('job');
  h.row.model_call_in_flight=true;
  await assert.rejects(h.steps.advanceChapterJob('job'),/not automatically submitted again/);
  assert.deepEqual(h.calls,[],'An interrupted model call must not be billed again on replay');
  const editedDraft='The author kept this sentence and removed the repeated scene.';
  const latestGuidance='Continue only after the edited sentence. End when the gate closes.';
  h=harness({operation:'write',action:'continue',story,pending:{...pending,draft:editedDraft,chapterBrief:JSON.stringify({originalGuidance:'Original direction, kept verbatim.',targetWordRange:{minimum:500,preferred:600,maximum:800}})},sectionInstruction:latestGuidance});
  await h.workflow.generateChapterJob('job');
  assert.equal(h.writerRequests[0].chapterDraft,editedDraft);
  assert.equal(h.writerRequests[0].sectionInstruction,latestGuidance);
  assert.equal(JSON.parse(h.writerRequests[0].chapterBrief).continuationGuidance,latestGuidance);
  assert.equal(JSON.parse(h.row.result.pending.chapterBrief).continuationGuidance,latestGuidance);
  assert.equal(JSON.parse(h.row.result.pending.chapterBrief).originalGuidance,'Original direction, kept verbatim.');
  assert.equal(h.row.result.pending.draft,editedDraft+'\n\nNew prose.');
  const fp=load('lib/chapter-job.ts').chapterSourceFingerprint;
  assert.equal(fp(story),fp({...story,storyState:{...story.storyState,lastGenerationDiagnostics:[diagnostic('test')],workspaceMetadata:{seriesType:'standalone'}}}));
  assert.notEqual(fp(story),fp({...story,chapters:[{content:'Manual edit.'}]}));
  console.log('PASS: browser-independent plan/write/specialist chain, checkpointed progress, failed-call draft recovery, resumed handoff, accepted-draft completion, no automatic paid replay and concurrent-edit fingerprints.');
})().catch(error=>{console.error(error);process.exitCode=1;});

