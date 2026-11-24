// Offline regression: inspect the actual prompts sent to each writer, no API calls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY = 'offline-test';
let output = 'I close the gate.\n<END_SECTION>';
const calls = [];
class AI {
  constructor() {
    this.responses = { create: async request => {
      calls.push(request);
      return {status:'completed', output_text:output, output:[], usage:{}};
    }};
    this.chat = {completions:{create:async request => {
      calls.push(request);
      return {choices:[{finish_reason:'stop',message:{content:output}}],usage:{}};
    }}};
  }
}
function load(file, extra = '') {
  file = path.resolve(file);
  const compiled = ts.transpileModule(fs.readFileSync(file,'utf8')+'\n'+extra, {
    fileName:file, reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
  });
  assert.deepEqual(compiled.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  const module={exports:{}};
  new Function('require','module','exports',compiled.outputText)(id=>{
    if(id==='openai') return AI;
    if(id==='next/server') return {NextResponse:{json:(data,opts)=>({data,status:opts?.status??200})}};
    // Style storage is unrelated to prompt wiring and must not access a database.
    if(id.endsWith('/author-style-server')) return {requestStyleContext:async()=>''};
    if(id.startsWith('.')) return load(path.resolve(path.dirname(file),id)+'.ts');
    return require(id);
  },module,module.exports);
  return module.exports;
}
const style=load('lib/prose-writer.ts');
const writer=load('app/api/story-chat/write/route.ts','export {mainWriterSystemPrompt,getPrompt,writeSpecialistScene};');
const brief=JSON.stringify({chapterNumber:1,povCharacter:'Sam',requiredBeats:[{order:1,instruction:'Talk, then leave.',specialistWriter:null}],originalGuidance:'Talk, then leave.',endpoint:'Sam leaves.',targetWordRange:{minimum:500,preferred:600,maximum:800}});
const input={action:'start',storyBible:{},storyState:{},recentChapters:[],chapterBrief:brief,chapterTitle:'One',povCharacter:'Sam',chapterDraft:'',sectionToRewrite:'',sectionInstruction:'',latestUserMessage:'',specialistScenes:[]};
function check(prompt) {
  assert(prompt.includes(style.REPETITION_STYLE_INSTRUCTION),'Shared rules reach the actual prompt');
  assert.equal(prompt.split(style.REPETITION_STYLE_INSTRUCTION).length-1,1,'No duplicate shared block within a prompt');
  for(const text of ['comma-and chains','substantial character-specific inner thoughts and feelings','Do not shorten an intimate scene','unplugging lights','No, it isn\'t','PRIOR PROSE IS CONTINUITY, NOT A STYLE TEMPLATE']) assert(prompt.includes(text),text);
  assert(!/consent|safeguard|aged eighteen/i.test(prompt),'No removed editorial boilerplate');
}
(async()=>{
  for(const action of ['start','continue','rewrite']) {
    for(const handoff of [false,true]) check(writer.mainWriterSystemPrompt(handoff,action));
    check(writer.getPrompt({...input,action}));
  }
  output=Array.from({length:600},(_,i)=>'word'+i).join(' ')+'.\n<END_SECTION>';
  let response=await writer.POST({json:async()=>({action:'start',povCharacter:'Sam',chapterBrief:brief})});
  assert.equal(response.status,200,JSON.stringify(response.data));
  assert.equal(calls.at(-1).model,'gpt-6.2-astra');
  check(calls.at(-1).input[0].content); check(calls.at(-1).input[1].content);
  output='I close the gate.\n<END_SECTION>';
  await writer.writeSpecialistScene({scene:{marker:'unused',instruction:'Close the gate.',wordTarget:20},assembledDraft:'I reach for it.',storyBible:{},storyState:{},chapterBrief:brief,povCharacter:'Sam',diagnostics:[],continuation:true});
  assert.equal(calls.at(-1).model,'aion-labs/aion-3.5');
  check(calls.at(-1).messages[1].content);
  output=Array.from({length:360},(_,i)=>'scene'+i).join(' ')+'.';
  await writer.writeSpecialistScene({scene:{marker:'[[AION_SCENE_1]]',instruction:'Complete the assigned scene.',wordTarget:360},assembledDraft:'I open the door.\n\n[[AION_SCENE_1]]\n\nI close the gate.',storyBible:{},storyState:{},chapterBrief:brief,povCharacter:'Sam',diagnostics:[]});
  check(calls.at(-1).messages[1].content);
  const rewrite=load('app/api/story-chat/rewrite/route.ts');
  for(const instruction of ['Rewrite this.','AION: Rewrite this.']) {
    // More than 600 words exercises Astra, rather than the existing small-edit model.
    const passage=Array.from({length:610},(_,i)=>'old'+i).join(' ')+'.';
    output='A complete replacement.';
    response=await rewrite.POST({json:async()=>({chapterContent:'Before.\n\n'+passage+'\n\nAfter.',passage,instruction})});
    assert.equal(response.status,200,JSON.stringify(response.data));
    const call=calls.at(-1);
    assert.equal(call.model,instruction.startsWith('AION')?'aion-labs/aion-3.5':'gpt-6.2-astra');
    check(call.input?.[1]?.content??call.messages[1].content);
  }
  const aion=load('app/api/story-chat/aion/route.ts');
  response=await aion.POST({json:async()=>({message:'AION: Rewrite this.\nOld passage.',chapterDraft:'Old passage.'})});
  assert.equal(response.status,200,JSON.stringify(response.data));
  check(calls.at(-1).messages[1].content);
  for (const call of calls) {
    const system = (call.messages ?? call.input)[0].content;
    assert.equal(system.includes(style.AION_SENTENCE_RHYTHM_INSTRUCTION), call.model === 'aion-labs/aion-3.5', 'Aion-only rhythm instruction is in the actual system message, never Astra');
    if (call.model === 'aion-labs/aion-3.5') {
      assert.equal(system.split(style.AION_SENTENCE_RHYTHM_INSTRUCTION).length - 1, 1);
      assert(system.includes('not deleting or summarising'));
      assert(system.includes('uniformly short sentences'));
    }
  }
  assert.equal(calls.length,6,'No additional review calls or automatic model retries');
  console.log('PASS: Aion-specific system instruction verified for insertion, continuation and both rewrite routes; Astra system messages unchanged;  shared repetition rules in Astra start/continue/rewrite, Aion insertion/continuation, both passage editors and direct Aion; model IDs unchanged; no real model or database calls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
