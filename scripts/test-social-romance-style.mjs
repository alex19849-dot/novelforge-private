import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier==='next/server')return next('next/server.js',context);if(specifier.startsWith('.')&&context.parentURL){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {posterPrompt}=await import('../lib/social-artwork.ts');
const {planRequest}=await import('../lib/social-plan-request.ts');
const book={slug:'example',title:'A Real Book',author:'Marlow Quinn',subgenre:'MM hockey romance',blurb:'Two adult rivals become roommates.',tropes:['Rivals to lovers'],kindleUnlimited:false,amazonUrl:'https://example.com/book',coverUrl:'https://example.com/cover'};
for(const platform of ['facebook','tiktok','youtube']){
 const prompt=posterPrompt(book,platform,'video','Keep the hockey scene and exact hook.','','book_promotion');
 assert.match(prompt,/large clear upright elegant serif/);assert.match(prompt,/No brush script/);assert.match(prompt,/No AI people/);assert.match(prompt,/first frame/);
 assert.doesNotMatch(prompt,/Use that exact cover as the hero|Never redesign, rewrite, crop away or replace its contents/);
 assert.ok(prompt.includes('A Real Book')&&prompt.includes(book.blurb));
}
const general=posterPrompt({...book,title:'',coverUrl:''},'facebook','image','A reader question','','reader_question');assert.match(general,/GENERAL READER CONTENT: no book attribution or sales footer/);
const request=planRequest(['facebook','tiktok','youtube'],[],[book],'');const instructions=JSON.parse(request.input[1].content);assert.match(instructions.visualStyle,/romantic, atmospheric/);assert.match(instructions.visualStyle,/serif/);assert.match(instructions.visualStyle,/Do not copy another author/);
console.log('PASS: approved serif identity reaches planning, all publishing platforms and people-free promotions without forcing a cover; reader entertainment keeps its own content boundaries.');
