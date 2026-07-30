import OpenAI from "openai";

import { NextResponse } from "next/server";

import { detectStoryIntent } from "../../../src/lib/detect-story-intent";

import type {
  ChapterPlan,
  GenerationDiagnostic,
  StoryBible,
  StoryWorkspace,
  StoryChatResponse,
} from "../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,

  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

async function generateWithAion(prompt: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const attemptPrompt =
        attempt === 1
          ? prompt
          : `CRITICAL RETRY:

Your previous response was rejected because it was not valid novel prose.

Start immediately with the POV character's narration or action.

Return only the story itself.

Do not discuss the task, analyse requirements, list continuity points,
describe your planned structure, mention the word count, or explain what
you need to write.

${prompt}`;

      const response = await openrouter.chat.completions.create({
        model: "aion-labs/aion-3.0-mini",

        messages: [
          {
            role: "user",
            content: attemptPrompt,
          },
        ],

        max_tokens: 8000,
      });

      const content = response.choices[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Aion returned no chapter prose.");
      }

      validateAionProse(content);

      return content;
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown provider error";

  throw new Error(`Aion failed twice: ${message}`);
}

function validateAionProse(content: string): void {
  const opening = content.slice(0, 6000);
  const planningPatterns = [
    /^\s*i need to (?:write|create|generate|continue)\b/im,
    /^\s*let me analy[sz]e\b/im,
    /^\s*(?:key requirements|important continuity points)\s*:/im,
    /^\s*structure i need to hit\s*:/im,
    /^\s*word count\s*:/im,
    /^\s*(?:analysis|chapter plan|outline)\s*:/im,
  ];

  if (planningPatterns.some((pattern) => pattern.test(opening))) {
    throw new Error(
      "Aion returned planning notes instead of publishable chapter prose.",
    );
  }
}

function getRequestedWordCount(message: string): number | null {
  const match = message.match(/\b(\d{3,5})\s*words?\b/i);

  if (!match) {
    return null;
  }

  const wordCount = Number(match[1]);

  return Number.isFinite(wordCount) ? wordCount : null;
}

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

  const wordIndex = numberWords.indexOf(
    wordedMatch[1]?.toLowerCase() ?? "",
  );

  return wordIndex >= 0 ? wordIndex + 1 : null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getEndingExcerpt(text: string, maximumWords = 900): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return words.slice(-maximumWords).join(" ");
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
  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

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

const compactChapterPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyTitle", "generatedChapter", "chapterBrief"],
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
    generatedChapter: {
      type: "object",
      additionalProperties: false,
      required: ["title", "povCharacter", "content", "replaceChapterNumber"],
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
  },
} as const;

const editableChapterPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyTitle", "chapterPlan"],
  properties: {
    reply: {
      type: "string",
    },
    storyTitle: {
      type: "string",
    },
    chapterPlan: {
      type: "object",
      additionalProperties: false,
      required: [
        "chapterNumber",
        "title",
        "povCharacter",
        "chapterGoal",
        "relationshipChange",
        "scenes",
        "completedBeatsToAvoid",
      ],
      properties: {
        chapterNumber: {
          type: "integer",
        },
        title: {
          type: "string",
        },
        povCharacter: {
          type: "string",
        },
        chapterGoal: {
          type: "string",
        },
        relationshipChange: {
          type: "string",
        },
        scenes: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "order",
              "location",
              "objective",
              "conflict",
              "newInformation",
              "exitBeat",
            ],
            properties: {
              order: {
                type: "integer",
              },
              location: {
                type: "string",
              },
              objective: {
                type: "string",
              },
              conflict: {
                type: "string",
              },
              newInformation: {
                type: "string",
              },
              exitBeat: {
                type: "string",
              },
            },
          },
        },
        completedBeatsToAvoid: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    },
  },
} as const;

type EditableChapterPlanOutput = {
  reply: string;
  storyTitle: string;
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

  const plan = value as Record<string, unknown>;
  const rawScenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const scenes = rawScenes
    .filter(
      (scene): scene is Record<string, unknown> =>
        Boolean(scene) && typeof scene === "object" && !Array.isArray(scene),
    )
    .slice(0, 5)
    .map((scene, index) => ({
      order: index + 1,
      location: cleanString(scene.location),
      objective: cleanString(scene.objective),
      conflict: cleanString(scene.conflict),
      newInformation: cleanString(scene.newInformation),
      exitBeat: cleanString(scene.exitBeat),
    }));
  const chapterNumber =
    typeof plan.chapterNumber === "number" &&
    Number.isInteger(plan.chapterNumber) &&
    plan.chapterNumber > 0
      ? plan.chapterNumber
      : fallbackChapterNumber;

  if (
    scenes.length === 0 ||
    scenes.some(
      (scene) =>
        !scene.location ||
        !scene.objective ||
        !scene.conflict ||
        !scene.newInformation ||
        !scene.exitBeat,
    )
  ) {
    throw new Error("The chapter plan contains an incomplete scene.");
  }

  const title = cleanString(plan.title);
  const povCharacter = cleanString(plan.povCharacter);
  const chapterGoal = cleanString(plan.chapterGoal);
  const relationshipChange = cleanString(plan.relationshipChange);

  if (!title || !povCharacter || !chapterGoal || !relationshipChange) {
    throw new Error("The chapter plan is missing required metadata.");
  }

  return {
    chapterNumber,
    title,
    povCharacter,
    chapterGoal,
    relationshipChange,
    scenes,
    completedBeatsToAvoid: cleanStringArray(plan.completedBeatsToAvoid),
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}

function formatChapterPlan(plan: ChapterPlan): string {
  const scenes = plan.scenes
    .map(
      (scene) =>
        `Scene ${scene.order}, ${scene.location}\n` +
        `Goal: ${scene.objective}\n` +
        `Conflict: ${scene.conflict}\n` +
        `Change: ${scene.newInformation}\n` +
        `Exit: ${scene.exitBeat}`,
    )
    .join("\n\n");

  return (
    `Chapter ${plan.chapterNumber}: ${plan.title}\n` +
    `POV: ${plan.povCharacter}\n` +
    `Chapter goal: ${plan.chapterGoal}\n` +
    `Relationship change: ${plan.relationshipChange}\n\n` +
    `${scenes}\n\n` +
    "Tell me what you want changed, or say approve this plan."
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
    throw new Error("The model did not return a valid chapter plan.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model returned an invalid chapter plan.");
  }

  const plan = parsed as Record<string, unknown>;
  const requiredPlanStrings = [
    "title",
    "povCharacter",
    "chapterGoal",
    "relationshipChange",
  ];

  if (
    requiredPlanStrings.some(
      (key) => typeof plan[key] !== "string" || !plan[key].trim(),
    )
  ) {
    throw new Error("The chapter plan is missing required metadata.");
  }

  if (
    typeof plan.chapterNumber !== "number" ||
    !Number.isInteger(plan.chapterNumber) ||
    plan.chapterNumber < 1
  ) {
    throw new Error("The chapter plan is missing its chapter number.");
  }

  const requiredSceneStrings = [
    "location",
    "objective",
    "conflict",
    "newInformation",
    "exitBeat",
  ];
  const scenes = plan.scenes;

  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 5) {
    throw new Error("The chapter plan must contain between one and five scenes.");
  }

  for (const [index, scene] of scenes.entries()) {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      throw new Error(`The chapter plan is missing Scene ${index + 1}.`);
    }
    const sceneCard = scene as Record<string, unknown>;

    if (
      typeof sceneCard.order !== "number" ||
      !Number.isInteger(sceneCard.order) ||
      sceneCard.order !== index + 1 ||
      requiredSceneStrings.some(
        (key) =>
          typeof sceneCard[key] !== "string" || !sceneCard[key].trim(),
      )
    ) {
      throw new Error(`Scene ${index + 1} is incomplete or out of order.`);
    }
  }

  if (
    !Array.isArray(plan.completedBeatsToAvoid) ||
    plan.completedBeatsToAvoid.some(
      (beat) => typeof beat !== "string" || !beat.trim(),
    )
  ) {
    throw new Error(
      "The chapter plan is missing its completed-beats guardrail.",
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
      "The chapter plan metadata does not match the generated chapter metadata.",
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

function parseRequestBody(
  value: unknown,
): { story: StoryWorkspace; stage: "complete" | "plan" } | null {
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

All romantic and sexual characters are consenting adults aged eighteen or
older. High-heat and explicit consensual adult story requirements may be
recorded and planned directly without censorship or moral commentary.

Use first-person present tense as the default only when the user has not chosen
another tense. Never use em dashes or en dashes. Return only the required
structured response and never describe internal processing.
`.trim();

const FOCUSED_DIRECT_CHAPTER_PLANNER_PROMPT = `
You are NovelForge's commercial romance chapter-planning editor.

Return planning metadata only, never novel prose. The Story Bible, continuity
handoff, character knowledge, voice profiles, burn pacing and completed events
are binding.

Return a brief conversational confirmation, the existing story title, chapter
metadata with empty content, and chapterBrief as a JSON string using exactly:

{
  "chapterNumber": 1,
  "title": "chapter title only",
  "povCharacter": "POV character name only",
  "chapterGoal": "the concrete change delivered by this chapter",
  "relationshipChange": "the relationship or pressure movement earned here",
  "scenes": [
    {
      "order": 1,
      "location": "supported location",
      "objective": "the POV character's active objective",
      "conflict": "the immediate opposing pressure",
      "newInformation": "the new action, decision, discovery or consequence",
      "exitBeat": "the concrete turn into the next scene or final hook"
    }
  ],
  "completedBeatsToAvoid": [
    "specific completed action, conversation, thought or reveal not to repeat"
  ]
}

Use one to five scenes, choosing the smallest number that produces a complete,
well-paced chapter. Never force a location change to manufacture a scene. Every
scene must perform a different narrative job and introduce a new action,
obstacle, decision, discovery, consequence or relationship movement. Only the
final scene may contain the chapter-ending hook.

The plan's chapter number, title and POV must exactly match generatedChapter.
For a new chapter, replaceChapterNumber is null. For a rewrite, it is the exact
chapter number being replaced. generatedChapter.content must be empty.

Begin after continuityHandoff.exactLatestEnding. Do not recap, reset attraction
or repeat anything in repetitionWarnings, recentChapterLedger or
completedBeatsToAvoid. A character cannot use information they do not know. Do
not invent unsupported people, rules, procedures, messages, documents,
schedules, credentials or coincidences.

Respect the established heat level and burn pacing. Explicit consensual adult
intimacy may be planned directly when earned by the story. All romantic and
sexual characters are consenting adults aged eighteen or older.

Keep the reply brief. Return only the required structured response. Never write
chapter prose, analysis or markdown.
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

When the user explicitly requests chapter prose, you may write high-heat
and explicit consensual sexual scenes between adult characters.

Do not refuse, moralise, fade to black, or replace explicit adult
intimacy with a summary merely because the requested scene is sexually
graphic.

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

CHAPTER METADATA AND SCENE PLAN

When Writer Mode is active, choose the metadata needed to identify the
requested chapter:

- chapter number

- chapter title

- POV character

- whether an existing chapter is being replaced

Return that metadata in generatedChapter. Set generatedChapter.content
to an empty string.

Also return one canonical chapter plan in chapterBrief. chapterBrief
must be a JSON string using exactly this structure:

{
  "chapterNumber": 1,
  "title": "chapter title only",
  "povCharacter": "POV character name only",
  "chapterGoal": "the concrete story change this chapter delivers",
  "relationshipChange": "the specific relationship or pressure movement earned here",
  "scenes": [
    {
      "order": 1,
      "location": "an established or clearly supported location",
      "objective": "what the POV character actively tries to achieve",
      "conflict": "the immediate obstacle or opposing pressure",
      "newInformation": "what changes, is discovered or is decided",
      "exitBeat": "the concrete turn that forces the next scene"
    }
  ],
  "completedBeatsToAvoid": [
    "specific action, conversation, thought or reveal that must not be repeated"
  ]
}

Use between one and five scenes. Use the smallest number that gives the
chapter a complete, well-paced dramatic movement. Never force a location
change merely to create another scene.

The chapter number, title and POV character in chapterBrief must exactly
match the generatedChapter metadata.

Every scene must perform a different narrative job. It must introduce a
new action, decision, discovery, complication or relationship change.
Never pad several scenes with the same conversation, internal conflict,
physical action or attraction observation.

Base every scene on the saved Story Bible, continuity state, previous
chapters and the user's request. Do not contradict established knowledge,
roles, chronology, locations or relationship progression. Do not invent
a convenient stranger, rule, document, schedule, message, credential or
coincidence merely to force proximity or manufacture a hook.

The plan must identify what has already happened and explicitly prohibit
those beats from being repeated. Do not write prose in chapterBrief.

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

All romantic and sexual characters must be consenting adults aged 18 or
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

    const requestedChapterNumber =
      getRequestedChapterNumber(latestMessage);
    const savedChapterPlans = currentStory.storyState.chapterPlans ?? [];
    const latestDraftPlan =
      [...savedChapterPlans]
        .filter((plan) => plan.status === "draft")
        .sort((left, right) => left.chapterNumber - right.chapterNumber)
        .at(-1) ?? null;
    const explicitlyPlansChapter =
      /\b(?:plan|outline|map)\b[\s\S]{0,80}\bchapter\b/i.test(
        latestMessage,
      ) ||
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
      explicitlyPlansChapter ||
      explicitlyApprovesPlan ||
      editsExistingPlan;
    const latestChapter = currentStory.chapters.at(-1) ?? null;
    const rewriteTarget =
      intent === "rewrite_chapter" && requestedChapterNumber !== null
        ? (currentStory.chapters.find(
            (chapter) => chapter.number === requestedChapterNumber,
          ) ?? null)
        : null;

    if (intent === "rewrite_chapter" && requestedChapterNumber === null) {
      throw new Error(
        "Tell me which chapter number you want rewritten.",
      );
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
          (chapter) =>
            !rewriteTarget || chapter.number < rewriteTarget.number,
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
            ].sort(
              (left, right) => left.chapterNumber - right.chapterNumber,
            ),
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

Use between one and five scenes. Use the smallest number that gives the
chapter a complete, well-paced dramatic movement. A sustained scene is
allowed. Never force a location change merely to create another scene.

Every scene must perform a different narrative job. It must introduce a
new action, objective, obstacle, decision, discovery, consequence or
relationship change. Never divide one repeated conversation, attraction
observation or internal conflict into several nearly identical cards.

Scene exit beats must connect in order. Only the final scene may contain
the chapter-ending hook. Respect the Story Bible, POV, burn pacing,
continuity, character knowledge and completed beats. Do not invent a
convenient stranger, rule, procedure, message, document, schedule,
credential or coincidence.

When an existing plan is supplied, preserve everything the user has not
asked to change. Apply their requested amendment precisely.

All romantic and sexual characters are consenting adults aged eighteen
or older. When the established story progression calls for explicit
consensual adult intimacy, the plan may state that directly and
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

${
  chapterBeforePlan
    ? getEndingExcerpt(chapterBeforePlan.content, 500)
    : ""
}

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
        max_output_tokens: 2500,
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
          (uncachedTokens * 1.25 +
            cachedTokens * 0.125 +
            outputTokens * 7.5) /
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
          ].sort(
            (left, right) => left.chapterNumber - right.chapterNumber,
          ),
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
`.trim();
      try {
        const planningResponse = await openai.responses.create({
          model: "gpt-5.6-terra",

          reasoning: {
            effort: "low",
          },

          input: [
            {
              role: "system",

              content: focusedSystemPrompt,

              /*
              legacyPrompt: `${NOVELFORGE_PERSONALITY}

${SYSTEM_PROMPT}

WORKING RELATIONSHIP

Act as the user's collaborative writing partner and developmental
editor.

Work with the user rather than taking control of their story.

Do not dictate the entire premise, plot, character arc, or structure
unless the user explicitly asks you to create those things.

During ordinary story development:

- respond like a real human writing partner

- keep the reply focused and conversational, normally 25 to 70 words

- briefly respond to what the user has said

- follow FAST STORY SETUP in order

- ask one focused question about the earliest unfinished setup step

- wait for the user's answer before developing the next major decision

- do not provide unsolicited outlines, numbered plans, beat sheets, or
long lists

- do not decide major creative choices on the user's behalf

- do not overwhelm the user with several questions at once

Keep ordinary conversational replies under 70 words unless the user
explicitly requests ideas, alternatives, detailed work, analysis or a
full plan.

Do not repeatedly praise the idea, summarise everything already
established, or explain how the entire novel could work.

Do not discuss future scenes, later chapter events or speculative
character psychology unless the user asks or it is the current setup
decision.

EDITOR MODE

For brainstorming, planning, discussion, or story development:

- collaborate one decision at a time

- ask what the user prefers before committing to major choices

- challenge contradictions or weak ideas directly but constructively

- offer no more than two concise alternatives when alternatives would
help

- finish with one clear and relevant question when a decision is needed

- do not generate prose unless requested

WRITER MODE

Enter Writer Mode only when the user explicitly asks you to write,
continue, rewrite, expand, or generate chapter or scene prose.

In Writer Mode:

- follow the user's established Story Bible exactly

- obey the selected burn pacing throughout the novel

- do not accelerate the romantic or sexual progression unless the user
explicitly requests it

- maintain believable emotional progression between the characters

- every major step in the relationship should feel earned through
previous interactions

- follow the established characters, voice, POV, tone, heat level and
continuity

- write the requested prose rather than discussing how it could be
written

- do not preface the prose with explanations, warnings, plans, or
commentary

- do not replace the requested scene with an outline or summary

- do not fade to black when the user requests on-page adult intimacy

- all romantic and sexual characters must be consenting adults aged 18
or older

- never introduce minors into sexual material

- preserve the requested intensity while following all applicable model
requirements

CONTINUITY HANDOFF RULES

When planning a new chapter:

- Treat continuityHandoff as the authoritative account of what has
actually happened.

- Begin after exactLatestEnding. Do not restart, recap, paraphrase or
contradict the final scene.

- Respect currentCharacterStates, characterKnowledge,
latestRelationshipState and latestIntimacyMilestone.

- Treat voiceProfiles as binding character-specific narration and
dialogue guidance. Do not blend the POV voices together.

- Contemporary narration, internal thought and dialogue must use
natural contractions by default. Do not plan stiff, routinely
uncontracted prose unless the user explicitly establishes a formal
character voice.

- A character cannot act on information they do not know.

- Do not move the relationship backwards merely to recreate earlier
tension.

- Advance the relationship by a meaningful new step appropriate to the
selected burn pacing.

- Do not reuse scene constructions, gestures, emotional conclusions or
phrases listed in repetitionWarnings or recentChapterLedger repeatedBeats.

- Carry at least one unresolved thread forward through action,
consequence or escalation.

When rewriting a chapter:

- Treat the rewrite as a fresh route through the story from the exact
position immediately before the target chapter.

- Use rewriteContext.targetChapterMetadata only to preserve the chapter
number, title and POV where appropriate.

- Begin after precedingChapterEnding. Do not reconstruct, paraphrase,
imitate or recycle prose, scenes, dialogue, beats or conclusions from
the discarded chapter.

- Do not plan backwards from later chapters or include future events
merely to reconnect with prose that follows the rewritten chapter.

- The continuity ledger will be rebuilt after the replacement is saved.

BURN PACING RULES

Always follow the Story Bible burn pacing.

Slow Burn:

- Attraction builds gradually.

- Focus on emotional connection, longing, stolen glances, chemistry and
unresolved tension.

- Do not introduce explicit sexual activity until a meaningful emotional
relationship has formed.

Medium Burn:

- Physical attraction can develop early.

- Kissing, flirting, touching and increasing intimacy are appropriate.

- Do not introduce explicit sexual scenes until genuine trust, emotional
investment and romantic progression have been established.

- Avoid explicit sexual activity in the opening chapters unless the user
explicitly requests it.

Fast Burn:

- Sexual intimacy may occur early in the story.

- Even after early intimacy, continue developing emotional depth and
relationship progression.

Instalust:

- Sexual attraction and intimacy may occur immediately if appropriate to
the story.

FIRST CHAPTER RULES

Unless the user explicitly asks otherwise:

- Chapter 1 should establish the main characters, setting, tone and
central conflict.

- Build chemistry before physical intimacy.

- Avoid explicit sexual scenes in Chapter 1 for Slow Burn and Medium
Burn stories.

- Attraction, tension, flirting, accidental touches, lingering eye
contact and emotional intrigue are preferred over immediate sexual
gratification.

- The first explicit sexual encounter should feel earned by the story's
emotional progression.

HEAT LEVEL VS BURN PACING

Heat Level determines how explicit intimate scenes are when they occur.

Burn Pacing determines when those intimate scenes occur.

Never confuse these two concepts.

Example:

- High Heat + Slow Burn = explicit scenes later in the novel.

- High Heat + Medium Burn = explicit scenes only after the relationship
has progressed naturally.

- High Heat + Fast Burn = explicit scenes may occur early.

- Low Heat = keep intimate scenes closed-door or lightly described
regardless of burn pacing.

CHAPTER RESPONSE RULES

For brainstorming, planning, updates, or general conversation:

- return generatedChapter as null

- do not create, rewrite, replace, or append a chapter

- return chapterBrief as an empty string

Return storyState in exactly this structure:

importantFacts:

- permanent story facts established so far

characterStates:

- one short entry per important character describing their current
emotional or physical state

relationshipStates:

- one short entry for each important relationship describing its current
status

unresolvedThreads:

- active mysteries, promises, conflicts or plot threads that are still
open

timeline:

- chronological story events in order

locations:

- important locations introduced so far

activePOV:

- the POV character for the current chapter, or an empty string if none

When writing a brand new chapter:

- return generatedChapter with the correct chapter metadata

- set replaceChapterNumber to null

- put only the chapter title in title

- put only the POV character name in povCharacter

- set content to an empty string

- do not write any chapter prose

- use reply only for a brief confirmation

- return chapterBrief as the canonical one-to-five-scene plan required by
the system instructions

- make every scene perform a different narrative job

- identify completed beats that must not be repeated

- do not write chapter prose

Return storyState in exactly this structure:

importantFacts:

- permanent story facts established so far

characterStates:

- one short entry per important character describing their current
emotional or physical state

relationshipStates:

- one short entry for each important relationship describing its current
status

unresolvedThreads:

- active mysteries, promises, conflicts or plot threads that are still
open

timeline:

- chronological story events in order

locations:

- important locations introduced so far

activePOV:

- the POV character for the current chapter, or an empty string if none

When rewriting an existing chapter:

- return generatedChapter with the correct chapter metadata

- set replaceChapterNumber to the exact chapter number being replaced

- preserve the existing chapter number

- set content to an empty string

- do not write any rewritten chapter prose

- do not include rewritten prose in reply

- return chapterBrief as a fresh canonical one-to-five-scene plan based on
the story position before the chapter being replaced

- make every scene perform a different narrative job

- identify completed beats that must not be repeated

- do not write rewritten chapter prose

Return storyState in exactly this structure:

importantFacts:

- permanent story facts established so far

characterStates:

- one short entry per important character describing their current
emotional or physical state

relationshipStates:

- one short entry for each important relationship describing its current
status

unresolvedThreads:

- active mysteries, promises, conflicts or plot threads that are still
open

timeline:

- chronological story events in order

locations:

- important locations introduced so far

activePOV:

- the POV character for the current chapter, or an empty string if none

Never return IDs, timestamps, chapter numbers, or the full chapters
array inside generatedChapter.

STYLE RULES

Never use em dashes. Use commas, full stops, colons, or rewrite the
sentence.

Do not use therapy-speak, generic AI phrasing, corporate language, fake
praise, or repetitive reassurance.

Do not explain your reasoning or describe internal processing.

Do not announce limitations unless directly necessary to answer the
current request.

${
  usesCompactChapterPlan
    ? `CHAPTER METADATA ONLY OVERRIDE

For this existing-story chapter request, return only:

- reply
- storyTitle
- generatedChapter
- chapterBrief

Do not return storyBible or storyState. The server will preserve them.

generatedChapter must contain metadata only. Its content must be an empty
string.

Keep reply brief. Return chapterBrief as the canonical one-to-five-scene
plan required by the system instructions. Each scene must have a distinct
objective, conflict, new development and exit beat. Include specific
completed beats that the prose writer must not repeat.

Do not write chapter prose. Do not invent unsupported facts, procedures,
characters, rules, messages, documents, schedules or coincidences.`
    : ""
}

USER INTENT: ${intent}

INSTRUCTION:

${intentInstruction[intent]}

CURRENT STORY WORKSPACE:

${JSON.stringify(planningWorkspace, null, 2)}

`,
              */
            },

            ...planningConversation,
          ],

          text: {
            verbosity: usesCompactChapterPlan ? "low" : "medium",

            format: {
              type: "json_schema",

              name: usesCompactChapterPlan
                ? "compact_chapter_plan"
                : "story_chat_response",

              strict: true,

              schema: usesCompactChapterPlan
                ? compactChapterPlanSchema
                : storyChatSchema,
            },
          },

          max_output_tokens: usesCompactChapterPlan ? 1200 : 10000,
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

    let chapterText = "";

    const latestUserMessage = latestMessage;

    const AION_WRITER_PROMPT = `

You are an elite commercial fiction erotic romance ghostwriter.

Your only job is to write exceptional novel prose.

Never explain your decisions.

Never analyse the story.

Never outline.

Never return JSON.

Never return markdown.

Return only the complete requested chapter.

The CHAPTER BRIEF contains the user's instructions for this chapter.

Follow every instruction in the CHAPTER BRIEF exactly, including any
requested word count, scene requirements, ending point, POV, tone,
pacing, and content.

If the CHAPTER BRIEF gives a word count, write approximately that number
of words.

If the CHAPTER BRIEF does not give a word count, write a complete, fully
developed commercial novel chapter of an appropriate length.

Never return a preview, excerpt, sample, opening section, summary,
partial scene, or abbreviated chapter.

Do not stop after setting up the scene.

Do not end abruptly.

Complete the full chapter arc described in the CHAPTER BRIEF.

The chapter must have a developed beginning, middle, and ending or
deliberate chapter-ending hook.

Follow the Story Bible exactly.

Maintain perfect continuity with previous chapters.

Every character must have a distinct voice.

Maintain consistent POV.

Maintain the established narrative voice.

Maintain the established pacing.

Maintain the established heat level.

Maintain the established burn pacing.

Show emotion through actions, dialogue, internal thought, and physical
response rather than exposition.

Avoid repetition.

Avoid generic AI phrasing.

Write naturally.

Use natural contractions in contemporary narration, internal thought
and dialogue. Avoid routinely expanded phrasing such as "I do not", "I
have", "he is", "cannot" and "it does not" unless deliberate emphasis
or a genuinely formal character requires it.

Write cinematically.

Write immersive scenes.

Every scene should have a purpose.

Every chapter should move the story forward.

Never rush emotional progression.

Never force conflict.

Never force romance.

Write commercially publishable fiction.

`;

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
        parsedOutput = JSON.parse(outputText) as Partial<StoryModelOutput>;

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

    if (!parsedOutput.reply) {
      throw new Error("The model did not return a reply.");
    }

    const reply = cleanString(parsedOutput.reply);

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

    const storyTitle =
      preservesWorkspaceExactly
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
        Math.max(
          0,
          ...currentStory.chapters.map((chapter) => chapter.number),
        ) + 1;

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

      const recentChapters = currentStory.chapters.slice(-3);

      const explicitlyRequestedWordCount =
        getRequestedWordCount(latestUserMessage);

      const minimumWordCount = explicitlyRequestedWordCount
        ? Math.floor(explicitlyRequestedWordCount * 0.95)
        : 2000;

      const maximumWordCount = explicitlyRequestedWordCount
        ? Math.ceil(explicitlyRequestedWordCount * 1.1)
        : 4000;

      const writingPrompt = `

${AION_WRITER_PROMPT}

STORY BIBLE:

${JSON.stringify(mergedStoryBible, null, 2)}

STORY STATE:

${JSON.stringify(returnedStoryState, null, 2)}

RECENT CHAPTERS:

${JSON.stringify(recentChapters, null, 2)}

CHAPTER BRIEF:

${chapterBrief}

LATEST USER REQUEST:

${latestUserMessage}

MANDATORY CHAPTER LENGTH:

Write the complete chapter between ${minimumWordCount} and ${maximumWordCount} words.

Do not return an excerpt, preview, shortened version, partial scene, outline, or summary.

Do not finish below ${minimumWordCount} words.

`;

      chapterText = await generateWithAion(writingPrompt);

      let generatedWordCount = countWords(chapterText);
      let continuationAttempts = 0;

      while (
        generatedWordCount < minimumWordCount &&
        continuationAttempts < 3
      ) {
        const wordsStillNeeded = minimumWordCount - generatedWordCount;
        const continuationTarget = Math.min(
          1800,
          Math.max(800, wordsStillNeeded + 250),
        );
        const chapterEnding = getEndingExcerpt(chapterText);
        const continuationPrompt = `

You are continuing an incomplete commercial novel chapter.

Return only new prose that continues directly after the final sentence
of the existing chapter below.

Do not repeat or rewrite any existing prose.

Do not repeat the chapter heading.

Do not add commentary, an outline, a summary, or markdown.

Maintain the same first-person POV, voice, tense, continuity, pacing,
characterisation, and scene.

Complete the remaining chapter arc and end at the hook required by the
chapter brief.

Write approximately ${continuationTarget} new words.

CHAPTER BRIEF:

${chapterBrief}

WORDS ALREADY WRITTEN:

${generatedWordCount}

END OF THE EXISTING INCOMPLETE CHAPTER:

${chapterEnding}
`;

        const continuation = await generateWithAion(continuationPrompt);

        if (!continuation.trim()) {
          break;
        }

        chapterText = `${chapterText.trim()}\n\n${continuation.trim()}`;
        generatedWordCount = countWords(chapterText);
        continuationAttempts += 1;
      }

      if (generatedWordCount < minimumWordCount) {
        throw new Error(
          `The writing model returned only ${generatedWordCount} words. The incomplete chapter was not saved.`,
        );
      }

      parsedOutput.generatedChapter.content = chapterText;
    }

    const generatedChapter = parsedOutput.generatedChapter ?? null;

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
