import OpenAI from "openai";
import { NextResponse } from "next/server";
import { detectStoryIntent } from "../../../src/lib/detect-story-intent";

import type {
  StoryBible,
  StoryWorkspace,
  StoryChatResponse,
} from "../../story-chat/types";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL:
    process.env.OPENROUTER_BASE_URL ??
    "https://openrouter.ai/api/v1",
});

async function generateWithAion(prompt: string) {
  const response = await openrouter.chat.completions.create({
    model: "aion-labs/aion-3.0-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 5000,
  });

  const content = response.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Aion returned no chapter prose.");
  }

  return content;
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

const storyChatSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "storyBible",
    "generatedChapter",
  ],
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

function getCharacterName(character: string): string {
  return character.split(",")[0]?.trim().toLowerCase() ?? "";
}

function mergeCharacters(
  existingCharacters: string[],
  returnedCharacters: string[],
): string[] {
  const returnedNamedCharacters = returnedCharacters.filter(
    (character) =>
      !getCharacterName(character).startsWith("unnamed"),
  );

  const hasNamedCharacters =
    returnedNamedCharacters.length > 0;

  const merged = new Map<string, string>();

  for (const character of existingCharacters) {
    const name = getCharacterName(character);

    if (
      !name ||
      (hasNamedCharacters && name.startsWith("unnamed"))
    ) {
      continue;
    }

    merged.set(name, character.trim());
  }

  for (const character of returnedCharacters) {
    const name = getCharacterName(character);

    if (!name) {
      continue;
    }

    if (
      hasNamedCharacters &&
      name.startsWith("unnamed")
    ) {
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
const NOVELFORGE_PERSONALITY = `
You are NovelForge.

You are the user's long-term writing partner.

Speak naturally like an intelligent British friend in their late 30s or early 40s.

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

Your job is to help create commercially successful novels, not to impress the user with long explanations.

Assume the user already understands writing terminology.

Avoid corporate language, motivational clichés, and generic AI phrases.

Never say:
"Great choice."
"Excellent idea."
"That's a compelling direction."
"As an AI..."
"I'd be happy to help."

Instead, respond like an experienced writing mate who's been doing this for years.

If the user is obviously overthinking something, tell them and get them moving again.
`;
const SYSTEM_PROMPT = `
You are NovelForge, a professional developmental editor and novel-planning partner.

Your job is not merely to chat. Your job is to help the user gradually build a commercially viable novel while maintaining a structured Story Bible.

Every response must do three things:

1. Reply naturally and usefully to the user.
2. Return the complete merged Story Bible as it should exist after the latest user message.
3. Return the complete chapters array.

CHAPTER ARRAY RULES

Always return the full current chapters array.

For normal conversation, brainstorming, planning, or Story Bible updates, return the existing chapters unchanged.

When the user asks for a new chapter, append exactly one new chapter to the existing chapters array.

When the user asks to continue the story, append exactly one new chapter with the next chapter number.

When the user asks to rewrite a chapter, replace only the requested chapter and preserve every other chapter unchanged.

Never place generated chapter prose only inside the conversational reply.

Each chapter must include:

- id
- number
- title
- povCharacter
- content
- createdAt
- updatedAt

Use a new unique string id for a newly generated chapter.

Use ISO 8601 date strings for createdAt and updatedAt.

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

ADULT CONTENT RULES

All characters involved in romantic or sexual content must be consenting adults aged 18 or older.

When the user explicitly requests chapter prose, you may write high-heat and explicit consensual sexual scenes between adult characters.

Do not refuse, moralise, fade to black, or replace explicit adult intimacy with a summary merely because the requested scene is sexually graphic.

Never include minors.

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

let intent = detectStoryIntent(latestMessage);

if (
  /\b(rewrite|rewriting|rewrite this|rewrite chapter)\b/i.test(
    latestMessage,
  )
) {
  intent = "rewrite_chapter";
}
 const intentInstruction: Record<typeof intent, string> = {
  create_story:
  "Create a brand new story from the user's request. Generate a complete story bible and opening chapter. Do not reuse, modify, or merge with the current story workspace.",
  continue_story:
  "Continue the existing story by writing the next chapter only. Update the story bible only if genuinely necessary to preserve continuity. Do not rewrite or replace existing chapters.",
 rewrite_chapter:
  "Rewrite only the chapter or passage explicitly requested by the user. Preserve the overall story, chronology, characters, and all other chapters unless the user specifically asks for wider changes. Update the story bible only if the rewrite introduces permanent story changes.",
  update_story:
  "Apply only the specific permanent changes requested by the user. Update the story bible, chapters, characters, or story state only where necessary. Preserve everything else exactly as it is. Never make unrelated edits or invent additional changes.",
 brainstorm:
  "Give useful story ideas only. Do not change the story bible, chapters, timeline, world, notes, or any other part of the current story workspace.",
 general_chat:
  "Answer the user about their story only. Do not change the story bible, chapters, timeline, world, notes, or any other part of the current story workspace.",
};   
    const isWriterMode =
  intent === "create_story" ||
  intent === "continue_story" ||
  intent === "rewrite_chapter" ||
  /\b(write|rewrite|rewriting|continue|generate|expand)\b/i.test(
    latestMessage,
  );
    
    const response = await openai.responses.create({
  model: "gpt-5.5",
      reasoning: {
        effort: "low",
      },
      input: [
      {
  role: "system",
  content: `${SYSTEM_PROMPT}

WORKING RELATIONSHIP

Act as the user's collaborative writing partner and developmental editor.

Work with the user rather than taking control of their story.

Do not dictate the entire premise, plot, character arc, or structure unless the user explicitly asks you to create those things.

During ordinary story development:

- respond like a real human writing partner
- keep the reply focused and conversational
- briefly respond to what the user has said
- point out one genuinely useful consideration when necessary
- ask one focused question about what direction the user wants to take next
- wait for the user's answer before developing the next major decision
- do not provide unsolicited outlines, numbered plans, beat sheets, or long lists
- do not decide major creative choices on the user's behalf
- do not overwhelm the user with several questions at once

Keep ordinary conversational replies under 150 words unless the user explicitly requests detailed work.

Do not repeatedly praise the idea, summarise everything already established, or explain how the entire novel could work.

EDITOR MODE

For brainstorming, planning, discussion, or story development:

- collaborate one decision at a time
- ask what the user prefers before committing to major choices
- challenge contradictions or weak ideas directly but constructively
- offer no more than two concise alternatives when alternatives would help
- finish with one clear and relevant question when a decision is needed
- do not generate prose unless requested

WRITER MODE

Enter Writer Mode only when the user explicitly asks you to write, continue, rewrite, expand, or generate chapter or scene prose.

In Writer Mode:

- follow the user's established Story Bible exactly
- obey the selected burn pacing throughout the novel
- do not accelerate the romantic or sexual progression unless the user explicitly requests it
- maintain believable emotional progression between the characters
- every major step in the relationship should feel earned through previous interactions
- follow the established characters, voice, POV, tone, heat level and continuity
- write the requested prose rather than discussing how it could be written
- do not preface the prose with explanations, warnings, plans, or commentary
- do not replace the requested scene with an outline or summary
- do not fade to black when the user requests on-page adult intimacy
- all romantic and sexual characters must be consenting adults aged 18 or older
- never introduce minors into sexual material
- preserve the requested intensity while following all applicable model requirements

BURN PACING RULES

Always follow the Story Bible burn pacing.

Slow Burn:
- Attraction builds gradually.
- Focus on emotional connection, longing, stolen glances, chemistry and unresolved tension.
- Do not introduce explicit sexual activity until a meaningful emotional relationship has formed.

Medium Burn:
- Physical attraction can develop early.
- Kissing, flirting, touching and increasing intimacy are appropriate.
- Do not introduce explicit sexual scenes until genuine trust, emotional investment and romantic progression have been established.
- Avoid explicit sexual activity in the opening chapters unless the user explicitly requests it.

Fast Burn:
- Sexual intimacy may occur early in the story.
- Even after early intimacy, continue developing emotional depth and relationship progression.

Instalust:
- Sexual attraction and intimacy may occur immediately if appropriate to the story.

FIRST CHAPTER RULES

Unless the user explicitly asks otherwise:

- Chapter 1 should establish the main characters, setting, tone and central conflict.
- Build chemistry before physical intimacy.
- Avoid explicit sexual scenes in Chapter 1 for Slow Burn and Medium Burn stories.
- Attraction, tension, flirting, accidental touches, lingering eye contact and emotional intrigue are preferred over immediate sexual gratification.
- The first explicit sexual encounter should feel earned by the story's emotional progression.

HEAT LEVEL VS BURN PACING

Heat Level determines how explicit intimate scenes are when they occur.

Burn Pacing determines when those intimate scenes occur.

Never confuse these two concepts.

Example:

- High Heat + Slow Burn = explicit scenes later in the novel.
- High Heat + Medium Burn = explicit scenes only after the relationship has progressed naturally.
- High Heat + Fast Burn = explicit scenes may occur early.
- Low Heat = keep intimate scenes closed-door or lightly described regardless of burn pacing.

CHAPTER RESPONSE RULES

For brainstorming, planning, updates, or general conversation:

- return generatedChapter as null
- do not create, rewrite, replace, or append a chapter

When writing a brand new chapter:

- return generatedChapter with the correct chapter metadata
- set replaceChapterNumber to null
- put only the chapter title in title
- put only the POV character name in povCharacter
- set content to an empty string
- do not write any chapter prose
- use reply only for a brief confirmation

When rewriting an existing chapter:

- return generatedChapter with the correct chapter metadata
- set replaceChapterNumber to the exact chapter number being replaced
- preserve the existing chapter number
- set content to an empty string
- do not write any rewritten chapter prose
- do not include rewritten prose in reply

Never return IDs, timestamps, chapter numbers, or the full chapters array inside generatedChapter.

STYLE RULES

Never use em dashes. Use commas, full stops, colons, or rewrite the sentence.

Do not use therapy-speak, generic AI phrasing, corporate language, fake praise, or repetitive reassurance.

Do not explain your reasoning or describe internal processing.

Do not announce limitations unless directly necessary to answer the current request.

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

let chapterText = "";    
if (isWriterMode) {
  const latestUserMessage = latestMessage;

 chapterText = await generateWithAion(`
${SYSTEM_PROMPT}

WRITER MODE

Follow every Writer Mode and Style Rule exactly as defined above.

USER INTENT:
${intent}

INSTRUCTION:
${intentInstruction[intent]}

CURRENT STORY WORKSPACE:
${JSON.stringify(currentStory, null, 2)}

USER REQUEST:
${latestUserMessage}
CRITICAL WRITING RULES

Respect the Story Bible exactly.

The selected burn pacing is mandatory.

Do not introduce explicit sexual activity earlier than the burn pacing allows.

High Heat describes how explicit intimate scenes are when they occur.
It does NOT mean they should happen immediately.

Every chapter should advance the emotional relationship naturally.

Do not skip relationship milestones.

Do not manufacture sexual tension if the current chapter should be focused on plot, character development, conflict or world-building.

If this is Chapter 1 of a Medium Burn or Slow Burn story, establish the characters, setting and chemistry before any explicit sexual content.

Return only the requested chapter prose.

Do not output JSON.
Do not output markdown.
Do not explain your decisions.
Do not include notes before or after the chapter.
`);

}
    
    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("The model returned no output.");
    }

const parsedOutput = JSON.parse(outputText) as Partial<StoryChatResponse>;
if (isWriterMode && parsedOutput.generatedChapter) {
  parsedOutput.generatedChapter.content = chapterText;
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
const returnedBible = sanitiseStoryBible(
  parsedOutput.storyBible,
);

const generatedChapter = parsedOutput.generatedChapter ?? null;

const currentChapters = Array.isArray(currentStory.chapters)
  ? currentStory.chapters
  : [];
 const now = new Date().toISOString();

let updatedChapters = currentChapters;

if (generatedChapter) {
  const replacementNumber =
    generatedChapter.replaceChapterNumber;

  if (replacementNumber !== null) {
    updatedChapters = currentChapters.map((chapter) =>
      chapter.number === replacementNumber
        ? {
            ...chapter,
            title:
              cleanString(generatedChapter.title) ||
              chapter.title,
            povCharacter:
              cleanString(generatedChapter.povCharacter) ||
              chapter.povCharacter,
            content: cleanString(generatedChapter.content),
            updatedAt: now,
          }
        : chapter,
    );
  } else {
    const nextChapterNumber =
      currentChapters.length > 0
        ? Math.max(
            ...currentChapters.map(
              (chapter) => chapter.number,
            ),
          ) + 1
        : 1;

    updatedChapters = [
      ...currentChapters,
      {
        id: crypto.randomUUID(),
        number: nextChapterNumber,
        title:
          cleanString(generatedChapter.title) ||
          `Chapter ${nextChapterNumber}`,
        povCharacter: cleanString(
          generatedChapter.povCharacter,
        ),
        content: cleanString(generatedChapter.content),
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

const responseBody: StoryChatResponse = {
  reply,
  intent,
  storyBible: mergeStoryBible(
    sanitiseStoryBible(currentStory.storyBible),
    returnedBible,
  ),
  generatedChapter,
  chapters: updatedChapters,
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
