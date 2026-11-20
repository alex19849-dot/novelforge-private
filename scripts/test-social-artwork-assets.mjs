import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier==='next/server')return next('next/server.js',context);if(specifier.startsWith('.')&&context.parentURL){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
process.env.OPENAI_API_KEY='fixture-only-no-network';
const {handleArtwork}=await import('../lib/social-artwork.ts');
const {assertVerifiedArtwork}=await import('../lib/social-asset-policy.ts');
const book={slug:'real-book',title:'Verified Book',blurb:'Two adult rivals fall in love.',tropes:['Rivals to lovers'],subgenre:'MM romance',kindleUnlimited:false,amazonUrl:'https://example.com/book',coverUrl:'https://www.marlowquinn.com/real.jpg'};
const image='Zml4dHVyZS1ub3QtYS1yZWFsLWltYWdl';
const copy={title:'Verified Book',caption:'An adult rivals to lovers romance.',hashtags:['#MMRomance']};
const quality={decision:'pass',assetIntegrity:'pass',assetIssues:'',summary:'Readable scene with no product.',promptAdherence:95,legibility:95,coverFidelity:100,socialTitle:copy.title,caption:copy.caption,hashtags:copy.hashtags,motionMap:{available:false,summary:'No hero',accentColor:'#ffffff',movement:'slow-push',effects:[],regions:[]}};
const realFetch=globalThis.fetch;
let check=quality,calls=[];
globalThis.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);
 if(url==='https://www.marlowquinn.com/api/books')return Response.json({books:[book]});
 assert.equal(url,'https://api.openai.com/v1/responses','Tests must never send an unexpected network request');
 const body=JSON.parse(init.body);calls.push(body);
 if(body.model==='gpt-5.6-terra'){
  if(check===null)return Response.json({error:{message:'fixture checker unavailable',type:'server_error'}},{status:503});
  return Response.json({id:'check',output_text:JSON.stringify(check),output:[]});
 }
 return Response.json({id:'poster',output_text:JSON.stringify(copy),output:[{type:'image_generation_call',result:image}]});
};
const request=(slug='real-book',platforms=['facebook'])=>new Request('https://studio.example/api/social-studio/generate',{method:'POST',body:JSON.stringify({book:{...book,slug,title:'FORGED TITLE',coverUrl:'https://untrusted.example/fake-paperback.jpg'},platforms,instructions:'A romantic scene',outputType:'image'})});
try{
 let response=await handleArtwork(request());let body=await response.json();assert.equal(response.status,200);assert.equal(body.posts[0].qualityCheck.assetIntegrity,'pass');assert.ok(body.posts[0].imageDataUrl.includes(image));assert.ok(JSON.stringify(calls).includes('Verified Book'));assert.ok(!JSON.stringify(calls).includes('FORGED TITLE'));assert.ok(!JSON.stringify(calls).includes('untrusted.example'));
 for(const result of [{...quality,assetIntegrity:'reject',assetIssues:'An invented paperback is visible.'},{...quality,assetIntegrity:undefined},{...quality,coverFidelity:20},null]){
  check=result;response=await handleArtwork(request());body=await response.json();assert.equal(response.status,500);assert.ok(!body.posts);assert.ok(!JSON.stringify(body).includes(image));assert.match(body.error,/Artwork rejected/);
 }
 check=quality;calls=[];response=await handleArtwork(request('unknown'));assert.equal(response.status,400);assert.equal(calls.length,0);
 response=await handleArtwork(request('real-book',['youtube']));body=await response.json();assert.equal(response.status,200);assert.equal(body.posts[0].platform,'youtube');
 assert.throws(()=>assertVerifiedArtwork({coverFidelity:100}),/Artwork rejected/);
 console.log('PASS: real artwork handler accepts a clean scene; blocks invented paperback, missing verdict, low fidelity and checker outage without returning the image; ignores forged book facts; rejects unknown books before generation; handles YouTube-only requests. No paid or live API calls.');
}finally{globalThis.fetch=realFetch;}
