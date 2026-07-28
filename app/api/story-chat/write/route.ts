import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const maxDuration = 180;

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

function getEndingExcerpt(text: string, maximumWords = 900): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return words.slice(-maximumWords).join(" ");
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
    .slice(-2);
}

function getNarrativeStyle(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "Follow the exact POV and tense stated in the chapter brief.";
  }

  const bible = value as Record<string, unknown>;
  const styleParts = [
    cleanString(bible.pov),
    cleanString(bible.tense),
    cleanString(bible.narrativeTense),
  ].filter(Boolean);

  return styleParts.length > 0
    ? styleParts.join(", ")
    : "Follow the exact POV and tense stated in the chapter brief.";
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

  cleaned = cleaned
    .replace(/\\"/g, '"')
    .replace(/\\([“”‘’])/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/u, "")
    .trim();

  return cleaned;
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

const WRITER_PROMPT = `
You are an elite commercial romance ghostwriter.

Return only publishable novel prose.

Never explain, analyse, outline, summarise, list requirements, discuss
word count, mention the prompt, or describe what you are about to write.

Start immediately with the POV character's narration, dialogue or action.

Do not include a chapter number, chapter title, POV heading or markdown.

Follow the supplied Story Bible, story state and chapter brief exactly.

Treat storyState.voiceProfiles as binding. The POV character's
narrative rhythm, vocabulary, humour, emotional deflection, sensory
focus, dialogue and internal thought must match their own profile and
must not sound interchangeable with another POV character.

Maintain first-person POV, tense, voice, continuity, pacing, heat level
and burn pacing.

Write immersive scenes with a developed beginning, middle and ending or
the deliberate hook required by the chapter brief.

All romantic or sexual characters are consenting adults aged 18 or older.

Never use em dashes or en dashes.
`.trim();

export async function POST(request: Request) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as WriterRequest;
    const chapterBrief = cleanString(body.chapterBrief);
    const latestUserMessage = cleanString(body.latestUserMessage);
    const existingDraft = cleanString(body.existingDraft);
    const recentChapters = cleanRecentChapters(body.recentChapters);
    const narrativeStyle = getNarrativeStyle(body.storyBible);
    const minimumWordCount = getWordCount(body.minimumWordCount, 3000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      getWordCount(body.maximumWordCount, 4000),
    );

    if (!chapterBrief) {
      return NextResponse.json(
        { error: "A chapter brief is required before writing can begin." },
        { status: 400 },
      );
    }

    const existingWordCount = countWords(existingDraft);
    const wordsStillNeeded = Math.max(0, minimumWordCount - existingWordCount);

    const prompt = existingDraft
      ? `
${WRITER_PROMPT}

Continue an incomplete chapter directly after its final sentence.

Return only new prose. Do not repeat or rewrite existing prose.

MANDATORY NARRATIVE STYLE:

${narrativeStyle}

Do not switch POV person or narrative tense.

STORY BIBLE:

${JSON.stringify(body.storyBible ?? {}, null, 2)}

ACTUAL CONTINUITY LEDGER:

${JSON.stringify(body.storyState ?? {}, null, 2)}

The existing draft contains ${existingWordCount} words.

Write approximately ${Math.min(1800, Math.max(800, wordsStillNeeded + 250))} new words.

Complete the remaining chapter arc and finish at the hook required by
the chapter brief.

CHAPTER BRIEF:

${chapterBrief}

END OF THE EXISTING DRAFT:

${getEndingExcerpt(existingDraft)}
`
      : `
${WRITER_PROMPT}

MANDATORY NARRATIVE STYLE:

${narrativeStyle}

Do not switch POV person or narrative tense.

STORY BIBLE:

${JSON.stringify(body.storyBible ?? {}, null, 2)}

STORY STATE:

${JSON.stringify(body.storyState ?? {}, null, 2)}

RECENT CHAPTERS:

${JSON.stringify(recentChapters, null, 2)}

CHAPTER BRIEF:

${chapterBrief}

LATEST USER REQUEST:

${latestUserMessage}

Write the complete chapter between ${minimumWordCount} and ${maximumWordCount} words.
`;

    const response = await openrouter.chat.completions.create({
      model: "aion-labs/aion-3.0-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 8000,
    });

    const rawProse = response.choices[0]?.message?.content;

    if (!rawProse?.trim()) {
      throw new Error("Aion returned no chapter prose.");
    }

    const prose = cleanGeneratedProse(rawProse);

    validateProse(prose);

    const totalWordCount = existingWordCount + countWords(prose);

    return NextResponse.json({
      prose,
      totalWordCount,
      isComplete: totalWordCount >= minimumWordCount,
    });
  } catch (error) {
    console.error("STORY WRITER FAILED:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The writing model failed.",
      },
      { status: 502 },
    );
  }
}
