const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}) { const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',mocks):require(id),m,m.exports);return m.exports; }
const core=load('lib/manuscript-review.ts');
const story={title:'Test',storyBible:{premise:'A romance',notes:['A fact']},chapters:[{id:'a',number:1,title:'First',povCharacter:'Sam',content:'I don’t know. He looks away.\n\nHe returns.'},{id:'b',number:2,title:'Second',povCharacter:'Rob',content:'The door is locked.'}]};
const input=core.prepareManuscriptReview(story);
function finding(quote='I don’t know.',paragraphId='p1',sourceId='chapter_1') { return {id:'F1',kind:'possible_issue',severity:'moderate',category:'Voice',explanation:'Check context.',correctionDirection:'Check the paragraph.',evidence:[{sourceId,paragraphId,quote}]}; }
function report(f=[]) {return {findings:f,strengths:[],limitations:[]};}
(async()=>{
 assert.equal(core.countReviewWords("I don’t know what he's doing in a blood-red shirt."),10);
 assert.equal(input.measuredLengths[0].target,null);
 assert.equal(input.sources.length,3);assert.equal(input.sources[2].chapterId,'b');
 assert.equal(core.checkManuscriptReport(report(),input).findings.length,0);
 assert(core.checkManuscriptReport(report([finding()]),input).findings[0].evidenceChecked);
 for(const f of [finding('I don’t know,'),finding("I don't know."),finding('I don’t … away.'),finding('I don’t know.','p2'),finding('absent','p1','unseen')]) assert.equal(core.checkManuscriptReport(report([f]),input).findings[0].evidenceChecked,false);
 const empty=finding();empty.evidence=[];assert.equal(core.checkManuscriptReport(report([empty]),input).unverifiedFindings,1);
 assert.throws(()=>core.checkManuscriptReport(report([finding(),finding()]),input),/incomplete/);
 assert.throws(()=>core.checkManuscriptReport({findings:'bad'},input),/invalid/);
 const q=core.reviewCostQuote(input,'key');assert(q.maximumUsd>=q.estimatedUsd);assert(q.maximumUsd>=((q.inputBytes+2048)*2.5+12000*7.5)/1e6);
 const large=structuredClone(story);large.chapters[0].content='x'.repeat(810000);assert.throws(()=>core.reviewCostQuote(core.prepareManuscriptReview(large),'x'),/size limit/);
 const key=await core.reviewSourceKey(story);const copy=structuredClone(story);copy.chapters.reverse();copy.storyBible={notes:['A fact'],premise:'A romance'};assert.equal(await core.reviewSourceKey(copy),key);
 copy.chapters[0].content+=' New.';assert.notEqual(await core.reviewSourceKey(copy),key);
 assert.throws(()=>core.prepareManuscriptReview({...story,chapters:[]}),/at least/);
 let calls=0,mode='success',lastBody;
 process.env.OPENAI_API_KEY='mock-only';
 global.fetch=async(_url,opts)=>{calls++;lastBody=JSON.parse(opts.body);if(mode==='timeout'){const e=new Error('timeout');e.name='TimeoutError';throw e;}if(mode==='http')return new Response('{}',{status:429});return new Response(JSON.stringify({status:mode==='truncated'?'incomplete':'completed',incomplete_details:mode==='truncated'?{reason:'max_output_tokens'}:null,usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cache_write_tokens:90},output_tokens_details:{reasoning_tokens:10}},output:[{content:[{type:'output_text',text:mode==='malformed'?'invalid':JSON.stringify(report([finding()]))}]}]}),{status:200});};
 const provider=load('lib/manuscript-review-provider.ts');
 let out=await provider.requestManuscriptReview(input,q.maximumUsd);assert(out.report);assert.equal(calls,1);assert.equal(lastBody.model,'gpt-6.1-terra');assert.equal(lastBody.max_output_tokens,12000);assert.equal(lastBody.store,false);assert.equal(out.diagnostic.costUsd,0.0003225);assert.equal(lastBody.tools,undefined);
 for(mode of ['timeout','truncated','malformed','http']){const before=calls;out=await provider.requestManuscriptReview(input,q.maximumUsd);assert(out.error);assert.equal(calls,before+1);assert(!out.report);}
 const before=calls;await assert.rejects(()=>provider.requestManuscriptReview(input,0),/Approve/);assert.equal(calls,before);
 assert.equal(JSON.stringify(story.chapters[0].content),JSON.stringify('I don’t know. He looks away.\n\nHe returns.'));
 console.log('PASS: exact evidence, stable source versions, full-source scope, word count/no invented target, bounded cost, one-call provider, timeout/truncation/malformed handling, no manuscript mutation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
