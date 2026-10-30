// Temporary prose trial requested by the author. Aion keeps its separate roles.
export const PROSE_WRITER = { model: "gpt-6.1-terra", label: "Terra 6.1", input: 1, cached: 0.05, output: 5 } as const;
export type ProseWriterId = typeof PROSE_WRITER.model;
export function selectedProseWriter(_state?: unknown, _instruction?: string) { return PROSE_WRITER; }
export function proseCostEstimate(_model: ProseWriterId, input: number, output: number, cached = 0): number {
  const cachedTokens = Math.max(0, Math.min(input, cached));
  const longContext = input > 272000;
  return ((Math.max(0, input - cachedTokens) * PROSE_WRITER.input + cachedTokens * PROSE_WRITER.cached) * (longContext ? 2 : 1) + output * PROSE_WRITER.output * (longContext ? 1.5 : 1)) / 1_000_000;
}
