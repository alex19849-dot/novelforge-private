import { selectedProseWriter, proseCostEstimate, type ProseWriterId } from './prose-writer';

export const SMALL_PASSAGE_WORD_LIMIT = 600;
export const SMALL_PASSAGE_EDITOR = { model: 'gpt-6.1-terra', input: 1, cached: 0.05, cacheWrite: 1.25, output: 5 } as const;
export function selectPassageEditor(passage: string, state?: unknown, instruction?: string) {
  const words = passage.trim().split(/\s+/u).filter(Boolean).length;
  return words > 0 && words <= SMALL_PASSAGE_WORD_LIMIT ? SMALL_PASSAGE_EDITOR : selectedProseWriter(state, instruction);
}
export function passageEditCost(model: ProseWriterId | typeof SMALL_PASSAGE_EDITOR.model, input: number, output: number, cached = 0, cacheWrite = 0): number {
  if (model !== SMALL_PASSAGE_EDITOR.model) return proseCostEstimate(model, input, output, cached);
  const count = (v: number) => Number.isFinite(v) ? Math.max(0,v) : 0;
  const i=count(input),o=count(output),c=Math.min(i,count(cached)),w=Math.min(i-c,count(cacheWrite));
  const long=i>272000;
  return ((i-c-w+w*SMALL_PASSAGE_EDITOR.cacheWrite+c*SMALL_PASSAGE_EDITOR.cached)*(long?2:1)+o*SMALL_PASSAGE_EDITOR.output*(long?1.5:1))/1_000_000;
}
