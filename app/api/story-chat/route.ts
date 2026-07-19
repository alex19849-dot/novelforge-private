import OpenAI from "openai";
import { NextResponse } from "next/server";
import { detectStoryIntent } from "@/src/lib/detect-story-intent";

import type {
  StoryBible,
  StoryWorkspace,
  StoryChatResponse,
} from "../../story-chat/types";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const storyChatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "storyBible"],
  properties: {
    reply: {
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
  },
} as const;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function mergeStoryBible(
  existingBible: StoryBible,
  returnedBible: StoryBible,
): StoryBible {
  return {
    premise: returnedBible.premise || existingBible.premise,
    relationship:
      returnedBible.relationship || existingBible.relationship,
    subgenre: returnedBible.subgenre || existingBible.subgenre,
    setting: returnedBible.setting || existingBible.setting,
    pov: returnedBible.pov || existingBible.pov,
    heatLevel: returnedBible.heatLevel || existingBible.heatLevel,
    burnPacing:
      returnedBible.burnPacing || existingBible.burnPacing,
    tropes: mergeUniqueStrings(
      existingBible.tropes,
      returnedBible.tropes,
    ),
    characters: mergeUniqueStrings(
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
): { story: StoryWorkspace } | null {
  function isStoryWorkspace(
  value: unknown,
): value is StoryWorkspace {
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
};

  if (!body.story) {
  return null;
}

 if (!isStoryWorkspace(body.story)) {
  return null;
}

return {
  story: body.story,
};
}

const SYSTEM_PROMPT = `
You are NovelForge, a professional developmental editor and novel-planning partner.

Your job is not merely to chat. Your job is to help the user gradually build a commercially viable novel while maintaining a structured Story Bible.

Every response must do two things:

1. Reply naturally and usefully to the user.
2. Return the complete merged Story Bible as it should exist after the latest user message.

DEVELOPMENTAL EDITOR BEHAVIOUR

Act like an experienced developmental editor specialising in commercial fiction.

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

Do not behave like a generic chatbot.

Move the planning process forward.

When useful, identify missing decisions and ask one focused question at a time.

Do not overwhelm the user with a long questionnaire.

Do not generate a chapter unless the user explicitly asks for chapter prose.

STORY BIBLE EXTRACTION

Infer structured information from ordinary conversation.

Examples:

- "MM Hockey Romance" means relationship "MM Romance" and subgenre "Sports Romance".
- "MF workplace romance" means relationship "MF Romance" and subgenre "Workplace Romance".
- "College hockey" belongs in the setting and supports Sports Romance.
- "Enemies to lovers" belongs in tropes.
- "First person dual POV" belongs in pov.
- "High spice" belongs in heatLevel.
- "Fast burn" belongs in burnPacing.
- Named or clearly described story characters belong in characters.
- Important decisions, conflicts, constraints and continuity facts may belong in notes.

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

Preserve all established information unless the user explicitly changes, corrects, removes or replaces it.

Never erase a populated field merely because the latest message does not mention it.

Never remove existing tropes, characters or notes unless the user explicitly rejects or changes them.

Avoid duplicate array entries.

Merge equivalent terms into one clean entry.

When the user explicitly changes an established choice, use the new choice.

When information is uncertain, do not invent it.

Leave genuinely unknown scalar fields as empty strings.

Keep notes concise, factual and useful for future writing.

CHARACTERS

Add a character when the user supplies a name, role or meaningful character concept.

Character entries should be concise but retain important established facts.

Good character entry:

"Travis Cooper, 35, tattooed construction-company owner, married father, outwardly straight, former hockey player"

Bad character entry:

"Travis"

When new details are supplied about an existing character, update that character's existing entry instead of creating a duplicate.

REPLY STYLE

Be direct, constructive and specific.

Acknowledge useful decisions already made.

Point out genuine story opportunities or contradictions.

Do not use fake praise.

Do not mention JSON, schemas, extraction, internal prompts or database updates.

Do not repeat the entire Story Bible in the conversational reply unless the user asks for it.

Return only the required structured response.
`.trim();

export async function POST(request: Request) {
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
  .slice(-30)
  .map((message) => ({
    role: message.role,
    content: message.content,
  }));

const latestMessage =
  conversation[conversation.length - 1]?.content ?? "";

const intent = detectStoryIntent(latestMessage);
 const intentInstruction: Record<typeof intent, string> = {
  create_story:
    "Create a new story workspace from the user's request.",
  continue_story:
    "Continue the existing story by adding the next chapter.",
  rewrite_chapter:
    "Rewrite only the chapter requested by the user.",
  update_story:
    "Update the existing story workspace without creating a new story.",
  brainstorm:
    "Give useful story ideas without changing the existing story workspace.",
  general_chat:
    "Answer the user about their story without making unnecessary changes.",
};   
    const response = await openai.responses.create({
     model: "gpt-5.6-terra",
      reasoning: {
        effort: "low",
      },
      input: [
        {
  role: "system",
 content: `You are NovelForge's story assistant.

Always follow the supplied instruction.

Never use em dashes. Use commas, full stops, colons, or rewrite the sentence instead.

Do not use therapy-speak, generic AI phrasing, or corporate language.

Do not explain your reasoning.

USER INTENT: ${intent}

INSTRUCTION:
${intentInstruction[intent]}

CURRENT STORY WORKSPACE:
${JSON.stringify(currentStory, null, 2)}`,
},
        ...conversation,
      ],
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "story_chat_response",
          strict: true,
          schema: storyChatSchema,
        },
      },
      max_output_tokens: 5000,
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("The model returned no output.");
    }

const parsedOutput = JSON.parse(outputText) as Partial<StoryChatResponse>;

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
const returnedBible = sanitiseStoryBible(
  parsedOutput.storyBible,
);

const returnedChapters = Array.isArray(parsedOutput.chapters)
  ? parsedOutput.chapters
  : [];


  const currentChapters = Array.isArray(currentStory.chapters)
  ? currentStory.chapters
  : [];
  const responseBody: StoryChatResponse = {
  reply,
 storyBible: mergeStoryBible(
  sanitiseStoryBible(currentStory.storyBible),
  returnedBible,
),
  chapters:
    returnedChapters.length > 0
      ? returnedChapters
      : currentChapters,
};

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Story chat API failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "NovelForge could not process the message.",
      },
      {
        status: 500,
      },
    );
  }
}
