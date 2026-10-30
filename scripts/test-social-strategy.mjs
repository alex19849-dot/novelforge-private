import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {FAMILIES,DEFAULT_STRATEGY,cleanStrategy,createStrategyAssignments,familyWeights,tooSimilar}=await import('../lib/social-strategy.ts');
const {normaliseMetrics,buildLearningReport}=await import('../lib/social-learning.ts');
const {validateStrategyCopy}=await import('../lib/social-strategy-validation.ts');
const {planRequest}=await import('../lib/social-plan-request.ts');
const books=['alpha','beta','gamma'].map(slug=>({slug,title:slug,blurb:'Two adult rivals find love at university.',tropes:['Enemies to lovers'],subgenre:'MM romance',kindleUnlimited:true,amazonUrl:'https://amazon.com/example',coverUrl:'https://example.com/cover.jpg'}));
const platforms=['facebook','instagram','tiktok'];
const plan=createStrategyAssignments('2026-11-01',platforms,books,DEFAULT_STRATEGY,null);
for(const platform of platforms){const variants=plan.map(p=>p.variants.find(v=>v.platform===platform));const count=variants.filter(v=>v.family==='book_promotion').length;assert.ok(count>=9&&count<=12);assert.equal(new Set(variants.map(v=>v.family)).size,8);assert.ok(variants.filter(v=>!v.book).length>=10);assert.ok(variants.every(v=>['book_hook','relationship_hook','book_promotion'].includes(v.family)===Boolean(v.book)));}
assert.deepEqual(plan.map(p=>p.variants[0].family),plan.map(p=>p.variants[1].family),'No unsupported platform divergence before evidence');
const disabled=cleanStrategy({...DEFAULT_STRATEGY,disabled_families:['reader_humour'],blocked_topics:['3am']});assert.ok(createStrategyAssignments('2026-11-01',platforms,books,disabled,null).every(day=>day.variants.every(v=>v.family!=='reader_humour')));
for(let mask=0;mask<255;mask++){const settings={...DEFAULT_STRATEGY,disabled_families:FAMILIES.filter((_,i)=>mask&(1<<i))};const weights=familyWeights(settings);assert.ok(Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-100)<.001,'Mix remains normalised for every allowed family combination');}
assert.throws(()=>cleanStrategy({...DEFAULT_STRATEGY,disabled_families:FAMILIES}));assert.ok(tooSimilar('What is your favourite romance trope to read?', 'What is your favourite romance trope to read tonight?'));
assert.deepEqual(normaliseMetrics([{type:'views',value:0,unit:'count'},{type:'reach',value:-1,unit:'count'},{type:'engagementRate',value:1000,unit:'percentage'}]),{views:0});
const now=new Date('2026-11-30T12:00:00Z'),posts=[],snapshots=[];
for(const platform of ['instagram','tiktok'])for(let i=0;i<16;i++){
 const date=new Date(now.getTime()-(25-i)*86400000).toISOString(),id=platform+i,question=i%2===0;
 posts.push({id,platform,media_type:'image',book_slug:question?'':'alpha',published_at:date,scheduled_at:date,content_metadata:{origin:'planned_v2',family:question?'reader_question':'book_promotion',visual_type:question?'question_card':'cover_hero'}});
 snapshots.push({post_id:id,provider_updated_at:new Date(Date.parse(date)+48*3600000).toISOString(),metrics:{views:(platform==='tiktok'?1000:100)*(question?2:1),comments:question?12:2,clicks:question?1:12}});
}
const report=buildLearningReport(posts,snapshots,DEFAULT_STRATEGY,now);
for(const platform of report.platforms.filter(p=>p.platform!=='facebook')){
 const questions=platform.attributes.find(a=>a.attribute==='family'&&a.value==='reader_question'),adverts=platform.attributes.find(a=>a.attribute==='family'&&a.value==='book_promotion');
 assert.equal(questions.ready,true);assert.ok(questions.discovery>adverts.discovery);assert.ok(adverts.conversion>questions.conversion);assert.ok(platform.weights.reader_question>12);assert.ok(platform.weights.book_promotion>=35&&platform.weights.book_promotion<=40);
}
const one=buildLearningReport(posts.slice(0,5),snapshots.slice(0,5),DEFAULT_STRATEGY,now);assert.ok(one.platforms.every(p=>p.attributes.every(a=>!a.ready)));
const repeated=buildLearningReport(posts,[...snapshots,...snapshots,...snapshots],DEFAULT_STRATEGY,now);assert.deepEqual(repeated.platforms.map(p=>p.eligible_posts),report.platforms.map(p=>p.eligible_posts));
const noClicks=buildLearningReport(posts,snapshots.map(s=>({...s,metrics:{views:s.metrics.views}})),DEFAULT_STRATEGY,now);assert.ok(noClicks.platforms.every(p=>p.attributes.every(a=>a.conversion===null)));
const noMetadata=buildLearningReport(posts.map(p=>({...p,content_metadata:{}})),snapshots,DEFAULT_STRATEGY,now);assert.ok(noMetadata.platforms.every(p=>p.attributes.every(a=>a.attribute!=='family')));
const a=plan.find(d=>d.variants[0].book),variant=a.variants[0];const copy={platform:'facebook',title:'Actual rivals',caption:'When rivals finally stop pretending they do not want each other.',hashtags:['#MMRomance','#BookTok','#RomanceBooks','#EnemiesToLovers','#Readers'],creativeBrief:'Large original headline about adult rivals with no cover.',hookType:'rivalry',topic:'rivals falling in love',factAnchors:['Two adult rivals']};
const day={dayIndex:a.dayIndex,hook:'Rivals',creativeBrief:copy.creativeBrief,posts:[copy]};const assigned={...a,variants:[variant]};assert.equal(validateStrategyCopy([day],[assigned],books,DEFAULT_STRATEGY,[]).size,1);assert.throws(()=>validateStrategyCopy([{...day,posts:[{...copy,factAnchors:['Secret mafia wedding']}]}],[assigned],books,DEFAULT_STRATEGY,[]),/source fact/);
assert.throws(()=>validateStrategyCopy([day],[assigned],books,{...DEFAULT_STRATEGY,blocked_topics:['rivals']},[]),/blocked/);
assert.throws(()=>validateStrategyCopy([day],[assigned],books,DEFAULT_STRATEGY,[copy]),/repeats/);
const request=planRequest(['facebook'],[assigned],books,'',{settings:DEFAULT_STRATEGY,recent:[],report});assert.ok(request.text.format.schema.properties.days.items.properties.posts.items.required.includes('factAnchors'));assert.ok(JSON.stringify(request.input).includes('NOT book extracts'));
console.log('PASS: eight-family mix, real general posts, all family switches, exploration, same-platform normalisation, separate discovery/click scores, small-sample caution, snapshot deduplication, unknown metrics, no invented legacy labels, source anchors, blocked topics and fatigue checks.');
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
for(const f of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(f=>f.endsWith('.sql')&&f.includes('_social_')).sort())await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const owner=randomUUID(),other=randomUUID();await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query("insert into social_strategy_settings(user_id,settings) values($1,'{}'),($2,'{}')",[owner,other]);
await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);assert.equal((await db.query('select * from social_strategy_settings')).rows.length,1);await assert.rejects(()=>db.query("update social_strategy_settings set settings='{}'"),/permission denied/);await assert.rejects(()=>db.query('select social_claim_analytics($1,true)',[owner]),/permission denied/);await db.exec('reset role');
const claimed=(await db.query('select social_claim_analytics($1,false) token',[owner])).rows[0].token;assert.ok(claimed);assert.equal((await db.query('select social_claim_analytics($1,true) token',[owner])).rows[0].token,null);await db.query('update social_learning_state set collecting_until=null where user_id=$1',[owner]);assert.equal((await db.query('select social_claim_analytics($1,true) token',[owner])).rows[0].token,null,'Force cannot bypass hourly limit');
const post=(await db.query("insert into social_posts(campaign_id,user_id,platform,caption,scheduled_at,status,content_metadata) values(gen_random_uuid(),$1,'facebook','Approved original',now(),'approved',$2) returning id",[owner,JSON.stringify({family:'reader_question'})])).rows[0];
await db.query("insert into social_publications(post_id,user_id,state,payload,scheduled_at) values($1,$2,'submitting','{}',now())",[post.id,owner]);await db.query("update social_posts set caption='Later changed' where id=$1",[post.id]);assert.equal((await db.query('select content_snapshot from social_publications where post_id=$1',[post.id])).rows[0].content_snapshot.caption,'Approved original');
await assert.rejects(()=>db.query("insert into social_metric_snapshots(post_id,user_id,provider_updated_at,metrics) values($1,$2,now(),'{}')",[post.id,other]),/foreign key/);await db.close();
console.log('PASS: real SQL owner RLS, client write denial, fenced/hourly collection claims, cross-owner snapshot rejection, and frozen publication metadata.');
