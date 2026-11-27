const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://test.local/story-chat'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>id in mocks?mocks[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts',mocks):require(id),m,m.exports);return m.exports;}
const core=load('lib/manuscript-review.ts');
const story={id:'test-story',title:'Test',storyBible:{premise:'A romance',notes:[]},chapters:[{id:'c1',number:1,title:'First',povCharacter:'Sam',content:'I don’t know.'}]};const original=JSON.stringify(story);
let jobs=[],postActions=[],patches=0,root,key,quote;
const report=core.checkManuscriptReport({findings:[{id:'F1',kind:'editorial_opinion',severity:'minor',category:'Voice',explanation:'Consider the context.',correctionDirection:'Check the exchange.',evidence:[{sourceId:'chapter_1',paragraphId:'p1',quote:'I don’t know.'}]}],strengths:['Natural dialogue.'],limitations:['One screening run.']},core.prepareManuscriptReview(story));
global.fetch=async(_url,opts)=>{const method=opts.method;if(method==='GET')return new Response(JSON.stringify({jobs}));const body=JSON.parse(opts.body);if(method==='POST'){postActions.push(body.action);if(body.action==='estimate')return new Response(JSON.stringify({quote}));assert.equal(body.approvedBudgetUsd,quote.maximumUsd);jobs=[{id:body.id,story_id:story.id,status:'generating',source_key:key,report:null,dismissed_ids:[],diagnostic:null,error_message:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];return new Response(JSON.stringify({job:jobs[0]}),{status:202});}if(method==='PATCH'){patches++;jobs[0]={...jobs[0],dismissed_ids:body.dismissed?[body.findingId]:[]};return new Response(JSON.stringify({job:jobs[0]}));}throw new Error('Unexpected API');};
const Panel=load('app/story-chat/components/ManuscriptReviewPanel.tsx',{'../../../lib/supabaseClient':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'mock-only'}}})}}}}).default;
const pause=()=>new Promise(r=>setTimeout(r,20));
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
async function mount(s=story){root=createRoot(document.getElementById('root'));await act(async()=>{root.render(React.createElement(Panel,{story:s,busy:false}));await pause();});await act(pause);}
async function click(text){const el=button(text);assert(el,`Missing button ${text}`);assert(!el.disabled,`Disabled button ${text}`);await act(async()=>{el.click();await pause();});}
(async()=>{
 key=await core.reviewSourceKey(story);quote=core.reviewCostQuote(core.prepareManuscriptReview(story),key);
 await mount();assert.equal(postActions.length,0);assert(!button('Confirm cost and review book'));
 await click('Check review cost');assert.deepEqual(postActions,['estimate']);assert(button('Confirm cost and review book'));assert(document.body.textContent.includes('Approval allowance'));
 await click('Confirm cost and review book');assert.deepEqual(postActions,['estimate','start']);assert(document.body.textContent.includes('Your book is being checked'));
 await act(async()=>root.unmount());
 jobs[0]={...jobs[0],status:'completed',report};
 await mount();assert.equal(postActions.length,2,'Remount must not send another paid start');assert(document.body.textContent.includes('Consider the context.'));assert(document.body.textContent.includes('Passage in your book'));assert(document.querySelectorAll('article').length===1);
 await click('Keep my text');assert.equal(patches,1);assert(!document.body.textContent.includes('Consider the context.'));
 const cb=document.querySelector('input[type=checkbox]');await act(async()=>{cb.click();await pause();});assert(button('Reconsider this suggestion'));
 await click('Reconsider this suggestion');assert.equal(patches,2);assert(button('Keep my text'));
 const changed={...story,chapters:[{...story.chapters[0],content:'Changed prose.'}]};await act(async()=>{root.render(React.createElement(Panel,{story:changed,busy:false}));await pause();});await act(pause);assert(document.body.textContent.includes('edited the book since this review'));assert(button('Review this fix').disabled);
 await act(async()=>root.unmount());
 jobs[0]={...jobs[0],source_key:key,dismissed_ids:[],report:{...report,findings:[...report.findings,{...report.findings[0],id:'F2',explanation:'Second distinct suggestion.'}]}};
 await mount();assert.equal(document.querySelectorAll('article').length,1);assert(document.body.textContent.includes('Suggestion 1 of 2'));assert(!document.body.textContent.includes('Second distinct suggestion.'));assert(!button('Check review cost'),'Existing report opens directly at suggestions');
 await click('Next suggestion');assert(document.body.textContent.includes('Suggestion 2 of 2'));assert(document.body.textContent.includes('Second distinct suggestion.'));assert(!document.body.textContent.includes('Consider the context.'));
 await click('Previous');assert(document.body.textContent.includes('Suggestion 1 of 2'));
 await click('Review updated book');assert(button('Check review cost'));assert(!document.querySelector('article'));await click('Back to suggestions');assert(document.querySelector('article'));assert.deepEqual(postActions,['estimate','start'],'Navigation and reopening setup do not spend money');
 assert.equal(JSON.stringify(story),original);assert.deepEqual(postActions,['estimate','start']);
 await act(async()=>root.unmount());dom.window.close();
 console.log('PASS: explicit cost confirmation before start, one start only, unmount/reopen recovery, saved dismiss/restore, stale-report warning, no automatic edit or model retry.');
})().catch(async e=>{console.error(e);if(root)await act(async()=>root.unmount());dom.window.close();process.exitCode=1;});
