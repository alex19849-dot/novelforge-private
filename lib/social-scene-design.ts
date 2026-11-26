export const SCENE_STYLES = [
  {name:'Midnight cinema',ink:'#ffffff',panel:'#101018',accent:'#e7bfd2',font:'DM Sans Bold',file:'DMSans.ttf',align:'left',backdrop:'#15121f'},
  {name:'Wine and cream',ink:'#fff8e8',panel:'#3b1028',accent:'#ffcf99',font:'DM Serif Display',file:'DMSerifDisplay-Regular.ttf',align:'left',backdrop:'#280c20'},
  {name:'Ivory romance',ink:'#281827',panel:'#fff6e8',accent:'#9d2b57',font:'DM Serif Display',file:'DMSerifDisplay-Regular.ttf',align:'centre',backdrop:'#301b30'},
  {name:'Electric midnight',ink:'#ffffff',panel:'#101e39',accent:'#85e3ff',font:'Bebas Neue',file:'BebasNeue-Regular.ttf',align:'left',backdrop:'#0d1830'},
  {name:'Emerald after dark',ink:'#fff8e8',panel:'#102e29',accent:'#c2e8cc',font:'DM Sans Bold',file:'DMSans.ttf',align:'centre',backdrop:'#0c211e'},
  {name:'Rose ink',ink:'#30102b',panel:'#ffe4ee',accent:'#932b59',font:'DM Sans Bold',file:'DMSans.ttf',align:'left',backdrop:'#3b1732'},
] as const;
const ANGLES=['an unspoken want revealed by a small action','a bold provocation and a charged response','the emotional risk beneath attraction','the moment their physical distance changes','an unexpected act of care','a competitive exchange that exposes chemistry','something one man notices and cannot ignore','a vulnerable admission held just short of its answer'];
const SHOTS=['wide environmental shot then an intimate reaction close-up','over-the-shoulder encounter then a reversed viewpoint','side-on two-shot then a close detail of eye contact','foreground framing then a candid medium two-shot','low eye-level perspective then a shoulder-height reaction','a doorway or architectural frame then a closer profile angle','a moving candid moment then a still, charged reaction','a reflective composition then a direct, intimate perspective'];
export function nextSceneDirection(history:any[],seed:number) {
  const recent=history.map(r=>r.recipe?.sceneDirection).filter(Boolean), used=new Set(recent.map(r=>r.key));
  const options=[];
  for(let look=0;look<SCENE_STYLES.length;look++)for(let angle=0;angle<ANGLES.length;angle++)for(let shot=0;shot<SHOTS.length;shot++) {
    const key=`${look}:${angle}:${shot}`;
    if(!used.has(key)&&!recent.slice(0,2).some(r=>r.look===look)&&!recent.slice(0,3).some(r=>r.angle===angle)&&!recent.slice(0,2).some(r=>r.shot===shot)) options.push({key,look,angle,shot});
  }
  const chosen=options[Math.abs(seed)%options.length]??{key:'0:0:0',look:0,angle:0,shot:0};
  return {...chosen,angleDirection:ANGLES[chosen.angle],shotDirection:SHOTS[chosen.shot]};
}
export function scenePlanRepeats(plan:{hook:string;slides:{text:string;imagePrompt:string}[]},history:any[]) {
  const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const similarity=(a:string,b:string)=>{const x=new Set(normal(a).split(' ')),y=new Set(normal(b).split(' '));return [...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size,1);};
  return history.some(r=>{
    const p=r.recipe?.scenePlan;if(!p?.slides?.length)return false;
    return normal(plan.hook)===normal(p.hook??r.hook??'') || similarity(plan.slides.map(s=>s.text).join(' '),p.slides.map((s:any)=>s.text).join(' '))>.83 || similarity(plan.slides.map(s=>s.imagePrompt).join(' '),p.slides.map((s:any)=>s.imagePrompt).join(' '))>.9;
  });
}
