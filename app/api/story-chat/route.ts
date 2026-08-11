import OpenAI from "openai";

import { NextResponse } from "next/server";

import { detectStoryIntent } from "../../../src/lib/detect-story-intent";

import type {
  ChapterPlan,
  GenerationDiagnostic,
  StoryBible,
  StoryBiblePatch,
  StoryWorkspace,
  StoryChatResponse,
} from "../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getRequestedChapterNumber(message: string): number | null {
  const numberedMatch = message.match(/\bchapter\s+(\d+)\b/i);

  if (numberedMatch) {
    const chapterNumber = Number(numberedMatch[1] ?? "");

    return Number.isInteger(chapterNumber) && chapterNumber > 0
      ? chapterNumber
      : null;
  }

  const numberWords = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ];
  const wordedMatch = message.match(
    new RegExp(`\\bchapter\\s+(${numberWords.join("|")})\\b`, "i"),
  );

  if (!wordedMatch) {
    return null;
  }

  const wordIndex = numberWords.indexOf(wordedMatch[1]?.toLowerCase() ?? "");

  return wordIndex >= 0 ? wordIndex + 1 : null;
}

function getEndingExcerpt(text: string, maximumWords = 900): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return words.slice(-maximumWords).join(" ");
}

function getOpeningExcerpt(text: string, maximumWords = 500): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return words.slice(0, maximumWords).join(" ");
}

const EMPTY_STORY_BIBLE: StoryBible = {
  premise: "",

  relationship: "",

  subgenre: "",

  setting: "",

  pov: "",

  heatLevel: "",

  burnPacing: "",

  tropes: [],

  characters: [],

  notes: [],
};

const EMPTY_STORY_STATE = {
  importantFacts: [],

  characterStates: [],

  relationshipStates: [],

  unresolvedThreads: [],

  timeline: [],

  locations: [],

  activePOV: "",
};

function getStoryStateBeforeChapter(
  state: StoryWorkspace["storyState"],
  chapterNumber: number,
): StoryWorkspace["storyState"] {
  const earlierLedger = (state.chapterLedger ?? []).filter(
    (entry) => entry.chapterNumber < chapterNumber,
  );
  const previousEntry = earlierLedger.at(-1);
  const unique = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean)));

  return {
    ...EMPTY_STORY_STATE,
    importantFacts: unique(
      earlierLedger.flatMap((entry) => entry.newFacts ?? []),
    ),
    relationshipStates: previousEntry?.relationshipShift
      ? [previousEntry.relationshipShift]
      : [],
    unresolvedThreads: previousEntry?.unresolvedThreads ?? [],
    timeline: earlierLedger.map(
      (entry) => `Chapter ${entry.chapterNumber}: ${entry.summary}`,
    ),
    locations: unique(
      earlierLedger.flatMap((entry) => [
        entry.openingLocation,
        entry.endingLocation,
      ]),
    ),
    activePOV: previousEntry?.povCharacter ?? "",
    chapterLedger: earlierLedger,
    latestChapterEnding: previousEntry?.endingExcerpt ?? "",
    characterKnowledge: [],
    repetitionWarnings: unique(
      earlierLedger.flatMap((entry) => entry.repeatedBeats ?? []),
    ).slice(-30),
    voiceProfiles: state.voiceProfiles ?? [],
    lastGenerationDiagnostics: [],
  };
}

function getCompactPlanningStoryState(
  state: StoryWorkspace["storyState"],
): StoryWorkspace["storyState"] {
  const compactLedger = (state.chapterLedger ?? []).map((entry) => ({
    ...entry,
    endingExcerpt: "",
  }));

  return {
    ...state,
    chapterLedger: compactLedger,
    latestChapterEnding: "",
    chapterPlans: [],
    lastGenerationDiagnostics: [],
  };
}

const storyChatSchema = {
  type: "object",

  additionalProperties: false,

  required: [
    "reply",

    "storyTitle",

    "storyBible",

    "storyState",

    "generatedChapter",

    "chapterBrief",
  ],

  properties: {
    reply: {
      type: "string",
    },

    storyTitle: {
      type: "string",
    },

    chapterBrief: {
      type: "string",
    },

    storyBible: {
      type: "object",

      additionalProperties: false,

      required: [
        "premise",

        "relationship",

        "subgenre",

        "setting",

        "pov",

        "heatLevel",

        "burnPacing",

        "tropes",

        "characters",

        "notes",
      ],

      properties: {
        premise: {
          type: "string",
        },

        relationship: {
          type: "string",
        },

        subgenre: {
          type: "string",
        },

        setting: {
          type: "string",
        },

        pov: {
          type: "string",
        },

        heatLevel: {
          type: "string",
        },

        burnPacing: {
          type: "string",
        },

        tropes: {
          type: "array",

          items: {
            type: "string",
          },
        },

        characters: {
          type: "array",

          items: {
            type: "string",
          },
        },

        notes: {
          type: "array",

          items: {
            type: "string",
          },
        },
      },
    },

    storyState: {
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
      ],

      properties: {
        importantFacts: {
          type: "array",

          items: {
            type: "string",
          },
        },

        characterStates: {
          type: "array",

          items: {
            type: "string",
          },
        },

        relationshipStates: {
          type: "array",

          items: {
            type: "string",
          },
        },

        unresolvedThreads: {
          type: "array",

          items: {
            type: "string",
          },
        },

        timeline: {
          type: "array",

          items: {
            type: "string",
          },
        },

        locations: {
          type: "array",

          items: {
            type: "string",
          },
        },

        activePOV: {
          type: "string",
        },
      },
    },

    generatedChapter: {
      anyOf: [
        {
          type: "object",

          additionalProperties: false,

          required: [
            "title",

            "povCharacter",

            "content",

            "replaceChapterNumber",
          ],

          properties: {
            title: {
              type: "string",
            },

            povCharacter: {
              type: "string",
            },

            content: {
              type: "string",
            },

            replaceChapterNumber: {
              anyOf: [
                {
                  type: "integer",
                },

                {
                  type: "null",
                },
              ],
            },
          },
        },

        {
          type: "null",
        },
      ],
    },
  },
} as const;

const storyBibleEditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyTitle", "patch"],
  properties: {
    reply: { type: "string" },
    storyTitle: { type: "string" },
    patch: {
      type: "object",
      additionalProperties: false,
      required: [
        "scalarChanges",
        "addTropes",
        "removeTropes",
        "upsertCharacters",
        "removeCharacterNames",
        "addNotes",
        "removeNotes",
      ],
      properties: {
        scalarChanges: {
          type: "object",
          additionalProperties: false,
          required: [
            "premise",
            "relationship",
            "subgenre",
            "setting",
            "pov",
            "heatLevel",
            "burnPacing",
          ],
          properties: {
            premise: { anyOf: [{ type: "string" }, { type: "null" }] },
            relationship: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            subgenre: { anyOf: [{ type: "string" }, { type: "null" }] },
            setting: { anyOf: [{ type: "string" }, { type: "null" }] },
            pov: { anyOf: [{ type: "string" }, { type: "null" }] },
            heatLevel: { anyOf: [{ type: "string" }, { type: "null" }] },
            burnPacing: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
        },
        addTropes: { type: "array", items: { type: "string" } },
        removeTropes: { type: "array", items: { type: "string" } },
        upsertCharacters: { type: "array", items: { type: "string" } },
        removeCharacterNames: {
          type: "array",
          items: { type: "string" },
        },
        addNotes: { type: "array", items: { type: "string" } },
        removeNotes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const canonicalPlanProperties = {
  chapterNumber: { type: "integer" },
  title: { type: "string" },
  povCharacter: { type: "string" },
  chapterGoal: { type: "string" },
  relationshipChange: { type: "string" },
  startingState: { type: "string" },
  endingState: { type: "string" },
  knowledgeLimits: {
    type: "array",
    minItems: 1,
    items: { type: "string" },
  },
  premiseLocks: {
    type: "array",
    minItems: 1,
    items: { type: "string" },
  },
  mustNotHappen: {
    type: "array",
    minItems: 1,
    items: { type: "string" },
  },
  plannedEvents: {
    type: "array",
    minItems: 4,
    maxItems: 8,
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "order",
        "event",
        "location",
        "staging",
        "continuityChange",
        "relationshipChange",
      ],
      properties: {
        order: { type: "integer" },
        event: { type: "string" },
        location: { type: "string" },
        staging: { type: "string" },
        continuityChange: { type: "string" },
        relationshipChange: { type: "string" },
      },
    },
  },
  completedBeatsToAvoid: {
    type: "array",
    items: { type: "string" },
  },
} as const;

const canonicalPlanRequired = [
  "chapterNumber",
  "title",
  "povCharacter",
  "chapterGoal",
  "relationshipChange",
  "startingState",
  "endingState",
  "knowledgeLimits",
  "premiseLocks",
  "mustNotHappen",
  "plannedEvents",
  "completedBeatsToAvoid",
] as const;

const editableChapterPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyTitle", "chapterPlan"],
  properties: {
    reply: { type: "string" },
    storyTitle: { type: "string" },
    chapterPlan: {
      type: "object",
      additionalProperties: false,
      required: canonicalPlanRequired,
      properties: canonicalPlanProperties,
    },
  },
} as const;

const directChapterPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyTitle", "generatedChapter", "chapterPlan"],
  properties: {
    reply: { type: "string" },
    storyTitle: { type: "string" },
    generatedChapter: {
      type: "object",
      additionalProperties: false,
      required: ["title", "povCharacter", "content", "replaceChapterNumber"],
      properties: {
        title: { type: "string" },
        povCharacter: { type: "string" },
        content: { type: "string" },
        replaceChapterNumber: {
          anyOf: [{ type: "integer" }, { type: "null" }],
        },
      },
    },
    chapterPlan: {
      type: "object",
      additionalProperties: false,
      required: canonicalPlanRequired,
      properties: canonicalPlanProperties,
    },
  },
} as const;

type EditableChapterPlanOutput = {
  reply: string;
  storyTitle: string;
  chapterPlan: Omit<ChapterPlan, "status" | "updatedAt">;
};

type DirectChapterPlanOutput = {
  reply: string;
  storyTitle: string;
  generatedChapter: NonNullable<StoryChatResponse["generatedChapter"]>;
  chapterPlan: Omit<ChapterPlan, "status" | "updatedAt">;
};

type StoryModelOutput = {
  reply: string;

  storyTitle: string;

  storyBible: StoryBible;

  storyState: StoryWorkspace["storyState"];

  generatedChapter: StoryChatResponse["generatedChapter"];

  chapterBrief: string;
};

type StoryBibleEditOutput = {
  reply: string;
  storyTitle: string;
  patch: {
    scalarChanges: Record<
      | "premise"
      | "relationship"
      | "subgenre"
      | "setting"
      | "pov"
      | "heatLevel"
      | "burnPacing",
      string | null
    >;
    addTropes: string[];
    removeTropes: string[];
    upsertCharacters: string[];
    removeCharacterNames: string[];
    addNotes: string[];
    removeNotes: string[];
  };
};

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value

    .replace(/[—–]/g, ",")

    .trim();
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  const cleaned: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();

    if (!trimmed) {
      continue;
    }

    const normalised = trimmed.toLowerCase();

    if (seen.has(normalised)) {
      continue;
    }

    seen.add(normalised);

    cleaned.push(trimmed);
  }

  return cleaned;
}

function sanitiseEditableChapterPlan(
  value: unknown,
  fallbackChapterNumber: number,
): ChapterPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The planning model returned an invalid chapter plan.");
  }

  const raw = value as Record<string, unknown>;
  const rawEvents = Array.isArray(raw.plannedEvents) ? raw.plannedEvents : [];
  const plannedEvents = rawEvents
    .filter(
      (event): event is Record<string, unknown> =>
        Boolean(event) && typeof event === "object" && !Array.isArray(event),
    )
    .slice(0, 8)
    .map((event, index) => ({
      order: index + 1,
      event: cleanString(event.event),
      location: cleanString(event.location),
      staging: cleanString(event.staging),
      continuityChange: cleanString(event.continuityChange),
      relationshipChange: cleanString(event.relationshipChange),
    }));

  if (
    plannedEvents.length < 4 ||
    plannedEvents.some(
      (event) =>
        !event.event ||
        !event.location ||
        !event.staging ||
        !event.continuityChange ||
        !event.relationshipChange,
    )
  ) {
    throw new Error(
      "The canonical chapter plan must contain four to eight complete events.",
    );
  }

  const chapterNumber =
    typeof raw.chapterNumber === "number" &&
    Number.isInteger(raw.chapterNumber) &&
    raw.chapterNumber > 0
      ? raw.chapterNumber
      : fallbackChapterNumber;
  const title = cleanString(raw.title);
  const povCharacter = cleanString(raw.povCharacter);
  const chapterGoal = cleanString(raw.chapterGoal);
  const relationshipChange = cleanString(raw.relationshipChange);
  const startingState = cleanString(raw.startingState);
  const endingState = cleanString(raw.endingState);
  const knowledgeLimits = cleanStringArray(raw.knowledgeLimits);
  const premiseLocks = cleanStringArray(raw.premiseLocks);
  const mustNotHappen = cleanStringArray(raw.mustNotHappen);

  if (
    !title ||
    !povCharacter ||
    !chapterGoal ||
    !relationshipChange ||
    !startingState ||
    !endingState ||
    knowledgeLimits.length === 0 ||
    premiseLocks.length === 0 ||
    mustNotHappen.length === 0
  ) {
    throw new Error("The canonical chapter plan is missing required metadata.");
  }

  // Saved-plan compatibility only. The writer never loops over these cards.
  const compatibilityScenes = plannedEvents.slice(0, 5).map((event, index) => ({
    order: index + 1,
    location: event.location,
    objective: event.event,
    conflict: event.relationshipChange,
    newInformation: event.continuityChange,
    exitBeat:
      plannedEvents[index + 1]?.event ??
      "Reach the planned chapter ending and final hook.",
    entryState: event.staging,
    endingState: plannedEvents[index + 1]?.staging ?? endingState,
    wordTarget: 650,
    mustNotHappen,
  }));

  return {
    chapterNumber,
    title,
    povCharacter,
    chapterGoal,
    relationshipChange,
    startingState,
    endingState,
    knowledgeLimits,
    premiseLocks,
    mustNotHappen,
    plannedEvents,
    scenes: compatibilityScenes,
    completedBeatsToAvoid: cleanStringArray(raw.completedBeatsToAvoid),
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}

function formatChapterPlan(plan: ChapterPlan): string {
  const progression = (plan.plannedEvents ?? [])
    .map(
      (event) =>
        String(event.order) +
        ". " +
        event.event +
        "\n   Location: " +
        event.location +
        "\n   Staging: " +
        event.staging +
        "\n   Continuity change: " +
        event.continuityChange +
        "\n   Relationship change: " +
        event.relationshipChange,
    )
    .join("\n\n");

  return (
    "Chapter " +
    plan.chapterNumber +
    ": " +
    plan.title +
    "\nPOV: " +
    plan.povCharacter +
    "\nChapter goal: " +
    plan.chapterGoal +
    "\nRelationship change: " +
    plan.relationshipChange +
    "\n\nStarts: " +
    plan.startingState +
    "\nEnds: " +
    plan.endingState +
    "\n\nCanonical progression\n\n" +
    progression +
    "\n\nTell me what you want changed, or say approve this plan."
  );
}

function validateCanonicalChapterPlan(
  value: string,
  expected?: {
    chapterNumber: number;
    title: string;
    povCharacter: string;
  },
): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The model did not return a valid canonical chapter plan.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model returned an invalid canonical chapter plan.");
  }

  const plan = parsed as Record<string, unknown>;
  const requiredStrings = [
    "title",
    "povCharacter",
    "chapterGoal",
    "relationshipChange",
    "startingState",
    "endingState",
  ];

  if (
    requiredStrings.some(
      (key) => typeof plan[key] !== "string" || !plan[key].trim(),
    ) ||
    typeof plan.chapterNumber !== "number" ||
    !Number.isInteger(plan.chapterNumber) ||
    plan.chapterNumber < 1
  ) {
    throw new Error("The canonical chapter plan is missing required metadata.");
  }

  const events = plan.plannedEvents;

  if (!Array.isArray(events) || events.length < 4 || events.length > 8) {
    throw new Error(
      "The canonical chapter plan must contain four to eight events.",
    );
  }

  const eventStrings = [
    "event",
    "location",
    "staging",
    "continuityChange",
    "relationshipChange",
  ];

  for (const [index, event] of events.entries()) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("The canonical progression contains an invalid event.");
    }

    const item = event as Record<string, unknown>;

    if (
      item.order !== index + 1 ||
      eventStrings.some(
        (key) => typeof item[key] !== "string" || !item[key].trim(),
      )
    ) {
      throw new Error(
        "Canonical event " + (index + 1) + " is incomplete or out of order.",
      );
    }
  }

  for (const guardrail of [
    "knowledgeLimits",
    "premiseLocks",
    "mustNotHappen",
  ]) {
    const values = plan[guardrail];

    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((item) => typeof item !== "string" || !item.trim())
    ) {
      throw new Error(
        "The canonical chapter plan is missing its " +
          guardrail +
          " guardrail.",
      );
    }
  }

  if (
    !Array.isArray(plan.completedBeatsToAvoid) ||
    plan.completedBeatsToAvoid.some(
      (beat) => typeof beat !== "string" || !beat.trim(),
    )
  ) {
    throw new Error(
      "The canonical chapter plan is missing completed-beat safeguards.",
    );
  }

  if (
    expected &&
    (plan.chapterNumber !== expected.chapterNumber ||
      cleanString(plan.title).toLowerCase() !==
        cleanString(expected.title).toLowerCase() ||
      cleanString(plan.povCharacter).toLowerCase() !==
        cleanString(expected.povCharacter).toLowerCase())
  ) {
    throw new Error(
      "The canonical plan metadata does not match the chapter metadata.",
    );
  }
}

function sanitiseStoryBible(value: unknown): StoryBible {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_STORY_BIBLE };
  }

  const bible = value as Partial<StoryBible>;

  return {
    premise: cleanString(bible.premise),

    relationship: cleanString(bible.relationship),

    subgenre: cleanString(bible.subgenre),

    setting: cleanString(bible.setting),

    pov: cleanString(bible.pov),

    heatLevel: cleanString(bible.heatLevel),

    burnPacing: cleanString(bible.burnPacing),

    tropes: cleanStringArray(bible.tropes),

    characters: cleanStringArray(bible.characters),

    notes: cleanStringArray(bible.notes),
  };
}

function hasCompleteStoryBible(storyBible: StoryBible): boolean {
  return Boolean(
    storyBible.premise &&
      storyBible.relationship &&
      storyBible.subgenre &&
      storyBible.setting &&
      storyBible.pov &&
      storyBible.heatLevel &&
      storyBible.burnPacing &&
      storyBible.tropes.length > 0 &&
      storyBible.characters.length > 0,
  );
}

function mergeUniqueStrings(
  existingValues: string[],

  returnedValues: string[],
): string[] {
  const merged: string[] = [];

  const seen = new Set<string>();

  for (const value of [...existingValues, ...returnedValues]) {
    const trimmed = value.trim();

    if (!trimmed) {
      continue;
    }

    const normalised = trimmed.toLowerCase();

    if (seen.has(normalised)) {
      continue;
    }

    seen.add(normalised);

    merged.push(trimmed);
  }

  return merged;
}

function getCharacterName(character: string): string {
  return character.split(",")[0]?.trim().toLowerCase() ?? "";
}

function mergeCharacters(
  existingCharacters: string[],

  returnedCharacters: string[],
): string[] {
  const returnedNamedCharacters = returnedCharacters.filter(
    (character) => !getCharacterName(character).startsWith("unnamed"),
  );

  const hasNamedCharacters = returnedNamedCharacters.length > 0;

  const merged = new Map<string, string>();

  for (const character of existingCharacters) {
    const name = getCharacterName(character);

    if (!name || (hasNamedCharacters && name.startsWith("unnamed"))) {
      continue;
    }

    merged.set(name, character.trim());
  }

  for (const character of returnedCharacters) {
    const name = getCharacterName(character);

    if (!name) {
      continue;
    }

    if (hasNamedCharacters && name.startsWith("unnamed")) {
      continue;
    }

    merged.set(name, character.trim());
  }

  return Array.from(merged.values());
}

function mergeStoryBible(
  existingBible: StoryBible,

  returnedBible: StoryBible,
): StoryBible {
  return {
    premise: returnedBible.premise || existingBible.premise,

    relationship: returnedBible.relationship || existingBible.relationship,

    subgenre: returnedBible.subgenre || existingBible.subgenre,

    setting: returnedBible.setting || existingBible.setting,

    pov: returnedBible.pov || existingBible.pov,

    heatLevel: returnedBible.heatLevel || existingBible.heatLevel,

    burnPacing: returnedBible.burnPacing || existingBible.burnPacing,

    tropes: mergeUniqueStrings(
      existingBible.tropes,

      returnedBible.tropes,
    ),

    characters: mergeCharacters(
      existingBible.characters,

      returnedBible.characters,
    ),

    notes: mergeUniqueStrings(
      existingBible.notes,

      returnedBible.notes,
    ),
  };
}

function removeMatching(values: string[], removals: string[]): string[] {
  const normalisedRemovals = removals
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.filter((value) => {
    const normalised = value.trim().toLowerCase();
    return !normalisedRemovals.some(
      (removal) =>
        normalised === removal ||
        normalised.includes(removal) ||
        removal.includes(normalised),
    );
  });
}

function applyStoryBiblePatch(
  existingBible: StoryBible,
  rawPatch: StoryBibleEditOutput["patch"],
): { storyBible: StoryBible; patch: StoryBiblePatch } {
  const scalarChanges = Object.fromEntries(
    Object.entries(rawPatch.scalarChanges)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([key, value]) => [key, cleanString(value)]),
  ) as StoryBiblePatch["scalarChanges"];
  const addTropes = cleanStringArray(rawPatch.addTropes);
  const removeTropes = cleanStringArray(rawPatch.removeTropes);
  const upsertCharacters = cleanStringArray(rawPatch.upsertCharacters);
  const removeCharacterNames = cleanStringArray(rawPatch.removeCharacterNames);
  const addNotes = cleanStringArray(rawPatch.addNotes);
  const removeNotes = cleanStringArray(rawPatch.removeNotes);
  const retainedCharacters = existingBible.characters.filter((character) => {
    const existingName = getCharacterName(character);
    return !removeCharacterNames.some((name) => {
      const requestedName = name.trim().toLowerCase();
      return (
        existingName === requestedName || existingName.includes(requestedName)
      );
    });
  });

  return {
    storyBible: {
      premise:
        scalarChanges.premise !== undefined
          ? scalarChanges.premise
          : existingBible.premise,
      relationship:
        scalarChanges.relationship !== undefined
          ? scalarChanges.relationship
          : existingBible.relationship,
      subgenre:
        scalarChanges.subgenre !== undefined
          ? scalarChanges.subgenre
          : existingBible.subgenre,
      setting:
        scalarChanges.setting !== undefined
          ? scalarChanges.setting
          : existingBible.setting,
      pov:
        scalarChanges.pov !== undefined ? scalarChanges.pov : existingBible.pov,
      heatLevel:
        scalarChanges.heatLevel !== undefined
          ? scalarChanges.heatLevel
          : existingBible.heatLevel,
      burnPacing:
        scalarChanges.burnPacing !== undefined
          ? scalarChanges.burnPacing
          : existingBible.burnPacing,
      tropes: mergeUniqueStrings(
        removeMatching(existingBible.tropes, removeTropes),
        addTropes,
      ),
      characters: mergeCharacters(retainedCharacters, upsertCharacters),
      notes: mergeUniqueStrings(
        removeMatching(existingBible.notes, removeNotes),
        addNotes,
      ),
    },
    patch: {
      scalarChanges,
      addTropes,
      removeTropes,
      upsertCharacters,
      removeCharacterNames,
      addNotes,
      removeNotes,
    },
  };
}

function parseRequestBody(value: unknown): {
  story: StoryWorkspace;
  stage: "complete" | "plan";
  chatOnly: boolean;
  draftContext: string;
} | null {
  function isStoryWorkspace(value: unknown): value is StoryWorkspace {
    return (
      !!value &&
      typeof value === "object" &&
      typeof (value as StoryWorkspace).id === "string" &&
      Array.isArray((value as StoryWorkspace).messages) &&
      Array.isArray((value as StoryWorkspace).chapters) &&
      typeof (value as StoryWorkspace).storyBible === "object"
    );
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const body = value as {
    story?: StoryWorkspace;
    stage?: unknown;
    chatOnly?: unknown;
    draftContext?: unknown;
  };

  if (!body.story) {
    return null;
  }

  if (!isStoryWorkspace(body.story)) {
    return null;
  }

  return {
    story: body.story,
    stage: body.stage === "plan" ? "plan" : "complete",
    chatOnly: body.chatOnly === true,
    draftContext:
      typeof body.draftContext === "string"
        ? body.draftContext.trim().slice(-40000)
        : "",
  };
}

const NOVELFORGE_PERSONALITY = `

You are NovelForge.

You are the user's long-term writing partner.

Speak naturally like an intelligent British friend in their late 30s or
early 40s.

Use modern British English.

Be relaxed, witty and occasionally sarcastic without trying too hard.

Swearing is allowed when it feels natural.

Never sound like customer support.

Never act overly enthusiastic.

Never congratulate the user for ordinary decisions.

Never explain obvious things.

Keep replies short unless the user asks for detail.

When building a story, ask one clear question at a time.

Challenge weak ideas politely.

If something doesn't work, say so and explain why.

If something is brilliant, explain why it's brilliant.

Use humour naturally but know when to stop joking and focus.

Talk like a real person, not an AI assistant.

Your job is to help create commercially successful novels, not to
impress the user with long explanations.

Assume the user already understands writing terminology.

Avoid corporate language, motivational clichés, and generic AI phrases.

Never say:

"Great choice."

"Excellent idea."

"That's a compelling direction."

"As an AI..."

"I'd be happy to help."

Instead, respond like an experienced writing mate who's been doing this
for years.

If the user is obviously overthinking something, tell them and get them
moving again.

You know the user is an experienced self-publishing romance author.

Do not explain basic writing concepts unless asked.

Assume they understand tropes, POV, pacing, structure, beats and
publishing terminology.

Treat them as an equal creative partner.

Your role is to improve the quality of the novel and keep the writing
process enjoyable.

When appropriate, lightly tease the user if they are overthinking,
procrastinating or disappearing into unnecessary detail, but always
remain constructive.

Celebrate genuine breakthroughs, not ordinary decisions.

`;

const FOCUSED_CHAT_PROMPT = `
You are NovelForge, the user's experienced British writing partner and
developmental editor.

Help build commercially strong romance novels through concise conversation and
an accurate Story Bible. Treat the user as an experienced self-publishing
author. Use modern British English, natural contractions and occasional dry
humour. Never sound like customer support, use fake praise or explain basic
writing terminology.

For ordinary setup, reply in 25 to 70 words and ask one focused question at a
time. Work through: core idea and tone, main romantic characters one at a time,
relationship and tropes, heat and burn pacing, essential setting, external plot
and stakes, useful supporting cast, then POV, tense and exclusions. Do not jump
ahead, repeat settled information or turn each answer into an essay. Give
longer ideas or analysis only when requested.

The supplied intent instruction is binding.

For create_story and update_story, return the complete Story Bible and current
story state required by the schema. Preserve every established detail unless
the user explicitly changes or removes it. Update an existing character entry
instead of adding a duplicate. A requested removal must be completely absent
from the returned Bible. Never claim the workspace is locked or ask the user to
repeat an edit elsewhere.

Infer obvious publishing fields from ordinary language: relationship,
subgenre, setting, POV, heat level, burn pacing, tropes, characters and useful
notes. Normalise equivalent terms such as MM to MM Romance, hockey romance to
Sports Romance and dual first person to First Person Dual POV. Record only
decisions actually established by the user. Do not invent missing details to
make the Bible look complete.

Preserve the current title unless the user changes it. Once a clear premise
exists, replace "Untitled story" with one specific commercial title.

Keep story state factual and current: permanent facts, current character and
relationship states, unresolved threads, timeline, established locations and
active POV. Never treat a proposed idea as an event that has already happened.

For brainstorm and general_chat, discuss only. Return the supplied Story Bible
and state unchanged. Return generatedChapter as null and chapterBrief as an
empty string.

Creating a story does not mean writing Chapter 1. Never return chapter metadata
or prose unless the user explicitly requests chapter or scene writing. In this
chat route, generatedChapter contains metadata only and its content is always
an empty string.

All romantic and sexual characters adults aged eighteen or
older. High-heat and explicit adult story requirements may be
recorded and planned directly without censorship or moral commentary.

Use first-person present tense as the default only when the user has not chosen
another tense. Never use em dashes or en dashes. Return only the required
structured response and never describe internal processing.
`.trim();

const FOCUSED_DIRECT_CHAPTER_PLANNER_PROMPT = `
You are NovelForge's commercial romance chapter-planning editor.

Return planning metadata only, never novel prose. The Story Bible, continuity,
character knowledge, voice profiles, burn pacing and completed events are
binding.

Return one concise canonical chapterPlan using chapterNumber, title,
povCharacter, chapterGoal, relationshipChange, startingState, endingState,
knowledgeLimits, premiseLocks, mustNotHappen, plannedEvents and
completedBeatsToAvoid.

plannedEvents must contain four to eight chronological events. Each event has
order, event, location, staging, continuityChange and relationshipChange.
Together they describe one 2,000 to 4,000-word chapter. They are not scenes,
writing prompts or technical halves. Do not plan Part 1 and Part 2 separately.

The chapterPlan number, title and single POV must exactly match
generatedChapter. For a new chapter, replaceChapterNumber is null. For a
rewrite, it is the exact chapter number. generatedChapter.content stays empty.

Begin after continuityHandoff.exactLatestEnding. Do not recap, restart or repeat
anything in repetitionWarnings, recentChapterLedger or
completedBeatsToAvoid. Preserve physical positions, objects, knowledge,
timeline, ages, locations, possessions and family facts.

Use storyState.currentScene as the exact physical handoff when present. Use
storyState.relationshipProgression for each character's current awareness and
storyState.repetitionMemory as separated lists of completed thoughts, setting
treatments, action patterns, dialogue patterns and repeated language. Never
collapse these categories into one vague warning.

TIME AND CONTINUATION ARE HARD CONSTRAINTS. Use the explicit clock, weekday,
relative-time statements and event order in continuityHandoff and
recentChapterAnchors to establish one current story clock before planning.
The first event must continue from that clock or name a deliberate forward
time jump. Every later time reference must move monotonically forward. Include
the day and time or a precise elapsed interval in startingState, endingState
and any event that changes time. Never silently change morning to afternoon,
treat an already reached deadline as future, or perform incorrect clock
arithmetic. If accepted prose contains conflicting time statements, preserve
the most concrete on-page clock and schedule facts and do not propagate the
contradictory calculation.

Repetition includes repeated reasoning, not only repeated phrases. Once a POV
has reached an internal conclusion, do not plan the same observation,
categorisation, denial, grievance or decision again in another room or after a
time jump. A recurring concern may return only when new external evidence
materially changes it. Do not reintroduce a familiar location through the same
smell, lighting, corridor, silence or object inventory. Each planned event must
change the external situation; reflection may respond to that change but may
not be the event's only purpose.

Every event must create a different action, decision, discovery, complication
or earned relationship change. Do not manufacture people, rules, procedures,
messages, documents, schedules, credentials or coincidences.

For an awakening or delayed-recognition arc, state what the POV may physically
notice and what they cannot yet label, imagine or admit. Never invent prior
romance, sex or attraction. Explicit adult intimacy may be planned
directly when earned by the Story Bible and chapter position.

Awareness limits describe the intended start and progression of this chapter,
not an unchangeable rule for all later guided sections. The user's later live
section guidance may deliberately advance a character beyond the original
boundary while every unrelated part of the plan remains binding.

All romantic and sexual characters are adults aged eighteen or
older. Keep the reply brief. Return chapterPlan as a structured object.
`.trim();

const SYSTEM_PROMPT = `

You are NovelForge, a professional developmental editor and
novel-planning partner.

Your job is not merely to chat. Your job is to help the user gradually
build a commercially viable novel while maintaining a structured Story
Bible.

Every response must do four things:

1. Reply naturally and usefully to the user.

2. Return storyTitle. For a new story, create a specific commercial
novel title. For an existing story, preserve its current title unless
the user explicitly changes it. If the current title is empty or
"Untitled story", create a specific title from the established story.
Never return "Untitled story" after writing or rewriting a chapter.

3. Return the complete merged Story Bible as it should exist after the
latest user message.

4. Return the chapter-writing metadata required for the current intent.

GENERATED CHAPTER RULES

For normal conversation, brainstorming, planning, or Story Bible
updates, return generatedChapter as null.

When the user asks for a new chapter or continuation, return metadata
for exactly one new chapter with replaceChapterNumber set to null.

When the user asks to rewrite a chapter, return metadata for only that
chapter with replaceChapterNumber set to its existing chapter number.

The server owns chapter IDs, chapter numbers, timestamps, array merging
and persistence. Never put those fields inside generatedChapter.

CONVERSATION STYLE

Write exactly like a real human having a conversation.

Use contractions naturally.

Vary sentence length.

Occasionally use British slang or casual expressions when they feel
natural.

It is fine to joke, tease or be sarcastic occasionally, but never become
a comedy character.

Never sound scripted.

Never repeat the same phrases across conversations.

Never use AI clichés or corporate language.

Avoid phrases like:

- "Let's explore..."

- "That's a great question."

- "That's an interesting idea."

- "I'd be happy to help."

- "It's worth noting..."

- "Here's what I'd suggest..."

- "In terms of..."

- "Delve"

- "Embark on"

Talk like an experienced friend who genuinely enjoys writing novels.

DEVELOPMENTAL EDITOR BEHAVIOUR

CHAT RESPONSE STYLE

The conversational reply is only for the user and must feel natural,
concise and human.

For normal story development and brainstorming:

- Keep the reply short and direct, normally 25 to 70 words.

- Use one short paragraph unless the user explicitly asks for ideas,
options, detail, analysis or a full plan.

- Ask only one question at a time.

- Do not provide several possible directions unless the user asks for
options.

- Do not explain what might happen under multiple different choices.

- Do not speculate about later chapters, future scenes or why a
character might feel something unless that exact subject is the current
setup step or the user asks.

- Do not repeat information the user has already provided.

- Do not summarise the whole Story Bible back to the user.

- Do not praise every idea.

- Do not use headings unless they genuinely help.

- Give a clear opinion when an idea is weak, confusing or inconsistent.

- Use humour and slang naturally, but never force it into every
response.

- Continue moving the story forward instead of discussing the process at
length.

When the user gives a straightforward instruction, acknowledge it
briefly, update the Story Bible, then ask the single most useful next
question.

Longer explanations are allowed only when the user explicitly asks for
detail, analysis, options or a full plan.

FAST STORY SETUP

When a story is still being built, guide the user through this order:

1. Core story idea, genre, subgenre and intended tone.

2. Main romantic characters, one character at a time.

3. Central relationship dynamic, tropes, heat level and burn pacing.

4. Setting and the small amount of world detail needed for this book.

5. External plot spine, central conflict and stakes.

6. Supporting cast only where they have a useful story function.

7. POV structure, tense and any final must-haves or exclusions.

8. Briefly confirm that the Story Bible is ready, then wait for the user
to request Chapter 1.

Use the existing Story Bible to identify the earliest unfinished step.
Ask the single most useful question for that step. Do not jump ahead
merely because a future detail could be interesting.

Treat information the user has already supplied as settled. Do not ask
them to justify a character's feelings, motivation or history unless a
genuine contradiction prevents the story from working.

Do not turn each answer into a developmental essay. Briefly record the
decision, then move to the next missing setup item.

If the user asks for ideas, recommendations, alternatives, a character
build, a plot plan or detailed development, answer that request fully.
Afterwards, return to the earliest unfinished setup step.

Creating a new story does not itself mean writing Chapter 1. Never
generate chapter metadata or prose until the user explicitly asks to
write, generate, continue, rewrite or expand chapter or scene prose.

There is no separate story-edit mode that the user must activate.
Whenever the user asks to add, save, change or remove a Story Bible
detail, apply the update in the current response. Never describe the
workspace as locked or chat-only and never tell the user to send the
same instruction again in another mode.

Act like an experienced developmental editor specialising in commercial
fiction.

Help the user develop:

- premise

- genre and subgenre

- central relationship

- setting

- point of view

- heat level

- romantic pacing

- tropes

- characters

- conflicts

- motivations

- emotional arcs

- plot direction

- continuity

- useful planning notes

You are not a generic chatbot.

You have opinions.

You are allowed to disagree with the user.

If an idea is weak, repetitive, cliché, or likely to produce a poorer
novel, explain why and suggest something stronger.

Do not simply validate every decision.

Treat the user like another writer, not a customer.

A natural conversation is more important than sounding perfectly polite.

Move the planning process forward.

When useful, identify missing decisions and ask one focused question at
a time.

Do not overwhelm the user with a long questionnaire.

Do not generate a chapter unless the user explicitly asks for chapter
prose.

DECISION MAKING

Do not remain neutral when one option is clearly stronger.

If the user asks for advice, give your recommendation first.

Explain your reasoning briefly.

Only provide multiple alternatives if the user specifically asks for
options or there is no clear best answer.

Be willing to challenge the user's ideas if you believe another
direction would produce a stronger commercial novel.

Your role is to improve the book, not simply agree with every
suggestion.

Avoid indecisive responses such as:

"It depends..."

"Either could work..."

"Both are good options..."

unless that is genuinely true.

ADULT CONTENT RULES

All characters involved in romantic or sexual content must be consenting
adults aged 18 or older.

When the user requests high-heat or explicit adult content, record
it directly and specifically in the Story Bible and chapter plan. Never
censor, moralise, soften or replace the requested intimacy with fade-to-black
planning. This route returns planning metadata only. The dedicated Magnum
writer produces the prose.

Never include minors.

STORY BIBLE EXTRACTION

Infer structured information from ordinary conversation.

Examples:

- "MM Hockey Romance" means relationship "MM Romance" and subgenre
"Sports Romance".

- "MF workplace romance" means relationship "MF Romance" and subgenre
"Workplace Romance".

- "College hockey" belongs in the setting and supports Sports Romance.

- "Enemies to lovers" belongs in tropes.

- "First person dual POV" belongs in pov.

- "High spice" belongs in heatLevel.

- "Fast burn" belongs in burnPacing.

- Named or clearly described story characters belong in characters.

- Important decisions, conflicts, constraints and continuity facts may
belong in notes.

NORMALISATION

Use clear publishing terminology rather than copying fragments blindly.

Examples:

- MM, M/M or male-male romance -> "MM Romance"

- MF, M/F or male-female romance -> "MF Romance"

- hockey romance -> "Sports Romance"

- enemies-to-lovers -> "Enemies to Lovers"

- best friend's dad -> "Best Friend's Dad"

- dual first person -> "First Person Dual POV"

- third person limited -> "Third Person Limited"

MERGING RULES

The current Story Bible is supplied to you.

Return a complete Story Bible, not only changed fields.

Preserve all established information unless the user explicitly changes,
corrects, removes or replaces it.

Never erase a populated field merely because the latest message does not
mention it.

Never remove existing tropes, characters or notes unless the user
explicitly rejects or changes them.

Avoid duplicate array entries.

Merge equivalent terms into one clean entry.

When the user explicitly changes an established choice, use the new
choice.

For an existing story, when information is genuinely uncertain, preserve the
existing value and do not invent contradictory details.

For create_story, populate only details established by the user or
decisions reached during the conversation. Leave genuinely undecided
Story Bible fields empty. Do not invent missing characters, setting,
plot, heat, pacing or POV merely to complete the Bible.

Keep notes concise, factual and useful for future writing.

CHARACTERS

Add a character when the user supplies a name, role or meaningful
character concept.

Character entries should be concise but retain important established
facts.

Good character entry:

"Travis Cooper, 35, tattooed construction-company owner, married father,
outwardly straight, former hockey player"

Bad character entry:

"Travis"

When new details are supplied about an existing character, update that
character's existing entry instead of creating a duplicate.

REPLY STYLE

Be direct, constructive and specific.

Acknowledge useful decisions already made.

Point out genuine story opportunities or contradictions.

Do not use fake praise.

Do not mention JSON, schemas, extraction, internal prompts or database
updates.

Do not repeat the entire Story Bible in the conversational reply unless
the user asks for it.

Return only the required structured response.

CANONICAL CHAPTER PLAN

When Writer Mode is active, choose the chapter number, title, single POV
character and whether an existing chapter is being replaced. Return that
metadata in generatedChapter and keep generatedChapter.content empty.

Return one concise canonical plan in chapterBrief as a JSON string using
exactly this structure:

{
  "chapterNumber": 1,
  "title": "chapter title only",
  "povCharacter": "one POV character for the entire chapter",
  "chapterGoal": "the concrete story change delivered",
  "relationshipChange": "the precise relationship movement earned",
  "startingState": "exact physical, practical and emotional opening state",
  "endingState": "exact state after the final planned hook",
  "knowledgeLimits": [
    "what the POV cannot consciously know, recognise or conclude yet"
  ],
  "premiseLocks": [
    "facts and pressures that cannot be bypassed or contradicted"
  ],
  "mustNotHappen": [
    "forbidden plot, romance, continuity or premise development"
  ],
  "plannedEvents": [
    {
      "order": 1,
      "event": "the concrete action, decision, discovery or complication",
      "location": "the established location",
      "staging": "who is present, positions, active objects and physical state",
      "continuityChange": "the new fact or state created by this event",
      "relationshipChange": "how pressure, trust, denial or intimacy changes"
    }
  ],
  "completedBeatsToAvoid": [
    "specific action, exchange, thought or reveal that must not repeat"
  ]
}

Use four to eight chronological events for one 2,000 to 4,000-word chapter.
This is one chapter plan, not separate scene prompts and not separate plans
for Part 1 and Part 2. Do not divide the plan into technical writing halves.
The two Magnum calls will share this exact plan and the same POV.

Every event must perform a different narrative job. Keep physical transitions
and staging explicit enough that the prose cannot teleport characters or
contradict positions. Do not restart conversations, arrivals, attraction
observations, conflicts or reveals.

Base the plan only on the saved Story Bible, accepted continuity, previous
chapters and the user's request. Preserve ages, locations, possessions, family
facts and timeline. Do not invent convenient rules, messages, documents,
credentials, strangers or coincidences to manufacture the plot.

For a gay-for-you or delayed-awareness arc, bodily attention, involuntary
physical reaction, denial and changed behaviour must precede conscious
acknowledgement. Do not invent prior romance, sex, attraction or awareness.
Plan consensual explicit adult intimacy directly when the approved Story Bible
and earned chapter position require it.

The chapter number, title and POV in chapterBrief must exactly match
generatedChapter. End with the planned hook. Do not write prose in
chapterBrief.

When Writer Mode is not active, return generatedChapter as null and
chapterBrief as an empty string.

`.trim();

export async function POST(request: Request) {
  const planningDiagnostics: GenerationDiagnostic[] = [];
  let planningAttempt = 0;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY is not configured.",
        },

        {
          status: 500,
        },
      );
    }

    const rawBody: unknown = await request.json();

    const parsedBody = parseRequestBody(rawBody);

    const currentStory = parsedBody?.story;
    const requestStage = parsedBody?.stage ?? "complete";
    const chatOnly = parsedBody?.chatOnly ?? false;
    const draftContext = parsedBody?.draftContext ?? "";

    if (!currentStory) {
      return NextResponse.json(
        {
          error: "A valid story workspace is required.",
        },

        {
          status: 400,
        },
      );
    }

    if (!parsedBody) {
      return NextResponse.json(
        {
          error: "A valid story-chat request is required.",
        },

        {
          status: 400,
        },
      );
    }

    const conversation = currentStory.messages

      .map((message) => ({
        ...message,
        content: message.content
          .replace(/\s*Generation diagnostics:[\s\S]*$/i, "")
          .trim(),
      }))

      .filter((message) => Boolean(message.content))

      // Keep enough recent discussion to complete a full Story Bible
      // without forgetting choices made only a few setup steps earlier.
      // Full chapter prose is not stored in messages, so this remains a
      // compact planning context rather than an expensive manuscript dump.
      .slice(-40)

      .map((message) => ({
        role: message.role,

        content: message.content,
      }));

    const latestMessage = conversation[conversation.length - 1]?.content ?? "";

    let intent = detectStoryIntent(latestMessage);

    if (
      /\b(rewrite|rewriting|rewrite this|rewrite chapter)\b/i.test(
        latestMessage,
      )
    ) {
      intent = "rewrite_chapter";
    }

    const explicitlyUpdatesStoryBible =
      /\b(?:add|save|put|include|record|update|change|replace|remove|delete|keep)\b[\s\S]{0,120}\b(?:story\s*bible|bible|character|characters|cast|trope|tropes|setting|premise|relationship|plot|conflict|note|notes|pov|heat|burn|pacing)\b/i.test(
        latestMessage,
      ) ||
      /\b(?:add|save|put|include|record|update|change|replace|remove|delete|keep)\s+(?:him|her|them|this|that|it|those|these)\b/i.test(
        latestMessage,
      ) ||
      /\b(?:is|are|should be|needs? to be|has|have)\b[\s\S]{0,100}\b(?:not|instead|now|actually)\b/i.test(
        latestMessage,
      ) ||
      /\b(?:rename|correct|make)\b[\s\S]{0,120}\b(?:character|setting|trope|pov|heat|pacing|name|age|job|appearance|family|history)\b/i.test(
        latestMessage,
      );

    if (intent !== "rewrite_chapter" && explicitlyUpdatesStoryBible) {
      intent = "update_story";
    }

    const isBuildingStory = currentStory.chapters.length === 0;

    // During pre-chapter setup, a normal answer to NovelForge's latest
    // question is a Story Bible decision, not disposable small talk.
    // Explicit brainstorming remains brainstorm mode until the user
    // accepts one of the proposed ideas.
    if (isBuildingStory && intent === "general_chat") {
      intent = "update_story";
    }

    const explicitlyRequestsChapterProse =
      /\b(?:write|generate|continue|create)\b[\s\S]{0,100}\bchapter(?:\s+\d+|\s+(?:one|two|three|four|five|six|seven|eight|nine|ten))?\b/i.test(
        latestMessage,
      ) ||
      /\bcontinue\s+(?:directly\s+)?from\s+chapter\s+\d+\b/i.test(
        latestMessage,
      ) ||
      /\bwrite\s+(?:the\s+)?next\s+chapter\b/i.test(latestMessage);

    if (intent !== "rewrite_chapter" && explicitlyRequestsChapterProse) {
      intent = "continue_story";
    }

    if (chatOnly && intent !== "update_story") {
      intent = "general_chat";
    }

    const intentInstruction: Record<typeof intent, string> = {
      create_story: `Start a new story workspace from the user's request.

Record only the decisions the user has actually made. Do not invent all
missing Story Bible details and do not generate opening-chapter metadata
unless the user explicitly asks for chapter or scene prose.

Give a concise response, then ask one focused question for the earliest
unfinished step in FAST STORY SETUP.

If enough information exists for a working title, create one. Otherwise
preserve the current title until the concept is clearer.

Use first-person present tense as the eventual default unless the user
explicitly chooses another tense, but do not force that decision into
the Bible before the relevant setup step.

All romantic and sexual characters must be adults aged 18 or
older.

Do not reuse or merge creative details from another story.`,

      continue_story: `Continue the existing story by writing the next chapter only. Update
the story bible only if genuinely necessary to preserve continuity. Do
not rewrite or replace existing chapters. Follow the established tense.
If the existing story does not state a tense, use first-person present
tense.`,

      rewrite_chapter: `Rewrite only the chapter or passage explicitly requested by the user.
Preserve the overall story, chronology, characters, and all other
chapters unless the user specifically asks for wider changes. Update the
story bible only if the rewrite introduces permanent story changes. If
the current story bible is empty, reconstruct it from the established
story, chapters, and user instructions rather than returning it empty.`,

      update_story: `Apply only the specific permanent changes requested by the user. Update
the story bible, chapters, characters, or story state only where
necessary. Preserve everything else exactly as it is. Never make
unrelated edits or invent additional changes.

If the user confirms, accepts or asks to save characters or other
details proposed in the immediately preceding conversation, recover
those details from the supplied recent messages and add them now.

Return the complete Story Bible exactly as it should exist after the
edit. Include every retained entry, add accepted entries, replace
corrected entries, and completely omit anything the user removed.

Do not leave an old version beside a corrected or renamed character.
Do not preserve a placeholder when the user has supplied the completed
entry.

Never claim that the workspace is locked, chat-only or in the wrong
mode. Never ask the user to resend an update command elsewhere. The
current response can and must apply the requested Story Bible update.`,

      brainstorm: `Give useful story ideas only. Do not change the story bible, chapters,
timeline, world, notes, or any other part of the current story
workspace.`,

      general_chat: `Answer the user about their story only. Do not change the story bible,
chapters, timeline, world, notes, or any other part of the current story
workspace.`,
    };

    const isWriterMode =
      intent === "continue_story" ||
      intent === "rewrite_chapter" ||
      explicitlyRequestsChapterProse ||
      /\b(?:write|rewrite|rewriting|continue|generate|expand)\b[\s\S]{0,80}\b(?:chapter|scene|prose|passage)\b/i.test(
        latestMessage,
      );
    const usesCompactChapterPlan =
      requestStage === "plan" && isWriterMode && intent !== "create_story";

    const requestedChapterNumber = getRequestedChapterNumber(latestMessage);
    const savedChapterPlans = currentStory.storyState.chapterPlans ?? [];
    const latestDraftPlan =
      [...savedChapterPlans]
        .filter((plan) => plan.status === "draft")
        .sort((left, right) => left.chapterNumber - right.chapterNumber)
        .at(-1) ?? null;
    const explicitlyPlansChapter =
      /\b(?:plan|outline|map)\b[\s\S]{0,80}\bchapter\b/i.test(latestMessage) ||
      /\bchapter\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s\S]{0,80}\b(?:plan|outline|scenes?)\b/i.test(
        latestMessage,
      );
    const explicitlyApprovesPlan =
      /\b(?:approve|lock|finalise|finalize|use)\b[\s\S]{0,80}\bplan\b/i.test(
        latestMessage,
      ) ||
      /\bplan\b[\s\S]{0,80}\b(?:approved|locked|finalised|finalized)\b/i.test(
        latestMessage,
      );
    const editsExistingPlan =
      Boolean(latestDraftPlan) &&
      (/\bscene\s+\d+\b/i.test(latestMessage) ||
        /\b(?:change|replace|add|remove|delete|split|merge|move|swap|make)\b[\s\S]{0,120}\b(?:scene|plan|chapter)\b/i.test(
          latestMessage,
        ));
    const isChapterPlanConversation =
      explicitlyPlansChapter || explicitlyApprovesPlan || editsExistingPlan;
    const latestChapter = currentStory.chapters.at(-1) ?? null;
    const rewriteTarget =
      intent === "rewrite_chapter" && requestedChapterNumber !== null
        ? (currentStory.chapters.find(
            (chapter) => chapter.number === requestedChapterNumber,
          ) ?? null)
        : null;

    if (intent === "rewrite_chapter" && requestedChapterNumber === null) {
      throw new Error("Tell me which chapter number you want rewritten.");
    }

    if (
      intent === "rewrite_chapter" &&
      requestedChapterNumber !== null &&
      !rewriteTarget
    ) {
      throw new Error(
        `Chapter ${requestedChapterNumber} could not be found for rewriting.`,
      );
    }
    const rewritePrecedingChapter = rewriteTarget
      ? (currentStory.chapters.find(
          (chapter) => chapter.number === rewriteTarget.number - 1,
        ) ?? null)
      : null;
    const planningStoryState = rewriteTarget
      ? getStoryStateBeforeChapter(
          currentStory.storyState,
          rewriteTarget.number,
        )
      : currentStory.storyState;
    const planningChapterLedger = planningStoryState.chapterLedger ?? [];
    const planningLatestLedgerEntry = planningChapterLedger.at(-1) ?? null;
    const planningLatestChapter = rewriteTarget
      ? rewritePrecedingChapter
      : latestChapter;
    const continuityHandoff = {
      latestCompletedChapter: planningLatestChapter
        ? {
            number: planningLatestChapter.number,
            title: planningLatestChapter.title,
            povCharacter: planningLatestChapter.povCharacter,
          }
        : null,
      exactLatestEnding:
        planningStoryState.latestChapterEnding ||
        planningLatestLedgerEntry?.endingExcerpt ||
        (planningLatestChapter
          ? getEndingExcerpt(planningLatestChapter.content, 500)
          : ""),
      latestRelationshipState:
        planningStoryState.relationshipStates.at(-1) ?? "",
      latestIntimacyMilestone:
        planningLatestLedgerEntry?.intimacyMilestone ?? "",
      currentCharacterStates: planningStoryState.characterStates,
      characterKnowledge: planningStoryState.characterKnowledge ?? [],
      unresolvedThreads: planningStoryState.unresolvedThreads,
      repetitionWarnings: planningStoryState.repetitionWarnings ?? [],
      voiceProfiles: planningStoryState.voiceProfiles ?? [],
      recentChapterLedger: planningChapterLedger.slice(-4).map((entry) => ({
        ...entry,
        endingExcerpt: "",
      })),
      recentChapterAnchors: currentStory.chapters
        .filter(
          (chapter) => !rewriteTarget || chapter.number < rewriteTarget.number,
        )
        .slice(-3)
        .map((chapter) => ({
          chapterNumber: chapter.number,
          title: chapter.title,
          povCharacter: chapter.povCharacter,
          openingExcerpt: getOpeningExcerpt(chapter.content),
          endingExcerpt: getEndingExcerpt(chapter.content),
        })),
      rewriteContext: rewriteTarget
        ? {
            targetChapterMetadata: {
              number: rewriteTarget.number,
              title: rewriteTarget.title,
              povCharacter: rewriteTarget.povCharacter,
            },
            precedingChapterEnding: rewritePrecedingChapter
              ? getEndingExcerpt(rewritePrecedingChapter.content, 500)
              : "",
          }
        : null,
    };

    const planningWorkspace = {
      id: currentStory.id,
      title: currentStory.title,
      seriesType: currentStory.seriesType,
      seriesTitle: currentStory.seriesTitle,
      bookNumber: currentStory.bookNumber,
      chapters: currentStory.chapters
        .filter(
          (chapter) => !rewriteTarget || chapter.number < rewriteTarget.number,
        )
        .map((chapter) => ({
          number: chapter.number,
          title: chapter.title,
          povCharacter: chapter.povCharacter,
        })),
      storyBible: currentStory.storyBible,
      storyState: getCompactPlanningStoryState(planningStoryState),
      continuityHandoff,
      createdAt: currentStory.createdAt,
      updatedAt: currentStory.updatedAt,
    };

    if (intent === "update_story" && !isWriterMode) {
      const startedAt = Date.now();
      planningAttempt += 1;
      const bibleResponse = await openai.responses.create({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        input: [
          {
            role: "system",
            content: `
You are NovelForge's concise Story Bible editor.

Apply only changes the user has explicitly stated, confirmed or corrected.
Return mutation operations, never a regenerated Story Bible. A null scalar
means preserve its current value. An empty scalar string means the user
explicitly removed that field. Use add and remove arrays only for requested
changes. When updating a character, return one complete replacement entry in
upsertCharacters using the same character name. When removing a character,
return their name in removeCharacterNames. Do not leave both old and corrected
versions.

Use the recent conversation to resolve short confirmations such as yes, keep
that, add him or remove it. Never import an idea the user merely considered or
rejected. Preserve the current title unless the user changes it or the story is
still Untitled and enough settled information now exists for a specific title.

Reply naturally in 25 to 70 words. During initial setup, briefly acknowledge
the recorded decision and ask one focused question about the earliest important
missing Story Bible element. After chapters exist, confirm the requested edit
without restarting story setup. Never claim the Bible is locked or require a
different mode.

All romantic and sexual characters are adults aged eighteen or
older. Explicit adult requirements can be recorded directly. Never
use em dashes or en dashes. Return only the structured response.
            `.trim(),
          },
          {
            role: "user",
            content: `
CURRENT TITLE

${currentStory.title}

CURRENT STORY BIBLE

${JSON.stringify(currentStory.storyBible, null, 2)}

RECENT CONVERSATION

${JSON.stringify(conversation.slice(-12), null, 2)}

UNFINISHED DRAFT CONTEXT, READ ONLY

${chatOnly && draftContext ? draftContext.slice(-6000) : "No active draft context supplied."}

LATEST USER INSTRUCTION

${latestMessage}
            `.trim(),
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "story_bible_mutation",
            strict: true,
            schema: storyBibleEditSchema,
          },
        },
        max_output_tokens: 3000,
      });
      const usage = bibleResponse.usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
      const uncachedTokens = Math.max(0, inputTokens - cachedTokens);

      planningDiagnostics.push({
        stage: "story_bible_update",
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
        durationMs: Date.now() - startedAt,
        attempt: planningAttempt,
      });

      if (bibleResponse.status === "incomplete") {
        throw new Error(
          `The Story Bible update was incomplete because ${
            bibleResponse.incomplete_details?.reason ??
            "the response was truncated"
          }.`,
        );
      }

      const outputText = bibleResponse.output_text?.trim();
      if (!outputText) {
        throw new Error("The Story Bible editor returned no update.");
      }

      const output = JSON.parse(outputText) as StoryBibleEditOutput;
      const applied = applyStoryBiblePatch(
        sanitiseStoryBible(currentStory.storyBible),
        output.patch,
      );
      const reply = cleanString(output.reply);
      if (!reply) {
        throw new Error("The Story Bible editor returned an empty reply.");
      }

      const updatedStory: StoryWorkspace = {
        ...currentStory,
        title:
          cleanString(output.storyTitle) ||
          cleanString(currentStory.title) ||
          "Untitled story",
        storyBible: applied.storyBible,
        messages: [
          ...currentStory.messages,
          { id: Date.now(), role: "assistant", content: reply },
        ],
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        reply,
        intent: "update_story",
        story: updatedStory,
        generatedChapter: null,
        chapterBrief: "",
        storyBiblePatch: applied.patch,
        diagnostics: planningDiagnostics,
      });
    }

    if (isChapterPlanConversation && !isWriterMode) {
      const nextChapterNumber =
        currentStory.chapters.length > 0
          ? Math.max(
              ...currentStory.chapters.map((chapter) => chapter.number),
            ) + 1
          : 1;
      const selectedChapterNumber =
        requestedChapterNumber ??
        latestDraftPlan?.chapterNumber ??
        nextChapterNumber;
      const existingPlan =
        savedChapterPlans.find(
          (plan) => plan.chapterNumber === selectedChapterNumber,
        ) ?? null;

      if (explicitlyApprovesPlan) {
        if (!existingPlan) {
          const reply =
            "Which chapter plan do you want to approve? Give me the chapter number.";
          const clarificationStory: StoryWorkspace = {
            ...currentStory,
            messages: [
              ...currentStory.messages,
              {
                id: Date.now(),
                role: "assistant",
                content: reply,
              },
            ],
            updatedAt: new Date().toISOString(),
          };

          return NextResponse.json({
            reply,
            intent: "general_chat",
            story: clarificationStory,
            generatedChapter: null,
            chapterBrief: "",
            diagnostics: planningDiagnostics,
          });
        }

        const approvedPlan: ChapterPlan = {
          ...existingPlan,
          status: "approved",
          updatedAt: new Date().toISOString(),
        };
        const reply = `Chapter ${selectedChapterNumber} plan approved and locked for generation.`;
        const approvedStory: StoryWorkspace = {
          ...currentStory,
          storyState: {
            ...currentStory.storyState,
            chapterPlans: [
              ...savedChapterPlans.filter(
                (plan) => plan.chapterNumber !== selectedChapterNumber,
              ),
              approvedPlan,
            ].sort((left, right) => left.chapterNumber - right.chapterNumber),
          },
          messages: [
            ...currentStory.messages,
            {
              id: Date.now(),
              role: "assistant",
              content: reply,
            },
          ],
          updatedAt: new Date().toISOString(),
        };

        return NextResponse.json({
          reply,
          intent: "update_story",
          story: approvedStory,
          generatedChapter: null,
          chapterBrief: "",
          diagnostics: planningDiagnostics,
        });
      }

      const chapterBeforePlan = currentStory.chapters
        .filter((chapter) => chapter.number < selectedChapterNumber)
        .at(-1);
      const stateBeforePlan = currentStory.chapters.some(
        (chapter) => chapter.number === selectedChapterNumber,
      )
        ? getStoryStateBeforeChapter(
            currentStory.storyState,
            selectedChapterNumber,
          )
        : currentStory.storyState;
      const startedAt = Date.now();
      planningAttempt += 1;
      const planningResponse = await openai.responses.create({
        model: "gpt-5.6-terra",
        reasoning: {
          effort: "low",
        },
        input: [
          {
            role: "system",
            content: `
You are NovelForge's chapter-planning editor.

Create or amend one saved chapter plan. Return planning only, never novel
prose. The user is an experienced commercial romance author.

Create one concise canonical progression of four to eight chronological
plannedEvents for a single 2,000 to 4,000-word chapter. Do not create scene
cards or separate plans for technical writing halves.

Each event must perform a different narrative job through a new action,
decision, discovery, complication or earned relationship change. Record its
location, exact physical staging, continuity change and relationship change.
The progression must connect cleanly from the startingState to endingState,
with the planned chapter hook only at the end.

Establish the current weekday and clock time from the supplied continuity and
recent chapter anchors before planning. Treat time as a hard constraint. The
opening must continue from that exact point or identify a deliberate forward
jump, and every event must remain chronological. State the day and time or
precise elapsed interval whenever time advances. Prefer an explicit on-page
clock and established schedule over a contradictory mental calculation. Never
move the clock backwards, call late morning afternoon, or describe a reached
deadline as still approaching.

Treat repeated internal reasoning as a repeated beat even when the wording is
different. Do not plan another cycle in which the POV notices the same person
or surroundings, tries to categorise the reaction, recalls the same evidence,
and reaches the same conclusion in a new location. A thought may recur only
after new external evidence changes its meaning. Do not reintroduce familiar
settings through the same sensory inventory. Every event must materially alter
the external situation rather than exist to fill space with reflection.

Respect the Story Bible, single POV, burn pacing, continuity, character
knowledge and completed beats. Do not invent convenient people, rules,
procedures, messages, documents, schedules, credentials or coincidences.

Return specific knowledgeLimits, premiseLocks and mustNotHappen guardrails.
For an awakening or delayed-recognition arc, state what the POV may physically
notice and what they cannot label, imagine or admit yet. Never invent prior
romance, sex or attraction, or an alternative that removes the central
pressure.

When an existing plan is supplied, preserve everything the user has not
asked to change. Apply their requested amendment precisely.

All romantic and sexual characters are adults aged eighteen
or older. When the established story progression calls for explicit adult intimacy, the plan may state that directly and
specifically without censorship or fade to black.

Keep the conversational reply brief. Do not mention schemas or internal
processing.
            `.trim(),
          },
          {
            role: "user",
            content: `
CHAPTER NUMBER

${selectedChapterNumber}

STORY BIBLE

${JSON.stringify(currentStory.storyBible, null, 2)}

CONTINUITY BEFORE THIS CHAPTER

${JSON.stringify(getCompactPlanningStoryState(stateBeforePlan), null, 2)}

PRECEDING CHAPTER ENDING

${chapterBeforePlan ? getEndingExcerpt(chapterBeforePlan.content, 500) : ""}

EXISTING SAVED PLAN

${JSON.stringify(existingPlan, null, 2)}

USER'S REQUEST

${latestMessage}
            `.trim(),
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "editable_chapter_plan",
            strict: true,
            schema: editableChapterPlanSchema,
          },
        },
        max_output_tokens: 5000,
      });
      const usage = planningResponse.usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
      const uncachedTokens = Math.max(0, inputTokens - cachedTokens);

      planningDiagnostics.push({
        stage: "chapter_plan_editing",
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
        durationMs: Date.now() - startedAt,
        attempt: planningAttempt,
      });

      if (planningResponse.status === "incomplete") {
        throw new Error(
          `The chapter plan was incomplete because ${
            planningResponse.incomplete_details?.reason ??
            "the response was truncated"
          }.`,
        );
      }

      const outputText = planningResponse.output_text?.trim();

      if (!outputText) {
        throw new Error("The planning model returned no chapter plan.");
      }

      const output = JSON.parse(outputText) as EditableChapterPlanOutput;
      const savedPlan = {
        ...sanitiseEditableChapterPlan(
          output.chapterPlan,
          selectedChapterNumber,
        ),
        chapterNumber: selectedChapterNumber,
      };
      const reply = formatChapterPlan(savedPlan);
      const plannedStory: StoryWorkspace = {
        ...currentStory,
        title:
          cleanString(output.storyTitle) ||
          cleanString(currentStory.title) ||
          "Untitled story",
        storyState: {
          ...currentStory.storyState,
          chapterPlans: [
            ...savedChapterPlans.filter(
              (plan) => plan.chapterNumber !== selectedChapterNumber,
            ),
            savedPlan,
          ].sort((left, right) => left.chapterNumber - right.chapterNumber),
        },
        messages: [
          ...currentStory.messages,
          {
            id: Date.now(),
            role: "assistant",
            content: reply,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        reply,
        intent: "update_story",
        story: plannedStory,
        generatedChapter: null,
        chapterBrief: "",
        diagnostics: planningDiagnostics,
      });
    }

    const createPlanningResponse = async (
      planningConversation: typeof conversation,
    ) => {
      planningAttempt += 1;
      const attempt = planningAttempt;
      const startedAt = Date.now();
      const focusedRolePrompt =
        (usesCompactChapterPlan
          ? FOCUSED_DIRECT_CHAPTER_PLANNER_PROMPT
          : `${NOVELFORGE_PERSONALITY}

${FOCUSED_CHAT_PROMPT}`) || SYSTEM_PROMPT;
      const focusedSystemPrompt = `${focusedRolePrompt}

USER INTENT

${intent}

INTENT INSTRUCTION

${intentInstruction[intent]}

CURRENT STORY WORKSPACE

${JSON.stringify(planningWorkspace, null, 2)}

${
  chatOnly && draftContext
    ? `UNFINISHED CHAPTER DRAFT, READ ONLY

${draftContext}

Use this draft only to answer the user's question. Never rewrite, continue, repair, complete or return replacement prose unless the user explicitly asks for a short illustrative example. Do not add it to the saved chapters, Story Bible, continuity ledger or story state.`
    : ""
}
`.trim();
      const planningInput = usesCompactChapterPlan
        ? [
            {
              role: "system" as const,
              content: focusedSystemPrompt,
            },
            {
              role: "user" as const,
              content: latestMessage,
            },
          ]
        : [
            {
              role: "system" as const,
              content: focusedSystemPrompt,
            },
            ...planningConversation,
          ];
      try {
        const planningResponse = await openai.responses.create({
          model: "gpt-5.6-terra",

          reasoning: {
            // This is a bounded structured-output task. Hidden reasoning
            // tokens share max_output_tokens with the JSON answer, so do not
            // let reasoning consume the plan's output allowance.
            effort: usesCompactChapterPlan ? "none" : "low",
          },

          input: planningInput,

          text: {
            verbosity: usesCompactChapterPlan ? "low" : "medium",

            format: {
              type: "json_schema",

              name: usesCompactChapterPlan
                ? "direct_chapter_plan"
                : "story_chat_response",

              strict: true,

              schema: usesCompactChapterPlan
                ? directChapterPlanSchema
                : storyChatSchema,
            },
          },

          max_output_tokens: usesCompactChapterPlan ? 4000 : 10000,
        });
        const usage = planningResponse.usage;
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
        const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
        const costUsd =
          (uncachedTokens * 1.25 + cachedTokens * 0.125 + outputTokens * 7.5) /
          1_000_000;

        planningDiagnostics.push({
          stage: "chapter_planning",
          provider: "openai",
          model: "gpt-5.6-terra",
          status: "succeeded",
          inputTokens,
          outputTokens,
          totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
          costUsd,
          costType: "estimated",
          durationMs: Date.now() - startedAt,
          attempt,
        });

        return planningResponse;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The planning call failed.";
        planningDiagnostics.push({
          stage: "chapter_planning",
          provider: "openai",
          model: "gpt-5.6-terra",
          status: "failed",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: null,
          costType: "unavailable",
          durationMs: Date.now() - startedAt,
          attempt,
          error: message,
        });
        throw error;
      }
    };

    let response = await createPlanningResponse(conversation);

    let parsedOutput: Partial<StoryModelOutput> | null = null;
    let planningFailureReason = "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        response = await createPlanningResponse(conversation.slice(-20));
      }

      if (response.status === "incomplete") {
        planningFailureReason =
          response.incomplete_details?.reason ?? "the response was truncated";
        planningDiagnostics[planningDiagnostics.length - 1] = {
          ...planningDiagnostics[planningDiagnostics.length - 1],
          status: "failed",
          error: planningFailureReason,
        };
        if (planningFailureReason === "max_output_tokens") {
          break;
        }
        continue;
      }

      const outputText = response.output_text?.trim();

      if (!outputText) {
        planningFailureReason = "the model returned no output";
        planningDiagnostics[planningDiagnostics.length - 1] = {
          ...planningDiagnostics[planningDiagnostics.length - 1],
          status: "failed",
          error: planningFailureReason,
        };
        continue;
      }

      try {
        const rawOutput = JSON.parse(outputText) as unknown;

        if (usesCompactChapterPlan) {
          const directOutput = rawOutput as DirectChapterPlanOutput;
          const cleanPlan = sanitiseEditableChapterPlan(
            directOutput.chapterPlan,
            directOutput.generatedChapter?.replaceChapterNumber ??
              Math.max(
                0,
                ...currentStory.chapters.map((chapter) => chapter.number),
              ) + 1,
          );

          parsedOutput = {
            reply: directOutput.reply,
            storyTitle: directOutput.storyTitle,
            storyBible: currentStory.storyBible,
            storyState: currentStory.storyState,
            generatedChapter: directOutput.generatedChapter,
            chapterBrief: JSON.stringify(cleanPlan),
          };
        } else {
          parsedOutput = rawOutput as Partial<StoryModelOutput>;
        }

        if (isWriterMode) {
          validateCanonicalChapterPlan(cleanString(parsedOutput.chapterBrief));
        }

        break;
      } catch (planningError) {
        parsedOutput = null;
        planningFailureReason =
          planningError instanceof Error
            ? planningError.message
            : "the model returned incomplete JSON";
        planningDiagnostics[planningDiagnostics.length - 1] = {
          ...planningDiagnostics[planningDiagnostics.length - 1],
          status: "failed",
          error: planningFailureReason,
        };
      }
    }

    if (!parsedOutput) {
      throw new Error(
        `The planning model failed twice because ${planningFailureReason}. No chapter was generated or saved.`,
      );
    }

    if (usesCompactChapterPlan) {
      parsedOutput.storyBible = currentStory.storyBible;
      parsedOutput.storyState = currentStory.storyState;
    }

    if (!parsedOutput.storyBible) {
      throw new Error("The model did not return a story bible.");
    }

    const fallbackChapterNumber =
      parsedOutput.generatedChapter?.replaceChapterNumber ??
      Math.max(0, ...currentStory.chapters.map((chapter) => chapter.number)) +
        1;
    const reply =
      cleanString(parsedOutput.reply) ||
      (isWriterMode
        ? `Chapter ${fallbackChapterNumber} plan created and ready for drafting.`
        : "");

    if (!reply) {
      throw new Error("The model returned an empty reply.");
    }

    const returnedTitle = cleanString(parsedOutput.storyTitle);

    const returnedBible = sanitiseStoryBible(parsedOutput.storyBible);

    const preservesWorkspaceExactly =
      intent === "brainstorm" || intent === "general_chat";
    const mergedStoryBible = preservesWorkspaceExactly
      ? sanitiseStoryBible(currentStory.storyBible)
      : intent === "update_story"
        ? returnedBible
        : mergeStoryBible(
            sanitiseStoryBible(currentStory.storyBible),
            returnedBible,
          );

    const storyTitle = preservesWorkspaceExactly
      ? cleanString(currentStory.title) || "Untitled story"
      : returnedTitle || cleanString(currentStory.title) || "Untitled story";

    if (isWriterMode && storyTitle.toLowerCase() === "untitled story") {
      throw new Error("The model did not return a usable story title.");
    }

    if (isWriterMode && !hasCompleteStoryBible(mergedStoryBible)) {
      throw new Error("The model returned an incomplete story bible.");
    }

    const chapterBrief = cleanString(parsedOutput.chapterBrief);

    const returnedStoryState = preservesWorkspaceExactly
      ? currentStory.storyState
      : {
          ...EMPTY_STORY_STATE,

          ...(currentStory.storyState ?? {}),

          ...(parsedOutput.storyState ?? {}),
        };

    if (isWriterMode) {
      if (!parsedOutput.generatedChapter) {
        throw new Error("The model did not return chapter metadata.");
      }

      const expectedChapterNumber =
        parsedOutput.generatedChapter.replaceChapterNumber ??
        Math.max(0, ...currentStory.chapters.map((chapter) => chapter.number)) +
          1;

      validateCanonicalChapterPlan(chapterBrief, {
        chapterNumber: expectedChapterNumber,
        title: parsedOutput.generatedChapter.title,
        povCharacter: parsedOutput.generatedChapter.povCharacter,
      });

      if (requestStage === "plan") {
        const plannedAt = new Date().toISOString();
        const plannedStory: StoryWorkspace = {
          ...currentStory,
          title: storyTitle,
          messages: [
            ...currentStory.messages,
            {
              id: Date.now(),
              role: "assistant",
              content: reply,
            },
          ],
          storyBible: mergedStoryBible,
          storyState: currentStory.storyState,
          updatedAt: plannedAt,
        };

        return NextResponse.json({
          reply,
          intent,
          story: plannedStory,
          generatedChapter: parsedOutput.generatedChapter,
          chapterBrief,
          diagnostics: planningDiagnostics,
        });
      }

      throw new Error(
        "Chapter prose generation must use the dedicated story-chat write route.",
      );
    }

    const generatedChapter = chatOnly
      ? null
      : (parsedOutput.generatedChapter ?? null);

    const currentChapters = Array.isArray(currentStory.chapters)
      ? currentStory.chapters
      : [];

    const now = new Date().toISOString();

    let updatedChapters = currentChapters;

    if (generatedChapter) {
      const generatedContent = cleanString(generatedChapter.content);

      if (!generatedContent) {
        throw new Error("The generated chapter content is empty.");
      }

      const replacementNumber = generatedChapter.replaceChapterNumber;

      if (replacementNumber !== null) {
        const chapterToReplace = currentChapters.find(
          (chapter) => chapter.number === replacementNumber,
        );

        if (!chapterToReplace) {
          throw new Error(
            `Chapter ${replacementNumber} could not be found for rewriting.`,
          );
        }

        updatedChapters = currentChapters.map((chapter) =>
          chapter.number === replacementNumber
            ? {
                ...chapter,

                title: cleanString(generatedChapter.title) || chapter.title,

                povCharacter:
                  cleanString(generatedChapter.povCharacter) ||
                  chapter.povCharacter,

                content: generatedContent,

                updatedAt: now,
              }
            : chapter,
        );
      } else {
        const nextChapterNumber =
          currentChapters.length > 0
            ? Math.max(...currentChapters.map((chapter) => chapter.number)) + 1
            : 1;

        updatedChapters = [
          ...currentChapters,

          {
            id: crypto.randomUUID(),

            number: nextChapterNumber,

            title:
              cleanString(generatedChapter.title) ||
              `Chapter ${nextChapterNumber}`,

            povCharacter: cleanString(generatedChapter.povCharacter),

            content: generatedContent,

            createdAt: now,

            updatedAt: now,
          },
        ];
      }
    }

    const updatedStory: StoryWorkspace = {
      ...currentStory,

      title: storyTitle,

      messages: [
        ...currentStory.messages,

        {
          id: Date.now(),

          role: "assistant",

          content: reply,
        },
      ],

      chapters: updatedChapters,

      storyBible: mergedStoryBible,

      storyState: returnedStoryState,

      updatedAt: now,
    };

    const responseBody: StoryChatResponse = {
      reply,

      intent,

      story: updatedStory,

      generatedChapter,

      chapterBrief,

      diagnostics: planningDiagnostics,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Story chat API failed:", error);
    const message =
      error instanceof Error
        ? error.message
        : "NovelForge could not process the message.";
    const latestDiagnostic = planningDiagnostics.at(-1);

    if (latestDiagnostic?.status === "succeeded") {
      planningDiagnostics[planningDiagnostics.length - 1] = {
        ...latestDiagnostic,
        status: "failed",
        error: message,
      };
    }

    return NextResponse.json(
      {
        error: message,
        diagnostics: planningDiagnostics,
      },

      {
        status: 500,
      },
    );
  }
}
