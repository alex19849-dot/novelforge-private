const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
let output, count=0;
const plannerSource=fs.readFileSync('lib/aion-chapter-planner.ts','utf8');
const compile=(source)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const planner={exports:{}};new Function('require','module','exports',compile(plannerSource))(require,planner,planner.exports);
const moduleUnderTest={exports:{}};
new Function('require','module','exports',compile(fs.readFileSync('lib/chapter-guidance-provider.ts','utf8')))(id=>{
 if(id==='./aion-chapter-planner')return {...planner.exports,createAionChapterPlan:async({diagnostics})=>{count++;diagnostics.push({stage:'chapter_planning'});return {output_text:output};}};
 if(id==='./story-section')return {requestedSpecialSection:text=>/prologue/i.test(text)?'prologue':/epilogue/i.test(text)?'epilogue':null};
 if(id==='../app/story-chat/generation')return {getStoryStateBeforeChapter:state=>state};
 if(id==='./chapter-guidance')return {isGuidanceProposal:()=>false};
 throw Error(id);
},moduleUnderTest,moduleUnderTest.exports);
const {draftChapterGuidance,parseGuidanceResponse,normaliseGuidanceHeadings,validateGuidanceDraft}=moduleUnderTest.exports;
const base="WRITE CHAPTER 3\nPOV: Sam, first-person present.\nTIME: Friday.\n\nPURPOSE\nDevelop their attraction.\n\nCONTINUITY FROM CHAPTER 2\n- They agreed to meet.\n\nAT THE BAR\n- Show their conversation and private reactions.\n\nENDING\nSam asks him to stay.\n\nEXCLUSIONS\n- No later events.";
const story={storyBible:{premise:'Test'},storyState:{},messages:[{role:'user',content:'Plan chapter 3'}],chapters:[]};
(async()=>{
 for(const guidance of [base,base.replace(/^(WRITE CHAPTER 3|PURPOSE|CONTINUITY FROM CHAPTER 2|ENDING|EXCLUSIONS)$/gm,'**$1:**'),base.replace('ENDING\n','ENDPOINT: '),base.replace('TIME:','TIMING:').replace('POV:','POINT OF VIEW:'),base.replace('CONTINUITY FROM CHAPTER 2','CONTINUITY'),base.replace('WRITE CHAPTER 3','### WRITE CHAPTER 3: Friday'),base.replace(/\n\nEXCLUSIONS[\s\S]*/,''),base.replaceAll('\n','\r\n')]) {
   output=JSON.stringify({guidance,question:''});const before=count,diagnostics=[];
   const result=await draftChapterGuidance(story,diagnostics);assert.equal(count,before+1);assert.equal(diagnostics[0].stage,'chapter_guidance');
   assert(result.guidance.startsWith('WRITE CHAPTER 3\n'));assert(result.guidance.includes('Sam asks him to stay.'));assert(result.guidance.includes('Show their conversation and private reactions.'));
 }
 assert.deepEqual(parseGuidanceResponse('{"guidance":"Sam\\\'s plan","question":""}'),{guidance:"Sam's plan",question:''});
 assert.deepEqual(parseGuidanceResponse('{"guidance":"line one\nline two","question":""}'),{guidance:'line one\nline two',question:''});
 assert.deepEqual(parseGuidanceResponse('```json\n{"guidance":"ok","question":""}\n```'),{guidance:'ok',question:''});
 assert.throws(()=>parseGuidanceResponse('{"guidance":"unfinished'),/unreadable/);
 assert.throws(()=>parseGuidanceResponse('{"guidance":"bad\\q","question":""}'),/unreadable/);
 assert.throws(()=>validateGuidanceDraft(normaliseGuidanceHeadings(base.replace('Sam asks him to stay.',''))),/ENDING/);
 assert.throws(()=>validateGuidanceDraft(normaliseGuidanceHeadings(base.replace('Develop their attraction.',''))),/PURPOSE/);
 assert.throws(()=>validateGuidanceDraft(base.replace('Sam, first-person present.','')),/POV/);
 output=JSON.stringify({guidance:'Incomplete',question:''});let before=count;const retained=await draftChapterGuidance(story,[]);assert.equal(retained.guidance,'');assert(retained.question.includes('Incomplete'));assert(retained.question.includes('kept the returned draft'));assert.equal(count,before+1);
 output=JSON.stringify({guidance:'',question:'Which POV?'});assert.equal((await draftChapterGuidance(story,[])).question,'Which POV?');
 for(const heading of ['WRITE CHAPTER 1','WRITE PROLOGUE','WRITE EPILOGUE']) validateGuidanceDraft(normaliseGuidanceHeadings(base.replace('WRITE CHAPTER 3',heading).replace('CONTINUITY FROM CHAPTER 2','CONTINUITY FROM STORY BIBLE')));
 for (const header of ['WRITE CHAPTER 3 (Friday)', 'WRITE CHAPTER 3 approximately 3000 words', 'CHAPTER 3: Friday', 'WRITE CHAPTER 3 – Friday']) {
 output=JSON.stringify({guidance:base.replace('WRITE CHAPTER 3',header),question:''});const fixed=await draftChapterGuidance(story,[]);assert(fixed.guidance.startsWith('WRITE CHAPTER 3\n'));assert(fixed.guidance.includes('Sam asks him to stay.'));
 }
 output=JSON.stringify({guidance:base.replace('WRITE CHAPTER 3\n',''),question:''});assert((await draftChapterGuidance(story,[])).guidance.startsWith('WRITE CHAPTER 3\n'));
 const authorBrief=base+'\n\nDETAILS\n- '+ 'Preserve the complete supplied event. '.repeat(8);story.messages=[{role:'user',content:authorBrief}];before=count;
 assert.equal((await draftChapterGuidance(story,[])).guidance,authorBrief.trim());assert.equal(count,before,'Author-supplied complete guidance still costs zero calls');
 console.log('PASS: heading variants and local JSON repair, same scene text, real incompleteness rejected, questions and special sections retained, no extra calls, supplied guidance unchanged. Offline only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
