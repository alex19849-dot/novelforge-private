const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}, extra = '') {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8') + '\n' + extra, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => id in mocks ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}
process.env.OPENAI_API_KEY = 'mock';
process.env.OPENROUTER_API_KEY = 'mock';
const helper = load('lib/aion-chapter-planner.ts');
const route = load('app/api/story-chat/route.ts', { openai: class {}, 'next/server': {}, '../../../src/lib/detect-story-intent': {}, '../../../lib/aion-chapter-planner': helper }, 'export { directSectionBriefSchema };');
const schema = route.directSectionBriefSchema;
const plan = { reply: 'Ready.', storyTitle: 'Test', generatedChapter: { kind: 'chapter', title: 'Chapter 1', povCharacter: 'Sam', content: '', replaceChapterNumber: null }, sectionBrief: { chapterNumber: 1, chapterKind: 'chapter', chapterTitle: 'Chapter 1', povCharacter: 'Sam', authorDirection: 'Talk.', continuationBoundary: 'Friday afternoon.', originalGuidance: 'Talk.', requiredBeats: [{ order: 1, instruction: 'Talk.', specialistWriter: null, approximateWordTarget: null }], endpoint: 'Leave.', exclusions: ['No graphic sexual escalation.'], targetWordRange: { minimum: 2000, preferred: 3000, maximum: 4000 } } };
const copy = () => JSON.parse(JSON.stringify(plan));
(async () => {
  helper.assertChapterPlanSchema(plan, schema);
  const assigned = copy(); assigned.sectionBrief.requiredBeats[0].specialistWriter = 'aion';
  helper.assertChapterPlanSchema(assigned, schema);
  for (const change of [p => delete p.sectionBrief.requiredBeats[0].specialistWriter, p => p.sectionBrief.requiredBeats[0].specialistWriter = 'wrong', p => p.extra = true, p => p.sectionBrief.requiredBeats = [], p => p.sectionBrief.chapterNumber = '1']) {
    const invalid = copy(); change(invalid);
    assert.throws(() => helper.assertChapterPlanSchema(invalid, schema), /Aion/);
  }
  let calls = [];
  const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.00042 };
  global.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ usage, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] }) }; };
  const diagnostics = [];
  const response = await helper.createAionChapterPlan({ messages: [{ role: 'system', content: 'Existing planner instructions.' }, { role: 'user', content: 'No graphic sexual escalation.' }], schema, diagnostics, attempt: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'aion-labs/aion-3.5');
  assert.equal(calls[0].body.max_tokens, 4000);
  assert.equal(calls[0].body.provider.allow_fallbacks, false);
  assert.equal(calls[0].body.response_format.type, 'json_object');
  assert.equal(calls[0].body.messages[1].content, 'No graphic sexual escalation.');
  assert(calls[0].body.messages[0].content.includes(JSON.stringify(schema)));
  assert.equal(response.output_text, JSON.stringify(plan));
  assert.equal(diagnostics[0].provider, 'openrouter');
  assert.equal(diagnostics[0].costType, 'reported');
  assert.equal(diagnostics[0].costUsd, usage.cost);
  for (const [data, ok, error] of [
    [{ usage, choices: [{ finish_reason: 'length' }] }, true, /output limit/],
    [{ choices: [{ finish_reason: 'content_filter' }] }, true, /did not provide/],
    [{ choices: [{ message: { refusal: 'Refused.' } }] }, true, /did not provide/],
    [{ choices: [{ message: { content: '' } }] }, true, /no chapter contract/],
    [{ error: { message: 'Unavailable' } }, false, /Unavailable/],
  ]) {
    let attempts = 0; const failed = [];
    global.fetch = async () => { attempts++; return { ok, status: ok ? 200 : 503, json: async () => data }; };
    await assert.rejects(helper.createAionChapterPlan({ messages: [], schema, diagnostics: failed, attempt: 1 }), error);
    assert.equal(attempts, 1); assert.equal(failed.length, 1); assert.equal(failed[0].status, 'failed');
  }
  console.log('PASS: Aion planner request, full contract schema, ordinary/specialist routing fields, reported cost and single-call failure handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
