import type { GenerationDiagnostic } from "../app/story-chat/types";

type JsonSchema = {
  type?: string;
  enum?: readonly unknown[];
  anyOf?: readonly JsonSchema[];
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
};

// Enforce the constraints used by NovelForge's chapter-contract schema locally.
// Aion supplies JSON mode, but the provider does not enforce this schema.
export function assertChapterPlanSchema(value: unknown, schema: JsonSchema, path = "contract"): void {
  if (schema.anyOf) {
    if (schema.anyOf.some((option) => { try { assertChapterPlanSchema(value, option, path); return true; } catch { return false; } })) return;
    throw new Error(`Aion returned an invalid chapter contract field: ${path}.`);
  }
  const matches = schema.type === "null" ? value === null
    : schema.type === "integer" ? Number.isInteger(value)
    : schema.type === "array" ? Array.isArray(value)
    : schema.type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
    : schema.type === "string" ? typeof value === "string" : true;
  if (!matches || (schema.enum && !schema.enum.includes(value))) throw new Error(`Aion returned an invalid chapter contract field: ${path}.`);
  if (schema.type === "object") {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) throw new Error(`Aion omitted the required chapter contract field: ${path}.${key}.`);
    for (const [key, child] of Object.entries(object)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) assertChapterPlanSchema(child, childSchema, `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`Aion returned an unexpected chapter contract field: ${path}.${key}.`);
    }
  }
  if (schema.type === "array") {
    const items = value as unknown[];
    if (items.length < (schema.minItems ?? 0) || items.length > (schema.maxItems ?? Infinity)) throw new Error(`Aion returned an invalid chapter contract list: ${path}.`);
    if (schema.items) items.forEach((item, index) => assertChapterPlanSchema(item, schema.items!, `${path}[${index}]`));
  }
}

export async function createAionChapterPlan(input: {
  messages: Array<{ role: string; content: string }>;
  schema: JsonSchema;
  diagnostics: GenerationDiagnostic[];
  attempt: number;
}) {
  const startedAt = Date.now();
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;
  const diagnostic = (status: "succeeded" | "failed", error?: string): GenerationDiagnostic => {
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const cached = Math.min(inputTokens, usage?.prompt_tokens_details?.cached_tokens ?? 0);
    return { stage: "chapter_planning", provider: "openrouter", model: "aion-labs/aion-3.5", status, inputTokens, outputTokens,
      totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd: typeof usage?.cost === "number" ? usage.cost : usage ? ((inputTokens - cached) * 3 + cached * 0.75 + outputTokens * 6) / 1_000_000 : null,
      costType: typeof usage?.cost === "number" ? "reported" : usage ? "estimated" : "unavailable",
      durationMs: Date.now() - startedAt, attempt: input.attempt, ...(error ? { error } : {}) };
  };
  try {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured for the chapter planner.");
    const messages = input.messages.map((message, index) => index === 0 ? { ...message,
      content: `${message.content}\n\nOUTPUT FORMAT\nReturn one JSON object matching this JSON Schema. Do not wrap it in markdown. All required fields must be present.\n${JSON.stringify(input.schema)}`,
    } : message);
    // One request only: no provider fallback, SDK retry or repair generation.
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "aion-labs/aion-3.5", messages, response_format: { type: "json_object" }, reasoning: { effort: "low" }, temperature: 0.2, max_tokens: 4000, provider: { allow_fallbacks: false } }),
      signal: AbortSignal.timeout(110000),
    });
    const data = await response.json();
    usage = data.usage;
    if (!response.ok || data.error) throw new Error(`Aion chapter planning failed (${response.status}): ${data.error?.message ?? "provider error"}`);
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("Aion reached its chapter-planning output limit. No automatic retry was started.");
    if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) throw new Error("Aion did not provide the requested chapter plan. No automatic retry was started.");
    const outputText = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!outputText) throw new Error("Aion returned no chapter contract. No automatic retry was started.");
    input.diagnostics.push(diagnostic("succeeded"));
    return { status: "completed" as const, incomplete_details: null, output_text: outputText,
      usage: { input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0, total_tokens: usage?.total_tokens ?? 0, input_tokens_details: { cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0 } } };
  } catch (error) {
    input.diagnostics.push(diagnostic("failed", error instanceof Error ? error.message : "Aion chapter planning failed."));
    throw error;
  }
}
