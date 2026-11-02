// Astra restored at the author's request. Aion keeps its separate roles.
export const PROSE_WRITER = { model: "gpt-6-astra", label: "Astra", input: 10, cached: 1, output: 50 } as const;
export type ProseWriterId = typeof PROSE_WRITER.model;
export function selectedProseWriter(_state?: unknown, _instruction?: string) { return PROSE_WRITER; }
export function proseCostEstimate(_model: ProseWriterId, input: number, output: number, cached = 0): number {
  const cachedTokens = Math.max(0, Math.min(input, cached));
  return ((Math.max(0, input - cachedTokens) * PROSE_WRITER.input + cachedTokens * PROSE_WRITER.cached) + output * PROSE_WRITER.output) / 1_000_000;
}

