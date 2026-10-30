import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../workflows/social-publishing.ts',import.meta.url),'utf8');
const executable=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export async function','async function'));
async function scenario(generation,{rejectStarts=0,registered=true,advanced=true}={}) {
 const calls={ticks:0,starts:[],sleeps:[],reports:0,advance:0};
 const context=vm.createContext({queueAnalyticsRefresh:async()=>{},registerPublisher:async()=>registered,publishingTick:async()=>{calls.ticks++;return{stop:false,delay:300};},advancePublisher:async()=>{calls.advance++;return advanced?generation+1:null;},reportPublisherHandoffFailure:async()=>{calls.reports++;},sleep:async delay=>calls.sleeps.push(delay),start:async(...args)=>{calls.starts.push(args);if(calls.starts.length<=rejectStarts)throw Error('Transient start failure');}});
 vm.runInContext(executable,context);await context.publishSocialCalendar('owner','lease',generation);return calls;
}
let calls=await scenario(0,{rejectStarts:4});
assert.equal(calls.ticks,1);assert.equal(calls.starts.length,5);assert.equal(calls.reports,4);assert.equal(calls.advance,1);assert.equal(calls.sleeps[0],'5s');assert.deepEqual(calls.sleeps.slice(1),['5m','5m','5m','5m']);
for(const args of calls.starts){assert.equal(args.length,2,'Never resolve latest or another deployment');assert.deepEqual(Array.from(args[1]),['owner','lease',1]);}
calls=await scenario(1);assert.equal(calls.ticks,144);assert.equal(calls.starts.length,1);assert.equal(calls.sleeps.length,144);assert.equal(calls.sleeps[0],'300s');
assert.equal((await scenario(0,{registered:false})).starts.length,0);assert.equal((await scenario(1,{advanced:false})).starts.length,0);
console.log('PASS: immediate startup renewal, bounded later runs, same-deployment continuation, repeated start failures retry, and fenced/paused workers stop.');
