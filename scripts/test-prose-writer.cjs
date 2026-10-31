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
  assert.equal(writers.selectedProseWriter().model, 'anthropic/claude-fable-5.1');
  assert.equal(writers.selectedProseWriter({ proseWriter: 'gpt-6-astra' }, 'ASTRA: Continue.').model, 'anthropic/claude-fable-5.1', 'Fable replaces the main prose writer during this trial');
  assert.equal(writers.proseCostEstimate('anthropic/claude-fable-5.1', 1000000, 0), 10, 'Fable standard rates apply across its context');
  assert.equal(writers.proseCostEstimate('anthropic/claude-fable-5.1', 100, 100), 0.006);
  const prose = Array.from({ length: 600 }, (_, i) => `synthetic${i}`).join(' ') + '.';
  let r = await run('app/api/story-chat/write/route.ts', { action: 'start', povCharacter: 'Sam', chapterBrief: JSON.stringify({ chapterNumber: 1, povCharacter: 'Sam', requiredBeats: [{ order: 1, instruction: 'An ordinary conversation.', specialistWriter: null }], originalGuidance: 'Have the conversation.', endpoint: 'Sam leaves.', targetWordRange: { minimum: 500, preferred: 600, maximum: 800 } }) }, prose + '\n<END_SECTION>');
  assert.equal(r.result.status, 200); assert.equal(r.calls.length, 1); assert.equal(r.calls[0].model, 'anthropic/claude-fable-5.1');
  assert.equal(r.calls[0].reasoning.effort, 'low'); assert.equal(r.result.data.diagnostics[0].model, 'anthropic/claude-fable-5.1'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.001);
  const body = { chapterContent: 'Before. The selected passage is here. After.', passage: 'The selected passage is here.', instruction: 'Rewrite this.' };
  r = await run('app/api/story-chat/rewrite/route.ts', body, 'A new complete replacement.');
  assert.equal(r.result.status, 200); assert.equal(r.calls[0].model, 'anthropic/claude-fable-5.1'); assert.equal(r.result.data.model, 'anthropic/claude-fable-5.1'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.001);
  r = await run('app/api/story-chat/rewrite/route.ts', { ...body, instruction: 'AION: Rewrite this.' }, 'A new complete replacement.');
  assert.equal(r.result.status, 200); assert.equal(r.calls[0].model, 'aion-labs/aion-3.5'); assert.equal(r.result.data.diagnostics[0].costUsd, 0.001);
  assert.equal(r.calls[0].temperature, 0.6, 'Aion settings are unchanged');
  assert.equal(writers.proseCostEstimate(writers.PROSE_WRITER.model, 100, 100, 50), 0.0055125);
  let request;
  const fake = (finish, content, refusal) => ({ chat: { completions: { create: async req => {
    request = req;
    return { choices: [{ finish_reason: finish, message: { content, refusal } }], usage: { prompt_tokens: 100, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 50 } } };
  } } } });
  const complete = await writers.requestProse(fake('stop', 'A complete sentence.'), { system: 'System', prompt: 'User', maxOutputTokens: 12000 });
  assert.equal(complete.status, 'completed');
  assert.equal(complete.usage.input_tokens_details.cached_tokens, 50);
  assert.equal(complete.usage.cost, undefined, 'Missing reported cost uses the estimate');
  assert.equal(request.model, 'anthropic/claude-fable-5.1');
  assert.equal(request.max_tokens, 12000);
  assert.equal(request.temperature, undefined, 'Do not send unsupported sampling controls');
  assert.equal(request.reasoning.effort, 'low');
  assert.equal((await writers.requestProse(fake('length', 'partial'), { system: '', prompt: '', maxOutputTokens: 10 })).status, 'incomplete');
  assert.equal((await writers.requestProse(fake('stop', '', 'Refused.'), { system: '', prompt: '', maxOutputTokens: 10 })).output[0].content[0].type, 'refusal');
  console.log('PASS: Fable main prose and passage rewrites, OpenRouter completion and cost normalization, truncation/refusal checks, and unchanged explicit Aion selection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
