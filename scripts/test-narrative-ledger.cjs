const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => id in mocks ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}
const memory = load('lib/narrative-memory.ts');
process.env.OPENAI_API_KEY = 'mock';
const chapter = { number: 1, title: 'Test', povCharacter: 'Sam', content: '  Sam hides the red key inside the desk drawer. Lee leaves before he sees it.' };
const raw = { key: 'red-key', kind: 'object', subject: 'red key', claim: 'The red key is in the desk drawer.', characters: ['Sam'], location: 'Desk', status: 'CURRENT', importance: 'HIGH', eventTime: '', learnedTime: '', quote: 'Sam hides the red key inside the desk drawer.' };
const output = { importantFacts: [], characterStates: [], relationshipStates: [], unresolvedThreads: [], timeline: [], locations: [], activePOV: 'Sam', characterKnowledge: [], repetitionWarnings: [], voiceProfiles: [], chapterEntries: [{ chapterNumber: 1, summary: 'Sam hides a key.', openingLocation: 'Room', endingLocation: 'Room', endingTime: 'Friday', relationshipShift: '', intimacyMilestone: '', newFacts: ['The key is in the desk.'], unresolvedThreads: [], repeatedBeats: [], narrativeRecords: [raw, { ...raw, key: 'invented', quote: 'There is no such sentence in this manuscript.' }] }] };
async function run(modelOutput, options = {}) {
  const calls = []; let config;
  class AI { constructor(value) { config = value; this.responses = { create: async request => { calls.push(request); return { status: options.incomplete ? 'incomplete' : 'completed', incomplete_details: { reason: 'max_output_tokens' }, output_text: JSON.stringify(modelOutput), usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }; } }; } }
  const route = load('app/api/story-chat/ledger/route.ts', { openai: AI, 'next/server': { NextResponse: { json: (data, o) => ({ data, status: o?.status ?? 200 }) } }, '../../../../lib/narrative-memory': memory });
  const correction = { targetId: 'object:red:key', replacement: 'The key is blue.', kind: 'object', characters: ['Sam'], chapterNumber: 1, suppressed: false };
  const body = { storyBible: { premise: 'Unchanged canon.' }, storyState: { memoryCorrections: [correction], chapterPlans: [{ chapterNumber: 2 }], chapterLedger: [] }, chapters: [chapter], chapter, rebuildMode: 'batch' };
  const before = JSON.stringify(body);
  const result = await route.POST({ json: async () => body });
  assert.equal(JSON.stringify(body), before, 'Extraction must not mutate manuscript, Bible or input state');
  assert.equal(calls.length, 1); assert.equal(config.maxRetries, 0);
  return { result, calls, correction };
}
(async () => {
  let r = await run(output);
  assert.equal(r.result.status, 200);
  const entry = r.result.data.storyState.chapterLedger[0];
  assert.equal(entry.narrativeMemory.records.length, 1); assert.equal(entry.narrativeMemory.rejectedEvidence, 1);
  assert.equal(entry.narrativeMemory.records[0].evidence.start, 2);
  assert.equal(entry.narrativeMemory.sourceHash, memory.memorySourceHash(chapter.content));
  assert.deepEqual(r.result.data.storyState.memoryCorrections, [r.correction]);
  assert(!('storyBible' in r.result.data));
  assert(r.calls[0].input[0].content.includes('NARRATIVE MEMORY RECORDS'));
  assert(r.calls[0].text.format.schema.properties.chapterEntries.items.required.includes('narrativeRecords'));
  r = await run({ ...output, chapterEntries: [{ ...output.chapterEntries[0], chapterNumber: 99 }] });
  assert.equal(r.result.status, 502, 'An invented source chapter cannot be matched by array position');
  r = await run({ ...output, chapterEntries: [output.chapterEntries[0], output.chapterEntries[0]] });
  assert.equal(r.result.status, 502, 'Duplicate source entries cannot masquerade as complete coverage');
  r = await run({ ...output, chapterEntries: [{ ...output.chapterEntries[0], narrativeRecords: [{ ...raw, quote: 'A fabricated supporting quotation.' }] }] });
  assert.equal(r.result.status, 502, 'An entirely ungrounded batch must not be marked as successfully remembered');
  r = await run(output, { incomplete: true }); assert.equal(r.result.status, 502); assert.equal(r.result.data.diagnostics[0].status, 'failed');
  console.log('PASS: existing ledger call grounds memory, rejects unsupported evidence and source chapters, preserves author corrections/Bible/prose and does not retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
