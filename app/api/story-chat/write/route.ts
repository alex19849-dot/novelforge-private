import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

const WRITING_MODEL = "aion-labs/aion-3.0";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

type RecentChapter = {
  number: number;
  title: string;
  povCharacter: string;
  content: string;
};

type WriterRequest = {
  storyBible?: unknown;
  storyState?: unknown;
  recentChapters?: unknown;
  chapterBrief?: unknown;
  latestUserMessage?: unknown;
  existingDraft?: unknown;
  minimumWordCount?: unknown;
  maximumWordCount?: unknown;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getWordCount(value: unknown, fallback: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 500 ||
    value > 10000
  ) {
    return fallback;
  }

  return Math.round(value);
}

function getWritingContinuityState(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const writingState = {
    ...(value as Record<string, unknown>),
  };

  delete writingState.lastGenerationDiagnostics;
  delete writingState.diagnostics;
  delete writingState.generationDiagnostics;

  return writingState;
}

function cleanRecentChapters(value: unknown): RecentChapter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (chapter): chapter is Partial<RecentChapter> =>
        Boolean(chapter) && typeof chapter === "object",
    )
    .map((chapter, index) => ({
      number: typeof chapter.number === "number" ? chapter.number : index + 1,
      title: cleanString(chapter.title),
      povCharacter: cleanString(chapter.povCharacter),
      content: cleanString(chapter.content),
    }))
    .filter((chapter) => chapter.content)
    .slice(-1);
}

function getNarrativeStyle(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "First-person present tense.";
  }

  const bible = value as Record<string, unknown>;
  const styleParts = [
    cleanString(bible.pov),
    cleanString(bible.tense),
    cleanString(bible.narrativeTense),
  ].filter(Boolean);
  const statedStyle = styleParts.join(", ");

  if (/\b(?:past|present)\s+tense\b/i.test(statedStyle)) {
    return statedStyle;
  }

  return statedStyle
    ? `${statedStyle}, present tense`
    : "First-person present tense.";
}

function cleanGeneratedProse(content: string): string {
  let cleaned = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  const fencedResponse = cleaned.match(
    /^```(?:text|markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i,
  );

  if (fencedResponse) {
    cleaned = fencedResponse[1].trim();
  }

  return cleaned
    .replace(/\\"/g, '"')
    .replace(/\\([“”‘’])/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/u, "")
    .trim();
}

function validateProse(content: string): void {
  const opening = content.slice(0, 6000);
  const planningPatterns = [
    /^\s*i need to (?:write|create|generate|continue)\b/im,
    /^\s*let me analy[sz]e\b/im,
    /^\s*(?:key requirements|important continuity points)\s*:/im,
    /^\s*structure i need to hit\s*:/im,
    /^\s*word count\s*:/im,
    /^\s*(?:analysis|chapter plan|outline)\s*:/im,
    /^\s*here(?:'s| is) (?:the|your) chapter\b/im,
    /^\s*an error (?:occurred|happened)\b/im,
  ];

  if (planningPatterns.some((pattern) => pattern.test(opening))) {
    throw new Error(
      "Aion returned planning notes instead of publishable chapter prose.",
    );
  }

  if (/^\s*chapter\s+\d+\b/im.test(content)) {
    throw new Error(
      "Aion included a chapter heading inside the prose. The chapter was not saved.",
    );
  }

  if (/^\s{0,3}#{1,6}\s+\S+/mu.test(content) || /```/.test(content)) {
    throw new Error(
      "Aion returned markdown instead of clean novel prose. The chapter was not saved.",
    );
  }

  if (/\\["“”‘’]/u.test(content)) {
    throw new Error(
      "Aion returned broken escaped quotation marks. The chapter was not saved.",
    );
  }

  if (!/[.!?…"”’']$/u.test(content.trim())) {
    throw new Error(
      "Aion appears to have stopped mid-sentence. The incomplete prose was not saved.",
    );
  }
}

function getPrompt(input: {
  storyBible: unknown;
  storyState: unknown;
  recentChapters: RecentChapter[];
  chapterDirection: string;
  latestUserMessage: string;
  narrativeStyle: string;
  minimumWordCount: number;
  maximumWordCount: number;
}): string {
  const preferredMinimum = Math.min(
    input.maximumWordCount,
    Math.max(input.minimumWordCount, 2600),
  );
  const preferredMaximum = Math.min(
    input.maximumWordCount,
    Math.max(preferredMinimum, 3000),
  );

  return `
You are NovelForge, a skilled commercial romance novelist.

Write one complete, immersive chapter. Return only finished novel prose.
Do not include a chapter number, title, POV heading, notes, analysis,
outline, markdown or commentary.

NARRATIVE

Use ${input.narrativeStyle}

The Story Bible and established continuity are binding. Characters must
remember what has happened and must not know information they have not
learned. Continue from the previous chapter's exact ending when one is
provided. Do not reset attraction, conflict, trust, intimacy or character
development.

Write in a fluent contemporary voice with natural contractions. Give the
POV character a distinct rhythm, vocabulary, humour, observations and
emotional habits. Dialogue must sound like these particular characters,
not interchangeable romance leads.

CHAPTER SHAPE

Use two or three purposeful scenes, or one sustained scene with meaningful
turns. Begin at the most interesting credible point. Every scene must change
the plot, relationship, knowledge, risk or a character's decision.

Plot developments and forced proximity must arise credibly from the
established world and from decisions made by established characters. Never
invent a convenient stranger, administrative rule, document, message,
credential, scheduling requirement or coincidence solely to put characters
together or manufacture an ending.

Do not invent institutional, sporting, legal, workplace or academic procedures
without support from the Story Bible or previous chapters. Avoid contradictions
in year groups, roles, authority, schedules, locations and character knowledge.

Keep the chapter between ${input.minimumWordCount} and ${input.maximumWordCount} words.
Aim for approximately ${preferredMinimum} to ${preferredMaximum} words so the
chapter clears the hard minimum without requiring continuation. The accepted
range is a boundary, not permission to pad. Once the chapter has cleared the
minimum and completed its natural dramatic arc, stop. Never extend the chapter
with repeated messages, repeated objects, repeated attraction denial, routine
travel, bedtime reflection or several versions of the same ending.

End once, on a concrete event, choice, reveal, complication, interruption or
changed relationship consequence. Do not end with a vague prediction, private
vow or summary about how difficult tomorrow will be. After the strongest final
turn or hook, stop immediately. Do not add another encounter, logistical
instruction, observation from a distance, attraction summary or second closing
beat.

CONTENT

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. When the established
progression calls for explicit consensual adult intimacy, write it fully,
directly and without censorship or fade to black. Do not insert intimacy before
it is earned.

Use varied sentence and paragraph lengths. Avoid generic attraction shorthand,
stock dramatic reactions, therapy-speak, purple prose and repetitive internal
summary. Never use em dashes or en dashes.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY STATE

${JSON.stringify(getWritingContinuityState(input.storyState), null, 2)}

PREVIOUS CHAPTER

${JSON.stringify(input.recentChapters.at(-1) ?? null, null, 2)}

USER'S CURRENT CHAPTER REQUEST

${input.latestUserMessage || "Write the next chapter naturally."}

CHAPTER DIRECTION

${input.chapterDirection || "Continue the story naturally from the established position."}

Write only the finished chapter prose now.
  `.trim();
}

function getContinuationPrompt(input: {
  existingDraft: string;
  latestUserMessage: string;
  minimumWordCount: number;
  maximumWordCount: number;
}): string {
  const currentWordCount = countWords(input.existingDraft);
  const missingWords = Math.max(
    0,
    input.minimumWordCount - currentWordCount,
  );
  const requestedAdditionalWords = Math.min(
    900,
    Math.max(400, missingWords + 200),
  );

  return `
Continue the unfinished novel chapter below.

Return only the new prose that comes after the draft. Do not repeat,
rewrite, summarise or quote any existing prose. Do not include a chapter
heading, title, POV label, note, analysis, outline, markdown or commentary.

Write approximately ${requestedAdditionalWords} additional words. Complete
the chapter's existing dramatic movement naturally and end once, on a
concrete event, choice, reveal, complication, interruption or changed
relationship consequence.

Do not introduce a new subplot merely to add length. Do not pad with routine
travel, repeated attraction denial, repeated objects, repeated messages,
bedtime reflection or a second version of an ending already present.

Maintain the exact POV, tense, voice, continuity and formatting established
by the draft. Use natural contractions. Never use em dashes or en dashes.

The combined chapter must finish between ${input.minimumWordCount} and
${input.maximumWordCount} words.

USER'S ORIGINAL REQUEST

${input.latestUserMessage || "Continue the chapter naturally."}

EXISTING DRAFT

${input.existingDraft}

Continue immediately after the final sentence. Return only the additional
finished prose.
  `.trim();
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];
  let providerCallStartedAt = 0;

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as WriterRequest;
    const chapterDirection = cleanString(body.chapterBrief);
    const latestUserMessage = cleanString(body.latestUserMessage);
    const existingDraft = cleanString(body.existingDraft);
    const recentChapters = cleanRecentChapters(body.recentChapters);
    const narrativeStyle = getNarrativeStyle(body.storyBible);
    const minimumWordCount = getWordCount(body.minimumWordCount, 2000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      getWordCount(body.maximumWordCount, 4000),
    );

    const existingWordCount = countWords(existingDraft);
    const isManualContinuation =
      Boolean(existingDraft) && existingWordCount < minimumWordCount;

    if (existingDraft && existingWordCount > maximumWordCount) {
      return NextResponse.json(
        {
          error: `The preserved draft already exceeds ${maximumWordCount} words.`,
        },
        { status: 409 },
      );
    }

    if (
      existingDraft &&
      existingWordCount >= minimumWordCount &&
      existingWordCount <= maximumWordCount
    ) {
      validateProse(existingDraft);

      return NextResponse.json({
        prose: existingDraft,
        totalWordCount: existingWordCount,
        isComplete: true,
        diagnostics,
      });
    }

    const prompt = isManualContinuation
      ? getContinuationPrompt({
          existingDraft,
          latestUserMessage,
          minimumWordCount,
          maximumWordCount,
        })
      : getPrompt({
          storyBible: body.storyBible ?? {},
          storyState: body.storyState ?? {},
          recentChapters,
          chapterDirection,
          latestUserMessage,
          narrativeStyle,
          minimumWordCount,
          maximumWordCount,
        });

    providerCallStartedAt = Date.now();
    const response = await openrouter.chat.completions.create({
      model: WRITING_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: isManualContinuation ? 2500 : 12000,
    });
    const rawUsage = response.usage as unknown as
      | Record<string, unknown>
      | undefined;
    const inputTokens =
      typeof rawUsage?.prompt_tokens === "number" ? rawUsage.prompt_tokens : 0;
    const outputTokens =
      typeof rawUsage?.completion_tokens === "number"
        ? rawUsage.completion_tokens
        : 0;
    const totalTokens =
      typeof rawUsage?.total_tokens === "number"
        ? rawUsage.total_tokens
        : inputTokens + outputTokens;
    const costUsd = typeof rawUsage?.cost === "number" ? rawUsage.cost : null;

    diagnostics.push({
      stage: isManualContinuation
        ? "chapter_writing_continuation"
        : "chapter_writing",
      provider: "openrouter",
      model: WRITING_MODEL,
      status: "succeeded",
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      costType: costUsd === null ? "unavailable" : "reported",
      durationMs: Date.now() - providerCallStartedAt,
      attempt: 1,
    });

    const rawProse = response.choices[0]?.message?.content;

    if (!rawProse?.trim()) {
      throw new Error("Aion returned no chapter prose.");
    }

    const returnedProse = cleanGeneratedProse(rawProse);

    validateProse(returnedProse);

    const prose = isManualContinuation
      ? `${existingDraft}\n\n${returnedProse}`.trim()
      : returnedProse;
    const totalWordCount = countWords(prose);

    return NextResponse.json({
      prose,
      totalWordCount,
      isComplete:
        totalWordCount >= minimumWordCount &&
        totalWordCount <= maximumWordCount,
      diagnostics,
    });
  } catch (error) {
    console.error("STORY WRITER FAILED:", error);
    const message =
      error instanceof Error ? error.message : "The writing model failed.";

    if (diagnostics.length > 0) {
      diagnostics[diagnostics.length - 1] = {
        ...diagnostics[diagnostics.length - 1],
        status: "failed",
        error: message,
      };
    } else if (providerCallStartedAt > 0) {
      diagnostics.push({
        stage: "chapter_writing",
        provider: "openrouter",
        model: WRITING_MODEL,
        status: "failed",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: null,
        costType: "unavailable",
        durationMs: Date.now() - providerCallStartedAt,
        attempt: 1,
        error: message,
      });
    }

    return NextResponse.json(
      {
        error: message,
        diagnostics,
      },
      { status: 502 },
    );
  }
}
