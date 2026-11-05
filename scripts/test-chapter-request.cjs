const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file) {
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText;
 const m={exports:{}};
 new Function('require','module','exports',js)(id=>load(path.resolve(path.dirname(file),id)+'.ts'),m,m.exports);
 return m.exports;
}
const routing=load('lib/chapter-request.ts');
const bible=load('lib/story-bible-request.ts');
const lowdownGuidance = 'CHAPTER 1, KAINON\nFirst-person present. Night one.\n\nPURPOSE\nEstablish Kainon and Jesse.\n\nOPENING\n- Follow the Story Bible.\n- End with Jesse accepting the ride.';
assert(routing.requestsChapterGeneration(lowdownGuidance));
assert(!bible.isStoryBibleRequest(lowdownGuidance));
assert(routing.requestsChapterGeneration('AION: ' + lowdownGuidance));
for(const text of ['Write CHAPTER 9\nPOV: Sam','Continue chapter 2 from the last sentence.','Start the next chapter.','Chapter 9\nPOV: Sam\nTiming: Friday.\n1. He arrives.','## CHAPTER 10\nPOV: Sam','EPILOGUE\nTiming: One year later.','Next chapter.','**CHAPTER 12**\nPOV: Sam','Next chapter.\nPOV: Sam','Continue','Keep going.','Carry on.']) assert(routing.requestsChapterGeneration(text),text);
for(const text of ['Do not write Chapter 9.','Please do not generate a chapter.','Outline chapter 9 before we write chapter 9.','Explain why chapter 9 failed.','Can you review chapter 9?','Rewrite this passage.','Update the Story Bible. Do not write a chapter.','Create a new story bible with 18 chapters.','What did chapter 9 establish?']) assert(!routing.requestsChapterGeneration(text),text);
assert(routing.continuesPendingChapter('Continue chapter 2.',2));
assert(!routing.continuesPendingChapter('Continue chapter 3.',2));
assert(!routing.continuesPendingChapter('Write chapter 2.',2));
// Exercise the actual chat submit handler with inert queue and UI dependencies.
const page=fs.readFileSync('app/story-chat/page.tsx','utf8');
const source=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='sendMessage')handler=node.getText(source);ts.forEachChild(node,visit)}visit(source);
assert(handler);
const js=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS}}).outputText;
async function submit(text,pending){
 const calls=[];
 const story={id:'story',chapters:[{id:'one',number:1,content:'Saved chapter.'}],messages:[],storyBible:{},storyState:{}};
 const deps={input:text,pendingGeneration:pending,story,isThinking:false,getChapterDeletionRequest:()=>({kind:'none'}),isStoryBibleRequest:bible.isStoryBibleRequest,...routing,setStory:()=>{},setInput:()=>{},setIsThinking:()=>{},queueChapterBackground:async input=>calls.push(input)};
 const run=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${js};return sendMessage;`)(deps);
 await run({preventDefault(){}});return calls;
}
(async()=>{
 const pending={storyId:'story',generatedChapter:{replaceChapterNumber:2},draft:'Existing edited draft.',chapterBrief:'Contract'};
 for(const text of ['Write chapter 2.','Continue chapter 2.','Chapter 2\nPOV: Sam\nTiming: Friday.','Next chapter.',lowdownGuidance]){
  const calls=await submit(text);assert.equal(calls.length,1,text);assert.equal(calls[0].operation,'generate');assert.equal(calls[0].story.messages.at(-1).content,text);
 }
 let calls=await submit('Continue chapter 2.',pending);assert.equal(calls[0].operation,'write');assert.equal(calls[0].action,'continue');assert.equal(calls[0].pending,pending);assert.equal(calls[0].sectionInstruction,'Continue chapter 2.');
 calls=await submit('Chapter 3\nPOV: Sam\nTiming: Friday.',pending);assert.equal(calls[0].operation,'generate');assert.equal(calls[0].pending,pending,'Retain old draft as recovery input until the new plan succeeds');
 console.log('PASS: shared chapter commands and pasted guidance, exclusions for Bible/planning/chat, actual submit queues before planning, continuation keeps edited draft, new guidance retains recovery draft.');
})().catch(error=>{console.error(error);process.exitCode=1});
