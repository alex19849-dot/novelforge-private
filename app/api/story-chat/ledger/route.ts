import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

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
      maxItems: 120,
      items: { type: "string" },
    },
    characterStates: {
      type: "array",
      maxItems: 40,
      items: { type: "string" },
    },
    relationshipStates: {
      type: "array",
      maxItems: 30,
      items: { type: "string" },
    },
    unresolvedThreads: {
      type: "array",
      maxItems: 60,
      items: { type: "string" },
    },
    timeline: {
      type: "array",
      maxItems: 120,
      items: { type: "string" },
    },
    locations: {
      type: "array",
      maxItems: 60,
      items: { type: "string" },
    },
    activePOV: {
      type: "string",
    },
    characterKnowledge: {
      type: "array",
      maxItems: 120,
      items: { type: "string" },
    },
    repetitionWarnings: {
      type: "array",
      maxItems: 60,
      items: { type: "string" },
    },
    voiceProfiles: {
      type: "array",
      maxItems: 12,
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
            maxItems: 20,
            items: { type: "string" },
          },
        },
      },
    },
    chapterEntries: {
      type: "array",
      maxItems: 100,
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
            maxItems: 30,
            items: { type: "string" },
          },
          unresolvedThreads: {
            type: "array",
            maxItems: 30,
            items: { type: "string" },
          },
          repeatedBeats: {
            type: "array",
            maxItems: 30,
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

function cleanStateForAnalysis(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const state = {
    ...(value as Record<string, unknown>),
  };

  delete state.lastGenerationDiagnostics;
  delete state.diagnostics;
  delete state.generationDiagnostics;
  delete state.chapterPlans;
  delete state.latestChapterEnding;

  if (Array.isArray(state.chapterLedger)) {
    state.chapterLedger = state.chapterLedger
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
      .map((entry) => {
        const compactEntry = {
          ...entry,
        };

        delete compactEntry.endingExcerpt;

        return compactEntry;
      });
  }

  return state;
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
      requiresFullRebuild && !isBatchRebuild
        ? {}
        : cleanStateForAnalysis(body.storyState);

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
You maintain NovelForge's factual continuity ledger for a commercial romance.

Read the supplied completed prose and return the complete current state required
by the schema. Record only what the prose establishes. Plans, implications,
fantasies, fears and likely future events are not completed facts. Preserve
still-current facts and guidance, merge duplicates and retire stale transient
entries when the completed prose establishes that they no longer affect the
present.

CONTINUITY VERSUS SALIENCE

The ledger is a fact register, not a list of details the next writer must
foreground. Keep permanent facts, chronology, individual knowledge, current
locations, meaningful physical or situational constraints, relationship state,
the furthest intimacy milestone and genuinely unresolved threads.

Do not promote a stable minor injury, bandage, changed clothing, finished meal,
routine object or ordinary tiredness into importantFacts or unresolvedThreads.
If a transient detail still matters factually, record it once in the narrowest
appropriate state and add "continuity only; do not foreground". Retire it when
later prose establishes that it is resolved. Never infer that a serious injury
has healed.

Record concrete before-and-after changes. Preserve final physical positions only
when they constrain the next immediate action. Character knowledge is
individual: state who knows, suspects, misunderstands or conceals each relevant
fact and how they learned it. Never transfer private narration or a secret to
another character without an on-page disclosure.

STORY CLOCK

Reconstruct one chronological clock from the supplied chapters. Explicit
weekday names, dates, displayed times, schedules and precise elapsed intervals
outweigh vague labels. Never repair a contradiction by inventing an event.

The final timeline item must use exactly:
CURRENT CLOCK: [weekday or story day], [exact time or narrowest supported time
range], immediately after [the final on-page event].

If claims conflict, add TIME CONFLICT: with both claims and name the concrete
clock or schedule fact future planning must follow. Each chapter entry
endingTime must include the weekday or story day and the exact time, narrowest
supported range, or a statement that the prose does not establish it.

REPETITION CONTROL

Track semantic cycles, not only matching wording. This includes noticing the
same person or object, categorising the reaction, recalling the same evidence
and reaching the same conclusion again. Record the conclusion already completed
and what genuinely new evidence would be required before it can return.

Also track repeated setting inventories, routine choreography, list-like action
reporting, successive identical sentence openings, recycled jokes, gestures,
attraction observations, reassurance loops, injury monitoring and protective
caretaking that occurs without a change in physical state. Flag the reused
narrative function, not a necessary location or object by itself.

repetitionWarnings must be concise cumulative instructions. Retain useful
warnings, merge duplicates and remove ones that no longer apply. repeatedBeats
must name each chapter's completed conclusions, exchanges, sensory
introductions and action patterns that must not be replayed.

CHARACTER VOICE

Maintain one operational voice profile for every established main POV
character. Preserve a profile unless the Story Bible or completed prose shows a
genuine stable change. Never canonise a weak generated tic as the intended
voice.

Make the profiles observably different. Use narrativeRhythm for syntax, line
length and decision speed; vocabulary for register, domain language and
swearing; humourStyle for the kind, target and frequency of humour;
emotionalDeflection for disclosure under pressure, topic avoidance and conflict
strategy; sensoryFocus for the character's attention filter; dialoguePattern
for turn-taking, directness, interruption and evasion; internalThoughtPattern
for how conclusions form. forbiddenHabits must block generic reactions,
borrowed traits and habits that would make two POVs swappable. Do not rely on
empty labels such as witty, guarded, dry, dominant or confident.

CHAPTER ENTRIES

Return one chapterEntries item for every supplied chapter, in chapter-number
order, describing that chapter only. Keep summaries concise and factual. Record
explicit adult intimacy accurately when it changes character, relationship,
knowledge or plot. Every romantic or sexual character is an adult aged eighteen
or older.

Do not invent events, rewrite prose, include plans or discuss your reasoning.
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
      max_output_tokens: 32000,
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
      const reasoningTokens =
        usage?.output_tokens_details?.reasoning_tokens ?? 0;
      const visibleOutputTokens = Math.max(
        0,
        outputTokens - reasoningTokens,
      );

      throw new Error(
        `The continuity ledger was incomplete because ${
          response.incomplete_details?.reason ?? "the response was truncated"
        }. It used ${reasoningTokens.toLocaleString()} hidden reasoning tokens and approximately ${visibleOutputTokens.toLocaleString()} visible output tokens.`,
      );
    }

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("The continuity model returned no ledger.");
    }

    const output = JSON.parse(outputText) as LedgerModelOutput;
   const analysedEntries = output.chapterEntries
  .map((entry, index) => {
    const sourceChapter =
      chaptersToAnalyse.find(
        (chapter) => chapter.number === entry.chapterNumber,
      ) ?? chaptersToAnalyse[index];

    if (!sourceChapter) {
      console.warn(
        `Skipping invalid continuity entry for chapter ${entry.chapterNumber}.`,
      );
      return null;
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
  })
  .filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
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
    const currentClock =
      typeof latestLedgerEntry?.endingTime === "string" &&
      latestLedgerEntry.endingTime.trim()
        ? latestLedgerEntry.endingTime.trim()
        : "time not established by the accepted prose";
    const timeline = [
      ...output.timeline.filter(
        (entry) =>
          typeof entry === "string" &&
          !entry.trim().startsWith("CURRENT CLOCK:"),
      ),
      `CURRENT CLOCK: ${currentClock}, immediately after the final on-page event of Chapter ${
        typeof latestLedgerEntry?.chapterNumber === "number"
          ? latestLedgerEntry.chapterNumber
          : chapterNumber
      }.`,
    ];
    return NextResponse.json({
      storyState: {
        importantFacts: output.importantFacts,
        characterStates: output.characterStates,
        relationshipStates: output.relationshipStates,
        unresolvedThreads: output.unresolvedThreads,
        timeline,
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

