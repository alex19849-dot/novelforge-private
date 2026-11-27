import type { ScenePlan } from './social-scene-slides';
/** Mechanical limits complement the editor's source/continuity review. */
export function finishSceneCopy(plan:ScenePlan):ScenePlan {
  if(plan.sourceMode==='excerpt') return plan;
  const slides=plan.slides.map(s=>({...s,text:s.text.replace(/\s*[—–]\s*/g,', ').replace(/,\s*,/g,',').trim()})) as ScenePlan['slides'];
  if(slides.some(s=>s.text.split(/\s+/).filter(Boolean).length>24))
    throw Error('The scene copy is too dense for a clear teaser. No images were requested.');
  if(!/\b(?:i|i'm|i've|my|me|we|our|us|you|your)\b/i.test(slides[0].text.replace(/[’‘]/g,"'")))
    throw Error('The opening is a plot report, not an immediate romantic hook. No images were requested.');
  return {...plan,slides};
}
