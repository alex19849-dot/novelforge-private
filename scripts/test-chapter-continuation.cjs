const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}, extra = '') {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8') + '\n' + extra, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => id in mocks ? mocks[id] : id.endsWith('/narrative-memory') ? load('lib/narrative-memory.ts') : id.endsWith('/prose-writer') ? load('lib/prose-writer.ts') : id.startsWith('.') ? {} : require(id), module, module.exports);
  return module.exports;
}
const words = (count, tag = 'word') => Array.from({ length: count }, (_, i) => `${tag}${i}`).join(' ') + '.';
const range = { minimum: 500, preferred: 600, maximum: 800 };
const ordinary = { order: 1, instruction: 'An ordinary discussion.', specialistWriter: null };
const assigned = { order: 2, instruction: 'The assigned specialist scene.', specialistWriter: 'aion' };
const brief = (beats = [ordinary, assigned], extra = {}) => JSON.stringify({ chapterNumber: 17, povCharacter: 'Sam', originalGuidance: 'Original direction.', requiredBeats: beats, endpoint: 'The original ending.', targetWordRange: range, ...extra });
const base = { action: 'start', chapterBrief: brief(), povCharacter: 'Sam', storyBible: {}, storyState: {}, recentChapters: [] };
process.env.OPENAI_API_KEY = 'mock';
process.env.OPENROUTER_API_KEY = 'mock';
async function run(body, output, options = {}) {
  const calls = [];
  class AI {
    static APIError = class extends Error {};
    static APIConnectionError = class extends Error {};
    constructor(config) {
      this.responses = { create: async request => {
        calls.push({ provider: 'openai', request });
        return { status: options.truncated ? 'incomplete' : 'completed', incomplete_details: { reason: 'max_output_tokens' }, output_text: output + (options.noSentinel ? '' : '\n<END_SECTION>'), output: options.refusal ? [{ type: 'message', content: [{ type: 'refusal', refusal: 'Refused.' }] }] : [], usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 } };
      } };
      this.chat = { completions: { create: async request => {
        calls.push({ provider: 'openrouter', request });
        return { choices: [{ finish_reason: options.truncated ? 'length' : options.filter ? 'content_filter' : 'stop', message: { content: output, ...(options.refusal ? { refusal: 'Refused.' } : {}) } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost: .001 } };
      } } };
    }
  }
  const api = load('app/api/story-chat/write/route.ts', { openai: AI, 'next/server': { NextResponse: { json: (data, o) => ({ data, status: o?.status ?? 200 }) } } });
  return { result: await api.POST({ json: async () => body }), calls };
}
(async () => {
  let r = await run(base, words(50, 'opening') + '\n[[AION_SCENE_1]]');
  assert.equal(r.result.status, 200);
  assert.match(r.calls[0].request.input[0].content, /belongs exclusively to Aion/);
  assert(!r.calls[0].request.input[0].content.includes('write the complete requested chapter'));
  assert(!r.calls[0].request.input[0].content.includes('When explicit intimacy is requested'));
  assert.match(r.calls[0].request.input[1].content, /at the START/);
  // A complete routing contract is authoritative. Exclusions are not Aion requests.
  for (const guidance of [
    'A deliberate kiss. Exclusions: No graphic sexual escalation. Lauren remains his girlfriend.',
    'A deliberate kiss. No explicit content is needed.',
    'A tense conversation without explicit sexual detail.',
  ]) {
    const contract = brief([{ ...ordinary, instruction: 'They talk, share a deliberate kiss and leave.' }], { originalGuidance: guidance });
    r = await run({ ...base, chapterBrief: contract, latestUserMessage: guidance }, words(600, 'ordinaryChapter'));
    assert.equal(r.result.status, 200, `Main-writer routing must not be overridden by exclusion keywords: ${guidance}`);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].provider, 'openai');
    assert.notEqual(r.result.data.specialistScenesPending, true);
    assert(r.calls[0].request.input[1].content.includes(guidance), 'Original guidance must remain unchanged');
  }
  // Keep the legacy incomplete-contract guard and explicit specialist assignment.
  r = await run({ ...base, chapterBrief: brief([{ order: 1, instruction: 'They talk.' }], { originalGuidance: 'Include an explicit scene.' }) }, words(600));
  assert.equal(r.result.status, 422);
  assert.match(r.result.data.error, /no Aion assignment/);
  assert.equal(r.calls.length, 0);
  r = await run({ ...base, chapterBrief: brief([ordinary, assigned], { originalGuidance: 'Include an explicit scene.' }) }, words(50, 'assignedOpening') + '\n[[AION_SCENE_1]]');
  assert.equal(r.result.status, 200);
  assert.equal(r.result.data.specialistScenesPending, true);

  for (const skeleton of ['[[AION_SCENE_1]]\n[[AION_SCENE_1]]', '[[AION_SCENE_2]]', '[[AION_SCENE_1]]\nLater scene repeated.']) {
    r = await run(base, skeleton);
    assert.equal(r.result.status, 422);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].provider, 'openai');
  }
  r = await run({ ...base, phase: 'fill_specialist', chapterDraft: 'Opening. [[AION_SCENE_1]] [[AION_SCENE_1]]' }, words(550));
  assert.equal(r.result.status, 502);
  assert.equal(r.calls.length, 0, 'Duplicate markers must be rejected before a paid Aion call');
  const edited = words(100, 'edited') + '\nThis is the exact edited ending.';
  const instruction = 'Continue from this edited ending. End when Sam closes the gate, replacing the previous endpoint.';
  const addition = 'I close the gate.\n<END_SECTION>';
  r = await run({ ...base, action: 'continue', chapterDraft: edited, sectionInstruction: instruction }, addition);
  assert.equal(r.result.status, 200);
  assert.equal(r.result.data.section, 'I close the gate.');
  assert.equal(r.result.data.wordCount, 4);
  assert(r.result.data.warnings.some(w => w.includes('saved for review')));
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].provider, 'openrouter');
  assert.equal(r.calls[0].request.model, 'aion-labs/aion-3.5');
  assert.equal(r.calls[0].request.reasoning.effort, 'low');
  assert.equal(r.calls[0].request.temperature, .65);
  assert.equal(r.calls[0].request.max_tokens, 12000);
  const prompt = r.calls[0].request.messages[1].content;
  assert(prompt.includes(edited));
  assert(prompt.includes(instruction));
  assert(prompt.includes('There is no minimum section length'));
  assert(!prompt.includes('TARGET LENGTH: approximately 900'));
  assert(prompt.includes('takes priority') || prompt.includes('TAKES PRIORITY'));
  for (const ending of ['"I will be there."', '“I will be there.”', "'I will be there.'", 'I will be there.']) {
    for (const specialist of [true, false]) {
      r = await run({ ...base, ...(specialist ? {} : { chapterBrief: brief([ordinary]) }), action: 'continue', chapterDraft: edited }, ending + (specialist ? '\n<END_SECTION>' : ''));
      assert.equal(r.result.status, 200, `Complete dialogue must be saved: ${ending}, specialist=${specialist}`);
      assert.equal(r.result.data.section, ending);
      assert.equal(r.calls.length, 1);
    }
  }
  for (const specialist of [true, false]) {
    r = await run({ ...base, ...(specialist ? {} : { chapterBrief: brief([ordinary]) }), action: 'continue', chapterDraft: edited }, 'I reach for the' + (specialist ? '\n<END_SECTION>' : ''));
    assert.equal(r.result.status, 422);
    assert.match(r.result.data.error, /obviously truncated/);
    assert.equal(r.result.data.preservedDraft, edited);
  }
  const ordinaryBrief = brief([ordinary]);
  r = await run({ ...base, chapterBrief: ordinaryBrief, action: 'continue', chapterDraft: edited, sectionInstruction: instruction }, 'I close the gate.');
  assert.equal(r.result.status, 200);
  assert.equal(r.calls[0].provider, 'openai');
  r = await run({ ...base, action: 'continue', chapterDraft: edited, sectionInstruction: 'ASTRA: Continue with the ordinary discussion.' }, 'He answers me.');
  assert.equal(r.result.status, 200);
  assert.equal(r.calls[0].provider, 'openai');
  assert.equal(r.calls[0].request.model, 'gpt-6.1-terra');
  r = await run({ ...base, action: 'continue', chapterDraft: edited, chapterBrief: brief([assigned, { ...ordinary, order: 2 }]) }, 'He answers me.');
  assert.equal(r.calls[0].provider, 'openai', 'An earlier Aion scene must not capture later ordinary continuation');
  r = await run({ ...base, action: 'continue', chapterDraft: edited, chapterBrief: brief(undefined, { continuationGuidance: instruction }) }, addition);
  assert.equal(r.result.status, 200);
  assert(r.calls[0].request.messages[1].content.includes(instruction));
  for (const [output, options, error] of [
    ['', {}, /empty response/],
    ['I cannot continue this scene because it contains explicit content.', {}, /refusal/],
    ['No.', { refusal: true }, /refusal/],
    ['Incomplete prose', { truncated: true }, /output limit/],
    ['Stopped.', { filter: true }, /content filter/],
    ['A complete sentence without completion marker.', {}, /deliberately complete/],
  ]) {
    r = await run({ ...base, action: 'continue', chapterDraft: edited }, output, options);
    assert.equal(r.result.status, 422);
    assert.match(r.result.data.error, error);
    assert.equal(r.result.data.preservedDraft, edited);
    assert.equal(r.calls.length, 1);
  }
  r = await run({ ...base, chapterBrief: ordinaryBrief, action: 'continue', chapterDraft: edited }, 'I cannot continue this scene because it contains explicit content.', { noSentinel: true });
  assert.match(r.result.data.error, /refusal/);
  assert.equal(r.calls.length, 1);
  r = await run({ ...base, action: 'continue', chapterDraft: edited }, words(20, 'edited') + '\n<END_SECTION>');
  assert.match(r.result.data.error, /restarted prose/);
  assert.equal(r.result.data.preservedDraft, edited);
  r = await run({ ...base, chapterBrief: ordinaryBrief }, words(300));
  assert.equal(r.result.status, 422, 'Initial full-chapter length enforcement is unchanged');
  assert.equal(r.result.data.preservedDraft, words(300));
  r = await run({ ...base, chapterBrief: ordinaryBrief }, words(850));
  assert.equal(r.result.status, 422);
  assert.equal(r.result.data.preservedDraft, words(850));
  const skeleton = words(50, 'before') + '\n[[AION_SCENE_1]]';
  r = await run({ ...base, phase: 'fill_specialist', chapterDraft: skeleton }, words(400, 'scene'));
  assert.equal(r.result.status, 422, 'Full initial assembly still enforces the chapter contract range');
  assert.equal(r.calls.length, 1);
  assert(!r.result.data.preservedDraft.includes('[[AION'));
  r = await run({ ...base, phase: 'fill_specialist', chapterDraft: skeleton, sectionInstruction: instruction }, words(550, 'scene'));
  assert.equal(r.result.status, 200);
  assert(r.calls[0].request.messages[1].content.includes(instruction));
  r = await run({ ...base, phase: 'fill_specialist', chapterDraft: skeleton }, words(550, 'scene') + '\n[[AION_SCENE_1]]');
  assert.equal(r.result.status, 502);
  assert.equal(r.calls.length, 1, 'A leaked marker must not cause the same scene to be requested again');
  assert.equal(r.result.data.preservedDraft, skeleton);
  const qa = load('app/api/story-chat/quality/route.ts', { openai: class {}, 'next/server': {} }, 'export { readChapterContract };');
  assert.equal(qa.readChapterContract(brief(undefined, { continuationGuidance: instruction })).continuationGuidance, instruction);
  console.log('PASS: exclusive handoff, marker cardinality/order/end boundary, no duplicate paid handoff, edited-draft Aion continuation, latest direction/endpoint, short prose saved with warnings, ordinary routing retained, clear empty/refusal/truncation errors, no replay and initial chapter length enforcement retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });


