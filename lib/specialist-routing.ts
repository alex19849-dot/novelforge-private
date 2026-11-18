import type { ChapterContractBeat } from '../app/story-chat/types';
// Routing is derived from the requested work, not a requirement that the author
// remember an implementation-specific heading. Negated and optional mentions
// are not instructions to add a scene.
const work = /\b(?:sex scene|sexual encounter|oral sex|anal sex|manual stimulation|mutual masturbation|penetrative sex|on[ -]page sex|explicit (?:adult )?(?:intimacy|sexual contact|scene)|blow[ -]?job|hand[ -]?job)\b/i;
const negative = /\b(?:no|not|without|avoid|exclude|omit|skip|do not|don't|does not|doesn't|must not|should not|cannot|can't|never|rather than|instead of)\b[^.!?\n;:]{0,90}$/i;
export function requestsSpecialistWork(instruction: string): boolean {
  const body = instruction.split(/^\s*(?:EXCLUSIONS|MUST NOT HAPPEN)\s*:?\s*$/im)[0];
  if (/^\s*(?:BEAT\s+\d+\s*:\s*)?AION\s*:/im.test(body)) return true;
  for (const match of body.matchAll(new RegExp(work.source,'gi'))) {
    const start = Math.max(body.lastIndexOf('\n',match.index),body.lastIndexOf('.',match.index),body.lastIndexOf(';',match.index),body.lastIndexOf(':',match.index)) + 1;
    const before = body.slice(start,match.index);
    if (negative.test(before)) continue;
    const sentence = body.slice(start).split(/[.!?\n]/)[0];
    if (/\b(?:if|may|might|could|optional|at most|do not force|don't force|not a full|no full)\b/i.test(sentence)) continue;
    return true;
  }
  return false;
}
export function routedSpecialistBeats(beats: ChapterContractBeat[]): ChapterContractBeat[] {
  return beats.map(beat => beat.specialistWriter === 'aion' || requestsSpecialistWork(beat.instruction)
    ? {...beat,specialistWriter:'aion'} : beat);
}
