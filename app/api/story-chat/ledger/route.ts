import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 120;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChapterInput = {
  number?: unknown;
  title?: unknown;
  povCharacter?: unknown;
  content?: unknown;
};

type LedgerRequest = {
  storyBible?: unknown;
  storyState?: unknown;
  chapters?: unknown;
  chapter?: ChapterInput;
  rebuildMode?: unknown;
};

type LedgerModelOutput = {
  importantFacts: string[];
  characterStates: string[];
  relationshipStates: string[];
  unresolvedThreads: string[];
  timeline: string[];
  locations: string[];
  activePOV: string;
  characterKnowledge: string[];
  repetitionWarnings: string[];
  voiceProfiles: Array<{
    characterName: string;
    narrativeRhythm: string;
    vocabulary: string;
    humourStyle: string;
    emotionalDeflection: string;
    sensoryFocus: string;
    dialoguePattern: string;
    internalThoughtPattern: string;
    forbiddenHabits: string[];
  }>;
  chapterEntries: Array<{
    chapterNumber: number;
    summary: string;
    openingLocation: string;
    endingLocation: string;
    endingTime: string;
    relationshipShift: string;
    intimacyMilestone: string;
    newFacts: string[];
    unresolvedThreads: string[];
    repeatedBeats: string[];
  }>;
};

const ledgerSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "importantFacts",
    "characterStates",
    "relationshipStates",
    "unresolvedThreads",
    "timeline",
    "locations",
    "activePOV",
    "characterKnowledge",
    "repetitionWarnings",
    "voiceProfiles",
    "chapterEntries",
  ],
  properties: {
    importantFacts: {
      type: "array",
      items: { type: "string" },
    },
    characterStates: {
      type: "array",
      items: { type: "string" },
    },
    relationshipStates: {
      type: "array",
      items: { type: "string" },
    },
    unresolvedThreads: {
      type: "array",
      items: { type: "string" },
    },
    timeline: {
      type: "array",
      items: { type: "string" },
    },
    locations: {
      type: "array",
      items: { type: "string" },
    },
    activePOV: {
      type: "string",
    },
    characterKnowledge: {
      type: "array",
      items: { type: "string" },
    },
    repetitionWarnings: {
      type: "array",
      items: { type: "string" },
    },
    voiceProfiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "characterName",
          "narrativeRhythm",
          "vocabulary",
          "humourStyle",
          "emotionalDeflection",
          "sensoryFocus",
          "dialoguePattern",
          "internalThoughtPattern",
          "forbiddenHabits",
        ],
        properties: {
          characterName: { type: "string" },
          narrativeRhythm: { type: "string" },
          vocabulary: { type: "string" },
          humourStyle: { type: "string" },
          emotionalDeflection: { type: "string" },
          sensoryFocus: { type: "string" },
          dialoguePattern: { type: "string" },
          internalThoughtPattern: { type: "string" },
          forbiddenHabits: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    chapterEntries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "chapterNumber",
          "summary",
          "openingLocation",
          "endingLocation",
          "endingTime",
          "relationshipShift",
          "intimacyMilestone",
          "newFacts",
          "unresolvedThreads",
          "repeatedBeats",
        ],
        properties: {
          chapterNumber: { type: "number" },
          summary: { type: "string" },
          openingLocation: { type: "string" },
          endingLocation: { type: "string" },
          endingTime: { type: "string" },
          relationshipShift: { type: "string" },
          intimacyMilestone: { type: "string" },
          newFacts: {
            type: "array",
            items: { type: "string" },
          },
          unresolvedThreads: {
            type: "array",
            items: { type: "string" },
          },
          repeatedBeats: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getEndingExcerpt(text: string, maximumWords = 500): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return words.slice(-maximumWords).join(" ");
}

function cleanExistingLedger(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const ledger = (value as Record<string, unknown>).chapterLedger;

  return Array.isArray(ledger)
    ? ledger.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
    : [];
}

function cleanChapters(value: unknown): Array<{
  number: number;
  title: string;
  povCharacter: string;
  content: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (chapter): chapter is ChapterInput =>
        Boolean(chapter) && typeof chapter === "object",
    )
    .map((chapter) => ({
      number: typeof chapter.number === "number" ? chapter.number : Number.NaN,
      title: cleanString(chapter.title),
      povCharacter: cleanString(chapter.povCharacter),
      content: cleanString(chapter.content),
    }))
    .filter(
      (chapter) =>
        Number.isFinite(chapter.number) &&
        chapter.povCharacter &&
        chapter.content,
    )
    .sort((left, right) => left.number - right.number);
}

export async function POST(request: Request) {
  let diagnostic: GenerationDiagnostic | null = null;
  let providerCallStartedAt = 0;
  let diagnosticStage = "continuity_ledger_update";

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as LedgerRequest;
    const chapterNumber = body.chapter?.number;
    const chapterTitle = cleanString(body.chapter?.title);
    const povCharacter = cleanString(body.chapter?.povCharacter);
    const chapterContent = cleanString(body.chapter?.content);
    const allChapters = cleanChapters(body.chapters);
    const isBatchRebuild = body.rebuildMode === "batch";
    diagnosticStage = isBatchRebuild
      ? "continuity_ledger_backfill"
      : "continuity_ledger_update";

    if (
      typeof chapterNumber !== "number" ||
      !Number.isFinite(chapterNumber) ||
      !chapterContent ||
      !povCharacter
    ) {
      return NextResponse.json(
        { error: "A complete generated chapter is required." },
        { status: 400 },
      );
    }

    const existingLedger = cleanExistingLedger(body.storyState);
    const latestChapterNumber =
      allChapters.length > 0
        ? Math.max(...allChapters.map((chapter) => chapter.number))
        : chapterNumber;
    const requiresFullRebuild =
      !isBatchRebuild &&
      (existingLedger.length === 0 || chapterNumber < latestChapterNumber);
    if (requiresFullRebuild) {
      diagnosticStage = "continuity_ledger_backfill";
    }
    const chaptersToAnalyse = isBatchRebuild
      ? allChapters
      : requiresFullRebuild
        ? allChapters
        : [
            {
              number: chapterNumber,
              title: chapterTitle,
              povCharacter,
              content: chapterContent,
            },
          ];
    const stateForAnalysis =
      requiresFullRebuild && !isBatchRebuild ? {} : (body.storyState ?? {});

    if (chaptersToAnalyse.length === 0) {
      throw new Error("No chapters were available for continuity analysis.");
    }

    providerCallStartedAt = Date.now();
    const response = await openai.responses.create({
      model: "gpt-5.6-terra",
      reasoning: {
        effort: "low",
      },
      input: [
        {
          role: "system",
          content: `
You maintain factual continuity for a commercial novel.

Read the supplied completed chapter or chapters themselves. Record only
what the prose actually establishes. Never treat a plan, implication or
likely future event as a completed fact.

Return a compact but complete updated story state.

Preserve established facts that the new chapter does not change. Update
each character's current emotional, physical and situational state.
Record what each named character knows, suspects, misunderstands or is
concealing. Record the exact relationship change and the furthest
romantic or sexual intimacy milestone actually reached.

Identify active unresolved threads. Keep the timeline chronological.
Identify repeated scene constructions, emotional beats, gestures,
internal conclusions or phrases that future chapters should avoid.

Create one distinct voiceProfiles entry for every established main POV
character. Build each profile from the Story Bible, the user's stated
characterisation and the completed prose. Preserve the user's intended
personality even when a generated chapter has slipped into generic prose.

Every voice profile must be operational enough for another writer to
imitate that character without seeing the source chapter:

- narrativeRhythm must describe typical sentence length, pace, fragment
use and how the rhythm changes under pressure;
- vocabulary must identify preferred register, recurring word types,
professional or regional language, swearing habits and language this
character would never naturally use;
- humourStyle must state what the character finds funny, how they deliver
humour and whether humour hides fear, attraction, anger or vulnerability;
- emotionalDeflection must state the character's specific defence
mechanism and the observable behaviour it produces;
- sensoryFocus must state what this character notices first in rooms,
people, conflict and attraction;
- dialoguePattern must describe directness, interruptions, questions,
evasions, pet names, formality and how speech changes with the love
interest;
- internalThoughtPattern must describe what the character admits
privately, what they rationalise and what they refuse to name;
- forbiddenHabits must contain concrete phrases, reactions, jokes and
sentence habits that would make this voice generic or too similar to
another POV.

Do not use empty labels such as sharp, witty, confident, guarded, dry,
sarcastic, observant or emotionally unavailable without explaining
exactly how that quality appears on the page. Contrast the main POV
profiles against each other explicitly. Give each character at least
three differences that the other main POV character must not inherit.

Preserve an existing voice profile when it remains consistent with the
Story Bible. Refine it when new prose reveals a genuine additional trait,
but never flatten distinct voices toward the same generated-fiction
style.

Natural contractions are the default for contemporary narration,
internal thought and dialogue. Do not preserve pervasive stiff
uncontracted phrasing as a character trait unless the Story Bible
clearly establishes that the character is deliberately formal.

Return one chapterEntries item for every supplied chapter, in chapter
number order.

Explicit consensual adult intimacy must be recorded factually and
accurately. Do not censor it, soften it, rewrite it or add moral
commentary.

Do not invent events. Do not write novel prose.
          `.trim(),
        },
        {
          role: "user",
          content: `
STORY BIBLE:

${JSON.stringify(body.storyBible ?? {}, null, 2)}

CURRENT STORY STATE:

${JSON.stringify(stateForAnalysis, null, 2)}

COMPLETED CHAPTERS TO ANALYSE:

${JSON.stringify(chaptersToAnalyse, null, 2)}
          `.trim(),
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "chapter_continuity_ledger",
          strict: true,
          schema: ledgerSchema,
        },
      },
      max_output_tokens: 7000,
    });
    const usage = response.usage;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
    diagnostic = {
      stage: diagnosticStage,
      provider: "openai",
      model: "gpt-5.6-terra",
      status: "succeeded",
      inputTokens,
      outputTokens,
      totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd:
        (uncachedTokens * 1.25 + cachedTokens * 0.125 + outputTokens * 7.5) /
        1_000_000,
      costType: "estimated",
      durationMs: Date.now() - providerCallStartedAt,
      attempt: 1,
    };

    if (response.status === "incomplete") {
      throw new Error(
        `The continuity ledger was incomplete because ${
          response.incomplete_details?.reason ?? "the response was truncated"
        }.`,
      );
    }

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("The continuity model returned no ledger.");
    }

    const output = JSON.parse(outputText) as LedgerModelOutput;
    const analysedEntries = output.chapterEntries.map((entry) => {
      const sourceChapter = chaptersToAnalyse.find(
        (chapter) => chapter.number === entry.chapterNumber,
      );

      if (!sourceChapter) {
        throw new Error(
          `The continuity model returned an unknown Chapter ${entry.chapterNumber}.`,
        );
      }

      return {
        chapterNumber: sourceChapter.number,
        title: sourceChapter.title,
        povCharacter: sourceChapter.povCharacter,
        summary: cleanString(entry.summary),
        openingLocation: cleanString(entry.openingLocation),
        endingLocation: cleanString(entry.endingLocation),
        endingTime: cleanString(entry.endingTime),
        endingExcerpt: getEndingExcerpt(sourceChapter.content),
        relationshipShift: cleanString(entry.relationshipShift),
        intimacyMilestone: cleanString(entry.intimacyMilestone),
        newFacts: entry.newFacts,
        unresolvedThreads: entry.unresolvedThreads,
        repeatedBeats: entry.repeatedBeats,
      };
    });

    const analysedNumbers = new Set(
      analysedEntries.map((entry) => entry.chapterNumber),
    );
    const expectedNumbers = new Set(
      chaptersToAnalyse.map((chapter) => chapter.number),
    );

    if (
      analysedNumbers.size !== expectedNumbers.size ||
      [...expectedNumbers].some((number) => !analysedNumbers.has(number))
    ) {
      throw new Error(
        "The continuity model did not analyse every supplied chapter.",
      );
    }

    const chapterLedger = [
      ...(requiresFullRebuild
        ? []
        : existingLedger.filter(
            (entry) => !analysedNumbers.has(Number(entry.chapterNumber)),
          )),
      ...analysedEntries,
    ].sort((left, right) => {
      const leftNumber =
        typeof left.chapterNumber === "number" ? left.chapterNumber : 0;
      const rightNumber =
        typeof right.chapterNumber === "number" ? right.chapterNumber : 0;

      return leftNumber - rightNumber;
    });
    const latestLedgerEntry = chapterLedger.at(-1);
    return NextResponse.json({
      storyState: {
        importantFacts: output.importantFacts,
        characterStates: output.characterStates,
        relationshipStates: output.relationshipStates,
        unresolvedThreads: output.unresolvedThreads,
        timeline: output.timeline,
        locations: output.locations,
        activePOV:
          typeof latestLedgerEntry?.povCharacter === "string"
            ? latestLedgerEntry.povCharacter
            : povCharacter,
        chapterLedger,
        latestChapterEnding:
          typeof latestLedgerEntry?.endingExcerpt === "string"
            ? latestLedgerEntry.endingExcerpt
            : getEndingExcerpt(chapterContent),
        characterKnowledge: output.characterKnowledge,
        repetitionWarnings: output.repetitionWarnings,
        voiceProfiles: output.voiceProfiles,
      },
      diagnostics: [diagnostic],
    });
  } catch (error) {
    console.error("CONTINUITY LEDGER FAILED:", error);
    const message =
      error instanceof Error
        ? error.message
        : "The continuity ledger could not be created.";

    if (diagnostic) {
      diagnostic = {
        ...diagnostic,
        status: "failed",
        error: message,
      };
    } else if (providerCallStartedAt > 0) {
      diagnostic = {
        stage: diagnosticStage,
        provider: "openai",
        model: "gpt-5.6-terra",
        status: "failed",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: null,
        costType: "unavailable",
        durationMs: Date.now() - providerCallStartedAt,
        attempt: 1,
        error: message,
      };
    }

    return NextResponse.json(
      {
        error: message,
        diagnostics: diagnostic ? [diagnostic] : [],
      },
      { status: 502 },
    );
  }
}
