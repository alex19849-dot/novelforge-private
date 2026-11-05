// Astra restored at the author's request. Aion keeps its separate roles.
export const PROSE_WRITER = { model: "gpt-6-astra", label: "Astra", input: 10, cached: 1, output: 50 } as const;
export type ProseWriterId = typeof PROSE_WRITER.model;
export const PROSE_BALANCE_INSTRUCTION = "Default chapter balance: approximately 50% dialogue, 30% character history, internal thoughts and feelings, and 20% world building, setting description and physical action. Use this as a flexible balance across the complete chapter, not a sentence-by-sentence quota or a requirement for every individual scene, specialist insertion, continuation or bounded rewrite. Give conversations and the POV character's personal experience room to develop; reveal established history when it matters to the present exchange, without inventing backstory or padding with recap, repetitive thoughts or idle conversation. Preserve required events, physical clarity, specialist assignments, passage boundaries and the chapter endpoint. A deliberate author instruction for the current story or scene takes priority.";
export const TEXT_MESSAGE_INSTRUCTION = "When an actual written text-message exchange occurs, establish in the surrounding narration that the characters are texting. Put each message in its own paragraph as SENDER: message, using the sender's established name in uppercase, for example JESSE: Are you coming home? Store this as plain text, without asterisks, quotation marks, HTML or markdown wrappers: the reader and Word export format the sender and colon in bold and the message in italics. Keep spoken dialogue and ordinary narration in their normal prose format. Do not invent a text exchange merely to use this format.";
export function selectedProseWriter(_state?: unknown, _instruction?: string) { return PROSE_WRITER; }
export function proseCostEstimate(_model: ProseWriterId, input: number, output: number, cached = 0): number {
  const cachedTokens = Math.max(0, Math.min(input, cached));
  return ((Math.max(0, input - cachedTokens) * PROSE_WRITER.input + cachedTokens * PROSE_WRITER.cached) + output * PROSE_WRITER.output) / 1_000_000;
}

