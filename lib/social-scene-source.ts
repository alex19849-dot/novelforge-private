import 'server-only';
import { createHash } from 'node:crypto';
import { jobAdmin } from './social-job-db';
import type { StudioBook } from './social-creative-directions';
const titleKey = (v:string) => v.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
export function sceneStoryMatches(title:string, book:Pick<StudioBook,'title'|'slug'>) {
  const keys=[book.title,book.title.split(':')[0],book.slug].map(titleKey);
  return keys.includes(titleKey(title)) || keys.includes(titleKey(title.split(':')[0]));
}
export type SceneStorySource = {kind:'manuscript'|'bible'|'catalogue'; storyId?:string; chapterId?:string; chapterNumber?:number; sourceKey?:string; bible?:unknown; passage?:string; alternatives?:{key:string;passage:string;chapterId:string;povHint?:string}[]};
/** Match only owned books, never a fuzzy match to a different story. */
export async function loadSceneStory(owner:string, book:StudioBook, history:any[], seed:string):Promise<SceneStorySource> {
  const db=jobAdmin();
  const list=await db.from('stories').select('id,title,updated_at').eq('user_id',owner).order('updated_at',{ascending:false}).limit(250);
  if(list.error) throw Error('Your saved story details could not be read. No images were requested.');
  const candidates=(list.data??[]).filter(s=>typeof s.title==='string' && sceneStoryMatches(s.title,book)).slice(0,4);
  let bibleOnly:SceneStorySource|undefined;
  for(const candidate of candidates) {
    const found=await db.from('stories').select('id,form,chapters').eq('user_id',owner).eq('id',candidate.id).maybeSingle();
    if(found.error) throw Error('The selected book’s story could not be loaded. No images were requested.');
    if(!found.data) continue;
    const story=found.data, form=story.form??{};
    const bible={premise:String(form.premise??'').slice(0,5000),relationship:String(form.relationship??'').slice(0,3000),setting:String(form.setting??'').slice(0,3000),characters:Array.isArray(form.characters)?form.characters.map((s:unknown)=>String(s).slice(0,2500)).slice(0,20):[]};
    bibleOnly??={kind:'bible',storyId:story.id,bible};
    const chapters=(Array.isArray(story.chapters)?story.chapters:[]).filter(c=>typeof c.content==='string'&&c.content.trim().length>80&&c.kind!=='epilogue'&&!/^epilogue\b/i.test(String(c.title??''))).sort((a,b)=>a.number-b.number);
    // Prefer the first two thirds, keeping endings and epilogues out of teaser selection.
    const early=chapters.slice(0,Math.max(1,Math.ceil(chapters.length*.65)));
    const slots=early.flatMap(c=>{
      const content=c.content.replace(/<[^>]*>/g,' ').replace(/\\n/g,'\n').trim();
      let offset=0;
      return content.split(/\n\s*\*\*\*\s*\n/).flatMap(part=>{
        const start=offset;offset+=part.length+5;
        // Stop the marketing source before explicit sexual activity; retain the preceding romantic build.
        const stop=part.search(/\b(?:cock|dick|blowjob|rimming|penetrat\w*|orgasm)\b/i);
        const safe=(stop<0?part:part.slice(0,Math.max(0,part.lastIndexOf('\n',stop)))).trim();
        if(safe.length<100)return [];
        const score=(safe.match(/\bkiss(?:ed|es|ing)?\b/gi)??[]).length*5+(safe.match(/\b(?:lips|mouth|wrist|pull(?:s|ed)?|closer)\b/gi)??[]).length*2+(safe.match(/\b(?:want(?:s|ed)?|touch|hand|stay|only|shouldn.t|can.t)\b/gi)??[]).length;
        const focus=safe.search(/\b(?:kiss|lips|mouth|wrist)\b/i);
        const from=safe.length<=6200?0:Math.max(0,focus-2000);
        return [{chapter:c,start,content:safe.slice(from,from+6200),score}];
      });
    });
    if(!slots.length) continue;
    const used=history.map(r=>r.recipe?.storySource?.sourceKey).filter(Boolean);
    const key=(s:typeof slots[number])=>`${story.id}:${s.chapter.id}:scene:${s.start}`;
    let available=slots.filter(s=>!used.includes(key(s)));
    if(!available.length) available=slots.filter(s=>key(s)!==used[0]);
    if(!available.length)available=slots;
    available.sort((a,b)=>b.score-a.score);
    const pool=available.slice(0,Math.max(3,Math.min(12,Math.ceil(available.length*.6))));
    const hash=createHash('sha256').update(seed).digest().readUInt32BE(0);
    const selected=pool.slice(0,6).sort((a,b)=>((hash+a.start)%7)-((hash+b.start)%7)).slice(0,3);
    const slot=selected[0];
    return {kind:'manuscript',storyId:story.id,chapterId:String(slot.chapter.id),chapterNumber:slot.chapter.number,sourceKey:key(slot),bible,passage:slot.content,
      alternatives:selected.map(s=>({key:key(s),passage:s.content,chapterId:String(s.chapter.id),povHint:String(s.chapter.povCharacter??'').slice(0,80)}))};
  }
  return bibleOnly??{kind:'catalogue'};
}
