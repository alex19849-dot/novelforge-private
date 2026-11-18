const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const ts=require(process.env.NOVELFORGE_TEST_TYPESCRIPT||'typescript'),root=path.resolve(__dirname,'..'),cache=new Map();
function load(p){p=path.resolve(p);if(cache.has(p))return cache.get(p);const m={exports:{}};const out=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,p);vm.runInNewContext(out.outputText,{require:n=>load(path.resolve(path.dirname(p),n)+'.ts'),module:m,exports:m.exports,TextEncoder,crypto:require('crypto').webcrypto},{filename:p});cache.set(p,m.exports);return m.exports;}
(async()=>{
const guidance=load(path.join(root,'lib/chapter-guidance.ts')),routing=load(path.join(root,'lib/specialist-routing.ts'));
const base={storyBible:{premise:'one'},chapters:[{number:1,content:'Accepted prose'}],storyState:{importantFacts:[],lastGenerationDiagnostics:[]}};
const key=await guidance.chapterGuidanceSourceKey(base);
assert.equal(key,await guidance.chapterGuidanceSourceKey({...base,storyState:{...base.storyState,authorStyleContext:''}}));
assert.equal(key,await guidance.chapterGuidanceSourceKey({...base,storyState:{...base.storyState,authorStyleContext:'Approved writing preference'}}));
assert(await guidance.matchesChapterGuidanceSource(base,key));
assert(!await guidance.matchesChapterGuidanceSource({...base,chapters:[{number:1,content:'Changed prose'}]},key));
assert(!await guidance.matchesChapterGuidanceSource({...base,storyBible:{premise:'changed'}},key));
assert(!await guidance.matchesChapterGuidanceSource({...base,storyState:{importantFacts:['A changed canon fact']}},key));
for(const text of ['A required sex scene follows.','Later, an oral sex scene occurs.','AION: Specialist section'])assert(routing.requestsSpecialistWork(text),text);
for(const text of ['No full sex scene this chapter.','Do not force a full sex scene.','A sensual scene may develop, but no full sex scene.','Only affectionate contact and kissing.'])assert(!routing.requestsSpecialistWork(text),text);
const original=[{order:1,instruction:'A required sex scene follows.',specialistWriter:null}];assert.equal(routing.routedSpecialistBeats(original)[0].specialistWriter,'aion');assert.equal(original[0].specialistWriter,null);
if(process.env.NOVELFORGE_GUIDANCE_FIXTURE){const live=JSON.parse(fs.readFileSync(process.env.NOVELFORGE_GUIDANCE_FIXTURE));assert(await guidance.matchesChapterGuidanceSource(live,live.storyState.chapterGuidanceDraft.sourceKey));const changed=JSON.parse(JSON.stringify(live));changed.chapters[0].content+=' Changed.';assert(!await guidance.matchesChapterGuidanceSource(changed,live.storyState.chapterGuidanceDraft.sourceKey));console.log('Actual saved guidance: legacy empty-style hash accepted; real manuscript edit still rejected.');}
if(process.env.NOVELFORGE_CONTRACT_FIXTURE){for(const c of JSON.parse(fs.readFileSync(process.env.NOVELFORGE_CONTRACT_FIXTURE))){const routed=routing.routedSpecialistBeats(c.requiredBeats);const count=routed.filter(b=>b.specialistWriter==='aion').length;assert.equal(count,[5,6,8].includes(c.chapterNumber)?1:0,'chapter '+c.chapterNumber);console.log('Saved chapter '+c.chapterNumber+': specialist assignments '+count);}}
console.log('Guidance source integrity and specialist assignment regression tests passed. No provider calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
