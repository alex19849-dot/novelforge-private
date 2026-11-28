const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require(process.env.NOVELFORGE_TEST_TYPESCRIPT||'typescript');
function load(file){file=path.resolve(file);const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts'):require(id),m,m.exports);return m.exports;}
const e=load('lib/prose-editorial.ts'),server=load('lib/prose-editorial-server.ts');
const chapter='“Eight.”\n\nHe checks his watch.\n\n“Eight, then.”';
const material=e.editorialEvidence(chapter,[]);
const raw={findings:[{id:'f1',category:'duplicate',paragraphIds:['p1','p3'],evidence:[{sourceId:'p1',quote:'Eight.'},{sourceId:'p3',quote:'Eight, then.'}],reason:'A test repetition.',direction:'Retain the time without repetitive confirmation.'}],signalAssessments:[{id:'duplicate',disposition:'repair',reason:'An unsolicited category score.'}],preservation:[],overflow:false};
const report=e.validateEditorialReport(raw,material);assert.equal(report.findings[0].evidence[0].quote,'Eight.');assert.equal(report.signalAssessments.length,0);assert.equal(raw.signalAssessments.length,1,'Retained report remains unmodified');
const shortReply={...raw,findings:[{...raw.findings[0],paragraphIds:['p1'],evidence:[{sourceId:'p1',quote:'Eight.'}]}],signalAssessments:[]};assert.equal(e.validateEditorialReport(shortReply,material).findings.length,1);
assert.throws(()=>e.validateEditorialReport({...shortReply,findings:[{...shortReply.findings[0],evidence:[{sourceId:'p1',quote:'Nine.'}]}]},material),/no matching manuscript evidence/);
assert.throws(()=>e.validateEditorialReport({...shortReply,findings:[{...shortReply.findings[0],evidence:[{sourceId:'p1',quote:'.'}]}]},material),/no matching manuscript evidence/);
const curly=e.editorialEvidence('“That’s enough,” I say.\n\nHe asks me\nagain.',[]);
const quoted={...shortReply,findings:[{...shortReply.findings[0],evidence:[{sourceId:'p1',quote:'"That\'s enough," I say.'}]}]};assert.equal(e.validateEditorialReport(quoted,curly).findings.length,1,'Typography normalization does not change actual wording');
const chained=e.editorialEvidence('I turn, and he looks up, and my answer catches in my throat.',[]);assert(chained.signals.length);
assert.throws(()=>e.validateEditorialReport({findings:[],signalAssessments:[{id:'sentence_pattern',disposition:'not_problem',reason:'Wrong ID cannot account for an actual signal.'}],preservation:[],overflow:false},chained),/every repetition signal/);
const context={content:chapter,chapters:[],storyBible:{},storyState:{},chapterBrief:'{}',pov:'Sam'};
const schema=server.buildEditorialReview(context).call.schema;
assert.equal(schema.properties.signalAssessments.maxItems,0);assert.equal(schema.properties.signalAssessments.minItems,0);assert.equal(schema.properties.preservation.maxItems,0);
const keyed=server.buildEditorialReview({...context,content:chained.paragraphs[0].text}).call.schema;
assert.deepEqual(keyed.properties.signalAssessments.items.properties.id.enum,chained.signals.map(s=>s.id));assert.deepEqual(keyed.properties.findings.items.properties.paragraphIds.items.enum,['p1']);
assert(Math.abs(e.reconcileEditorialCost(.1,.08,.01)-.03)<.0000011);assert.equal(e.reconcileEditorialCost(.1,.08,null),.1);assert.throws(()=>e.reconcileEditorialCost(.1,.08,.09),/cost could not/);
// A report may quote many targets supporting one issue. Do not repeat its
// entire evidence list in every repair target and inflate the input budget.
const many=Array.from({length:8},(_,i)=>({id:'t'+i,start:0,end:chapter.length,original:chapter,writer:'astra',findings:[report.findings[0]]}));
const repair=server.buildEditorialRepair(context,many,'astra');
assert.equal(repair.prompt.split(report.findings[0].direction).length-1,1,'One shared editorial direction, not eight duplicated reports');assert(repair.ceilingUsd<.25);
console.log('PASS: exact six-character replies, typographic evidence, irrelevant legacy category labels, required real signals, dynamic structured IDs/empty arrays, compact repair context and reconciliation against known usage. No live calls.');
