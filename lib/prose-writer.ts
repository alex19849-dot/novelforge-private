import type OpenAI from "openai";

// Main prose trial requested by the author. Aion keeps its separate roles.
export const PROSE_WRITER = { model: "anthropic/claude-fable-5.1", label: "Fable 5.1", provider: "openrouter", input: 10, cached: 0.25, output: 50 } as const;
export type ProseWriterId = typeof PROSE_WRITER.model;
export function selectedProseWriter(_state?: unknown, _instruction?: string) { return PROSE_WRITER; }
export function proseCostEstimate(_model: ProseWriterId, input: number, output: number, cached = 0): number {
  const cachedTokens = Math.max(0, Math.min(input, cached));
  return (Math.max(0, input - cachedTokens) * PROSE_WRITER.input + cachedTokens * PROSE_WRITER.cached + output * PROSE_WRITER.output) / 1_000_000;
}

// Normalize the existing OpenRouter chat endpoint for the writer's completion checks.
export async function requestProse(client: Pick<OpenAI, "chat">, input: { system: string; prompt: string; maxOutputTokens: number }) {
  const response = await client.chat.completions.create({
    model: PROSE_WRITER.model,
    messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
    max_tokens: input.maxOutputTokens,
    ...({ reasoning: { effort: "low", exclude: true } } as object),
  });
  const choice = response.choices[0];
  const usage = response.usage as (typeof response.usage & { cost?: number });
  const refusal = choice?.message.refusal || (choice?.finish_reason === "content_filter" ? "The provider's content filter declined the request." : "");
  return {
    status: choice?.finish_reason === "stop" ? "completed" : "incomplete",
    incomplete_details: { reason: choice?.finish_reason === "length" ? "the model output limit was reached" : refusal || "the provider did not confirm completion" },
    output_text: choice?.message.content ?? "",
    output: refusal ? [{ type: "message", content: [{ type: "refusal", refusal }] }] : [],
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
      input_tokens_details: { cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0 },
      output_tokens_details: { reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0 },
      ...(typeof usage?.cost === "number" && Number.isFinite(usage.cost) ? { cost: usage.cost } : {}),
    },
  };
}
