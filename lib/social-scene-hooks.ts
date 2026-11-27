export type HookCandidate={id:number;sourceKey:string;narrator:string;first:string;second:string;evidence:string[];firstAction:string;secondAction:string};
export type HookScore={id:number;grounded:boolean;clarity:number;curiosity:number;romance:number;escalation:number;isSynopsis:boolean;reason:string};
const normal=(s:string)=>s.normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
export function hookCandidateIssues(c:HookCandidate,sources:{key:string;passage:string;povHint?:string}[]) {
  const issues:string[]=[];
  if(!c||!Number.isInteger(c.id)||typeof c.first!=='string'||typeof c.second!=='string'||!c.narrator?.trim())return ['Incomplete hook candidate'];
  const source=sources.find(s=>s.key===c.sourceKey);
  if(!source)issues.push('Unknown story moment');
  if(source?.povHint && !normal(c.narrator).startsWith(normal(source.povHint).split(' ')[0]))issues.push('Narrator does not match the source viewpoint');
  for(const text of [c.first,c.second])if(text.trim().split(/\s+/).length>24||text.length>180)issues.push('Too dense for six seconds');
  if(!/\b(?:i|i'm|i've|my|me|we|our|us|you|your)\b/i.test(normal(c.first)))issues.push('Opening reports the plot instead of putting the viewer inside the desire');
  if(!Array.isArray(c.evidence)||c.evidence.length<2||c.evidence.some(q=>typeof q!=='string'||q.length<12||!normal(source?.passage??'').includes(normal(q))))issues.push('The romantic action lacks source evidence');
  if(!c.firstAction?.trim()||!c.secondAction?.trim()||normal(c.firstAction)===normal(c.secondAction))issues.push('No developing action');
  return issues;
}
export function selectSceneHook(candidates:HookCandidate[],scores:HookScore[],sources:{key:string;passage:string;povHint?:string}[]) {
  const eligible=candidates.filter(c=>!hookCandidateIssues(c,sources).length).map(c=>({candidate:c,score:scores.find(s=>s.id===c.id)})).filter(x=>{
    const s=x.score;return s?.grounded===true&&s.isSynopsis===false&&[s.clarity,s.curiosity,s.romance,s.escalation].every(n=>Number.isFinite(n)&&n>=8&&n<=10);
  });
  eligible.sort((a,b)=>(b.score!.clarity+b.score!.curiosity+b.score!.romance+b.score!.escalation)-(a.score!.clarity+a.score!.curiosity+a.score!.romance+a.score!.escalation));
  return eligible[0]??null;
}
