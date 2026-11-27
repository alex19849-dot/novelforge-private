const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ts = require(process.env.NOVELFORGE_TEST_TYPESCRIPT||'typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true } }).outputText;
  const m = { exports:{} };
  new Function('require','module','exports',js)(id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.resolve(path.dirname(file),id)+'.ts',mocks) : require(id),m,m.exports);
  return m.exports;
}
const shared = load('app/story-chat/generation.ts');
const memory = load('lib/narrative-memory.ts');
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
      let section=options.prose??'New prose.';
      if(body.phase==='fill_specialist')section=++fills===1?(options.firstFilledProse??'Opening. First saved scene. [[AION_SCENE_2]]'):(options.filledProse??'Opening. First saved scene. Second saved scene.');
      else if(options.markers)section=options.mainProse??'Opening. [[AION_SCENE_1]] [[AION_SCENE_2]]';
      return response({section,wordCount:600,warnings:[],action:body.action,diagnostics:[diagnostic('write')]});
    }},
    '../app/api/story-chat/quality/route':{POST:async()=>{
      calls.push('quality');const quality={passed:false,overallStatus:'needs_attention',hardFailures:[],repairInstructions:[],summary:'Review.',findings:[{category:'test',severity:'minor',message:'Review this.',beatOrder:null}],beatAssessments:[],guidanceAdherence:{missingBeats:[],orderViolations:[],endpointViolations:[],inventedMajorEvents:[],exclusionViolations:[]},wordCountCompliance:{actual:600,minimum:500,maximum:800,withinRange:true},scores:{continuity:5,plotMovement:5,relationshipProgression:5,voiceDistinctiveness:5,povAndTense:5,repetitionControl:5,hookStrength:5}};
      return response({accepted:false,chapterContent:'Draft.',repaired:false,quality,diagnostics:[diagnostic('quality')]});
    }},
    '../app/api/story-chat/ledger/route':{POST:async req=>{
      calls.push('ledger'); const body = await req.json();
      if (options.failLedgerAt && calls.filter(c => c === 'ledger').length === options.failLedgerAt) return new Response(JSON.stringify({error:'Extraction stopped.', diagnostics:[]}), {status:502});
      return response({storyState:{...shared.EMPTY_STORY_STATE, chapterLedger:[...(body.storyState.chapterLedger ?? []), ...(body.chapters ?? [body.chapter]).map(c => ({ chapterNumber:c.number,title:c.title,povCharacter:c.povCharacter,summary:'Accepted chapter.',openingLocation:'Room',endingLocation:'Room',endingTime:'Friday',endingExcerpt:'Accepted ending.',relationshipShift:'',intimacyMilestone:'',newFacts:[],unresolvedThreads:[],repeatedBeats:[],narrativeMemory:memory.groundNarrativeRecords([],c) }))]},diagnostics:[diagnostic('ledger')]});
    }},
  };
  const editorialServer=load('lib/prose-editorial-server.ts');
  let currentReview,currentTargets,reviewCount=0;
  const editor={...editorialServer,
    buildEditorialReview:(context,edits=[])=>{currentReview={...editorialServer.buildEditorialReview(context,edits),edits,context};return currentReview;},
    buildEditorialRepair:(context,targets,writer)=>{currentTargets=targets;return editorialServer.buildEditorialRepair(context,targets,writer);},
    executeEditorialCall:async(plan,diagnostics)=>{
      calls.push(plan.stage);diagnostics.push(diagnostic(plan.stage));
      if(options.failEditor)throw Error('Editorial provider interrupted.');
      if(plan.writer!=='mini')return {replacements:currentTargets.map(t=>({id:t.id,replacement:options.replacement?options.replacement(t):t.original+' A newly phrased reaction.'}))};
      reviewCount++;
      const {material,edits}=currentReview;
      if(options.report)return options.report({material,edits,reviewCount,context:currentReview.context});
      return {findings:[],signalAssessments:material.signals.map(s=>({id:s.id,disposition:'intentional',reason:'Required by this test scene.'})),preservation:edits.map(e=>({id:e.id,preserved:true,reason:'All original actions and details retained.'})),overflow:false};
    }
  };
  const steps=load('workflows/chapter-generation-steps.ts',{'../lib/prose-editorial-server':editor,'../lib/social-job-db':{jobAdmin:()=>db},'../app/story-chat/generation':shared,...routes});
  const workflow=load('workflows/chapter-generation.ts',{'./chapter-generation-steps':steps});
  return {row,calls,steps,workflow,writerRequests};
}
(async()=>{
  let h=harness({operation:'generate',story},{markers:true});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['plan','write','specialist','specialist','automatic_prose_check']);
  assert.equal(h.row.status,'completed');
  assert.equal(h.row.result.pending.draft,'Opening. First saved scene. Second saved scene.');
  assert.equal(h.row.result.pending.diagnostics.length,5);
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
  assert.deepEqual(h.calls,['automatic_prose_check','ledger']);
  assert.equal(h.row.result.pending,null);
  assert.equal(h.row.result.story.chapters[0].content,'Finished draft.');
  h=harness({operation:'complete',story,pending:{...pending,draft:'Review this draft.'}});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['automatic_prose_check','quality']);
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
  const book = {...clone(story), chapters:Array.from({length:5},(_,i)=>({id:String(i+1),number:i+1,title:`Chapter ${i+1}`,povCharacter:'Sam',content:`Accepted source chapter ${i+1}.`})), storyState:{...shared.EMPTY_STORY_STATE,memoryCorrections:[{targetId:'author:test',replacement:'Author fact.',kind:'fact',characters:['Sam'],chapterNumber:1,suppressed:false}]}};
  h=harness({operation:'memory',memoryBuildApproved:true,story:book,pending:{...pending,draft:'Unfinished draft, retain it.'}});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['ledger','ledger']);
  assert.equal(h.row.status,'completed');
  assert.deepEqual(h.row.result.story.chapters,book.chapters);
  assert.deepEqual(h.row.result.story.storyBible,book.storyBible);
  assert.equal(h.row.result.pending.draft,'Unfinished draft, retain it.');
  assert.equal(h.row.result.story.storyState.memoryCorrections[0].replacement,'Author fact.');
  assert.equal(memory.memoryCoverage(h.row.result.story.storyState,book.chapters).complete,5);
  h=harness({operation:'memory',memoryBuildApproved:true,story:book},{failLedgerAt:2});
  await h.workflow.generateChapterJob('job');
  assert.equal(h.row.status,'failed');
  assert.equal(memory.memoryCoverage(h.row.result.story.storyState,book.chapters).complete,3,'Completed memory batches survive a later failure');
  const partial=h.row.result.story;
  h=harness({operation:'memory',memoryBuildApproved:true,story:partial});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['ledger'],'A resumed build must not bill completed batches again');
  assert.equal(memory.memoryCoverage(h.row.result.story.storyState,book.chapters).complete,5);
  h=harness({operation:'memory',memoryBuildApproved:false,story:book});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,[],'A build needs explicit in-app cost approval');
  const fp=load('lib/chapter-job.ts').chapterSourceFingerprint;
  assert.equal(fp(story),fp({...story,storyState:{...story.storyState,lastGenerationDiagnostics:[diagnostic('test')],workspaceMetadata:{seriesType:'standalone'}}}));
  assert.notEqual(fp(story),fp({...story,chapters:[{content:'Manual edit.'}]}));
  // New chapters cannot finish before automatic editing. Precise repairs are
  // applied only after their preservation recheck, without author approvals.
  const original='I close the latch, and he looks over, and my answer sticks in my throat.';
  const replacement='I close the latch. He looks over, waiting for an answer that still sticks in my throat.';
  const report=({material,edits,reviewCount})=>({
    findings:reviewCount===1?[{id:'f1',category:'sentence_pattern',paragraphIds:['p1'],evidence:[{sourceId:'p1',quote:material.paragraphs[0].text}],reason:'Repeated clause joins.',direction:'Vary the syntax, retaining every movement and thought.'}]:[],
    signalAssessments:material.signals.map(s=>({id:s.id,disposition:reviewCount===1?'repair':'not_problem',reason:'Checked against the live prose.'})),
    preservation:edits.map(e=>({id:e.id,preserved:true,reason:'All physical actions, inner thought and endpoint preserved.'})),overflow:false});
  h=harness({operation:'write',action:'start',story,pending},{prose:original,report,replacement:()=>replacement});
  await h.steps.advanceChapterJob('job');await h.steps.advanceChapterJob('job');
  assert.equal(h.row.checkpoint.phase,'editorial');assert.equal(h.row.checkpoint.pending.draft,original);
  assert.deepEqual(h.calls,['write']);
  await assert.rejects(h.steps.finishChapterJob('job'),/not passed automatic editing/);
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['write','automatic_prose_check','automatic_prose_repair_astra','automatic_prose_recheck']);
  assert.equal(h.row.result.pending.draft,replacement);assert.equal(h.row.result.pending.automaticEditorial.edits[0].original,original);assert.equal(h.row.result.pending.automaticEditorial.status,'passed');
  assert.equal(h.row.result.pending.lastSection,replacement);
  const checkedPending=clone(h.row.result.pending);
  h=harness({operation:'generate',story},{markers:true,filledProse:original,report,replacement:()=>replacement});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['plan','write','specialist','specialist','automatic_prose_check','automatic_prose_repair_aion','automatic_prose_recheck']);
  assert.equal(h.row.result.pending.draft,replacement);assert.equal(h.row.result.pending.automaticEditorial.edits[0].writer,'aion');

  const intimate='He cups my cheek, and I lean closer, and he presses his forehead to mine.';
  const intimateRepair='He cups my cheek. I lean closer until he presses his forehead to mine.';
  const combined=original+'\n\n'+intimate+'\n\nHis hand drops. He steps back.';
  const mixedReport=({material,edits,reviewCount})=>({
    findings:reviewCount===1?['p1','p2'].map((id,i)=>({id:'f'+(i+1),category:'sentence_pattern',paragraphIds:[id],evidence:[{sourceId:id,quote:material.paragraphs.find(p=>p.id===id).text}],reason:'Chained movements.',direction:'Retain the actions and vary their syntax.'})):[],
    signalAssessments:material.signals.map(s=>({id:s.id,disposition:reviewCount===1?'repair':'not_problem',reason:'Compared to the exact paragraph.'})),preservation:edits.map(e=>({id:e.id,preserved:true,reason:'Every movement and thought retained.'})),overflow:false});
  h=harness({operation:'generate',story},{markers:true,mainProse:original+'\n\n[[AION_SCENE_1]]\n\n[[AION_SCENE_2]]',firstFilledProse:original+'\n\n'+intimate+'\n\n[[AION_SCENE_2]]',filledProse:combined,report:mixedReport,replacement:t=>t.id==='f1'?replacement:intimateRepair});
  await h.workflow.generateChapterJob('job');
  assert.deepEqual(h.calls,['plan','write','specialist','specialist','automatic_prose_check','automatic_prose_repair_astra','automatic_prose_repair_aion','automatic_prose_recheck']);
  assert.equal(h.row.status,'completed');assert.equal(h.row.result.pending.draft,replacement+'\n\n'+intimateRepair+'\n\nHis hand drops. He steps back.');
  assert.deepEqual(h.row.result.pending.automaticEditorial.edits.map(e=>e.writer),['astra','aion']);
  assert.equal(load('lib/prose-editorial.ts').restoreEditorialOriginal(h.row.result.pending.draft,h.row.result.pending.automaticEditorial),combined);
  // Accepting the unchanged checked draft must not pay for another style check.
  h=harness({operation:'complete',story,pending:{...checkedPending,qualityOverrideReady:true,qualityCheckedDraft:replacement}});
  await h.workflow.generateChapterJob('job');assert.deepEqual(h.calls,['ledger']);
  assert.equal(h.row.result.story.chapters[0].automaticEditorial.edits[0].original,original);
  const edited={...checkedPending,draft:replacement+' Manual change.'};
  h=harness({operation:'complete',story,pending:edited});await h.workflow.generateChapterJob('job');assert(h.calls.includes('automatic_prose_check'),'A manual edit invalidates the old check');
  h=harness({operation:'write',action:'start',story,pending},{prose:original,report:args=>{const r=report(args);if(args.reviewCount>1)r.preservation[0].preserved=false;return r;},replacement:()=>replacement});
  await h.workflow.generateChapterJob('job');assert.equal(h.row.status,'failed');assert.equal(h.row.result.pending.draft,original,'A destructive repair must never replace the original');assert.equal(h.row.result.pending.automaticEditorial,undefined);assert.equal(h.calls.filter(c=>c.includes('repair')).length,1);
  h=harness({operation:'write',action:'start',story,pending},{prose:original,report:args=>report({...args,reviewCount:1}),replacement:()=>replacement});
  await h.workflow.generateChapterJob('job');assert.equal(h.row.status,'failed');assert.equal(h.row.result.pending.draft,original,'Unresolved repetition does not get marked ready');
  h=harness({operation:'write',action:'start',story,pending},{failEditor:true});await h.workflow.generateChapterJob('job');assert.equal(h.row.status,'failed');assert.equal(h.row.result.pending.draft,'New prose.');assert.deepEqual(h.calls,['write','automatic_prose_check']);
  process.env.NOVELFORGE_AUTO_EDIT_MAX_USD='0.000001';
  h=harness({operation:'write',action:'start',story,pending});await h.workflow.generateChapterJob('job');assert.deepEqual(h.calls,['write'],'A cost rejection must happen before a model submission');assert.equal(h.row.status,'failed');delete process.env.NOVELFORGE_AUTO_EDIT_MAX_USD;
  console.log('PASS: browser-independent plan/write/specialist chain, checkpointed progress, failed-call draft recovery, resumed handoff, accepted-draft completion, no automatic paid replay and concurrent-edit fingerprints.');
})().catch(error=>{console.error(error);process.exitCode=1;});


