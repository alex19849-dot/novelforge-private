import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

const WRITING_MODEL = "mistralai/mistral-large-2512";

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

type GenerationStage = "opening" | "middle" | "final";

type SceneCard = {
  location: string;
  objective: string;
  conflict: string;
  newInformation: string;
  exitBeat: string;
};

type ChapterScenePlan = {
  chapterGoal: string;
  relationshipChange: string;
  scenes: SceneCard[];
  completedBeatsToAvoid: string[];
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
  generationStage?: unknown;
  sceneIndex?: unknown;
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

function getGenerationStage(value: unknown): GenerationStage {
  return value === "middle" || value === "final" ? value : "opening";
}

function getSceneWordRange(sceneCount: number): string {
  if (sceneCount === 1) {
    return "2200 to 2800";
  }

  if (sceneCount === 2) {
    return "1100 to 1400";
  }

  if (sceneCount === 3) {
    return "800 to 1000";
  }

  if (sceneCount === 4) {
    return "600 to 800";
  }

  return "500 to 700";
}

function parseChapterScenePlan(value: unknown): ChapterScenePlan {
  const rawPlan = cleanString(value);
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPlan);
  } catch {
    throw new Error(
      "The chapter is missing its validated scene plan.",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The chapter scene plan is invalid.");
  }

  const plan = parsed as Record<string, unknown>;
  const sceneFieldKeys = [
    "location",
    "objective",
    "conflict",
    "newInformation",
    "exitBeat",
  ] as const;
  const rawScenes = Array.isArray(plan.scenes)
    ? plan.scenes.slice(0, 5)
    : [plan.scene1, plan.scene2, plan.scene3];
  const scenes: SceneCard[] = [];

  for (const [index, rawScene] of rawScenes.entries()) {
    if (
      !rawScene ||
      typeof rawScene !== "object" ||
      Array.isArray(rawScene)
    ) {
      throw new Error(`The chapter scene plan is missing Scene ${index + 1}.`);
    }

    const sceneRecord = rawScene as Record<string, unknown>;
    const scene = {} as SceneCard;

    for (const fieldKey of sceneFieldKeys) {
      const fieldValue = cleanString(sceneRecord[fieldKey]);

      if (!fieldValue) {
        throw new Error(`Scene ${index + 1} is missing ${fieldKey}.`);
      }

      scene[fieldKey] = fieldValue;
    }

    scenes.push(scene);
  }

  const chapterGoal = cleanString(plan.chapterGoal);
  const relationshipChange = cleanString(plan.relationshipChange);
  const completedBeatsToAvoid = Array.isArray(plan.completedBeatsToAvoid)
    ? plan.completedBeatsToAvoid.map(cleanString).filter(Boolean)
    : [];

  if (!chapterGoal || !relationshipChange || scenes.length === 0) {
    throw new Error("The chapter scene plan is missing its narrative goal.");
  }

  return {
    chapterGoal,
    relationshipChange,
    scenes,
    completedBeatsToAvoid,
  };
}

function getDraftTail(text: string, maximumWords = 600): string {
  const words = text.trim().split(/\s+/);

  return words.slice(-maximumWords).join(" ");
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
    .replace(/\s*[—–]\s*/g, ", ")
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
      "The writing model returned planning notes instead of publishable chapter prose.",
    );
  }

  if (/^\s*chapter\s+\d+\b/im.test(content)) {
    throw new Error(
      "The writing model included a chapter heading inside the prose. The chapter was not saved.",
    );
  }

  if (/^\s{0,3}#{1,6}\s+\S+/mu.test(content) || /```/.test(content)) {
    throw new Error(
      "The writing model returned markdown instead of clean novel prose. The chapter was not saved.",
    );
  }

  if (/\\["“”‘’]/u.test(content)) {
    throw new Error(
      "The writing model returned broken escaped quotation marks. The chapter was not saved.",
    );
  }

}

function getOpeningPrompt(input: {
  storyBible: unknown;
  storyState: unknown;
  recentChapters: RecentChapter[];
  scenePlan: ChapterScenePlan;
  latestUserMessage: string;
  narrativeStyle: string;
}): string {
  const isOnlyScene = input.scenePlan.scenes.length === 1;
  const endingInstruction = isOnlyScene
    ? `This is the chapter's only scene. Reach its exit beat once, use that
as the chapter's single ending hook, then stop immediately. Do not add an
aftermath, closing reflection or second ending.`
    : `Write only the assigned scene card. Do not borrow actions, conflict,
information or exit beats from later planned scenes. Reach Scene One's exit
beat once, then stop. Do not create a chapter ending or closing reflection.`;

  return `
You are NovelForge, a skilled commercial romance novelist.

Write SCENE ONE of one immersive commercial romance chapter.
Write approximately ${getSceneWordRange(input.scenePlan.scenes.length)} words.
Return only finished novel prose.
Do not include a chapter number, title, POV heading, notes, analysis,
outline, markdown or commentary.

Use ${input.narrativeStyle}

${endingInstruction}

The Story Bible, continuity and plan are binding. Characters must not know
information they have not learned. Do not reset attraction, conflict, trust or
intimacy. Use natural contractions and a distinct character voice.

Never repeat any completed beat listed below. Every paragraph must move the
scene's action, decision, knowledge, risk or relationship. Avoid generic
attraction shorthand, repetitive internal summary, therapy-speak, purple prose,
stock reactions and interchangeable banter.

Do not invent an unsupported stranger, rule, procedure, document, message,
schedule, credential or coincidence. Never use em dashes or en dashes.

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. When established
progression calls for explicit consensual adult intimacy, write it directly
without censorship or fade to black. Do not insert intimacy before it is earned.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY STATE

${JSON.stringify(getWritingContinuityState(input.storyState), null, 2)}

PREVIOUS CHAPTER

${JSON.stringify(input.recentChapters.at(-1) ?? null, null, 2)}

CHAPTER GOAL

${input.scenePlan.chapterGoal}

RELATIONSHIP CHANGE

${input.scenePlan.relationshipChange}

SCENE ONE CARD

${JSON.stringify(input.scenePlan.scenes[0], null, 2)}

COMPLETED BEATS THAT MUST NOT BE REPEATED

${JSON.stringify(input.scenePlan.completedBeatsToAvoid, null, 2)}

USER'S CURRENT CHAPTER REQUEST

${input.latestUserMessage || "Write the next chapter naturally."}

Write only Scene One prose now.
  `.trim();
}

function getLaterMovementPrompt(input: {
  stage: "middle" | "final";
  sceneIndex: number;
  storyBible: unknown;
  storyState: unknown;
  recentChapters: RecentChapter[];
  scenePlan: ChapterScenePlan;
  existingDraft: string;
  latestUserMessage: string;
  narrativeStyle: string;
}): string {
  const sceneNumber = input.sceneIndex + 1;
  const sceneCard = input.scenePlan.scenes[input.sceneIndex];
  const isFinalScene =
    input.sceneIndex === input.scenePlan.scenes.length - 1;
  const requestedAdditionalWords = getSceneWordRange(
    input.scenePlan.scenes.length,
  );
  const endingInstruction =
    !isFinalScene
      ? `Reach Scene ${sceneNumber}'s exit beat once, then stop. Do not create the chapter
ending, summarise the relationship or add a closing reflection.`
      : `Reach this scene's exit beat once. That exit beat is the chapter's
only ending hook. Stop immediately afterward. Do not add an aftermath,
attraction summary, travel, bedtime reflection or second ending.`;
  const sceneBoundaryInstruction = !isFinalScene
    ? "Do not borrow the final scene's exit beat early."
    : "Do not repeat objectives, arguments, actions or conclusions from earlier scenes.";

  return `
Write SCENE ${sceneNumber} of the unfinished commercial romance chapter.

Return only the new scene prose. Do not repeat, rewrite, summarise or quote
the earlier scenes. Do not include a chapter heading, title, POV label, note,
analysis, outline, markdown or commentary.

Write approximately ${requestedAdditionalWords} words.

${endingInstruction}

Write only the assigned scene card. Do not reuse an objective, argument,
action, physical business, internal conclusion or attraction observation from
an earlier scene. ${sceneBoundaryInstruction}

The excerpt below contains only the end of the previous scene. Continue from
its exact physical and emotional position. Maintain its POV, tense, voice and
formatting. Use natural contractions.

Use ${input.narrativeStyle}

The Story Bible, continuity and scene plan are binding. Never repeat the
completed beats listed below. Do not invent an unsupported stranger, rule,
procedure, document, message, schedule, credential or coincidence.

Avoid generic attraction shorthand, repetitive internal summary, therapy-speak,
purple prose, stock reactions and interchangeable banter. Never use em dashes
or en dashes.

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. When established
progression calls for explicit consensual adult intimacy, write it directly
without censorship or fade to black. Do not insert intimacy before it is earned.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY STATE

${JSON.stringify(getWritingContinuityState(input.storyState), null, 2)}

PREVIOUS CHAPTER

${JSON.stringify(input.recentChapters.at(-1) ?? null, null, 2)}

CHAPTER GOAL

${input.scenePlan.chapterGoal}

RELATIONSHIP CHANGE

${input.scenePlan.relationshipChange}

SCENE ${sceneNumber} CARD

${JSON.stringify(sceneCard, null, 2)}

COMPLETED BEATS THAT MUST NOT BE REPEATED

${JSON.stringify(input.scenePlan.completedBeatsToAvoid, null, 2)}

END OF PREVIOUS SCENE

${getDraftTail(input.existingDraft)}

USER'S ORIGINAL REQUEST

${input.latestUserMessage || "Continue the chapter naturally."}

Continue immediately after the excerpt's final sentence. Return only Scene
${sceneNumber} prose.
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
    const scenePlan = parseChapterScenePlan(body.chapterBrief);
    const latestUserMessage = cleanString(body.latestUserMessage);
    const existingDraft = cleanString(body.existingDraft);
    const recentChapters = cleanRecentChapters(body.recentChapters);
    const narrativeStyle = getNarrativeStyle(body.storyBible);
    const minimumWordCount = getWordCount(body.minimumWordCount, 2000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      getWordCount(body.maximumWordCount, 4000),
    );
    const generationStage = getGenerationStage(body.generationStage);
    const requestedSceneIndex =
      typeof body.sceneIndex === "number" &&
      Number.isInteger(body.sceneIndex)
        ? body.sceneIndex
        : null;
    const fallbackSceneIndex =
      generationStage === "opening"
        ? 0
        : generationStage === "final"
          ? scenePlan.scenes.length - 1
          : Math.min(1, scenePlan.scenes.length - 1);
    const sceneIndex = requestedSceneIndex ?? fallbackSceneIndex;
    const isFinalScene = sceneIndex === scenePlan.scenes.length - 1;
    const existingWordCount = countWords(existingDraft);

    if (sceneIndex < 0 || sceneIndex >= scenePlan.scenes.length) {
      return NextResponse.json(
        { error: "The requested chapter scene does not exist." },
        { status: 400 },
      );
    }

    if (existingDraft && existingWordCount > maximumWordCount) {
      return NextResponse.json(
        {
          error: `The preserved draft already exceeds ${maximumWordCount} words.`,
        },
        { status: 409 },
      );
    }

    if (generationStage === "opening" && existingDraft) {
      return NextResponse.json(
        { error: "The opening movement cannot include an existing draft." },
        { status: 409 },
      );
    }

    if (generationStage === "opening" && sceneIndex !== 0) {
      return NextResponse.json(
        { error: "The opening request must write the first planned scene." },
        { status: 409 },
      );
    }

    if (generationStage !== "opening" && !existingDraft) {
      return NextResponse.json(
        { error: "A middle or final movement requires an existing draft." },
        { status: 409 },
      );
    }

    if (
      generationStage === "middle" &&
      (sceneIndex === 0 || isFinalScene)
    ) {
      return NextResponse.json(
        { error: "A middle request must write a non-final planned scene." },
        { status: 409 },
      );
    }

    if (generationStage === "final" && !isFinalScene) {
      return NextResponse.json(
        { error: "The final request must write the last planned scene." },
        { status: 409 },
      );
    }

    const prompt =
      generationStage === "opening"
        ? getOpeningPrompt({
            storyBible: body.storyBible ?? {},
            storyState: body.storyState ?? {},
            recentChapters,
            scenePlan,
            latestUserMessage,
            narrativeStyle,
          })
        : getLaterMovementPrompt({
            stage: generationStage,
            sceneIndex,
            storyBible: body.storyBible ?? {},
            storyState: body.storyState ?? {},
            recentChapters,
            scenePlan,
            existingDraft,
            latestUserMessage,
            narrativeStyle,
          });

    const maximumAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      providerCallStartedAt = Date.now();

      try {
        const response = await openrouter.chat.completions.create({
          model: WRITING_MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 4500,
        });
        const rawUsage = response.usage as unknown as
          | Record<string, unknown>
          | undefined;
        const inputTokens =
          typeof rawUsage?.prompt_tokens === "number"
            ? rawUsage.prompt_tokens
            : 0;
        const outputTokens =
          typeof rawUsage?.completion_tokens === "number"
            ? rawUsage.completion_tokens
            : 0;
        const totalTokens =
          typeof rawUsage?.total_tokens === "number"
            ? rawUsage.total_tokens
            : inputTokens + outputTokens;
        const costUsd =
          typeof rawUsage?.cost === "number" ? rawUsage.cost : null;
        const choice = response.choices[0];
        const finishReason = choice?.finish_reason;
        const rawProse = choice?.message?.content;

        if (finishReason === "length") {
          throw new Error(
            "The writing model reached its token limit before completing the movement.",
          );
        }

        if (finishReason === "content_filter") {
          throw new Error(
            "The writing provider stopped the movement because of its content filter.",
          );
        }

        if (!rawProse?.trim()) {
          throw new Error("The writing model returned no chapter prose.");
        }

        const returnedProse = cleanGeneratedProse(rawProse);

        validateProse(returnedProse);

        diagnostics.push({
          stage: `chapter_writing_scene_${sceneIndex + 1}`,
          provider: "openrouter",
          model: WRITING_MODEL,
          status: "succeeded",
          inputTokens,
          outputTokens,
          totalTokens,
          costUsd,
          costType: costUsd === null ? "unavailable" : "reported",
          durationMs: Date.now() - providerCallStartedAt,
          attempt,
        });

        const prose =
          generationStage === "opening"
            ? returnedProse
            : `${existingDraft}\n\n${returnedProse}`.trim();
        const totalWordCount = countWords(prose);

        return NextResponse.json({
          prose,
          totalWordCount,
          isComplete:
            isFinalScene &&
            totalWordCount >= minimumWordCount &&
            totalWordCount <= maximumWordCount,
          generationStage,
          sceneIndex,
          totalScenes: scenePlan.scenes.length,
          isFinalScene,
          diagnostics,
        });
      } catch (attemptError) {
        lastError =
          attemptError instanceof Error
            ? attemptError
            : new Error("The writing model failed.");

        diagnostics.push({
          stage: `chapter_writing_scene_${sceneIndex + 1}`,
          provider: "openrouter",
          model: WRITING_MODEL,
          status: "failed",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: null,
          costType: "unavailable",
          durationMs: Date.now() - providerCallStartedAt,
          attempt,
          error: lastError.message,
        });
      }
    }

    throw (
      lastError ??
      new Error("The writing model failed after three automatic attempts.")
    );
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
