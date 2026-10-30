const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(id => id in mocks ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}
const writers = load('lib/prose-writer.ts');
const memory = load('lib/narrative-memory.ts');
const passages = load('app/story-chat/passageRewrite.ts');
process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY = 'mock';
async function run(file, body, output) {
  const calls = [];
  class AI { constructor(config) {
    this.responses = { create: async request => { calls.push(request); return { status: 'completed', output_text: output, output: [], usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 } }; } };
    this.chat = { completions: { create: async request => { calls.push(request); return { choices: [{ finish_reason: 'stop', message: { content: output } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost: 0.001 } }; } } };
  } }
  const route = load(file, { openai: AI, 'next/server': { NextResponse: { json: (data, opts) => ({ data, status: opts?.status ?? 200 }) } }, '../../../../lib/narrative-memory': memory, '../../../../lib/prose-writer': writers, '../../../story-chat/passageRewrite': passages });
  return { result: await route.POST({ json: async () => body }), calls };
}
(async () => {
  assert.equal(writers.selectedProseWriter().model, 'gpt-6.1-terra');
  assert.equal(writers.selectedProseWriter({ proseWriter: 'gpt-6-astra' }, 'ASTRA: Continue.').model, 'gpt-6.1-terra', 'Astra is removed from active prose routing during this trial');
  assert.equal(writers.proseCostEstimate('gpt-6.1-terra', 1000000, 0), 2, 'Long input uses documented higher rates');
  assert.equal(writers.proseCostEstimate('gpt-6.1-terra', 100, 100), 0.0006);
  const prose = Array.from({ length: 600 }, (_, i) => `synthetic${i}`).join(' ') + '.';
  let r = await run('app/api/story-chat/write/route.ts', { action: 'start', povCharacter: 'Sam', chapterBrief: JSON.stringify({ chapterNumber: 1, povCharacter: 'Sam', requiredBeats: [{ order: 1, instruction: 'An ordinary conversation.', specialistWriter: null }], originalGuidance: 'Have the conversation.', endpoint: 'Sam leaves.', targetWordRange: { minimum: 500, preferred: 600, maximum: 800 } }) }, prose + '\n<END_SECTION>');
  assert.equal(r.result.status, 200); assert.equal(r.calls.length, 1); assert.equal(r.calls[0].model, 'gpt-6.1-terra');
  assert.equal(r.calls[0].reasoning.effort, 'low'); assert.equal(r.result.data.diagnostics[0].model, 'gpt-6.1-terra'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.0006);
  const body = { chapterContent: 'Before. The selected passage is here. After.', passage: 'The selected passage is here.', instruction: 'Rewrite this.' };
  r = await run('app/api/story-chat/rewrite/route.ts', body, 'A new complete replacement.');
  assert.equal(r.result.status, 200); assert.equal(r.calls[0].model, 'gpt-6.1-terra'); assert.equal(r.result.data.model, 'gpt-6.1-terra'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.0006);
  r = await run('app/api/story-chat/rewrite/route.ts', { ...body, instruction: 'AION: Rewrite this.' }, 'A new complete replacement.');
  assert.equal(r.result.status, 200); assert.equal(r.calls[0].model, 'aion-labs/aion-3.5'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.001);
  console.log('PASS: Terra 6.1 replaces Astra in prose and normal passage rewrites, diagnostics/rates match, and explicit Aion selection is preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; });
