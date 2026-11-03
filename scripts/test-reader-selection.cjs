const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports;
}
const { findPassageRange, replacePassage, undoPassageRewrite, passageWriter } = load('app/story-chat/passageRewrite.ts');
const { readerParagraphs } = load('app/story-chat/readerSelection.ts');
const content = '  Same words.\n \nNick:   A message.\r\n\r\nSame words.  ';
const paragraphs = readerParagraphs(content);
assert.deepEqual(paragraphs.map(p => p.text), ['Same words.', 'Nick:   A message.', 'Same words.']);
for (const p of paragraphs) assert.equal(content.slice(p.start, p.end), p.text);
assert.throws(() => findPassageRange(content, 'Same words.'), /more than once/);
const range = { start: paragraphs[2].start, end: paragraphs[2].end };
assert.deepEqual(findPassageRange(content, 'Same words.', range), range);
const changed = replacePassage(content, 'Same words.', 'Different words.', range);
assert.equal(changed, content.slice(0, range.start) + 'Different words.' + content.slice(range.end));
const undo = { chapterId: 'chapter', sourceContent: content, rewrittenContent: changed };
assert.equal(undoPassageRewrite(changed, undo), content);
assert.throws(() => undoPassageRewrite(changed + ' New edit.', undo), /newer edits/);
for (const invalid of [null, {}, { start: -1, end: 2 }, { start: 1.2, end: 5 }, { start: 0, end: content.length + 1 }, { start: 5, end: 5 }, { start: 0, end: 10 }]) {
  assert.throws(() => findPassageRange(content, 'Same words.', invalid), /selected passage has changed/);
}
const multiline = { start: paragraphs[0].start, end: paragraphs[1].end };
assert.deepEqual(findPassageRange(content, content.slice(multiline.start, multiline.end), multiline), multiline);
assert.equal(passageWriter('AION: Keep it direct.').model, 'aion');
assert.equal(passageWriter('Rewrite this.').model, 'astra');
console.log('PASS: exact duplicate occurrence, multi-paragraph offsets, spacing, stale/invalid ranges, backward-compatible pasted passages, precise replacement, guarded undo and Aion selection.');
