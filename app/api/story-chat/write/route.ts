import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";

export const maxDuration = 300;

const PRIMARY_WRITING_MODEL = "anthracite-org/magnum-v4-72b";

const FALLBACK_WRITING_MODEL = "anthracite-org/magnum-v4-72b";

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
  entryState: string;
  objective: string;
  conflict: string;
  newInformation: string;
  exitBeat: string;
  endingState: string;
  wordTarget: number;
  mustNotHappen: string[];
};

type ChapterScenePlan = {
  chapterNumber: number | null;
  title: string;
  povCharacter: string;
  chapterGoal: string;
  relationshipChange: string;
  startingState: string;
  endingState: string;
  knowledgeLimits: string[];
  premiseLocks: string[];
  mustNotHappen: string[];
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
  continueCurrentMovement?: unknown;
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

type SceneWordBudget = {
  minimum: number;
  maximum: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getSceneWordBudget(input: {
  minimumWordCount: number;
  maximumWordCount: number;
  existingWordCount: number;
  sceneIndex: number;
  sceneCount: number;
  plannedWordTarget: number;
}): SceneWordBudget {
  const remainingScenes = Math.max(1, input.sceneCount - input.sceneIndex);
  const futureScenes = remainingScenes - 1;
  const targetChapterWords = Math.round(
    (input.minimumWordCount + input.maximumWordCount) / 2,
  );
  const remainingToMaximum = Math.max(
    1,
    input.maximumWordCount - input.existingWordCount,
  );
  const remainingToMinimum = Math.max(
    1,
    input.minimumWordCount - input.existingWordCount,
  );
  const remainingToTarget = clamp(
    targetChapterWords - input.existingWordCount,
    remainingToMinimum,
    remainingToMaximum,
  );

  if (futureScenes === 0) {
    const minimum =
      remainingToMinimum <= 500
        ? remainingToMinimum
        : Math.min(700, Math.max(450, remainingToMinimum));
    const maximum = Math.min(
      remainingToMaximum,
      Math.max(
        minimum,
        Math.min(
          800,
          Math.max(input.plannedWordTarget, remainingToTarget),
        ),
      ),
    );

    return {
      minimum: Math.max(1, minimum),
      maximum: Math.max(1, maximum),
    };
  }

  const idealSceneWords = clamp(
      input.plannedWordTarget,
      400,
      Math.min(
        750,
        Math.max(400, Math.round(remainingToTarget / remainingScenes)),
      ),
  );
  const reservedForFutureScenes = futureScenes * 250;
  const maximumAvailableNow = Math.max(
    250,
    remainingToMaximum - reservedForFutureScenes,
  );
  const maximum = Math.min(
    maximumAvailableNow,
    Math.max(300, Math.ceil(idealSceneWords * 1.15)),
  );
  const minimum = Math.min(
    maximum,
    Math.max(250, Math.floor(idealSceneWords * 0.85)),
  );

  return {
    minimum,
    maximum,
  };
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
    "entryState",
    "objective",
    "conflict",
    "newInformation",
    "exitBeat",
    "endingState",
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

    scene.wordTarget =
      typeof sceneRecord.wordTarget === "number" &&
      Number.isInteger(sceneRecord.wordTarget)
        ? clamp(sceneRecord.wordTarget, 400, 750)
        : 650;
    scene.mustNotHappen = Array.isArray(sceneRecord.mustNotHappen)
      ? sceneRecord.mustNotHappen.map(cleanString).filter(Boolean)
      : [];

    if (scene.mustNotHappen.length === 0) {
      throw new Error(
        `Scene ${index + 1} is missing its forbidden-development guardrail.`,
      );
    }

    scenes.push(scene);
  }

  const chapterGoal = cleanString(plan.chapterGoal);
  const relationshipChange = cleanString(plan.relationshipChange);
  const startingState = cleanString(plan.startingState);
  const endingState = cleanString(plan.endingState);
  const chapterNumber =
    typeof plan.chapterNumber === "number" &&
    Number.isInteger(plan.chapterNumber) &&
    plan.chapterNumber > 0
      ? plan.chapterNumber
      : null;
  const title = cleanString(plan.title);
  const povCharacter = cleanString(plan.povCharacter);
  const completedBeatsToAvoid = Array.isArray(plan.completedBeatsToAvoid)
    ? plan.completedBeatsToAvoid.map(cleanString).filter(Boolean)
    : [];
  const knowledgeLimits = Array.isArray(plan.knowledgeLimits)
    ? plan.knowledgeLimits.map(cleanString).filter(Boolean)
    : [];
  const premiseLocks = Array.isArray(plan.premiseLocks)
    ? plan.premiseLocks.map(cleanString).filter(Boolean)
    : [];
  const mustNotHappen = Array.isArray(plan.mustNotHappen)
    ? plan.mustNotHappen.map(cleanString).filter(Boolean)
    : [];

  if (
    !chapterGoal ||
    !relationshipChange ||
    !startingState ||
    !endingState ||
    knowledgeLimits.length === 0 ||
    premiseLocks.length === 0 ||
    mustNotHappen.length === 0 ||
    scenes.length < 3
  ) {
    throw new Error("The chapter scene plan is missing its narrative goal.");
  }

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
    scenes,
    completedBeatsToAvoid,
  };
}

function getEndingExcerpt(text: string, maximumWords = 700): string {
  const words = text.trim().split(/\s+/);

  return words.slice(-maximumWords).join(" ");
}

function getActivePov(
  scenePlan: ChapterScenePlan,
  storyState: unknown,
): string {
  if (scenePlan.povCharacter) {
    return scenePlan.povCharacter;
  }

  if (
    storyState &&
    typeof storyState === "object" &&
    !Array.isArray(storyState)
  ) {
    return cleanString(
      (storyState as Record<string, unknown>).activePOV,
    );
  }

  return "";
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
  delete writingState.chapterPlans;
  delete writingState.latestChapterEnding;

  const chapterLedger = writingState.chapterLedger;

  if (Array.isArray(chapterLedger)) {
    writingState.chapterLedger = chapterLedger
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
      content: getEndingExcerpt(cleanString(chapter.content)),
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
    .replace(/(?:\n\s*)?<END_MOVEMENT>\s*$/i, "")
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

  const promptLeakagePatterns = [
    /\bSTORY BIBLE\b/i,
    /\bCONTINUITY STATE\b/i,
    /\bCHAPTER GOAL\b/i,
    /\bRELATIONSHIP CHANGE\b/i,
    /\bBINDING CHAPTER CONTRACT\b/i,
    /\bPOV KNOWLEDGE LIMITS\b/i,
    /\bPREMISE LOCKS\b/i,
    /\bDEVELOPMENTS FORBIDDEN\b/i,
    /\bSCENE \d+ CARD\b/i,
    /\bCOMPLETED BEATS THAT MUST NOT BE REPEATED\b/i,
    /\bCOMPLETE CHAPTER DRAFT SO FAR\b/i,
    /\bUSER'S (?:CURRENT|ORIGINAL) (?:CHAPTER )?REQUEST\b/i,
    /<\|(?:system|user|assistant|end)[^>]*\|>/i,
    /\[(?:INST|\/INST)\]/i,
  ];

  if (promptLeakagePatterns.some((pattern) => pattern.test(content))) {
    throw new Error(
      "The writing model leaked instructions or prompt data into the prose. The chapter was not saved.",
    );
  }

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const markdownLines = lines.filter((line) =>
    /^(?:[-+*]\s+|\d+[.)]\s+|>\s+|\|.+\|$)/u.test(line),
  ).length;
  const hasMarkdownEmphasis =
    /(?:^|\s)(?:\*\*|__)[^\n]+(?:\*\*|__)(?:\s|$)/u.test(content);

  if (
    markdownLines >= 2 ||
    (lines.length > 0 && markdownLines / lines.length > 0.12) ||
    hasMarkdownEmphasis
  ) {
    throw new Error(
      "The writing model returned formatted notes or markdown instead of clean novel prose. The chapter was not saved.",
    );
  }

  const normalizedWords = content
    .toLowerCase()
    .replace(/[^a-z0-9'’]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const repeatedWindows = new Map<string, number>();

  for (let index = 0; index + 9 < normalizedWords.length; index += 1) {
    const window = normalizedWords.slice(index, index + 10).join(" ");
    const occurrences = (repeatedWindows.get(window) ?? 0) + 1;
    repeatedWindows.set(window, occurrences);

    if (occurrences >= 3) {
      throw new Error(
        "The writing model fell into repetitive or mechanically corrupted text. The chapter was not saved.",
      );
    }
  }

  const proseCharacters = Array.from(content);
  const suspiciousCharacters = proseCharacters.filter(
    (character) => !/[\p{L}\p{N}\p{P}\p{Z}\n\r\t]/u.test(character),
  ).length;

  if (
    proseCharacters.length > 0 &&
    suspiciousCharacters / proseCharacters.length > 0.01
  ) {
    throw new Error(
      "The writing model returned mechanically corrupted characters. The chapter was not saved.",
    );
  }

}

function getContinuationExcerpt(content: string, maximumWords = 1400): string {
  const words = content.trim().split(/\s+/).filter(Boolean);

  if (words.length <= maximumWords) {
    return content.trim();
  }

  return words.slice(-maximumWords).join(" ");
}

function validateNoDraftOverlap(
  existingDraft: string,
  newMovement: string,
): void {
  if (!existingDraft.trim()) {
    return;
  }

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9'’]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const existingWords = normalize(existingDraft);
  const movementWords = normalize(newMovement);
  const windowSize = 14;

  if (
    existingWords.length < windowSize ||
    movementWords.length < windowSize
  ) {
    return;
  }

  const existingWindows = new Set<string>();

  for (
    let index = 0;
    index + windowSize <= existingWords.length;
    index += 1
  ) {
    existingWindows.add(
      existingWords.slice(index, index + windowSize).join(" "),
    );
  }

  for (
    let index = 0;
    index + windowSize <= movementWords.length;
    index += 1
  ) {
    const window = movementWords
      .slice(index, index + windowSize)
      .join(" ");

    if (existingWindows.has(window)) {
      throw new Error(
        "The writing model repeated prose or restarted an event already present in the saved draft. The duplicate movement was not saved.",
      );
    }
  }
}

function getBindingChapterContract(
  scenePlan: ChapterScenePlan,
  scene: SceneCard,
  continueCurrentMovement = false,
): string {
  return `
BINDING CHAPTER CONTRACT

Chapter starting state:
${scenePlan.startingState}

Required chapter ending state:
${scenePlan.endingState}

POV knowledge limits:
${JSON.stringify(scenePlan.knowledgeLimits, null, 2)}

Premise locks that cannot be bypassed or contradicted:
${JSON.stringify(scenePlan.premiseLocks, null, 2)}

Developments forbidden anywhere in this chapter:
${JSON.stringify(scenePlan.mustNotHappen, null, 2)}

This movement's planned entry state:
${scene.entryState}

${
  continueCurrentMovement
    ? "Because this movement has already begun, the supplied draft's exact final state is the binding current state. Do not restore the planned entry state."
    : "Begin from this planned entry state without replaying the previous movement."
}

This movement must end at:
${scene.endingState}

Developments forbidden in this movement:
${JSON.stringify(scene.mustNotHappen, null, 2)}

These constraints override generic romance conventions and any tempting
shortcut. Never upgrade friendship, rivalry, family history or emotional
closeness into former romance, sex or acknowledged desire unless the contract
explicitly establishes it. Never let the POV recognise, label, imagine or
admit attraction beyond the stated knowledge limit. Never invent housing,
money, transport, employment, evidence or another convenient alternative that
removes a premise lock.
  `.trim();
}

function getOpeningPrompt(input: {
  storyBible: unknown;
  storyState: unknown;
  recentChapters: RecentChapter[];
  scenePlan: ChapterScenePlan;
  latestUserMessage: string;
  narrativeStyle: string;
  wordBudget: SceneWordBudget;
  minimumWordCount: number;
  maximumWordCount: number;
}): string {
  const isOnlyScene = input.scenePlan.scenes.length === 1;
  const mayReachChapterHook = input.wordBudget.minimum <= 500;
  const endingInstruction = isOnlyScene
    ? mayReachChapterHook
      ? `This is the chapter's only scene. Reach its exit beat once, use that
as the chapter's single ending hook, then stop immediately. Do not add an
aftermath, closing reflection or second ending.`
      : `This is the opening movement of the chapter's only sustained scene.
Develop the assigned objective and conflict, but do not resolve the scene or
reach its exit beat yet. Stop at a natural active beat that can be continued
directly. Do not write a chapter ending or closing reflection.`
    : `Write only the assigned scene card. Do not borrow actions, conflict,
information or exit beats from later planned scenes. Reach Scene One's exit
beat once, then stop. Do not create a chapter ending or closing reflection.`;

  return `
You are NovelForge, a skilled commercial romance novelist.

Write SCENE ONE of one immersive commercial romance chapter.
Write between ${input.wordBudget.minimum} and ${input.wordBudget.maximum} words
for this scene. The complete chapter must finish between
${input.minimumWordCount} and ${input.maximumWordCount} words.
Return only finished novel prose.
Do not include a chapter number, title, POV heading, notes, analysis,
outline, markdown or commentary.

${getBindingChapterContract(input.scenePlan, input.scenePlan.scenes[0])}

Use ${input.narrativeStyle}

CHAPTER IDENTITY

Chapter ${input.scenePlan.chapterNumber ?? "next"}: ${
  input.scenePlan.title || "Use the planned chapter title."
}

POV CHARACTER

${getActivePov(input.scenePlan, input.storyState) || "Use the established active POV."}

Remain in this character's POV for the entire scene. Never switch heads.
Apply this character's saved narrative and dialogue voice profile.

${endingInstruction}

The Story Bible, continuity and plan are binding. Characters must not know
information they have not learned. Do not reset attraction, conflict, trust or
intimacy. Use natural contractions and a distinct character voice.

Never repeat any completed beat listed below. The scene as a whole must create
meaningful movement in action, knowledge, risk or relationship. Allow natural
breathing room for atmosphere, humour, observation, tension and sensory detail
when those elements deepen the reader's experience. Avoid generic attraction
shorthand, repetitive internal summary, therapy-speak, purple prose, stock
reactions and interchangeable banter.

You may create ordinary connective details and unnamed background activity
needed for a natural scene. Do not invent a new named character, major rule,
crucial message, convenient document, coincidence or factual development that
changes the planned plot or established continuity. Never use em dashes or en
dashes.

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. When established
progression calls for explicit consensual adult intimacy, write it directly
and graphically when the saved heat level requires it, without censorship,
euphemistic summary or fade to black. Do not insert intimacy before the
approved milestone earns it.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY STATE

${JSON.stringify(getWritingContinuityState(input.storyState), null, 2)}

PREVIOUS CHAPTER ENDING

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

Write only Scene One prose now. After the final prose sentence, output
<END_MOVEMENT> on its own line. Do not continue after that marker.
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
  wordBudget: SceneWordBudget;
  minimumWordCount: number;
  maximumWordCount: number;
  continueCurrentMovement: boolean;
}): string {
  const sceneNumber = input.sceneIndex + 1;
  const sceneCard = input.scenePlan.scenes[input.sceneIndex];
  const isFinalScene =
    input.sceneIndex === input.scenePlan.scenes.length - 1;
  const mayReachChapterHook = input.wordBudget.minimum <= 500;
  const endingInstruction =
    !isFinalScene
      ? `Reach Scene ${sceneNumber}'s exit beat once, then stop. Do not create the chapter
ending, summarise the relationship or add a closing reflection.`
      : mayReachChapterHook
        ? `Reach this scene's exit beat once. That exit beat is the chapter's
only ending hook. Stop immediately afterward. Do not add an aftermath,
attraction summary, travel, bedtime reflection or second ending.`
        : `Continue developing this final scene without resolving it yet.
Do not reach the planned exit beat or chapter-ending hook in this movement.
Stop at a natural active beat that can be continued directly.`;
  const sceneBoundaryInstruction = !isFinalScene
    ? "Do not borrow the final scene's exit beat early."
    : "Do not repeat objectives, arguments, actions or conclusions from earlier scenes.";
  const continuationExcerpt = getContinuationExcerpt(input.existingDraft);
  const finalParagraph =
    input.existingDraft
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .at(-1) ?? "";

  const movementInstruction = input.continueCurrentMovement
    ? `Continue MOVEMENT ${sceneNumber}. This movement has already begun.
The draft's exact final state now overrides the movement card's original entry
state. Advance only the unfinished objective or consequence.`
    : `Write MOVEMENT ${sceneNumber}. Begin from its binding entry state,
which must inherit the previous movement's ending state without replaying it.`;

  return `
${movementInstruction}
Never restart the location, arrival, conversation or confrontation.

Return only the new scene prose. Do not repeat, rewrite, summarise or quote
the earlier scenes. Do not include a chapter heading, title, POV label, note,
analysis, outline, markdown or commentary.

${getBindingChapterContract(
  input.scenePlan,
  sceneCard,
  input.continueCurrentMovement,
)}

Write between ${input.wordBudget.minimum} and ${input.wordBudget.maximum} new
words for this scene. The complete chapter must finish between
${input.minimumWordCount} and ${input.maximumWordCount} words.

${endingInstruction}

Write only the assigned scene card. Do not reuse an objective, argument,
action, physical business, internal conclusion or attraction observation from
an earlier scene. ${sceneBoundaryInstruction}

The read-only excerpt below contains the chapter immediately before this
movement. Continue after its final sentence and from its exact location,
physical state, knowledge and emotional position. Anything shown in the
excerpt has already happened and must not happen again. Do not make a
character arrive somewhere they have already reached. Do not restart a
conversation or confrontation. Do not restore, move or reuse an object whose
condition or location has already changed. If a scene-card instruction has
already happened, advance to the next unfinished consequence instead.
Maintain the established POV, tense, voice and formatting. Use natural
contractions.

Use ${input.narrativeStyle}

CHAPTER IDENTITY

Chapter ${input.scenePlan.chapterNumber ?? "next"}: ${
  input.scenePlan.title || "Use the planned chapter title."
}

POV CHARACTER

${getActivePov(input.scenePlan, input.storyState) || "Use the established active POV."}

Remain in this character's POV for the entire scene. Never switch heads.
Apply this character's saved narrative and dialogue voice profile.

The Story Bible, continuity and scene plan are binding. Never repeat the
completed beats listed below. You may create ordinary connective details and
unnamed background activity needed for a natural scene. Do not invent a new
named character, major rule, crucial message, convenient document, coincidence
or factual development that changes the planned plot or established
continuity.

Avoid generic attraction shorthand, repetitive internal summary, therapy-speak,
purple prose, stock reactions and interchangeable banter. Never use em dashes
or en dashes.

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. When established
progression calls for explicit consensual adult intimacy, write it directly
and graphically when the saved heat level requires it, without censorship,
euphemistic summary or fade to black. Do not insert intimacy before the
approved milestone earns it.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY STATE

${JSON.stringify(getWritingContinuityState(input.storyState), null, 2)}

PREVIOUS CHAPTER ENDING

${JSON.stringify(input.recentChapters.at(-1) ?? null, null, 2)}

CHAPTER GOAL

${input.scenePlan.chapterGoal}

RELATIONSHIP CHANGE

${input.scenePlan.relationshipChange}

SCENE ${sceneNumber} CARD

${JSON.stringify(sceneCard, null, 2)}

COMPLETED BEATS THAT MUST NOT BE REPEATED

${JSON.stringify(input.scenePlan.completedBeatsToAvoid, null, 2)}

DRAFT CONTINUATION EXCERPT, READ ONLY

${continuationExcerpt}

EXACT FINAL PARAGRAPH, CONTINUE AFTER THIS WITHOUT QUOTING IT

${finalParagraph}

USER'S ORIGINAL REQUEST

${input.latestUserMessage || "Continue the chapter naturally."}

Continue immediately after the draft's final sentence. Return only Scene
${sceneNumber} prose. After the final prose sentence, output <END_MOVEMENT>
on its own line. Do not continue after that marker.
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
    const continueCurrentMovement = body.continueCurrentMovement === true;
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
    const wordBudget = getSceneWordBudget({
      minimumWordCount,
      maximumWordCount,
      existingWordCount,
      sceneIndex,
      sceneCount: scenePlan.scenes.length,
      plannedWordTarget: scenePlan.scenes[sceneIndex]?.wordTarget ?? 750,
    });

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
            wordBudget,
            minimumWordCount,
            maximumWordCount,
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
            wordBudget,
            minimumWordCount,
            maximumWordCount,
            continueCurrentMovement,
          });

    const maximumAttempts = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      providerCallStartedAt = Date.now();
      const writingModel =
        attempt === 1 ? PRIMARY_WRITING_MODEL : FALLBACK_WRITING_MODEL;
      let attemptInputTokens = 0;
      let attemptOutputTokens = 0;
      let attemptTotalTokens = 0;
      let attemptCostUsd: number | null = null;

      try {
        const attemptPrompt =
          attempt === 1
            ? prompt
            : `${prompt}

CRITICAL RETRY

The previous attempt failed for this exact reason:

${lastError?.message ?? "The movement was unusable."}

Write a fresh replacement for this movement only. Correct that exact failure.
Do not restart an arrival, location, conversation, confrontation, action,
memory, attraction observation or conclusion already present in the read-only
draft excerpt. Begin from the movement's stated entry state and finish at its
stated ending state. It must contain between ${wordBudget.minimum} and
${wordBudget.maximum} new words. Return only replacement novel prose.`;
        const response = await openrouter.chat.completions.create({
          model: writingModel,
          messages: [
            {
              role: "system",
              content: `You are NovelForge's commercial romance prose writer.
Write immersive, emotionally intelligent fiction with distinct character
voices. Treat the supplied Story Bible, continuity and approved scene plan as
binding canon. Return only the requested scene's finished novel prose, with no
analysis, planning, headings, markdown or commentary.`,
            },
            {
              role: "user",
              content: attemptPrompt,
            },
          ],
          // OpenRouter exposes roughly a 2K-token output ceiling for Magnum
          // v4 72B. Keep each bounded movement safely below that hard limit.
          max_tokens: 1900,
          temperature: attempt === 1 ? 0.72 : 0.5,
          top_p: 0.9,
          frequency_penalty: 0.18,
          presence_penalty: 0.08,
          stop: ["<END_MOVEMENT>"],
        });
        const rawUsage = response.usage as unknown as
          | Record<string, unknown>
          | undefined;
        attemptInputTokens =
          typeof rawUsage?.prompt_tokens === "number"
            ? rawUsage.prompt_tokens
            : 0;
        attemptOutputTokens =
          typeof rawUsage?.completion_tokens === "number"
            ? rawUsage.completion_tokens
            : 0;
        attemptTotalTokens =
          typeof rawUsage?.total_tokens === "number"
            ? rawUsage.total_tokens
            : attemptInputTokens + attemptOutputTokens;
        attemptCostUsd =
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
        validateNoDraftOverlap(existingDraft, returnedProse);

        const prose =
          generationStage === "opening"
            ? returnedProse
            : `${existingDraft}\n\n${returnedProse}`.trim();
        const totalWordCount = countWords(prose);
        const movementWordCount = countWords(returnedProse);
        const minimumAcceptedMovementWords = Math.max(
          300,
          Math.floor(wordBudget.minimum * 0.8),
        );
        const maximumAcceptedMovementWords = Math.ceil(
          wordBudget.maximum * 1.2,
        );
        const finalLengthIsValid =
          totalWordCount >= minimumWordCount &&
          totalWordCount <= maximumWordCount;
        const nonFinalExceededChapterMaximum =
          !isFinalScene && totalWordCount >= maximumWordCount;

        if (movementWordCount < minimumAcceptedMovementWords) {
          throw new Error(
            `The movement returned only ${movementWordCount} words and did not develop its assigned dramatic job.`,
          );
        }

        if (
          movementWordCount > maximumAcceptedMovementWords ||
          totalWordCount > maximumWordCount
        ) {
          throw new Error(
            "The movement exceeded its safe boundary and would overrun the chapter.",
          );
        }

        if (attempt < maximumAttempts && nonFinalExceededChapterMaximum) {
          throw new Error(
            "The scene left no safe word budget for the remaining planned scenes.",
          );
        }

        diagnostics.push({
          stage: `chapter_writing_scene_${sceneIndex + 1}`,
          provider: "openrouter",
          model: writingModel,
          status: "succeeded",
          inputTokens: attemptInputTokens,
          outputTokens: attemptOutputTokens,
          totalTokens: attemptTotalTokens,
          costUsd: attemptCostUsd,
          costType:
            attemptCostUsd === null ? "unavailable" : "reported",
          durationMs: Date.now() - providerCallStartedAt,
          attempt,
        });

        return NextResponse.json({
          prose,
          totalWordCount,
          isComplete:
            isFinalScene && finalLengthIsValid,
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
          model: writingModel,
          status: "failed",
          inputTokens: attemptInputTokens,
          outputTokens: attemptOutputTokens,
          totalTokens: attemptTotalTokens,
          costUsd: attemptCostUsd,
          costType:
            attemptCostUsd === null ? "unavailable" : "reported",
          durationMs: Date.now() - providerCallStartedAt,
          attempt,
          error: lastError.message,
        });
      }
    }

    throw (
      lastError ??
      new Error("The writing model failed after two focused attempts.")
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
        model: PRIMARY_WRITING_MODEL,
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
