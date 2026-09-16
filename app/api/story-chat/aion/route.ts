import OpenAI from "openai";
import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const AION_MODEL = "aion-labs/aion-3.0";
const MAX_COMPLETION_TOKENS = 12000;
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

type AionRequest = {
  message?: unknown;
  storyBible?: unknown;
  storyState?: unknown;
  chapterBrief?: unknown;
  chapterDraft?: unknown;
  povCharacter?: unknown;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

class RetryableAionError extends Error {}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripAionPrefix(value: string): string {
  return value.replace(/^\s*aion\s*[:,-]?\s*/i, "").trim();
}

function compactContext(value: unknown, maximumCharacters: number): string {
  try {
    const serialized = JSON.stringify(value ?? {}, null, 2);
    return serialized.length <= maximumCharacters
      ? serialized
      : serialized.slice(0, maximumCharacters) + "\n[context shortened]";
  } catch {
    return "{}";
  }
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repeatedWindows(value: string, size: number): number {
  const words = normalise(value).split(" ").filter(Boolean);
  const counts = new Map<string, number>();
  for (let index = 0; index + size <= words.length; index += 1) {
    const window = words.slice(index, index + size).join(" ");
    counts.set(window, (counts.get(window) ?? 0) + 1);
  }
  return Array.from(counts.values()).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
}

function validateReplacement(value: string): void {
  if (
    /^\s{0,3}#{1,6}\s+\S+/mu.test(value) ||
    value.includes(String.fromCharCode(96).repeat(3)) ||
    /<\/?think[^>]*>/i.test(value) ||
    /^\s*(?:rewrite|replacement|analysis|notes?|explanation|here(?:'s| is))\s*:/im.test(value)
  ) {
    throw new Error(
      "Aion returned commentary, markdown or reasoning instead of replacement prose.",
    );
  }
  if (repeatedWindows(value, 16) >= 4) {
    throw new Error(
      "Aion repeated substantial prose inside the replacement. The response was discarded.",
    );
  }
}

function isRetryable(error: unknown): boolean {
  if (
    error instanceof RetryableAionError ||
    error instanceof OpenAI.APIConnectionError ||
    error instanceof TypeError
  ) {
    return true;
  }
  return (
    error instanceof OpenAI.APIError &&
    (error.status === undefined ||
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500))
  );
}

function diagnostic(input: {
  status: "succeeded" | "failed";
  startedAt: number;
  attempt: number;
  usage?: OpenRouterUsage;
  error?: string;
}): GenerationDiagnostic {
  const inputTokens = input.usage?.prompt_tokens ?? 0;
  const outputTokens = input.usage?.completion_tokens ?? 0;
  const reportedCost =
    typeof input.usage?.cost === "number" ? input.usage.cost : null;
  return {
    stage: "aion_passage_rewrite",
    provider: "openrouter",
    model: AION_MODEL,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd: reportedCost,
    costType: reportedCost === null ? "unavailable" : "reported",
    durationMs: Math.max(0, Date.now() - input.startedAt),
    attempt: input.attempt,
    ...(input.error ? { error: input.error } : {}),
  };
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as AionRequest;
    const instructionAndPassage = stripAionPrefix(cleanString(body.message));
    const povCharacter = cleanString(body.povCharacter);
    const chapterBrief = cleanString(body.chapterBrief);

    if (!instructionAndPassage) {
      return NextResponse.json(
        {
          error:
            "After Aion:, include your instruction and the exact passage you want rewritten.",
        },
        { status: 400 },
      );
    }

    const prompt = [
      "You are NovelForge's specialist bounded-passage editor for commercial adult MM romance.",
      "Rewrite only the exact passage supplied by the author. Return the complete replacement passage only. Do not return analysis, reasoning, labels, markdown, alternatives or notes.",
      "The author's requested maximum expansion is a hard limit. Preserve all prose and events that are not being changed, replace the requested material naturally, and do not continue beyond the pasted endpoint.",
      "Every romantic or sexual character is an adult aged eighteen or older. Follow the requested heat, tone and emphasis directly. Keep explicit adult intimacy physically clear, emotionally specific and particular to these characters, without a generic escalation sequence, anatomy inventory, stock dialogue, repeated reassurance or automatic tenderness.",
      "Preserve POV, tense, established voice, factual continuity, physical staging and emotional progression. Do not invent prior attraction, sex, knowledge or off-page events.",
      "Use natural contractions and complete contemporary sentences. Never use em dashes or en dashes. Keep dialogue causally connected. Remove filler, repetitive emotional explanation, therapy language and interchangeable banter.",
      "POV CHARACTER:\n" +
        (povCharacter || "Use the POV established by the supplied passage."),
      "COMPLETE CHAPTER CONTRACT:\n" +
        (chapterBrief || "No separate Chapter Contract was supplied."),
      "STORY BIBLE:\n" + compactContext(body.storyBible, 9000),
      "CONTINUITY STATE:\n" + compactContext(body.storyState, 7000),
      "CURRENT CHAPTER DRAFT, CONTEXT ONLY:\n" +
        cleanString(body.chapterDraft).slice(-12000),
      "AUTHOR INSTRUCTION AND EXACT PASSAGE:\n" + instructionAndPassage,
      "Return the complete replacement passage and stop at its original endpoint.",
    ].join("\n\n");

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      let usage: OpenRouterUsage | undefined;

      try {
        const response = await openrouter.chat.completions.create({
          model: AION_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Return only one complete replacement passage. Reason internally as required by the provider, but never expose reasoning. Obey the author's hard length and passage boundaries.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: MAX_COMPLETION_TOKENS,
          temperature: 0.6,
          top_p: 0.9,
          frequency_penalty: 0,
          presence_penalty: 0,
        });

        usage = response.usage as OpenRouterUsage | undefined;
        const choice = response.choices[0];

        if (choice?.finish_reason === "length") {
          throw new RetryableAionError(
            "Aion reached its output limit before finishing the replacement.",
          );
        }
        if (choice?.finish_reason === "content_filter") {
          throw new Error(
            "The writing provider stopped Aion's replacement with a content filter.",
          );
        }

        const reply = choice?.message?.content?.trim();
        if (!reply) {
          throw new RetryableAionError("Aion returned an empty response.");
        }

        validateReplacement(reply);
        diagnostics.push(
          diagnostic({ status: "succeeded", startedAt, attempt, usage }),
        );
        return NextResponse.json({ reply, diagnostics });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Aion could not rewrite the passage.";
        const retryable = isRetryable(error);
        diagnostics.push(
          diagnostic({
            status: "failed",
            startedAt,
            attempt,
            usage,
            error: message,
          }),
        );
        if (!retryable || attempt === 2) {
          return NextResponse.json(
            { error: message, diagnostics },
            { status: retryable ? 502 : 422 },
          );
        }
      }
    }

    throw new Error("Aion's provider failed.");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Aion could not rewrite the passage.",
        diagnostics,
      },
      { status: 500 },
    );
  }
}

