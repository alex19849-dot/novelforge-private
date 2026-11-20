import type {CalendarPost} from './social-calendar';
export type StudioView='scheduled'|'drafts'|'issues'|'create'|'history'|'settings';
export type StudioCounts={scheduled:number;drafts:number;issues:number;history:number};
export function postSection(post:CalendarPost,publicationState?:string,now=Date.now()):'scheduled'|'drafts'|'issues'|'history'|'discarded'{
 if(post.status==='cancelled')return 'discarded';
 if(post.status==='published')return 'history';
 if(post.status==='failed'||['attention','uncertain'].includes(publicationState??''))return 'issues';
 if(post.quality_notes?.trim())return 'issues';
 if(post.status==='draft')return 'drafts';
 if(['approved','scheduled','publishing'].includes(post.status)){
  if(post.status!=='publishing'&&(!post.scheduled_at||Date.parse(post.scheduled_at)<now-6*3600000))return 'issues';
  return 'scheduled';
 }
 return 'discarded';
}
export function workspaceGroups(posts:CalendarPost[]){
 const groups=new Map<string,CalendarPost[]>();
 for(const post of posts){const key=post.campaign_id||post.id;groups.set(key,[...(groups.get(key)??[]),post]);}
 return [...groups.values()].sort((a,b)=>(a[0].scheduled_at??'9999').localeCompare(b[0].scheduled_at??'9999'));
}
