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
  currentScene: {
    chapterNumber: number;
    storyClock: string;
    location: string;
    presentCharacters: string[];
    physicalPositions: string[];
    activeObjects: string[];
    injuries: string[];
    clothing: string[];
  };
  relationshipProgression: Array<{
    relationship: string;
    currentStage: string;
    characterAwareness: string[];
    currentTension: string;
    lastMeaningfulChange: string;
    lastChangedChapter: number;
    furthestIntimacy: string;
  }>;
  repetitionMemory: {
    completedInternalBeats: string[];
    settingTreatments: string[];
    actionPatterns: string[];
    dialoguePatterns: string[];
    repeatedLanguage: string[];
    sentenceOpeningWarnings: string[];
  };
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
    openingTime: string;
    endingPositions: string[];
    activeObjects: string[];
    characterKnowledgeChanges: string[];
    completedInternalBeats: string[];
    settingTreatments: string[];
    actionPatterns: string[];
    repeatedLanguage: string[];
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
    "currentScene",
    "relationshipProgression",
    "repetitionMemory",
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
    currentScene: {
      type: "object",
      additionalProperties: false,
      required: [
        "chapterNumber",
        "storyClock",
        "location",
        "presentCharacters",
        "physicalPositions",
        "activeObjects",
        "injuries",
        "clothing",
      ],
      properties: {
        chapterNumber: { type: "number" },
        storyClock: { type: "string" },
        location: { type: "string" },
        presentCharacters: {
          type: "array",
          maxItems: 20,
          items: { type: "string" },
        },
        physicalPositions: {
          type: "array",
          maxItems: 30,
          items: { type: "string" },
        },
        activeObjects: {
          type: "array",
          maxItems: 30,
          items: { type: "string" },
        },
        injuries: {
          type: "array",
          maxItems: 20,
          items: { type: "string" },
        },
        clothing: {
          type: "array",
          maxItems: 20,
          items: { type: "string" },
        },
      },
    },
    relationshipProgression: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "relationship",
          "currentStage",
          "characterAwareness",
          "currentTension",
          "lastMeaningfulChange",
          "lastChangedChapter",
          "furthestIntimacy",
        ],
        properties: {
          relationship: { type: "string" },
          currentStage: { type: "string" },
          characterAwareness: {
            type: "array",
            maxItems: 20,
            items: { type: "string" },
          },
          currentTension: { type: "string" },
          lastMeaningfulChange: { type: "string" },
          lastChangedChapter: { type: "number" },
          furthestIntimacy: { type: "string" },
        },
      },
    },
    repetitionMemory: {
      type: "object",
      additionalProperties: false,
      required: [
        "completedInternalBeats",
        "settingTreatments",
        "actionPatterns",
        "dialoguePatterns",
        "repeatedLanguage",
        "sentenceOpeningWarnings",
      ],
      properties: {
        completedInternalBeats: {
          type: "array",
          maxItems: 80,
          items: { type: "string" },
        },
        settingTreatments: {
          type: "array",
          maxItems: 60,
          items: { type: "string" },
        },
        actionPatterns: {
          type: "array",
          maxItems: 60,
          items: { type: "string" },
        },
        dialoguePatterns: {
          type: "array",
          maxItems: 40,
          items: { type: "string" },
        },
        repeatedLanguage: {
          type: "array",
          maxItems: 60,
          items: { type: "string" },
        },
        sentenceOpeningWarnings: {
          type: "array",
          maxItems: 40,
          items: { type: "string" },
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
          "openingTime",
          "endingPositions",
          "activeObjects",
          "characterKnowledgeChanges",
          "completedInternalBeats",
          "settingTreatments",
          "actionPatterns",
          "repeatedLanguage",
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
          openingTime: { type: "string" },
          endingPositions: {
            type: "array",
            maxItems: 30,
            items: { type: "string" },
          },
          activeObjects: {
            type: "array",
            maxItems: 30,
            items: { type: "string" },
          },
          characterKnowledgeChanges: {
            type: "array",
            maxItems: 30,
            items: { type: "string" },
          },
          completedInternalBeats: {
            type: "array",
            maxItems: 30,
            items: { type: "string" },
          },
          settingTreatments: {
            type: "array",
            maxItems: 20,
            items: { type: "string" },
          },
          actionPatterns: {
            type: "array",
            maxItems: 20,
            items: { type: "string" },
          },
          repeatedLanguage: {
            type: "array",
            maxItems: 20,
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

function hasStrictClockMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const timeline = (value as Record<string, unknown>).timeline;

  return (
    Array.isArray(timeline) &&
    timeline.some(
      (entry) =>
        typeof entry === "string" && entry.trim().startsWith("CURRENT CLOCK:"),
    )
  );
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
      (existingLedger.length === 0 ||
        chapterNumber < latestChapterNumber ||
        !hasStrictClockMarker(body.storyState));
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
You maintain the factual continuity ledger for a commercial romance novel.

Read the supplied completed prose. Record only events and changes the prose
actually establishes. A plan, implication, fantasy, fear or likely future event
is not a completed fact.

Return the complete current state required by the schema. Preserve existing
facts, knowledge, threads and voice guidance unless the supplied prose changes
them. Keep entries concise, specific and useful to the next chapter writer.

Track:

- permanent facts and chronological events;
- each important character's current physical, emotional and situational state;
- the final location of every present named character and any important object,
  possession, injury, clothing, vehicle, room or evidence whose state changed;
- the current state of important relationships;
- what named characters know, suspect, misunderstand or conceal;
- active unresolved threads and established locations;
- the exact relationship shift and furthest intimacy milestone reached;
- repeated scene constructions, jokes, gestures, attraction observations,
  internal conclusions or phrases future chapters must avoid.

STRICT STORY CLOCK

Reconstruct one chronological clock from the supplied chapters. Treat explicit
weekday names, dates, displayed clock times, established schedules and precise
elapsed intervals as stronger evidence than vague words such as later, morning
or afternoon. Never silently repair accepted prose by inventing an event.

The final timeline item must use exactly this prefix:

CURRENT CLOCK: [weekday or story day], [exact time or narrowest supported time
range], immediately after [the final on-page event].

If prose contains incompatible time claims, add a concise timeline item using
the prefix TIME CONFLICT:. State both claims and identify which concrete clock
or schedule fact future planning must follow. Do not perform faulty clock
arithmetic. Do not call late morning afternoon, treat a reached deadline as
future, or confuse hours until tonight with hours until tomorrow.

Every chapter entry endingTime must include the weekday or story day plus the
exact time, narrowest supported range, or an explicit statement that the prose
does not establish it. Never return only words such as later, evening or after
practice when stronger evidence is available. Opening and ending chronology
must agree with the previous chapter unless the prose makes a forward jump.

REPETITION CONTROL

Track semantic cycles, not merely matching phrases. A repeated internal beat
includes noticing the same person or object, trying to categorise the reaction,
recalling the same evidence and reaching the same conclusion again, even when
the wording and location change. Record the conclusion already completed and
the new evidence required before it may return.

Track repeated setting introductions and routine choreography, including the
same corridor, lighting, smell, silence, phone, notebook, shower, drive, meal or
room inventory when it does not change the situation. Track list-like action
reporting and repeated sentence openings such as successive sentences beginning
with I. Do not flag a necessary recurring location or object by itself. Flag the
reused descriptive treatment or narrative function.

repetitionWarnings must be cumulative, concise instructions for future prose.
Retain still-relevant existing warnings, merge duplicates and remove a warning
only when it is no longer useful. repeatedBeats in each chapter entry must name
that chapter's completed conclusions, exchanges, sensory introductions and
action patterns that must not be replayed.

STRUCTURED HANDOFF

currentScene is the exact handoff for the next writer. Record the final story
clock, location, characters still physically present, their positions, active
objects, injuries and clothing only when established and still relevant. Do
not carry a character or object into the scene after they leave.

relationshipProgression records the current stage of each central romantic
relationship without averaging the two viewpoints together. characterAwareness
must name each character separately and distinguish what they consciously know
from what the reader can infer. lastMeaningfulChange is the newest earned
change, not the relationship premise repeated again.

repetitionMemory is cumulative but selective. Separate completed internal
conclusions, reused setting treatments, repeated action choreography, recurring
dialogue exchanges, conspicuous repeated wording and overused sentence
openings. Store specific warnings future prose can act on. Do not fill these
lists with ordinary necessary words, locations or actions that have not become
noticeably repetitive.

CONTINUITY PRECISION

Record concrete before-and-after changes, not broad mood summaries. If a
character arrives, leaves, moves rooms, loses or recovers an object, changes
clothes, drinks, eats, sleeps, becomes injured or learns information, preserve
the final state needed by the next chapter.

Character knowledge is individual. State who knows each fact and how they
learned it. Never allow one character's narration, private thought or secret to
become another character's knowledge without an on-page disclosure.

Romantic knowledge is also individual. Distinguish physical awareness,
fixation, jealousy, denial, suspicion, conscious attraction, acknowledged
desire, intimacy and declared feelings. For an awakening arc, never upgrade an
unlabelled reaction into recognised attraction merely because the reader can
understand it.

Do not convert friendship, rivalry, family history, former closeness or
unresolved conflict into prior romance or sex unless the prose explicitly
establishes that history. Do not infer off-page housing, money, transport,
employment, evidence or another solution that removes an active premise
pressure.

Return one chapterEntries item for every supplied chapter in chapter-number
order. Each entry must describe that chapter only.

Maintain one operational voice profile for every established main POV
character. Preserve an existing profile unless the Story Bible or completed
prose establishes a genuine stable change. Never copy generic weaknesses from a
generated chapter into the intended voice.

Each voice profile must state concrete, character-specific guidance for narrative
rhythm, vocabulary, humour, emotional deflection, sensory focus, dialogue and
internal thought. forbiddenHabits must identify phrases, reactions, jokes and
sentence habits that would make the voice generic or too similar to another
POV. Contrast the main POV voices through specific observable differences, not
empty labels such as witty, guarded, dry or confident.

Natural contractions are standard in contemporary narration, thought and
dialogue unless the Story Bible deliberately establishes formal speech.

Record explicit consensual adult intimacy factually and accurately. Do not
censor, soften, embellish or moralise. All romantic and sexual characters are
consenting adults aged eighteen or older.

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
      max_output_tokens: 8000,
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
          openingTime: cleanString(entry.openingTime),
          endingPositions: entry.endingPositions,
          activeObjects: entry.activeObjects,
          characterKnowledgeChanges: entry.characterKnowledgeChanges,
          completedInternalBeats: entry.completedInternalBeats,
          settingTreatments: entry.settingTreatments,
          actionPatterns: entry.actionPatterns,
          repeatedLanguage: entry.repeatedLanguage,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
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
        currentScene: {
          ...output.currentScene,
          chapterNumber:
            typeof latestLedgerEntry?.chapterNumber === "number"
              ? latestLedgerEntry.chapterNumber
              : chapterNumber,
          storyClock: currentClock,
        },
        relationshipProgression: output.relationshipProgression,
        repetitionMemory: output.repetitionMemory,
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
