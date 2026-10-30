import type { GenerationDiagnostic } from "../app/story-chat/types";
import { assertChapterPlanSchema } from "./aion-chapter-planner";
import { bibleOutputAllowance } from "./story-bible-request";

type Schema = Parameters<typeof assertChapterPlanSchema>[1];

export async function createAionBibleEdit(input: {
  messages: Array<{ role: string; content: string }>;
  schema: Schema;
  diagnostics: GenerationDiagnostic[];
  instruction: string;
}) {
  const startedAt = Date.now();
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;
  const record = (status: "succeeded" | "failed", error?: string) => {
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const cached = Math.min(inputTokens, usage?.prompt_tokens_details?.cached_tokens ?? 0);
    input.diagnostics.push({ stage: "story_bible_update", provider: "openrouter", model: "aion-labs/aion-3.5", status,
      inputTokens, outputTokens, totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd: typeof usage?.cost === "number" ? usage.cost : usage ? ((inputTokens - cached) * 3 + cached * 0.75 + outputTokens * 6) / 1_000_000 : null,
      costType: typeof usage?.cost === "number" ? "reported" : usage ? "estimated" : "unavailable",
      durationMs: Date.now() - startedAt, attempt: 1, ...(error ? { error } : {}) });
  };
  try {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured for the Story Bible editor.");
    const messages = input.messages.map((message, i) => i === 0 ? { ...message, content: `${message.content}\n\nReturn one JSON object matching this schema. Do not repeat the Bible in the reply. Preserve detailed author decisions in the appropriate fields, including all world rules and planned revelations. Future events are plans, not completed continuity.\n${JSON.stringify(input.schema)}` } : message);
    const response = await fetch(`${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "aion-labs/aion-3.5", messages, response_format: { type: "json_object" }, reasoning: { effort: "low" }, temperature: 0.2, max_tokens: bibleOutputAllowance(input.instruction), provider: { allow_fallbacks: false } }),
      signal: AbortSignal.timeout(240000),
    });
    const data = await response.json();
    usage = data.usage;
    if (!response.ok || data.error) throw new Error(`Aion Story Bible editing failed (${response.status}): ${data.error?.message ?? "provider error"}`);
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("Aion reached the Story Bible output limit. The existing Bible is unchanged. No automatic retry was started.");
    if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) throw new Error("Aion did not provide the requested Story Bible edit. The existing Bible is unchanged.");
    const text = choice?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Aion returned no Story Bible edit.");
    const output: unknown = JSON.parse(text);
    try { assertChapterPlanSchema(output, input.schema); }
    catch { throw new Error("Aion returned an invalid Story Bible edit. The existing Bible is unchanged."); }
    record("succeeded");
    return output;
  } catch (error) {
    record("failed", error instanceof Error ? error.message : "Aion Story Bible editing failed.");
    throw error;
  }
}
