const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
let authValid=true,readError=false,authTimeout=false,readTimeout=false,requests=[];const owner='owner';const id='2f6a2d44-3853-43c9-8b69-3c80ffb9302a';const rows=Array.from({length:12},(_,i)=>({id:i===0?id:'record'+i,title:'Book '+i,created_at:'created',updated_at:'updated'}));
process.env.NEXT_PUBLIC_SUPABASE_URL='https://db.example.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-mock';
const originalFetch=global.fetch;const originalInfo=console.info;console.info=()=>{};
global.fetch=async(input,options)=>{const url=new URL(input);requests.push({url,options});assert.equal(url.origin,'https://db.example.test');assert.equal(options.headers.apikey,'public-mock');assert.equal(options.headers.Authorization,'Bearer test');
 if(url.pathname==='/auth/v1/user'){if(authTimeout)throw new DOMException('timeout','TimeoutError');return new Response(JSON.stringify(authValid?{id:owner,email:'test@example.test'}:{}),{status:authValid?200:401});}
 assert.equal(url.pathname,'/rest/v1/stories');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);if(readTimeout)throw new DOMException('timeout','TimeoutError');if(readError)return new Response('{}',{status:503});
 const requested=url.searchParams.get('id');return new Response(JSON.stringify(requested?(requested==='eq.'+id?[{...rows[0],custom_rewrite:'saved draft'}]:[]):rows));};
const api=load('app/api/story-chat/library/route.ts',{'next/server':{NextResponse:{json:(v,o)=>new Response(JSON.stringify(v),{status:o?.status??200,headers:o?.headers})}}});
const client=load('lib/story-library-client.ts');
function extract(name){const source=fs.readFileSync('app/story-chat/page.tsx','utf8'),ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert(found,name);return found;}
function handler(name,env){const code=ts.transpileModule(extract(name)+`; result=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return new Function('env',`let result;with(env){${code}}return result;`)(env);}
(async()=>{
 const req=(query='',token='test')=>new Request('http://test/api/story-chat/library'+query,{headers:token?{Authorization:'Bearer '+token}:{}});
 let response=await api.GET(req('',null));assert.equal(response.status,401);assert.equal(requests.length,0);
 response=await api.GET(req('?userId=other'));const body=await response.json();assert.equal(body.stories.length,12);assert(response.headers.get('cache-control').includes('no-store'));assert.equal(requests.length,2);assert.equal(requests[1].url.searchParams.get('user_id'),'eq.'+owner);
 response=await api.GET(req('?storyId='+id));assert.equal(response.status,200);assert.equal(requests.at(-1).url.searchParams.get('id'),'eq.'+id);
 response=await api.GET(req('?storyId=11111111-1111-1111-1111-111111111111'));assert.equal(response.status,404);
 authValid=false;const before=requests.length;response=await api.GET(req());assert.equal(response.status,401);assert.equal(requests.length,before+1);authValid=true;readError=true;response=await api.GET(req());assert.equal(response.status,503);readError=false;
 authTimeout=true;response=await api.GET(req());assert((await response.json()).error.includes('sign-in service'));authTimeout=false;readTimeout=true;response=await api.GET(req());assert((await response.json()).error.includes('saved-story read'));readTimeout=false;
 await assert.rejects(client.bounded(new Promise(()=>{}),5),/timed out/);
 const realFetch=global.fetch;global.fetch=async()=>new Response(JSON.stringify({account:{id:'wrong'},stories:rows}));await assert.rejects(client.readStoryLibrary('mock',owner),/sign-in changed/);global.fetch=realFetch;
 let sdkCalls=0;const sessionEnv={librarySessionRef:{current:{access_token:'mock',expires_at:Date.now()/1000+3600,user:{id:owner}}},supabase:{auth:{getSession:async()=>{sdkCalls++;return {data:{session:null}}}}},bounded:client.bounded};await handler('activeLibrarySession',sessionEnv)();assert.equal(sdkCalls,0);sessionEnv.librarySessionRef.current=null;await assert.rejects(handler('activeLibrarySession',sessionEnv)(),/Sign in again/);
 let opened=0,remoteFlags=[],created=0,errorShown='',loadedFlags=[];
 const env={userId:owner,cancelled:false,loadStoryList:async()=>{throw Error('Network down')},openStory:async()=>opened++,localStorage:{getItem:()=>id},setHasLoaded:x=>loadedFlags.push(x),setHasLoadedRemoteStory:x=>remoteFlags.push(x),setLibraryError:e=>errorShown=e,setDraftFocusKey:()=>{},createEmptyStory:()=>{created++;return {}},setStory:()=>{},setPendingGeneration:()=>{}};
 await handler('loadStory',env)();assert(errorShown.includes('Network down'));assert.equal(opened,0);assert.equal(created,0);assert(!remoteFlags.includes(true));
 env.loadStoryList=async()=>rows;await handler('loadStory',env)();assert.equal(opened,1);assert(remoteFlags.includes(true));
 let writes=0;await assert.rejects(handler('persistStory',{userId:owner,hasLoadedRemoteStory:false,setStory:()=>writes++})({}),/protected/);assert.equal(writes,0);
 console.info=originalInfo;global.fetch=originalFetch;console.log('PASS: direct verified-user auth + REST reads, owner filter and RLS JWT preserved, 12-story list, owned draft, no auth SDK session hop, auth/read timeout messages, no-store, client account mismatch, no stale fallback and blocked stale saves. All mocked, no real account/model calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
