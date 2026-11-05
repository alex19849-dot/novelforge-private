const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { unzipSync, strFromU8 } = require('fflate');

process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY = 'mock-only';
let output = 'A complete replacement.';
const calls = [];
class AI {
  constructor() {
    this.responses = { create: async request => {
      calls.push(request);
      return { status: 'completed', output_text: output, output: [], usage: {} };
    } };
    this.chat = { completions: { create: async request => {
      calls.push(request);
      return { choices: [{ finish_reason: 'stop', message: { content: output } }], usage: {} };
    } } };
  }
}
class NextResponse extends Response {
  static json(value, options) { return new NextResponse(JSON.stringify(value), options); }
}
function load(file, extra = '') {
  file = path.resolve(file);
  const source = fs.readFileSync(file, 'utf8') + '\n' + extra;
  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(id => {
    if (id === 'openai') return AI;
    if (id === 'next/server') return { NextResponse };
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(file), id);
      const resolved = [base + '.ts', base + '.tsx'].find(p => fs.existsSync(p));
      if (resolved) return load(resolved);
    }
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const style = load('lib/prose-writer.ts');
const writer = load('app/api/story-chat/write/route.ts', 'export { getPrompt, mainWriterSystemPrompt, repetitionWarnings, validateSection, writeSpecialistScene };');
const brief = JSON.stringify({ chapterNumber: 1, povCharacter: 'Sam', requiredBeats: [{ order: 1, instruction: 'Talk and then leave.', specialistWriter: null }], originalGuidance: 'Talk and then leave.', endpoint: 'Sam leaves.' });
const input = { action: 'start', storyBible: {}, storyState: {}, recentChapters: [], chapterBrief: brief, chapterTitle: 'One', povCharacter: 'Sam', chapterDraft: '', sectionToRewrite: '', sectionInstruction: '', latestUserMessage: '', specialistScenes: [] };
function checkStyle(prompt) {
  assert(prompt.includes(style.PROSE_BALANCE_INSTRUCTION));
  assert(prompt.includes(style.TEXT_MESSAGE_INSTRUCTION));
  assert(prompt.includes('50% dialogue'));
  assert(prompt.includes('30% character history, internal thoughts and feelings'));
  assert(prompt.includes('20% world building'));
}

(async () => {
  for (const action of ['start', 'continue', 'rewrite']) {
    for (const handoff of [false, true]) checkStyle(writer.mainWriterSystemPrompt(handoff, action));
    const prompt = writer.getPrompt({ ...input, action });
    checkStyle(prompt);
    assert(!prompt.includes('use no fixed thought-to-description ratio'));
    assert(prompt.includes('Sam leaves.'));
  }
  const messages = 'JESSE: Are you coming home?\n\nKAINON: Yes, give me ten minutes.\n\nJESSE: Bring something to eat.\n\nKAINON: I already have it.\n\nJESSE: Good.';
  writer.validateSection(messages, 0);
  assert(!writer.repetitionWarnings('', messages, '').some(w => /colons/i.test(w)));
  assert(writer.repetitionWarnings('', 'A prohibited — dash.', '').some(w => /dash/i.test(w)), 'Other warnings remain active');

  output = 'I close the gate.\n<END_SECTION>';
  await writer.writeSpecialistScene({ scene: { marker: 'unused', instruction: 'Close the gate.', wordTarget: 20 }, assembledDraft: 'I reach for it.', storyBible: {}, storyState: {}, chapterBrief: brief, povCharacter: 'Sam', diagnostics: [], continuation: true });
  checkStyle(calls.at(-1).messages[1].content);

  const rewrite = load('app/api/story-chat/rewrite/route.ts');
  for (const instruction of ['Rewrite this.', 'AION: Rewrite this.']) {
    output = messages;
    const response = await rewrite.POST({ json: async () => ({ chapterContent: 'Before.\n\nOld passage.\n\nAfter.', passage: 'Old passage.', instruction }) });
    assert.equal(response.status, 200);
    checkStyle(calls.at(-1).input?.[1]?.content ?? calls.at(-1).messages?.[1]?.content);
  }
  const aion = load('app/api/story-chat/aion/route.ts');
  const response = await aion.POST({ json: async () => ({ message: 'AION: Rewrite this.\nOld passage.', chapterDraft: 'Old passage.' }) });
  assert.equal(response.status, 200);
  checkStyle(calls.at(-1).messages[1].content);

  const chapterContent = 'I pick up my phone.\n\nJESSE:   Are you coming home?\n\nKAINON: Yes, give me ten minutes.\n\n“See you soon,” I tell him.';
  const Panel = load('app/story-chat/components/ChapterPanel.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Panel, {
    storyId: 'test', storyTitle: 'Test', chapters: [{ id: 'one', number: 1, kind: 'chapter', title: 'Chapter 1', povCharacter: 'Sam', content: chapterContent }], readerOpen: true,
    onCloseReader() {}, onSaveChapter() {}, readerTheme: 'light', setReaderTheme() {}, readerFontSize: 18, setReaderFontSize() {}, readerLineHeight: 1.7, setReaderLineHeight() {}, readerWidth: 'medium', setReaderWidth() {},
  }));
  const dom = new JSDOM(html);
  const paragraphs = [...dom.window.document.querySelectorAll('[data-source-start]')];
  const message = paragraphs.find(p => p.textContent.startsWith('JESSE:'));
  assert(message);
  assert.equal(message.querySelector('strong').textContent, 'JESSE:');
  assert.equal(message.querySelector('em').textContent, 'Are you coming home?');
  for (const p of paragraphs) assert.equal(p.textContent, chapterContent.slice(+p.dataset.sourceStart, +p.dataset.sourceEnd), 'Styling preserves exact source offsets for passage rewriting');
  assert(!paragraphs.find(p => p.textContent.startsWith('“See')).querySelector('em'), 'Spoken dialogue stays normal');
  dom.window.close();

  const exporter = load('app/api/export-docx/route.ts');
  const doc = await exporter.POST({ json: async () => ({ title: 'Style test', chapters: [{ number: 1, title: 'One', povCharacter: 'Sam', content: chapterContent }] }) });
  assert.equal(doc.status, 200);
  const zip = unzipSync(new Uint8Array(await doc.arrayBuffer()));
  const xml = strFromU8(zip['word/document.xml']);
  const word = new JSDOM(xml, { contentType: 'text/xml' });
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const runs = [...word.window.document.getElementsByTagNameNS(ns, 'r')];
  const sender = runs.find(r => r.textContent === 'JESSE:');
  const body = runs.find(r => r.textContent === 'Are you coming home?');
  assert(sender.getElementsByTagNameNS(ns, 'b').length);
  assert(body.getElementsByTagNameNS(ns, 'i').length);
  assert.equal(sender.parentNode.textContent, 'JESSE:   Are you coming home?');
  const spoken = runs.find(r => r.textContent === '“See you soon,” I tell him.');
  assert(spoken);
  assert.equal(spoken.getElementsByTagNameNS(ns, 'i').length, 0);
  word.window.close();
  console.log('PASS: chapter/continuation/rewrite/specialist prompts, flexible 20/30/50 balance, colon warning removed with other checks retained, reader bold/italic messages and exact source offsets, Word message formatting and ordinary dialogue preserved. No model calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
