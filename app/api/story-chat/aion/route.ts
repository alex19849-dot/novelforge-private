import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const AION_MODEL = "aion-labs/aion-3.0";
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

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

class TechnicalAionError extends Error {}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripAionPrefix(message: string): string {
  return message.replace(/^\s*aion\s*[:,-]?\s*/i, "").trim();
}

function compactJson(value: unknown, maximumCharacters: number): string {
  let serialized = "{}";

  try {
    serialized = JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }

  if (serialized.length <= maximumCharacters) {
    return serialized;
  }

  return `${serialized.slice(0, maximumCharacters)}\n[context shortened]`;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repeatedWindowOccurrences(text: string, size: number): number {
  const words = normalise(text).split(" ").filter(Boolean);
  const counts = new Map<string, number>();

  for (let index = 0; index + size <= words.length; index += 1) {
    const window = words.slice(index, index + size).join(" ");
    counts.set(window, (counts.get(window) ?? 0) + 1);
  }

  let repeated = 0;

  for (const count of counts.values()) {
    if (count > 1) {
      repeated += count - 1;
    }
  }

  return repeated;
}

function validateReply(reply: string): void {
  if (
    /^\s{0,3}#{1,6}\s+\S+/mu.test(reply) ||
    /```/.test(reply) ||
    /<\/?think[^>]*>/i.test(reply) ||
    /^\s*(?:rewrite|replacement|analysis|notes?|explanation|here(?:'s| is))\s*:/im.test(
      reply,
    )
  ) {
    throw new Error(
      "Aion returned commentary, markdown or reasoning instead of replacement prose.",
    );
  }

  if (!/[.!?…”’']$/u.test(reply)) {
    throw new Error("Aion returned an obviously incomplete passage.");
  }

  if (repeatedWindowOccurrences(reply, 16) >= 4) {
    throw new Error(
      "Aion repeated substantial prose inside the replacement. The response was discarded.",
    );
  }
}

function isTechnicalFailure(error: unknown): boolean {
  if (error instanceof TechnicalAionError) {
    return true;
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return true;
  }

  if (error instanceof OpenAI.APIError) {
    return (
      error.status === undefined ||
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500)
    );
  }

  return error instanceof TypeError;
}

function makeDiagnostic(input: {
  status: "succeeded" | "failed";
  usage?: Usage;
  durationMs: number;
  attempt: number;
  error?: string;
}): GenerationDiagnostic {
  const inputTokens = input.usage?.prompt_tokens ?? 0;
  const outputTokens = input.usage?.completion_tokens ?? 0;
  const costUsd =
    typeof input.usage?.cost === "number" ? input.usage.cost : null;

  return {
    stage: "aion_passage_rewrite",
    provider: "openrouter",
    model: AION_MODEL,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd,
    costType: costUsd === null ? "unavailable" : "reported",
    durationMs: input.durationMs,
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

    const prompt = `
You are Aion, NovelForge's specialist passage editor for commercial adult MM
romance.

The user has pasted a bounded passage and asked for a replacement. Rewrite only
that passage. Return replacement novel prose only, with no introduction,
explanation, labels, markdown, quotation fence, notes or alternatives.

Follow the user's requested heat, length, tone and emphasis directly. When they
ask for hotter or more explicit prose, write direct consensual adult sexual
content without censoring, summarising or fading to black. Every romantic or
sexual character is a consenting adult aged eighteen or older.

Preserve the supplied passage's POV, tense, voice, established facts, consent,
physical staging, clothing, injuries, possessions and emotional progression.
Preserve the purpose and outcome of the passage unless the user explicitly asks
to change them. Do not continue beyond the pasted moment and do not rewrite the
surrounding chapter.

Use natural contractions. Keep dialogue character-specific and logically
responsive. Do not use em dashes or en dashes. Do not add a chapter heading.
Do not invent prior attraction, romance, sex, knowledge or off-page events.

POV CHARACTER:
${povCharacter || "Use the POV established by the pasted passage."}

STORY BIBLE:
${compactJson(body.storyBible, 7000)}

CANONICAL CHAPTER PLAN:
${chapterBrief ? chapterBrief.slice(0, 4000) : "No separate plan supplied."}

CURRENT CONTINUITY STATE:
${compactJson(body.storyState, 5000)}

USER'S INSTRUCTION AND EXACT PASSAGE:
${instructionAndPassage}
    `.trim();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      let usage: Usage | undefined;

      try {
        const response = await openrouter.chat.completions.create({
          model: AION_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Return only the requested replacement prose. All characters in romantic or sexual material are consenting adults aged eighteen or older. Preserve POV, tense, voice, continuity and physical staging.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 1900,
          temperature: 0.6,
          top_p: 0.9,
          frequency_penalty: 0,
          presence_penalty: 0,
        });

        usage = response.usage as Usage | undefined;
        const choice = response.choices[0];

        if (choice?.finish_reason === "length") {
          throw new Error(
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
          throw new TechnicalAionError("Aion returned an empty response.");
        }

        validateReply(reply);

        diagnostics.push(
          makeDiagnostic({
            status: "succeeded",
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
          }),
        );

        return NextResponse.json({
          reply,
          diagnostics,
        });
      } catch (error) {
        const aionError =
          error instanceof Error
            ? error
            : new Error("Aion could not rewrite the passage.");
        const retryable = isTechnicalFailure(error);

        diagnostics.push(
          makeDiagnostic({
            status: "failed",
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
            error: aionError.message,
          }),
        );

        if (!retryable || attempt === 2) {
          return NextResponse.json(
            {
              error: aionError.message,
              diagnostics,
            },
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
