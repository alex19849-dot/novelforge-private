// NovelForge original-voice restoration with targeted realism safeguards.
import OpenAI from "openai";
import { selectedProseWriter, proseCostEstimate, requestProse } from "../../../../lib/prose-writer";
import { narrativeContext } from "../../../../lib/narrative-memory";

import { NextResponse } from "next/server";

import type {
  GenerationDiagnostic,
  SectionWritingBrief,
} from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const AION_MODEL = "aion-labs/aion-3.5";
const AION_MARKER_PREFIX = "[[AION_SCENE_";
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  maxRetries: 0,
  timeout: 240_000,
});

type SectionAction = "start" | "continue" | "rewrite";

type WriterRequest = {
  phase?: unknown;
  storyBible?: unknown;
  storyState?: unknown;
  recentChapters?: unknown;
  chapterBrief?: unknown;
  chapterTitle?: unknown;
  povCharacter?: unknown;
  chapterDraft?: unknown;
  sectionToRewrite?: unknown;
  sectionInstruction?: unknown;
  latestUserMessage?: unknown;
  action?: unknown;
};

type Usage = {
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

type SpecialistScene = {
  marker: string;
  instruction: string;
  wordTarget: number;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

class TechnicalWriterError extends Error {}

class ChapterLengthError extends Error {
  constructor(message: string, readonly preservedDraft: string) {
    super(message);
    this.name = "ChapterLengthError";
  }
}

function validateChapterLength(
  draft: string,
  target: NonNullable<SectionWritingBrief["targetWordRange"]>,
): void {
  const words = countWords(draft);
  if (words < target.minimum || words > target.maximum) {
    throw new ChapterLengthError(
      `The chapter is ${words.toLocaleString()} words; the Chapter Contract requires ${target.minimum.toLocaleString()} to ${target.maximum.toLocaleString()}. The draft is preserved for review. No automatic rewrite was started.`,
      draft,
    );
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSectionBrief(value: string): Partial<SectionWritingBrief> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawRequiredBeats = Array.isArray(parsed.requiredBeats)
      ? parsed.requiredBeats
      : [];
    const requiredBeats = rawRequiredBeats
      .filter(
        (beat): beat is Record<string, unknown> =>
          Boolean(beat) && typeof beat === "object" && !Array.isArray(beat),
      )
      .map((beat, index) => ({
        order: index + 1,
        instruction: cleanString(beat.instruction),
        ...(beat.specialistWriter === "aion"
          ? { specialistWriter: "aion" as const }
          : beat.specialistWriter === null
            ? { specialistWriter: null }
            : {}),
        ...(typeof beat.approximateWordTarget === "number" &&
        Number.isInteger(beat.approximateWordTarget) &&
        beat.approximateWordTarget > 0
          ? { approximateWordTarget: beat.approximateWordTarget }
          : {}),
      }))
      .filter((beat) => Boolean(beat.instruction));
    const rawTarget =
      parsed.targetWordRange &&
      typeof parsed.targetWordRange === "object" &&
      !Array.isArray(parsed.targetWordRange)
        ? (parsed.targetWordRange as Record<string, unknown>)
        : null;
    const minimum = Number(rawTarget?.minimum);
    const preferred = Number(rawTarget?.preferred);
    const maximum = Number(rawTarget?.maximum);
    const targetWordRange =
      Number.isInteger(minimum) &&
      Number.isInteger(preferred) &&
      Number.isInteger(maximum) &&
      minimum >= 500 &&
      maximum <= 10000 &&
      minimum <= preferred &&
      preferred <= maximum
        ? { minimum, preferred, maximum }
        : undefined;

    return {
      continuationGuidance: cleanString(parsed.continuationGuidance),
      chapterNumber:
        typeof parsed.chapterNumber === "number"
          ? parsed.chapterNumber
          : undefined,
      chapterKind: parsed.chapterKind === "epilogue" ? "epilogue" : "chapter",
      chapterTitle: cleanString(parsed.chapterTitle || parsed.title),
      povCharacter: cleanString(parsed.povCharacter),
      authorDirection: cleanString(parsed.authorDirection),
      continuationBoundary: cleanString(
        parsed.continuationBoundary || parsed.startingState,
      ),
      originalGuidance: cleanString(parsed.originalGuidance),
      requiredBeats,
      endpoint: cleanString(parsed.endpoint),
      exclusions: Array.isArray(parsed.exclusions)
        ? parsed.exclusions.map(cleanString).filter(Boolean)
        : [],
      targetWordRange,
    };
  } catch {
    return {};
  }
}

function getTargetWordRange(
  sectionBrief: Partial<SectionWritingBrief>,
): NonNullable<SectionWritingBrief["targetWordRange"]> {
  return (
    sectionBrief.targetWordRange ?? {
      minimum: 2000,
      preferred: 3000,
      maximum: 4000,
    }
  );
}

function getOutputTokenLimit(maximumWordCount: number): number {
  return Math.min(
    24000,
    Math.max(4000, Math.ceil(maximumWordCount * 2) + 2000),
  );
}

function explicitSpecialistScenes(
  sectionBrief: Partial<SectionWritingBrief>,
  latestUserMessage: string,
): SpecialistScene[] {
  const explicitPattern =
    /\b(?:explicit|graphic|open[ -]door|on[ -]page sex|sex scene|hate sex|rough sex|full sex|oral sex|anal sex|blow[ -]?job|hand[ -]?job|penetrat(?:e|es|ed|ing|ion|ive)|orgasm|climax(?:es|ed|ing)?|masturbat\w*|wank\w*|jerk(?:ing|s|ed)?\s+(?:each other\s+)?off|perking\s+off|hands?\s+(?:inside|down)\s+(?:his|their|the|each other's)?\s*boxers|(?:get|gets|getting)\s+each other off)\b/i;
  const negativePattern =
    /\b(?:do not depict (?:intimacy|sexual contact)|no sexual contact)\b/i;
  const beats = sectionBrief.requiredBeats ?? [];
  const originalGuidance = sectionBrief.originalGuidance || latestUserMessage;
  const guidanceRequestsExplicit = explicitPattern.test(originalGuidance);
  const sexualBeatPattern =
    /\b(?:physical encounter|sexual encounter|intimacy|intimate contact|touch(?:ing)?\s+(?:each other|over clothes|under clothes)|boxers|arousal|pleasure|hands?\s+(?:inside|down)|manual stimulation)\b/i;

  return beats
    .filter(
      (beat) =>
        beat.specialistWriter === "aion" ||
        (beat.specialistWriter === undefined &&
          (explicitPattern.test(beat.instruction) ||
            (guidanceRequestsExplicit && sexualBeatPattern.test(beat.instruction))) &&
          !negativePattern.test(beat.instruction)),
    )
    .map((beat, index) => ({
      marker: `${AION_MARKER_PREFIX}${index + 1}]]`,
      instruction: beat.instruction,
      wordTarget:
        typeof beat.approximateWordTarget === "number"
          ? Math.max(500, Math.min(1800, beat.approximateWordTarget))
          : 900,
    }));
}

function aionDiagnostic(input: {
  status: "succeeded" | "failed";
  usage?: OpenRouterUsage;
  durationMs: number;
  attempt: number;
  error?: string;
}): GenerationDiagnostic {
  const inputTokens = input.usage?.prompt_tokens ?? 0;
  const outputTokens = input.usage?.completion_tokens ?? 0;
  const reportedCost =
    typeof input.usage?.cost === "number" ? input.usage.cost : null;

  return {
    stage: "aion_automatic_intimacy_scene",
    provider: "openrouter",
    model: AION_MODEL,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd: reportedCost,
    costType: reportedCost === null ? "unavailable" : "reported",
    durationMs: input.durationMs,
    attempt: input.attempt,
    ...(input.error ? { error: input.error } : {}),
  };
}

function markerContext(draft: string, marker: string): {
  before: string;
  after: string;
} {
  const markerIndex = draft.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`The main writer did not place the required specialist marker ${marker}.`);
  }

  return {
    before: draft.slice(Math.max(0, markerIndex - 9000), markerIndex).trim(),
    after: draft
      .slice(markerIndex + marker.length, markerIndex + marker.length + 6000)
      .trim(),
  };
}

function validateHandoffMarkers(draft: string, scenes: SpecialistScene[], terminalMarker?: string): void {
  const actual = draft.match(/\[\[AION_SCENE_\d+\]\]/g) ?? [];
  if (actual.length !== scenes.length || scenes.some((scene, index) => actual[index] !== scene.marker)) {
    throw new Error("The chapter framework must contain each assigned scene marker exactly once, in order. Aion was not called; the existing draft is preserved.");
  }
  if (terminalMarker && !draft.trimEnd().endsWith(terminalMarker)) {
    throw new Error("The final assigned scene marker must end the chapter framework. The main writer must not write that scene or its aftermath. Aion was not called; the existing draft is preserved.");
  }
}

function validateProseResponse(prose: string, writer: string): void {
  if (!prose.trim()) throw new Error(`${writer} returned an empty response, not chapter prose. The existing draft is preserved.`);
  if (/^(?:(?:I['’]m sorry|Sorry)[,.!\s]+)?I\s+(?:can(?:not|['’]t)|won['’]t|am unable to)\s+(?:write|generate|continue|provide|assist|help)[\s\S]{0,300}\b(?:explicit|sexual content|pornograph\w*|this scene|that scene|this request|that request)\b/i.test(prose.trim())) {
    throw new Error(`${writer} returned a refusal rather than chapter prose. The existing draft is preserved.`);
  }
}

function validateContinuationBoundary(before: string, addition: string): void {
  const previous = normalise(before);
  const next = normalise(addition);
  const opening = next.split(" ").slice(0, 16).join(" ");
  if (opening.split(" ").length >= 12 && previous.includes(opening)) {
    throw new Error("The writer restarted prose already present in the edited draft. The existing draft is preserved; no automatic rewrite was started.");
  }
}

function chapterLengthWarnings(draft: string, target: NonNullable<SectionWritingBrief["targetWordRange"]>): string[] {
  const words = countWords(draft);
  return words < target.minimum || words > target.maximum
    ? [`The complete draft is ${words.toLocaleString()} words; the chapter target is ${target.minimum.toLocaleString()} to ${target.maximum.toLocaleString()}. This continuation has been saved for review.`]
    : [];
}

function specialistContinuation(sectionBrief: Partial<SectionWritingBrief>, latestUserMessage: string, instruction: string): SpecialistScene | undefined {
  const scenes = explicitSpecialistScenes(sectionBrief, latestUserMessage);
  if (/^\s*ASTRA\s*:/i.test(instruction)) return undefined;
  const finalBeat = sectionBrief.requiredBeats?.at(-1);
  return (finalBeat?.specialistWriter !== null ? scenes.find((scene) => scene.instruction === finalBeat?.instruction) : undefined) ??
    (/^\s*AION\s*:/i.test(instruction) ? scenes.at(-1) : undefined);
}

function validateSpecialistScene(scene: string, continuation = false): void {
  validateProseResponse(scene, "Aion");
  if (!continuation && countWords(scene) < 350) {
    throw new Error("Aion returned an incomplete intimacy scene.");
  }
  if (
    /^\s{0,3}#{1,6}\s+\S+/mu.test(scene) ||
    /```/.test(scene) ||
    scene.includes(AION_MARKER_PREFIX) ||
    /<\/?think[^>]*>/i.test(scene) ||
    /^\s*(?:rewrite|replacement|analysis|notes?|explanation)\s*:/im.test(scene)
  ) {
    throw new Error("Aion returned commentary or formatting instead of novel prose.");
  }
  if (/[—–]/u.test(scene)) {
    throw new Error("Aion returned prohibited long dashes.");
  }
  if (repeatedWindowOccurrences(scene, 16) >= 4) {
    throw new Error("Aion repeated substantial prose inside the intimacy scene.");
  }
}

async function writeSpecialistScene(input: {
  scene: SpecialistScene;
  assembledDraft: string;
  storyBible: unknown;
  storyState: unknown;
  chapterBrief: string;
  povCharacter: string;
  diagnostics: GenerationDiagnostic[];
  continuation?: boolean;
  sectionInstruction?: string;
}): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "This chapter contains an explicit scene, but OPENROUTER_API_KEY is not configured for the automatic Aion handoff.",
    );
  }

  const context = input.continuation
    ? { before: completeDraftContext(input.assembledDraft), after: "" }
    : markerContext(input.assembledDraft, input.scene.marker);
  const sectionBrief = readSectionBrief(input.chapterBrief);
  const latestDirection = input.sectionInstruction || sectionBrief.continuationGuidance || "No additional continuation instruction supplied.";
  const prompt = [
    "You are NovelForge's specialist intimacy writer for commercial adult MM romance.",
    input.continuation
      ? "Write only NEW prose continuing from the exact last sentence of the author's current edited draft. The draft is accepted prose, not an outline to regenerate. Do not restart the assigned beat or repeat actions, dialogue, reactions or discoveries already on the page. Return finished prose followed by <END_SECTION>, with no heading, analysis, notes or markdown."
      : "Write only the missing scene represented by the supplied marker. Return finished novel prose only, with no heading, marker, analysis, notes or markdown.",
    "Every romantic and sexual character is an adult aged eighteen or older. The scene is consensual. Follow the requested heat and acts directly, vividly and moment by moment.",
    input.continuation
      ? "Preserve the fixed first-person POV, tense, character voices, current physical positions, established boundaries and continuity. Begin after the exact final sentence of the supplied edited draft and follow the author's latest continuation direction."
      : "Preserve the fixed first-person POV, tense, character voices, physical staging, established boundaries and continuity. Begin exactly after BEFORE THE MARKER and end exactly before AFTER THE MARKER so the inserted prose reads as one uninterrupted chapter.",
    "Make the intimacy particular to these men and this stage of their relationship. It must reveal character, change the relationship or raise the emotional stakes. Let touch move naturally according to position, desire and response rather than returning repeatedly to waists and arms; avoid an anatomy inventory. Avoid a generic escalation sequence, recycled dirty talk, repeated reassurance, automatic soft aftercare and abrupt emotional breakthroughs that the contract does not authorise.",
    "Keep the POV character's attraction specific to what he finds appealing about this man, using selective physical, vocal or behavioural observations grounded in fixed appearance and the supplied prose. Do not repeat a favourite feature as a refrain or explain every response. Preserve established clothing, positions, objects and room conditions across the insertion boundaries. Do not introduce stock paper napkins, open windows or a default muted-colour outfit as generic scene decoration.",
    "Use natural contractions and complete contemporary sentences. Never use em dashes or en dashes. Do not recap earlier prose, repeat the first line after the marker or continue into later chapter beats.",
    "Keep dialogue and narration understandable on the first read, using natural language particular to each character. Make the connection between a reply and its prompt clear even during teasing, evasion or conflict. Let sarcasm work through the words and immediate context rather than missing premises or imagined delivery. Mix ordinary responses with selective wit; do not chain clever retorts, give everyone the same verbal style or explain a joke after it fails to land. Keep imagery selective and grounded, with plain phrasing where an elaborate comparison would obscure the moment. Preserve the established heat, emotional intensity and individual voices.",
    "Keep the reader inside the fixed POV character's immediate experience. Weave his private reactions, interpretations, withheld words and decisions through the live scene, rather than mainly reporting outward movements and surroundings. Prefer a revealing thought in his own voice over incidental set dressing. Retain enough physical orientation to follow the action, and let environmental details matter to what he notices or does. Do not add a thought after every line, pause for an internal essay, explain every feeling or repeat an established conclusion. Each response should develop with the unfolding interaction.",
    "When relevant supporting characters are present in this bounded scene, let them act and speak according to the supplied context instead of being described only through the POV character. If this scene also ends the chapter, land on its final live moment without an explanatory recap or generic thought about what comes next. Preserve the author's exact endpoint and do not invent additional beats.",
    input.continuation
      ? "Write only the continuation requested by the author. There is no minimum section length. Do not pad the section to satisfy the whole-chapter word target."
      : `TARGET LENGTH: approximately ${input.scene.wordTarget} words. Finish the scene cleanly even if exact length varies.`,
    input.continuation
      ? "LATEST AUTHOR CONTINUATION GUIDANCE, TAKES PRIORITY OVER EARLIER DIRECTIONS WHERE IT DELIBERATELY CHANGES THEM:\n" + latestDirection + "\nIf this guidance explicitly changes the old endpoint, follow the new endpoint. Otherwise retain the original endpoint and exclusions. Do not infer a new endpoint merely from the word continue."
      : "SCENE REQUIREMENT:\n" + input.scene.instruction,
    !input.continuation && (input.sectionInstruction || sectionBrief.continuationGuidance)
      ? "LATEST AUTHOR SCENE GUIDANCE:\n" + latestDirection + "\nThis takes priority where it deliberately changes an earlier instruction or endpoint; otherwise keep the original boundaries."
      : "",
    "POV CHARACTER:\n" + input.povCharacter,
    "CHAPTER CONTRACT:\n" + input.chapterBrief,
    "STORY BIBLE:\n" + JSON.stringify(input.storyBible ?? {}, null, 2),
    "CHARACTER VOICE PROFILES, ACTIVE POV FIRST:\n" +
      JSON.stringify(cleanVoiceProfiles(input.storyState, input.povCharacter), null, 2),
    "CONTINUITY STATE:\n" +
      JSON.stringify(cleanStoryState(input.storyState, input.povCharacter, input.chapterBrief + "\n" + (input.sectionInstruction ?? "")), null, 2),
    "BEFORE THE MARKER:\n" + context.before,
    "AFTER THE MARKER:\n" + context.after,
  ].join("\n\n");

  const outputTokenLimit = Math.min(18000, Math.max(12000, input.scene.wordTarget * 9));
  // OpenRouter's unified option is an extension to the OpenAI SDK types.
  const reasoningOptions = { reasoning: { effort: "low" as const } };
  const startedAt = Date.now();
  let usage: OpenRouterUsage | undefined;

  try {
    const response = await openrouter.chat.completions.create({
      model: AION_MODEL,
      messages: [
        {
          role: "system",
          content:
            input.continuation
              ? "Continue the author's current edited draft only. Follow the latest continuation guidance, including an explicitly changed endpoint, without replaying the original scene. Return new prose followed by <END_SECTION>. Reason internally but never expose reasoning."
              : "Return only the complete missing intimacy scene. Reason internally but never expose reasoning. Preserve the supplied boundaries exactly.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: outputTokenLimit,
      // Aion 3.5 defaults to high reasoning. Use its supported low setting so
      // this bounded scene leaves more of the existing budget for prose.
      ...reasoningOptions,
      temperature: 0.65,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
    usage = response.usage as OpenRouterUsage | undefined;
    const choice = response.choices[0];

    if (choice?.finish_reason === "length") {
      const inputTokens = usage?.prompt_tokens;
      const outputTokens = usage?.completion_tokens;
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
      const visibleWords = countWords(choice?.message?.content ?? "");
      const formatTokens = (value: number | undefined) =>
        typeof value === "number" ? value.toLocaleString() : "not reported";
      const visibleTokens = typeof outputTokens === "number" && typeof reasoningTokens === "number"
        ? formatTokens(Math.max(0, outputTokens - reasoningTokens))
        : "not reported";
      throw new Error(
        `Aion reached its output limit before finishing the intimacy scene. Input tokens: ${formatTokens(inputTokens)}; output tokens: ${formatTokens(outputTokens)}; reasoning tokens: ${formatTokens(reasoningTokens)}; estimated visible output tokens: ${visibleTokens}; returned prose: ${visibleWords.toLocaleString()} words. Requested output allowance: ${outputTokenLimit.toLocaleString()} tokens; reasoning effort: low. Your existing draft is preserved. No automatic retry was started.`,
      );
    }
    if (choice?.finish_reason === "content_filter") {
      throw new Error("Aion's provider stopped the intimacy scene with a content filter.");
    }
    if (choice?.message?.refusal) {
      throw new Error("Aion returned a refusal rather than chapter prose. The existing draft is preserved.");
    }

    const raw = choice?.message?.content?.trim() ?? "";
    validateProseResponse(raw, "Aion");
    const prose = input.continuation ? extractCompletedSection(raw, "", input.povCharacter) : raw;
    validateSpecialistScene(prose, input.continuation);
    if (input.continuation) {
      validateSection(prose, 0);
      validateContinuationBoundary(input.assembledDraft, prose);
    } else {
      validateContinuationBoundary(context.before, prose);
      if (context.after) validateContinuationBoundary(prose, context.after);
    }
    input.diagnostics.push(
      aionDiagnostic({
        status: "succeeded",
        usage,
        durationMs: Date.now() - startedAt,
        attempt: 1,
      }),
    );
    return prose;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aion could not write the intimacy scene.";
    input.diagnostics.push(
      aionDiagnostic({
        status: "failed",
        usage,
        durationMs: Date.now() - startedAt,
        attempt: 1,
        error: message,
      }),
    );
    throw new Error(message);
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endingExcerpt(text: string, maximumWords: number): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-maximumWords)
    .join(" ");
}

function cleanStoryState(value: unknown, pov = "", guidance = ""): unknown {
  return narrativeContext(value, { pov, guidance });
}

function cleanVoiceProfiles(
  value: unknown,
  povCharacter: string,
): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const profiles = (value as Record<string, unknown>).voiceProfiles;

  if (!Array.isArray(profiles)) {
    return [];
  }

  const normalisedPov = povCharacter.trim().toLowerCase();

  return profiles
    .filter(
      (profile): profile is Record<string, unknown> =>
        Boolean(profile) &&
        typeof profile === "object" &&
        !Array.isArray(profile),
    )
    .slice(0, 12)
    .sort((left, right) => {
      const leftIsPov =
        cleanString(left.characterName).toLowerCase() === normalisedPov;
      const rightIsPov =
        cleanString(right.characterName).toLowerCase() === normalisedPov;

      return Number(rightIsPov) - Number(leftIsPov);
    });
}

function completeDraftContext(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= 50000) {
    return trimmed;
  }

  return [
    trimmed.slice(0, 15000),
    "[Middle retained by the application but omitted from this prompt only because the draft exceeds 50,000 characters.]",
    trimmed.slice(-35000),
  ].join("\n\n");
}

function chapterRepetitionReport(text: string): string[] {
  const normalised = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalised) {
    return [];
  }

  const warnings: string[] = [];
  const sentences = normalised
    .split(/[.!?]+\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const openingCounts = new Map<string, number>();

  for (const sentence of sentences) {
    const words = sentence
      .replace(/^["']+/, "")
      .toLowerCase()
      .match(/[a-z']+/g);
    if (!words?.length) continue;
    const opening = words.slice(0, Math.min(3, words.length)).join(" ");
    openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
  }

  const repeatedOpenings = [...openingCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([opening, count]) => `"${opening}" (${count} sentence openings)`);

  if (repeatedOpenings.length) {
    warnings.push(
      `Repeated sentence openings: ${repeatedOpenings.join(", ")}.`,
    );
  }

  const phraseWords = normalised.toLowerCase().match(/[a-z']+/g) ?? [];
  const phraseCounts = new Map<string, number>();
  const ignoredPhrases = new Set([
    "one of the",
    "the other side",
    "i don't know",
    "i look at",
    "he looks at",
    "i can see",
  ]);

  for (let index = 0; index + 3 <= phraseWords.length; index += 1) {
    const phrase = phraseWords.slice(index, index + 3).join(" ");
    if (!ignoredPhrases.has(phrase)) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }

  const repeatedPhrases = [...phraseCounts.entries()]
    .filter(([, count]) => count >= 4)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([phrase, count]) => `"${phrase}" (${count})`);

  if (repeatedPhrases.length) {
    warnings.push(
      `Repeated three-word phrases: ${repeatedPhrases.join(", ")}.`,
    );
  }

  const habitChecks: Array<[string, RegExp, number]> = [
    ["look/looked/looking", /\blook(?:s|ed|ing)?\b/gi, 10],
    ["eyes/gaze", /\b(?:eyes?|gaze)\b/gi, 10],
    ["jaw", /\bjaw\b/gi, 4],
    ["breath/breathe", /\bbreath(?:e|es|ed|ing)?\b/gi, 5],
    ["turn/turned/turning", /\bturn(?:s|ed|ing)?\b/gi, 8],
    ["nod/nodded/nodding", /\bnod(?:s|ded|ding)?\b/gi, 5],
    ["silence/quiet", /\b(?:silence|silent|quiet|quietly)\b/gi, 7],
  ];
  const overusedHabits = habitChecks
    .map(([label, pattern, maximum]) => {
      const count = normalised.match(pattern)?.length ?? 0;
      return count > maximum ? `${label} (${count})` : "";
    })
    .filter(Boolean);

  if (overusedHabits.length) {
    warnings.push(
      `Potentially overused words or reactions: ${overusedHabits.join(", ")}.`,
    );
  }

  const injurySentences = sentences.filter((sentence) =>
    /\b(?:bandag(?:e|ed|es)|dressing|wound|injur(?:y|ed|ies)|stitch(?:es|ed)?|bruise(?:d|s)?|cut|scrape(?:d|s)?|bleed(?:s|ing)?|sore|swollen|swelling)\b/i.test(
      sentence,
    ),
  ).length;

  if (injurySentences >= 3) {
    warnings.push(
      `Minor-injury or caretaking language appears in ${injurySentences} sentences. Unless the condition changes or materially constrains the current action, stop foregrounding it.`,
    );
  }

  return warnings;
}

function cleanRecentChapters(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (chapter): chapter is Record<string, unknown> =>
        Boolean(chapter) &&
        typeof chapter === "object" &&
        !Array.isArray(chapter),
    )
    .slice(-2)
    .map((chapter) => ({
      number: chapter.number,
      title: cleanString(chapter.title),
      povCharacter: cleanString(chapter.povCharacter),
      endingExcerpt: endingExcerpt(cleanString(chapter.content), 500),
    }));
}

function getAction(value: unknown): SectionAction {
  return value === "start" || value === "rewrite" ? value : "continue";
}

function mainWriterSystemPrompt(handoff: boolean, action: SectionAction): string {
  return [
    "You are NovelForge, writing polished adult MM romance as a skilled human novelist. The complete Chapter Contract and its original author guidance govern the requested events, order, endpoint, exclusions and length.",
    handoff
      ? "On a start action, write only the chapter framework and unassigned beats. Each Aion-assigned beat belongs exclusively to Aion: insert its marker exactly once at its start and write none of its actions, dialogue, reactions or endpoint. If that beat is last, stop at the marker. Do not complete the assigned scene before leaving its marker."
      : "On a start action, write the complete requested chapter in one response.",
    "On continuation, the author's current edited draft is authoritative. Continue only after its exact final sentence; do not restore deleted text or replay completed material. The latest continuation guidance takes priority where it deliberately changes an earlier instruction or endpoint. Otherwise retain the original endpoint and exclusions. On rewrite, replace only the selected passage.",
    "Follow accepted continuity, stay in the fixed POV and tense, and return only complete novel prose followed by <END_SECTION>. Write fluid contemporary prose with natural contractions. Make each character's voice distinct and each conversation logically connected, imperfect and alive. Let important moments breathe without filler, circular thought or repeated explanation. Treat repetition data as guidance rather than a rigid blacklist. Never foreground a stable minor injury or routine caretaking unless it materially affects the present action.",
    handoff ? "Do not write any part of an Aion-assigned scene." : "When explicit intimacy is requested, make it vivid, physically clear, character-specific and consequential.",
    action === "continue" ? "A valid requested continuation can be short. Do not pad it to reach a chapter word target." : "",
    "Never use em dashes or en dashes, repeat completed material or add an unrequested escalation.",
  ].filter(Boolean).join(" ");
}

function getPrompt(input: {
  action: SectionAction;
  storyBible: unknown;
  storyState: unknown;
  recentChapters: unknown[];
  chapterBrief: string;
  chapterTitle: string;
  povCharacter: string;
  chapterDraft: string;
  sectionToRewrite: string;
  sectionInstruction: string;
  latestUserMessage: string;
  specialistScenes: SpecialistScene[];
}): string {
  const sectionBrief = readSectionBrief(input.chapterBrief);
  const originalGuidance =
    sectionBrief.originalGuidance ||
    input.latestUserMessage ||
    sectionBrief.authorDirection ||
    "Open the chapter from the established continuity boundary.";
  const requiredBeats = sectionBrief.requiredBeats?.length
    ? sectionBrief.requiredBeats
    : [
        {
          order: 1,
          instruction: sectionBrief.authorDirection || originalGuidance,
        },
      ];
  const targetWordRange = getTargetWordRange(sectionBrief);
  const endpoint =
    sectionBrief.endpoint ||
    requiredBeats[requiredBeats.length - 1]?.instruction ||
    "Stop at the final development explicitly requested by the author.";
  const chapterContract = {
    continuationGuidance: sectionBrief.continuationGuidance,
    chapterNumber: sectionBrief.chapterNumber,
    chapterKind: sectionBrief.chapterKind,
    chapterTitle: input.chapterTitle || sectionBrief.chapterTitle,
    povCharacter: input.povCharacter || sectionBrief.povCharacter,
    authorDirection: sectionBrief.authorDirection || originalGuidance,
    continuationBoundary: sectionBrief.continuationBoundary,
    originalGuidance,
    requiredBeats,
    endpoint,
    exclusions: sectionBrief.exclusions ?? [],
    targetWordRange,
  };
  const fullDraftContext = completeDraftContext(input.chapterDraft);
  const exactContinuationBoundary = endingExcerpt(input.chapterDraft, 350);
  const draftRepetitionReport = chapterRepetitionReport(input.chapterDraft);
  const voiceProfiles = cleanVoiceProfiles(
    input.storyState,
    input.povCharacter,
  );
  const manualRecoveryInstruction =
    input.sectionInstruction || sectionBrief.continuationGuidance || "No additional recovery instruction supplied.";
  const actionInstruction =
    input.action === "start"
      ? input.specialistScenes.length
        ? "Write the chapter framework only: write unassigned beats and place each assigned Aion marker exactly once at the START of its assigned beat. Write no action, dialogue, internal reaction or endpoint belonging to an assigned beat. If an assigned beat ends the chapter, stop immediately after its marker. The complete chapter word target applies after the specialist fills the markers, not to this framework."
        : `Write the complete requested chapter in one response. Begin from the continuity boundary: ${
          sectionBrief.continuationBoundary ||
          "the exact accepted ending supplied in continuity"
        }. Include every REQUIRED BEAT in order, reach the precise ENDPOINT, and do not continue beyond it. The complete chapter must be ${targetWordRange.minimum.toLocaleString()} to ${targetWordRange.maximum.toLocaleString()} words; aim near ${targetWordRange.preferred.toLocaleString()} words.`
      : input.action === "rewrite"
        ? "Replace SECTION TO REWRITE only. Preserve what happens immediately before and after it. The full Chapter Contract governs continuity and prohibitions, but do not add later required beats, rewrite the whole chapter or advance beyond the selected passage."
        : "Continue only from the exact last sentence of the author's current edited draft. It is accepted prose, not an outline to regenerate. Follow the latest continuation guidance; when it deliberately changes an earlier direction or endpoint, the new direction takes priority. Otherwise keep the original endpoint and exclusions. Do not infer permission to change the endpoint merely from the word continue. Do not replay completed actions or restore text the author removed. Write only the requested new section, with no minimum section length and no padding to reach the whole-chapter target.";
  const specialistBudget = input.specialistScenes.reduce(
    (total, scene) => total + scene.wordTarget,
    0,
  );
  const specialistInstruction = input.specialistScenes.length
    ? [
        "AUTOMATIC SPECIALIST HANDOFF",
        "The explicit intimacy beats listed below will be written by NovelForge's specialist model after this response.",
        "At the START of each listed assigned beat, output its marker exactly once on a line by itself. That beat belongs exclusively to the specialist. Do not write any part of it, its endpoint or a substitute summary. Continue with later unassigned prose only when the chapter contract requires later beats; if the assigned beat is last, stop at its marker.",
        "Make the prose immediately before and after every marker join naturally once the marker is replaced. Do not refer to a missing scene, a handoff or a marker in the narration.",
        `Reserve approximately ${specialistBudget.toLocaleString()} words of the complete chapter target for specialist scenes. Keep the non-specialist prose compact enough that the final assembled chapter remains within the contract range.`,
        JSON.stringify(input.specialistScenes, null, 2),
      ].join("\n\n")
    : "";

  return [
    "You are NovelForge. Write polished, immersive adult MM romance as a skilled human novelist would write it.",
    "THE JOB",
    "The CHAPTER CONTRACT is author authority over what must happen. ORIGINAL GUIDANCE is its lossless fallback source of truth. Follow the requested participants, ordered beats, endpoint, exclusions and target length without simplifying, replacing or creatively reinterpreting them. The Story Bible and accepted continuity control established facts. A deliberate new instruction from the author may change an earlier plan.",
    "Read the complete current draft as finished novel prose. Continue from its exact final moment without recapping it, repeating its ending or skipping an interaction the reader expects to witness.",
    input.action === "rewrite"
      ? "Rewrite only the selected passage. Preserve what happens immediately before and after it."
      : input.action === "start"
        ? "Write one complete chapter, not an instalment or sample. Silently inspect all required beats before drafting and allocate the available word budget across them so the opening is not over-expanded and later beats or the endpoint are not rushed."
        : "Write only the requested recovery prose. Do not restart or recap the chapter.",
    "Invent dialogue, micro-actions, internal thought, description and connective tissue freely when needed to dramatise the contract, but do not invent major events, alter beat order, cross an exclusion or advance beyond the endpoint.",
    "Return only novel prose followed by <END_SECTION> on its own line. Finish every sentence before the marker.",
    "NATURAL PROSE",
    "Use natural contractions in narration, internal thought and dialogue wherever a real person would use them. Write I'm, I'd, I'll, I've, it's, isn't, wasn't, don't, didn't, can't, won't, shouldn't, wouldn't, he's, they're and we're. Use a full form only for deliberate emphasis or because that particular character would naturally say it that way. A controlled, educated, wealthy, older, authoritative or professional man does not automatically speak or think stiffly.",
    "Keep sentences complete, grammatical, contemporary and idiomatic. Vary sentence length according to the POV character and the pressure of the moment. Never use an em dash or en dash.",
    "Keep the reader close to the POV character's experience as events happen. Between dialogue and action, favour his immediate private thoughts, reactions, interpretations, wants and impulses over incidental descriptions of the surroundings. Let us hear what he wants to say but withholds, the meaning he reads into another person's words or behaviour, what he hopes will happen and what he decides to do next. Use his own natural vocabulary and rhythm, not a detached explanation of his psychology. A small revealing reaction is enough; each thought need not deliver a major realisation or name an emotion. Give important moments room to breathe without restating what the reader already understands.",
    "Keep description selective and seen through this POV. Establish enough place, position and physical action for the reader to follow the scene, then let the character's inner experience carry more of the narration. Notice surroundings when they affect what he does, catch his attention for a personal reason, trigger a specific thought or alter the mood or stakes. Do not routinely open scenes with weather, smells, traffic noise or a room inventory, or fill conversational pauses with unrelated objects and movements. Preserve necessary physical clarity and atmosphere without repeatedly pulling attention away from the people.",
    "Weave thoughts into the live exchange rather than stopping the scene for a long internal essay. Give him space to react before he answers when that reaction matters, but do not insert a thought after every spoken line or action. Vary the balance with the scene's pressure and the character's voice; use no fixed thought-to-description ratio. Keep his attention moving as the exchange changes. Avoid circular rumination, repeated denials, repeated reassurance, recaps of his feelings, therapy language and explanations of every implication. Carry an established feeling forward through a fresh interpretation, choice or response rather than rehearsing its explanation again.",
    "Let narration and internal thought be equally easy to follow. Use the POV character's natural vocabulary and concrete observations. Keep figurative language and comic comparisons when they sharpen what he notices or feels, but allow ordinary actions and thoughts to stand plainly. Do not turn every movement into a witty analogy, abstract verdict or miniature performance. Choose precise, natural phrasing when an ornate comparison makes the reader reconstruct a simple meaning. Preserve varied sentence rhythms, emotional depth and individual voice; clarity does not require clipped prose, an explanation of every implication or simplified characters.",
    "Choose incidental objects and environmental details from the actual place, activity, weather and people. Do not repeatedly furnish unrelated scenes with paper napkins or open windows, or replace them with another stock prop used everywhere. An open window needs a plausible reason, not a default place in every room. Reuse an established detail when continuity or a deliberate motif makes it matter; otherwise omit unnecessary business rather than adding decorative novelty. Read the supplied continuity and recent prose for repeated set dressing.",
    "Give clothing the variety real people have, consistent with each person's taste, budget, work, age, setting and weather. Do not default the cast to grey, charcoal, green and blue shirts. Allow other colours, prints, fabrics, fits and styles where natural, including brighter or patterned clothes when they suit the person. Differentiate wardrobes without assigning every character one permanent colour, making everyone fashionable or listing an outfit at every entrance. Mention clothing when it serves POV, attraction, character or action. Preserve the current outfit within a scene and carry it across continuous scenes unless a change is shown or established; do not invent an opportunity to change clothes merely for variety.",
    "CHARACTERS AND VOICE",
    "Write these characters as specific adult men, not romance templates. Their work, background, age, culture, friendships, habits, pride, humour, experience and blind spots shape what they notice, how they speak, what they hide and what they do.",
    "Use CHARACTER VOICE PROFILES as the authority for each character's syntax, vocabulary, rhythm, humour, swearing, emotional habits and conflict style. If a profile is absent, derive a distinct voice from the Story Bible. The leads must not sound interchangeable in narration or dialogue.",
    "A character's behaviour must grow from what he wants now, what he knows and what he is trying not to reveal. Do not make him perform a generic role such as the gruff protector, perfect caretaker, therapist, mind-reader or endlessly patient green flag unless that behaviour is genuinely individual to him and earned by the scene.",
    "When a recurring supporting character is present and relevant, let them participate through their own dialogue, choices, interruptions and responses that affect the scene. Show their relationship with the leads through exchanges rather than only the POV character's description or summary of their role. Do not force incidental extras to speak or give supporting characters dialogue that serves no purpose.",
    "DIALOGUE",
    "Write conversations real people could actually have. Each response must make sense after the previous words or visible action, even when someone evades, lies, misunderstands or changes the subject for a reason the reader can follow.",
    "Prioritise meaning on the first read. Use idiomatic spoken language suited to the character and setting, with an understandable connection between each reply and what prompted it. A reader may be uncertain about a character's motives while still understanding what he is saying. Let subtext deepen a clear exchange. Sarcasm should be audible from the wording and immediate situation without relying on an imagined delivery or an unstated premise. When a reply needs a missing conversational step, a strained comparison or several unrelated associations to work, choose the more natural response instead of explaining the clever line afterward. During the final silent check, read each exchange in sequence for what the speakers are actually responding to, not just for the effect of individual lines.",
    "Give conversations room for ordinary answers, genuine questions, unfinished thoughts, silence and practical remarks. Wit belongs where it arises from this person's mood and the shared situation; a funny character need not answer everything with a comeback. Let a joke land without automatically supplying another punch line. Preserve distinctive humour, swearing, teasing, conflict and evasion, but vary their frequency and shape by person and circumstance. Do not give the whole cast the same polished verbal agility, or default everyone to mock consulting fees, contracts, legal precedent, official notices and similar business or bureaucratic jokes. Use such language when it belongs to that character and moment, rather than as a shared house style. Do not make intelligent characters speak more cryptically to prove their intelligence.",
    "People may interrupt, answer only part of a question, deflect, tease, swear, joke badly, become defensive, say the imperfect thing, leave implications unstated or go quiet. Preserve friction and subtext. Do not make every exchange emotionally tidy.",
    "Avoid exposition both speakers know, interview-style question chains, random topic changes, confirmation ladders, constant banter, interchangeable sarcasm, therapy language, mediator language, workplace-training language and speeches that explain what the scene already shows.",
    "PACE, FRESHNESS AND CONTINUITY",
    "Every scene must advance character, relationship, conflict or plot, but it may also contain brief distinctive texture that makes the people and world feel lived in. Maintain clear causal flow between beats and let transitions arise from character choices and consequences. Cut filler, transition waffle, repeated conclusions and generic reactions. Do not turn this into clipped, staccato or breathless prose merely to make it efficient.",
    "At scene and chapter boundaries, land on the strongest live action, exchange, decision, discovery or consequence, then stop at the specified endpoint. Do not append a recap, a paragraph explaining the meaning or feeling of what just happened, or a generic thought wondering what comes next. Allow implications and unresolved tension to remain. Vary the shape of endings; do not routinely finish with ominous reflection or a rhetorical question. Preserve any explicitly requested final beat or line.",
    "Treat the repetition report as guidance, not a rigid blacklist. Avoid a tracked pattern naturally. Do not contort sentences, drain the character's voice or replace one repeated phrase with a different cliché merely to satisfy a count.",
    "Carry forward established facts, knowledge, positions, timeline and relationship progress. Do not invent off-page conversations, emotional breakthroughs, prior attraction, sudden conflicts or convenient solutions.",
    "Treat a relationship question answered on page as settled continuity, even if its external cause remains unresolved. Check the completed exchanges and conclusions in the continuity ledger before writing another emotional conversation. Do not have either character seek the same reassurance or argue toward the same answer again with changed wording. Show lingering feelings through new behaviour, humour, intimacy or a concrete choice. Revisit the subject only when the author's current instruction explicitly requires it or a specific new event changes the facts or stakes; then give the exchange new information and an actual consequence. Do not invent neediness to fill a scene.",
    "A stable minor injury belongs in continuity but not in the foreground. Mention it only if it changes, is directly aggravated or materially limits the current action. Do not repeatedly check, protect, worry about, discuss or reassure over a bandage, bruise, cut or other ordinary discomfort. Do not use routine caretaking as automatic proof of love.",
    "ROMANCE AND HIGH HEAT",
    "Every romantic or sexual character is an adult aged eighteen or older.",
    "Let attraction, awareness, emotional attachment and physical escalation develop at the pace established by the Story Bible, current guidance and events already shown. Do not force the next romantic milestone merely because the characters share a scene. Vary purposeful hand placement according to the bodies' positions and what each person wants or responds to; do not repeatedly default to touching waists and arms or turn touch into an anatomy inventory.",
    "When attraction is established or the current guidance calls for it, let the POV character register what he personally finds attractive, sexy or distracting about the other man. Select concrete physical attributes, movement, voice, expression or the way clothes fit, consistent with fixed appearance and the immediate action. Let desire colour what catches his attention and how he responds, rather than relying on generic handsome labels, scent and proximity alone. Different men notice and value different things; keep that preference individual and allow it to deepen with familiarity. A character in denial may notice before admitting why, without naming himself obsessed or explaining every reaction. Do not invent major physical traits, force attraction before the planned stage, insert an admiring inventory, repeat the same favourite feature every encounter or turn every glance into arousal. Preserve anger and conflict when present; attraction does not automatically soften either man or settle their dispute.",
    "When CURRENT GUIDANCE calls for explicit intimacy, write it openly, vividly and moment by moment. Keep the bodies and movement physically clear. Make the language, tempo, humour, hunger, vulnerability, power and aftermath specific to these men and this point in their relationship.",
    "Do not use a standard escalation sequence, anatomy inventory, recycled dirty talk, repeated reassurance, procedural checklists or an automatic soft aftercare scene. Intimacy must reveal character, change the relationship or create a consequence, and it must not repeat the shape or language of an earlier encounter.",
    specialistInstruction,
    "POV",
    "Use the Story Bible's POV and tense. Default to first-person present only if neither is specified. Remain in " +
      input.povCharacter +
      "'s POV and never report another character's unspoken thoughts as fact.",
    "STORY BIBLE, FIXED CANON\n" +
      JSON.stringify(input.storyBible ?? {}, null, 2),
    "CHARACTER VOICE PROFILES, ACTIVE POV FIRST\n" +
      (voiceProfiles.length
        ? JSON.stringify(voiceProfiles, null, 2)
        : "No persistent profile exists yet. Establish distinct voices from the Story Bible and current prose."),
    "CONTINUITY CHECKPOINT\n" +
      JSON.stringify(cleanStoryState(input.storyState, input.povCharacter, input.chapterBrief + "\n" + (input.sectionInstruction ?? "")), null, 2),
    "RECENT CHAPTER ENDINGS\n" + JSON.stringify(input.recentChapters, null, 2),
    "COMPLETE CHAPTER CONTRACT, AUTHOR AUTHORITY\n" +
      JSON.stringify(chapterContract, null, 2),
    "ORIGINAL GUIDANCE, LOSSLESS FALLBACK SOURCE OF TRUTH\n" +
      originalGuidance,
    input.chapterDraft
      ? "COMPLETE CURRENT CHAPTER DRAFT, READ ONLY\n" + fullDraftContext
      : "",
    input.chapterDraft
      ? "EXACT CONTINUATION BOUNDARY, READ ONLY\n" +
        exactContinuationBoundary
      : "",
    "CURRENT CHAPTER REPETITION REPORT, GUIDANCE ONLY\n" +
      (draftRepetitionReport.length
        ? draftRepetitionReport.join("\n")
        : "No tracked pattern has crossed its review threshold."),
    input.action === "rewrite"
      ? "SECTION TO REWRITE, READ ONLY\n" + input.sectionToRewrite
      : "",
    "CHAPTER METADATA\nTitle: " +
      input.chapterTitle +
      "\nPOV: " +
      input.povCharacter,
    "MANUAL RECOVERY INSTRUCTION\n" + manualRecoveryInstruction,
    "EXACT ACTION AND BOUNDARY\n" + actionInstruction,
    "Before returning the prose, silently check that the action-specific scope is complete, required beats are respected in order, the endpoint and exclusions are obeyed, the prose sounds natural when read aloud, the conversation follows logically, the POV voice belongs to this character, contractions are natural, no thought is pointlessly repeated, and no stable injury has been turned into a recurring relationship ritual. Correct only actual problems. Do not flatten lively prose to satisfy a checklist. Return no analysis.",
    input.action === "start"
      ? "Complete the chapter, output <END_SECTION>, then stop."
      : "Complete the requested recovery prose, output <END_SECTION>, then stop.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractCompletedSection(
  raw: string,
  chapterTitle: string,
  povCharacter: string,
  providerCompleted = false,
): string {
  const trimmed = raw.trim();

  // A provider-confirmed completed response can omit our advisory marker.
  // Callers still validate prose, sentence endings, length and scene handoffs.
  if (!/<END_SECTION>\s*$/i.test(trimmed) && !providerCompleted) {
    throw new Error(
      "The writing model did not deliberately complete the section.",
    );
  }

  let section = trimmed.replace(/\s*<END_SECTION>\s*$/i, "").trim();

  if (/^```(?:text|markdown)?\s*/i.test(section) && /```\s*$/i.test(section)) {
    section = section
      .replace(/^```(?:text|markdown)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  const lines = section.split(/\r?\n/);
  const normalisedChapterTitle = chapterTitle.trim().toLowerCase();
  const normalisedPovCharacter = povCharacter.trim().toLowerCase();

  while (lines.length > 0) {
    const firstLine = lines[0].trim();
    const withoutMarkdown = firstLine.replace(/^#{1,6}\s*/, "").trim();
    const withoutLabel = withoutMarkdown
      .replace(/^(?:title|chapter title|pov|point of view)\s*:\s*/i, "")
      .trim()
      .toLowerCase();
    const isKnownMetadata =
      !firstLine ||
      /^#{1,6}\s+\S+/.test(firstLine) ||
      /^chapter\s+\d+(?:\s*[:.\-]\s*.+)?$/i.test(withoutMarkdown) ||
      /^(?:title|chapter title|pov|point of view)\s*:/i.test(withoutMarkdown) ||
      (Boolean(normalisedChapterTitle) &&
        withoutLabel === normalisedChapterTitle) ||
      (Boolean(normalisedPovCharacter) &&
        withoutLabel === normalisedPovCharacter);

    if (!isKnownMetadata) break;
    lines.shift();
  }

  section = lines.join("\n").trim();

  if (!section) {
    throw new Error("The writing model returned no section prose.");
  }

  return section;
}

function validateSection(section: string, minimumWords = 120): void {
  validateProseResponse(section, "The writer");
  if (
    /^\s*chapter\s+\d+\b/im.test(section) ||
    /^\s{0,3}#{1,6}\s+\S+/mu.test(section) ||
    /```/.test(section) ||
    /^\s*(outline|analysis|notes?|instructions?|chapter plan|word count)\s*:/im.test(
      section,
    ) ||
    /<\/?think[^>]*>/i.test(section)
  ) {
    throw new Error(
      "The writing model returned headings, markdown or instruction-like text instead of clean prose.",
    );
  }

  if (!/[.!?…”’'"]$/u.test(section)) {
    throw new Error(
      "The writing model returned an obviously truncated section.",
    );
  }

  if (repeatedWindowOccurrences(section, 16) >= 4) {
    throw new Error(
      "The writing model repeated substantial prose within the same section. The duplicated output was discarded.",
    );
  }

  if (countWords(section) < minimumWords) {
    throw new Error(
      "The writing model returned too little prose to preserve safely.",
    );
  }
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'" ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function substantialParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(normalise)
    .filter((paragraph) => paragraph.split(" ").length >= 12);
}

function wordWindows(text: string, size: number): Set<string> {
  const words = normalise(text).split(" ").filter(Boolean);
  const windows = new Set<string>();

  for (let index = 0; index + size <= words.length; index += 1) {
    windows.add(words.slice(index, index + size).join(" "));
  }

  return windows;
}

function repeatedWindowOccurrences(text: string, size: number): number {
  const words = normalise(text).split(" ").filter(Boolean);
  const counts = new Map<string, number>();

  for (let index = 0; index + size <= words.length; index += 1) {
    const window = words.slice(index, index + size).join(" ");
    counts.set(window, (counts.get(window) ?? 0) + 1);
  }

  let repeated = 0;

  for (const count of counts.values()) {
    if (count > 1) {
      repeated += count - 1;
    }
  }

  return repeated;
}

function repetitionWarnings(
  chapterDraft: string,
  section: string,
  sectionToRewrite: string,
): string[] {
  const comparisonDraft =
    sectionToRewrite && chapterDraft.includes(sectionToRewrite)
      ? chapterDraft.replace(sectionToRewrite, "")
      : chapterDraft;
  const warnings: string[] = [];
  const existingParagraphs = new Set(substantialParagraphs(comparisonDraft));
  const returnedParagraphs = substantialParagraphs(section);

  if (/[—–]/u.test(section)) {
    warnings.push(
      "This section contains a prohibited em dash or en dash. Review it before continuing.",
    );
  }

  const combinedProse = `${comparisonDraft}\n\n${section}`;
  const injuryMentions = combinedProse
    .split(/[.!?]+\s+/)
    .filter((sentence) =>
      /\b(?:bandag(?:e|ed|es)|dressing|wound|injur(?:y|ed|ies)|stitch(?:es|ed)?|bruise(?:d|s)?|cut|scrape(?:d|s)?|bleed(?:s|ing)?|sore|swollen|swelling)\b/i.test(
        sentence,
      ),
    ).length;

  if (injuryMentions >= 4) {
    warnings.push(
      "This chapter repeatedly foregrounds an injury or caretaking detail. Keep it only if its state changes or it materially constrains the immediate action.",
    );
  }

  const overuseChecks: { pattern: RegExp; maximum: number }[] = [
    { pattern: /\bmy heart (?:is )?pound(?:s|ing)\b/gi, maximum: 1 },
    { pattern: /\bi (?:take|draw) a deep breath\b/gi, maximum: 1 },
    { pattern: /\bi can(?:not|'t) help but\b/gi, maximum: 1 },
    { pattern: /\bi remind myself\b/gi, maximum: 1 },
    { pattern: /\b(?:his|her|my|their) jaw\b/gi, maximum: 3 },
    { pattern: /\b(?:his|her|my|their) (?:eyes|gaze)\b/gi, maximum: 6 },
    {
      pattern: /\bclench(?:es|ed|ing)? (?:his|her|my|their) teeth\b/gi,
      maximum: 2,
    },
  ];

  if (
    overuseChecks.some(
      ({ pattern, maximum }) =>
        Array.from(combinedProse.matchAll(pattern)).length > maximum,
    )
  ) {
    warnings.push(
      "This section overuses a physical or internal reaction already used in the chapter. Review it before continuing.",
    );
  }

  if ((section.match(/:/g) ?? []).length > 3) {
    warnings.push(
      "This section uses colons unusually often for novel prose. Review whether the narration has become list-like or explanatory.",
    );
  }

  if (
    /\b(?:something i (?:can(?:not|'t)|could(?: not|n't)) (?:name|identify)|not \w+[,.]? exactly|an unfamiliar feeling|an unexplained pull)\b/i.test(
      section,
    )
  ) {
    warnings.push(
      "This section uses vague unnamed-awareness phrasing that may advance attraction prematurely.",
    );
  }

  if (
    returnedParagraphs.some((paragraph) => existingParagraphs.has(paragraph))
  ) {
    warnings.push(
      "This section contains a substantial paragraph already present in the chapter.",
    );
  }

  if (comparisonDraft.trim()) {
    const existingWindows = wordWindows(comparisonDraft, 16);
    const sectionWindows = wordWindows(section, 16);
    let sharedWindows = 0;

    for (const window of sectionWindows) {
      if (existingWindows.has(window)) {
        sharedWindows += 1;
      }
    }

    if (sharedWindows >= 2) {
      warnings.push(
        "This section contains passages that closely overlap existing chapter prose.",
      );
    }
  }

  const internalParagraphs = substantialParagraphs(section);
  if (new Set(internalParagraphs).size !== internalParagraphs.length) {
    warnings.push(
      "This section repeats one of its own substantial paragraphs.",
    );
  }

  return warnings;
}

function isTechnicalFailure(error: unknown): boolean {
  if (error instanceof TechnicalWriterError) {
    return true;
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return true;
  }

  if (error instanceof OpenAI.APIError) {
    return (
      error.status === undefined ||
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500)
    );
  }

  return error instanceof TypeError;
}

function diagnostic(input: {
  writer: ReturnType<typeof selectedProseWriter>;
  status: "succeeded" | "failed";
  usage?: Usage;
  durationMs: number;
  attempt: number;
  error?: string;
}): GenerationDiagnostic {
  const inputTokens = input.usage?.input_tokens ?? 0;
  const outputTokens = input.usage?.output_tokens ?? 0;
  const cachedTokens = input.usage?.input_tokens_details?.cached_tokens ?? 0;
  const costUsd = input.usage?.cost ?? proseCostEstimate(input.writer.model, inputTokens, outputTokens, cachedTokens);

  return {
    stage: "chapter_section_writing",
    provider: input.writer.provider,
    model: input.writer.model,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd,
    costType: input.usage?.cost !== undefined ? "reported" : "estimated",
    durationMs: input.durationMs,
    attempt: input.attempt,
    ...(input.error ? { error: input.error } : {}),
  };
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as WriterRequest;
    const action = getAction(body.action);
    const chapterBrief = cleanString(body.chapterBrief);
    const chapterTitle = cleanString(body.chapterTitle);
    const povCharacter = cleanString(body.povCharacter);
    const chapterDraft = cleanString(body.chapterDraft);
    const sectionToRewrite = cleanString(body.sectionToRewrite);
    const sectionBrief = readSectionBrief(chapterBrief);
    const latestUserMessage = cleanString(body.latestUserMessage);
    const phase = cleanString(body.phase);
    const sectionInstruction = cleanString(body.sectionInstruction) || sectionBrief.continuationGuidance || "";
    const writer = selectedProseWriter(body.storyState, sectionInstruction);
    const assignedScenes = explicitSpecialistScenes(sectionBrief, latestUserMessage);
    const finalBeat = sectionBrief.requiredBeats?.at(-1);
    const terminalScene = finalBeat?.specialistWriter !== null
      ? assignedScenes.find((scene) => scene.instruction === finalBeat?.instruction)
      : undefined;
    const specialistScenes =
      action === "start"
        ? explicitSpecialistScenes(sectionBrief, latestUserMessage)
        : [];
    const targetWordRange = getTargetWordRange(sectionBrief);
    const maxOutputTokens = getOutputTokenLimit(targetWordRange.maximum);

    if (!chapterBrief || !povCharacter) {
      return NextResponse.json(
        { error: "A current section brief and POV character are required." },
        { status: 400 },
      );
    }

    if (phase === "fill_specialist") {
      if (action !== "start" || !chapterDraft || !specialistScenes.length) {
        return NextResponse.json(
          { error: "A saved chapter with a pending specialist scene is required." },
          { status: 409 },
        );
      }

      const nextScene = specialistScenes.find((scene) =>
        chapterDraft.includes(scene.marker),
      );
      if (!nextScene) {
        return NextResponse.json(
          { error: "The saved chapter has no recognised Aion marker to resume." },
          { status: 409 },
        );
      }

      try {
        validateHandoffMarkers(chapterDraft, specialistScenes.filter((scene) => chapterDraft.includes(scene.marker)), terminalScene?.marker);
        const replacement = await writeSpecialistScene({
          scene: nextScene,
          assembledDraft: chapterDraft,
          storyBible: body.storyBible ?? {},
          storyState: body.storyState ?? {},
          chapterBrief,
          povCharacter,
          diagnostics,
          sectionInstruction,
        });
        const section = chapterDraft.replace(nextScene.marker, replacement);
        const specialistScenesPending = specialistScenes.some((scene) =>
          section.includes(scene.marker),
        );

        if (!specialistScenesPending) {
          validateSection(section);
          validateChapterLength(section, targetWordRange);
        }

        return NextResponse.json({
          section,
          wordCount: countWords(section),
          warnings: specialistScenesPending
            ? []
            : repetitionWarnings("", section, ""),
          action: "start",
          specialistScenesPending,
          diagnostics,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "The automatic Aion handoff failed.",
            preservedDraft: error instanceof ChapterLengthError ? error.preservedDraft : chapterDraft,
            diagnostics,
          },
          { status: error instanceof ChapterLengthError ? 422 : 502 },
        );
      }
    }

    if (
      action === "start" &&
      !specialistScenes.length &&
      // Explicit routing (including null = main writer) is authoritative.
      // Only legacy contracts without complete routing need this keyword guard.
      !(sectionBrief.requiredBeats?.length && sectionBrief.requiredBeats.every(
        (beat) => beat.specialistWriter === null || beat.specialistWriter === "aion",
      )) &&
      /\b(?:explicit|graphic|open[ -]door|on[ -]page sex|sex scene|hand[ -]?job|masturbat\w*|wank\w*|jerk(?:ing|s|ed)?\s+(?:each other\s+)?off|perking\s+off|hands?\s+(?:inside|down)\s+(?:his|their|the|each other's)?\s*boxers)\b/i.test(
        sectionBrief.originalGuidance || latestUserMessage,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The Chapter Contract has no Aion assignment for the requested specialist beat. Recreate the contract with the updated planner so its routing fields are included. Your draft is unchanged.",
        },
        { status: 422 },
      );
    }

    if (action === "start" && chapterDraft) {
      return NextResponse.json(
        { error: "A new chapter section cannot start with an existing draft." },
        { status: 409 },
      );
    }

    if (action === "continue" && !chapterDraft) {
      return NextResponse.json(
        { error: "Continuing a chapter requires its existing draft." },
        { status: 409 },
      );
    }

    if (
      action === "rewrite" &&
      (!chapterDraft ||
        !sectionToRewrite ||
        !chapterDraft.includes(sectionToRewrite))
    ) {
      return NextResponse.json(
        {
          error: "Rewriting requires an exact section from the current draft.",
        },
        { status: 409 },
      );
    }

    const continuationScene = action === "continue"
      ? specialistContinuation(sectionBrief, latestUserMessage, sectionInstruction)
      : undefined;
    if (continuationScene) {
      try {
        const section = await writeSpecialistScene({
          scene: continuationScene,
          assembledDraft: chapterDraft,
          storyBible: body.storyBible ?? {},
          storyState: body.storyState ?? {},
          chapterBrief,
          povCharacter,
          diagnostics,
          continuation: true,
          sectionInstruction,
        });
        return NextResponse.json({
          section,
          wordCount: countWords(section),
          warnings: [
            ...repetitionWarnings(chapterDraft, section, ""),
            ...chapterLengthWarnings(`${chapterDraft}\n\n${section}`, targetWordRange),
          ],
          action: "continue",
          diagnostics,
        });
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "The scene continuation failed.",
          preservedDraft: chapterDraft,
          diagnostics,
        }, { status: 422 });
      }
    }

    const writingPrompt = getPrompt({
      action,
      storyBible: body.storyBible ?? {},
      storyState: body.storyState ?? {},
      recentChapters: cleanRecentChapters(body.recentChapters),
      chapterBrief,
      chapterTitle,
      povCharacter,
      chapterDraft,
      sectionToRewrite,
      sectionInstruction,
      latestUserMessage: cleanString(body.latestUserMessage),
      specialistScenes,
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      let usage: Usage | undefined;

      try {
        const response = await requestProse(openrouter, {
          system: mainWriterSystemPrompt(specialistScenes.length > 0, action),
          prompt: writingPrompt,
          maxOutputTokens,
        });
        usage = response.usage as Usage | undefined;

        if (response.status === "incomplete") {
          const reasoningTokens =
            usage?.output_tokens_details?.reasoning_tokens ?? 0;
          const visibleOutputTokens = Math.max(
            0,
            (usage?.output_tokens ?? 0) - reasoningTokens,
          );

          throw new Error(
            `The writing model did not complete the section because ${
              response.incomplete_details?.reason ??
              "the response was interrupted"
            }. It used ${reasoningTokens.toLocaleString()} hidden reasoning tokens and approximately ${visibleOutputTokens.toLocaleString()} visible output tokens.`,
          );
        }

        const raw = response.output_text;
        if (response.output?.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"))) {
          throw new Error(`${writer.label} returned a refusal rather than chapter prose. The existing draft is preserved.`);
        }

        if (!raw?.trim()) {
          throw new TechnicalWriterError(
            "The writing model returned an empty response.",
          );
        }
        validateProseResponse(raw, writer.label);

        const section = extractCompletedSection(
          raw,
          chapterTitle,
          povCharacter,
          response.status === "completed",
        );
        if (!specialistScenes.length) {
          validateSection(section, action === "continue" ? 0 : 120);
          if (action === "continue") validateContinuationBoundary(chapterDraft, section);
          if (action === "start") validateChapterLength(section, targetWordRange);
        }

        diagnostics.push(
          diagnostic({
            writer,
            status: "succeeded",
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
          }),
        );

        let assembledSection = section;
        if (specialistScenes.length) {
          validateHandoffMarkers(assembledSection, specialistScenes, terminalScene?.marker);
          for (const scene of specialistScenes) {
            markerContext(assembledSection, scene.marker);
          }
          return NextResponse.json({
            section: assembledSection,
            wordCount: countWords(assembledSection),
            warnings: [],
            action,
            specialistScenesPending: true,
            diagnostics,
          });
        }

        if (assembledSection.includes(AION_MARKER_PREFIX)) {
          return NextResponse.json(
            {
              error:
                "The chapter still contains an unresolved Aion scene marker, so NovelForge refused to save an incomplete draft.",
              preservedDraft: chapterDraft || null,
              diagnostics,
            },
            { status: 502 },
          );
        }

        validateSection(assembledSection, action === "continue" ? 0 : 120);
        const warnings = repetitionWarnings(
          chapterDraft,
          assembledSection,
          sectionToRewrite,
        );
        if (action === "continue") warnings.push(...chapterLengthWarnings(`${chapterDraft}\n\n${assembledSection}`, targetWordRange));

        return NextResponse.json({
          section: assembledSection,
          wordCount: countWords(assembledSection),
          warnings,
          action,
          specialistScenesWritten: specialistScenes.length,
          diagnostics,
        });
      } catch (error) {
        const writerError =
          error instanceof Error
            ? error
            : new Error("The section writer failed.");
        const retryable = isTechnicalFailure(error);

        diagnostics.push(
          diagnostic({
            writer,
            status: "failed",
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
            error: writerError.message,
          }),
        );

        if (!retryable || attempt === 2) {
          const status = retryable ? 502 : 422;

          return NextResponse.json(
            {
              error: writerError.message,
              preservedDraft: error instanceof ChapterLengthError ? error.preservedDraft : chapterDraft || null,
              diagnostics,
            },
            { status },
          );
        }
      }
    }

    throw new Error("The writing provider failed.");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The section writer failed.",
        diagnostics,
      },
      { status: 500 },
    );
  }
}










