import 'server-only';
import { createHash } from 'node:crypto';
import { jobAdmin } from './social-job-db';
import type { StudioBook } from './social-creative-directions';
const titleKey = (v:string) => v.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
export function sceneStoryMatches(title:string, book:Pick<StudioBook,'title'|'slug'>) {
  const keys=[book.title,book.title.split(':')[0],book.slug].map(titleKey);
  return keys.includes(titleKey(title)) || keys.includes(titleKey(title.split(':')[0]));
}
export type SceneStorySource = {kind:'manuscript'|'bible'|'catalogue'; storyId?:string; chapterId?:string; chapterNumber?:number; sourceKey?:string; bible?:unknown; passage?:string};
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
      const content=c.content.replace(/<[^>]*>/g,' ').trim(), width=6500;
      return Array.from({length:Math.max(1,Math.ceil(content.length/width))},(_,n)=>({chapter:c,start:n*width,content}));
    });
    if(!slots.length) continue;
    const used=history.map(r=>r.recipe?.storySource?.sourceKey).filter(Boolean);
    const key=(s:typeof slots[number])=>`${story.id}:${s.chapter.id}:${s.start}`;
    let available=slots.filter(s=>!used.includes(key(s)));
    if(!available.length) {
      const oldest=Math.max(...slots.map(s=>used.indexOf(key(s))));
      available=slots.filter(s=>used.indexOf(key(s))===oldest);
    }
    const hash=createHash('sha256').update(seed).digest().readUInt32BE(0), slot=available[hash%available.length];
    const from=Math.max(0,slot.start-500), passage=slot.content.slice(from,slot.start+6500);
    return {kind:'manuscript',storyId:story.id,chapterId:String(slot.chapter.id),chapterNumber:slot.chapter.number,sourceKey:key(slot),bible,passage};
  }
  return bibleOnly??{kind:'catalogue'};
}
