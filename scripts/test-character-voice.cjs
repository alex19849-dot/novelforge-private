const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require(process.env.NOVELFORGE_TEST_TYPESCRIPT||'typescript');
const root=path.resolve(__dirname,'..'),fallback=process.env.NOVELFORGE_SOURCE_ROOT||path.resolve(root,'../style_learning');
const cache=new Map(),calls=[];
const neutral=Array.from({length:550},(_,i)=>'fixture'+i).join(' ')+'.\n<END_SECTION>';
class FakeOpenAI {
 constructor() {
  this.responses = { create: async input => { calls.push(input); return { status: 'completed', output_text: neutral, usage: {} }; } };
  this.chat = { completions: { create: async input => { calls.push(input); return { choices: [{ finish_reason: 'stop', message: { content: neutral } }], usage: {} }; } } };
 }
}
FakeOpenAI.APIError = class extends Error {};
FakeOpenAI.APIConnectionError = class extends Error {};

function load(relative){if(cache.has(relative))return cache.get(relative);let file=path.join(root,relative);if(!fs.existsSync(file))file=path.join(fallback,relative);let source=fs.readFileSync(file,'utf8');if(relative==='app/api/story-chat/write/route.ts')source+='\nexport const testOnly = { mainWriterSystemPrompt, getPrompt, writeSpecialistScene };';const m={exports:{}};cache.set(relative,m.exports);const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true});assert(!result.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error),relative);new Function('require','module','exports',result.outputText)(n=>n==='openai'?FakeOpenAI:n==='next/server'?{NextResponse:{json:(v,o)=>Response.json(v,o)}}:n.startsWith('.')?load(path.normalize(path.join(path.dirname(relative),n+'.ts'))):require(n),m,m.exports);return m.exports;}
(async()=>{process.env.OPENAI_API_KEY='mock';process.env.OPENROUTER_API_KEY='mock';const prose=load('lib/prose-writer.ts'),route=load('app/api/story-chat/write/route.ts');
assert.equal(prose.PROSE_WRITER.model,'gpt-6-astra');assert.equal(prose.proseCostEstimate(prose.PROSE_WRITER.model,1000,1000),0.06);
for(const term of ['age at the time of this scene','where he grew up','British expatriate','American expatriate','substantial, character-specific inner thoughts','Preserve emotional depth'])assert((prose.DIRECT_THOUGHT_INSTRUCTION+' '+prose.PROSE_BALANCE_INSTRUCTION).includes(term),term);
for(const action of ['start','continue','rewrite'])for(const handoff of [false,true]){const prompt=route.testOnly.mainWriterSystemPrompt(handoff,action);assert(prompt.includes(prose.DIRECT_THOUGHT_INSTRUCTION));assert(prompt.includes(prose.PROSE_BALANCE_INSTRUCTION));if(handoff)assert(prompt.includes('write none of its actions'));if(action==='continue')assert(prompt.includes('can be short'));}
const brief={chapterNumber:1,chapterKind:'chapter',chapterTitle:'Fixture',povCharacter:'A',originalGuidance:'They discuss a decision.',authorDirection:'They discuss a decision.',requiredBeats:[{order:1,instruction:'They discuss a decision.',specialistWriter:null}],endpoint:'They decide.',exclusions:[],targetWordRange:{minimum:500,preferred:650,maximum:1000}};
const input={action:'start',storyBible:{characters:['A, 23, grew up in Britain and now lives in America.']},storyState:{voiceProfiles:[{characterName:'A',vocabulary:'A generic ornate narrator'}]},recentChapters:[],chapterBrief:JSON.stringify(brief),chapterTitle:'Fixture',povCharacter:'A',chapterDraft:'',sectionToRewrite:'',sectionInstruction:'',latestUserMessage:brief.originalGuidance,specialistScenes:[]};
const prompt=route.testOnly.getPrompt(input);assert(prompt.includes('His age in this scene, upbringing and established regional speech take priority'));assert(prompt.includes('British expatriate'));assert(prompt.includes('grew up in Britain'));assert(prompt.includes('generic ornate narrator'));
await route.testOnly.writeSpecialistScene({scene:{order:1,instruction:'Follow the author direction.',marker:'[[AION_SCENE_1]]'},assembledDraft:'Opening.\n[[AION_SCENE_1]]\nEnding.',storyBible:input.storyBible,storyState:input.storyState,chapterBrief:input.chapterBrief,povCharacter:'A',diagnostics:[]});assert.equal(calls.length,1);assert.equal(calls[0].model,'aion-labs/aion-3.5');assert(JSON.stringify(calls[0]).includes(prose.DIRECT_THOUGHT_INSTRUCTION));
const ledger=fs.readFileSync(path.join(root,'app/api/story-chat/ledger/route.ts'),'utf8');assert(ledger.includes('current residence from the dialect'));assert(ledger.includes('do not treat those output habits as canon'));
console.log('PASS: main start/continue/rewrite and automatic AION receive the shared age/background/regional/clear-prose instructions; saved profiles defer to character facts; ledger does not preserve flowery habits as canon. Models, pricing, inner-thought and heat-preservation instructions retained. Mock provider output only; no paid calls.');
})().catch(error=>{console.error(error);process.exitCode=1});
