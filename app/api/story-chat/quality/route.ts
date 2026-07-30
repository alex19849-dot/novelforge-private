import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

const REPAIR_MODEL = "anthracite-org/magnum-v4-72b";

type QualityRequest = {
  storyBible?: unknown;
  storyState?: unknown;
  chapterBrief?: unknown;
  chapterTitle?: unknown;
  povCharacter?: unknown;
  chapterContent?: unknown;
  minimumWordCount?: unknown;
  maximumWordCount?: unknown;
};

type QualityAssessment = {
  passed: boolean;
  hardFailures: string[];
  repairInstructions: string[];
  repairTargets: Array<{
    oldText: string;
    instruction: string;
  }>;
  summary: string;
  scores: {
    continuity: number;
    factualAuthenticity: number;
    plotMovement: number;
    relationshipProgression: number;
    voiceDistinctiveness: number;
    povAndTense: number;
    repetitionControl: number;
    hookStrength: number;
  };
};

type GenerationDiagnostic = {
  stage: string;
  provider: "openai" | "openrouter";
  model: string;
  status: "succeeded" | "failed";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  costType?: "reported" | "estimated" | "unavailable";
  durationMs: number;
  attempt: number;
  error?: string;
};

type VerifiedRepairTarget = {
  oldText: string;
  instruction: string;
  start: number;
  end: number;
};

class DiagnosticFailure extends Error {
  diagnostic: GenerationDiagnostic;

  constructor(message: string, diagnostic: GenerationDiagnostic) {
    super(message);
    this.name = "DiagnosticFailure";
    this.diagnostic = {
      ...diagnostic,
      status: "failed",
      error: message,
    };
  }
}

const qualitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "passed",
    "hardFailures",
    "repairInstructions",
    "repairTargets",
    "summary",
    "scores",
  ],
  properties: {
    passed: {
      type: "boolean",
    },
    hardFailures: {
      type: "array",
      items: { type: "string" },
    },
    repairInstructions: {
      type: "array",
      items: { type: "string" },
    },
    repairTargets: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["oldText", "instruction"],
        properties: {
          oldText: { type: "string" },
          instruction: { type: "string" },
        },
      },
    },
    summary: {
      type: "string",
    },
    scores: {
      type: "object",
      additionalProperties: false,
      required: [
        "continuity",
        "factualAuthenticity",
        "plotMovement",
        "relationshipProgression",
        "voiceDistinctiveness",
        "povAndTense",
        "repetitionControl",
        "hookStrength",
      ],
      properties: {
        continuity: { type: "number", minimum: 1, maximum: 10 },
        factualAuthenticity: { type: "number", minimum: 1, maximum: 10 },
        plotMovement: { type: "number", minimum: 1, maximum: 10 },
        relationshipProgression: { type: "number", minimum: 1, maximum: 10 },
        voiceDistinctiveness: { type: "number", minimum: 1, maximum: 10 },
        povAndTense: { type: "number", minimum: 1, maximum: 10 },
        repetitionControl: { type: "number", minimum: 1, maximum: 10 },
        hookStrength: { type: "number", minimum: 1, maximum: 10 },
      },
    },
  },
} as const;

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

function cleanQualityStoryState(value: unknown): unknown {
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

  if (Array.isArray(state.chapterLedger)) {
    state.chapterLedger = state.chapterLedger
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
      .slice(-6)
      .map((entry, index, entries) => {
        const compactEntry = {
          ...entry,
        };

        if (index < entries.length - 1) {
          delete compactEntry.endingExcerpt;
        }

        return compactEntry;
      });
  }

  return state;
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
    .replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/u, "")
    .trim();
}

function removeExactDuplicateParagraphs(content: string): string {
  const paragraphs = content
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const retained: string[] = [];

  for (const paragraph of paragraphs) {
    const fingerprint = paragraph
      .toLowerCase()
      .replace(/[“”]/gu, '"')
      .replace(/[‘’]/gu, "'")
      .replace(/\s+/gu, " ")
      .trim();
    const isSubstantial =
      fingerprint.length >= 35 &&
      fingerprint.split(/\s+/u).length >= 7;

    if (isSubstantial && seen.has(fingerprint)) {
      continue;
    }

    if (isSubstantial) {
      seen.add(fingerprint);
    }

    retained.push(paragraph);
  }

  return retained.join("\n\n").trim();
}

function hasLongTextOverlap(left: string, right: string): boolean {
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9'’]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
  const leftWords = normalise(left);
  const rightWords = normalise(right);
  const windowSize = 18;

  if (
    leftWords.length < windowSize ||
    rightWords.length < windowSize
  ) {
    return false;
  }

  const windows = new Set<string>();

  for (
    let index = 0;
    index + windowSize <= leftWords.length;
    index += 1
  ) {
    windows.add(leftWords.slice(index, index + windowSize).join(" "));
  }

  for (
    let index = 0;
    index + windowSize <= rightWords.length;
    index += 1
  ) {
    if (
      windows.has(
        rightWords.slice(index, index + windowSize).join(" "),
      )
    ) {
      return true;
    }
  }

  return false;
}

function countOccurrences(content: string, target: string): number {
  if (!target) {
    return 0;
  }

  return content.split(target).length - 1;
}

function normaliseWithMap(value: string): {
  text: string;
  sourceIndexes: number[];
} {
  let text = "";
  const sourceIndexes: number[] = [];
  let previousWasSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const sourceCharacter = value[index] ?? "";
    const character = sourceCharacter
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[—–]/g, "-")
      .toLowerCase();
    const isSpace = /\s/u.test(character);

    if (isSpace) {
      if (previousWasSpace) {
        continue;
      }

      text += " ";
      sourceIndexes.push(index);
      previousWasSpace = true;
      continue;
    }

    text += character;
    sourceIndexes.push(index);
    previousWasSpace = false;
  }

  return {
    text: text.trim(),
    sourceIndexes,
  };
}

function resolveUniquePassage(
  chapterContent: string,
  requestedPassage: string,
): Pick<VerifiedRepairTarget, "oldText" | "start" | "end"> {
  if (countOccurrences(chapterContent, requestedPassage) === 1) {
    const start = chapterContent.indexOf(requestedPassage);

    return {
      oldText: requestedPassage,
      start,
      end: start + requestedPassage.length,
    };
  }

  const normalisedChapter = normaliseWithMap(chapterContent);
  const normalisedPassage = normaliseWithMap(requestedPassage).text;
  const firstMatch = normalisedChapter.text.indexOf(normalisedPassage);
  const secondMatch =
    firstMatch < 0
      ? -1
      : normalisedChapter.text.indexOf(
          normalisedPassage,
          firstMatch + normalisedPassage.length,
        );

  if (!normalisedPassage || firstMatch < 0 || secondMatch >= 0) {
    throw new Error(
      "The quality assessment did not identify one unique repair passage.",
    );
  }

  const start = normalisedChapter.sourceIndexes[firstMatch];
  const finalNormalisedIndex = firstMatch + normalisedPassage.length - 1;
  const finalSourceIndex =
    normalisedChapter.sourceIndexes[finalNormalisedIndex];

  if (start === undefined || finalSourceIndex === undefined) {
    throw new Error("The repair passage could not be mapped safely.");
  }

  return {
    oldText: chapterContent.slice(start, finalSourceIndex + 1),
    start,
    end: finalSourceIndex + 1,
  };
}

function verifyRepairTargets(
  chapterContent: string,
  assessment: QualityAssessment,
): VerifiedRepairTarget[] {
  if (assessment.repairTargets.length === 0) {
    throw new Error("The quality assessment returned no bounded repair targets.");
  }

  const targets = assessment.repairTargets.map((target) => {
    const requestedPassage = cleanString(target.oldText);
    const instruction = cleanString(target.instruction);

    if (!requestedPassage || !instruction) {
      throw new Error("The quality assessment returned an empty repair target.");
    }

    return {
      ...resolveUniquePassage(chapterContent, requestedPassage),
      instruction,
    };
  });
  const ordered = [...targets].sort((left, right) => left.start - right.start);

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) {
      throw new Error("The quality assessment returned overlapping repairs.");
    }
  }

  const changedCharacterCount = ordered.reduce(
    (total, target) => total + target.oldText.length,
    0,
  );
  const maximumLocalChange = Math.max(
    2200,
    Math.floor(chapterContent.length * 0.35),
  );

  if (changedCharacterCount > maximumLocalChange) {
    throw new Error("The required changes are too broad for safe local repair.");
  }

  return ordered;
}

function assessmentPasses(
  assessment: QualityAssessment,
  mechanicalFailures: string[],
): boolean {
  return (
    assessment.passed &&
    mechanicalFailures.length === 0 &&
    assessment.hardFailures.length === 0 &&
    assessment.scores.continuity >= 7 &&
    assessment.scores.factualAuthenticity >= 6 &&
    assessment.scores.plotMovement >= 6 &&
    assessment.scores.relationshipProgression >= 6 &&
    assessment.scores.voiceDistinctiveness >= 6 &&
    assessment.scores.povAndTense >= 7 &&
    assessment.scores.repetitionControl >= 6 &&
    assessment.scores.hookStrength >= 6
  );
}

function validateMechanicalQuality(
  content: string,
  minimumWordCount: number,
  maximumWordCount: number,
): string[] {
  const failures: string[] = [];
  const wordCount = countWords(content);

  if (wordCount < minimumWordCount) {
    failures.push(
      `The chapter has ${wordCount} words, below the ${minimumWordCount}-word minimum.`,
    );
  }

  if (wordCount > maximumWordCount) {
    failures.push(
      `The chapter has ${wordCount} words, above the ${maximumWordCount}-word maximum.`,
    );
  }

  if (/^\s*chapter\s+\d+\b/im.test(content)) {
    failures.push("The prose contains an unwanted chapter heading.");
  }

  if (/^\s{0,3}#{1,6}\s+\S+/mu.test(content) || /```/.test(content)) {
    failures.push("The prose contains markdown.");
  }

  if (/\\["“”‘’]/u.test(content)) {
    failures.push("The prose contains broken escaped quotation marks.");
  }

  if (!/[.!?…"”’']$/u.test(content.trim())) {
    failures.push("The prose appears to stop mid-sentence.");
  }

  return failures;
}

async function assessChapter(input: {
  storyBible: unknown;
  storyState: unknown;
  chapterBrief: string;
  chapterTitle: string;
  povCharacter: string;
  chapterContent: string;
  mechanicalFailures: string[];
  attempt: number;
}): Promise<{
  assessment: QualityAssessment;
  diagnostic: GenerationDiagnostic;
}> {
  const startedAt = Date.now();
  const response = await openai.responses.create({
    model: "gpt-5.6-terra",
    reasoning: {
      effort: "low",
    },
    input: [
      {
        role: "system",
        content: `
You are the final quality controller for a commercially published
romance novel.

Judge the completed chapter against the supplied chapter brief, Story
Bible and actual continuity ledger. Assess only what is on the page.
Read the complete chapter from beginning to end before scoring it. Check
later scenes against details established earlier in the same chapter,
not only against the pre-chapter ledger.

Score each category from 1 to 10.

A passing chapter must:

- preserve names, facts, chronology, locations and character knowledge
- preserve ages, family roles, physical positions, possessions, actions
and who is present in each location throughout the chapter
- make every character behave credibly for their established age unless
the prose supplies a clear reason otherwise
- use credible terminology, procedures and professional behaviour for
the Story Bible's exact country, region, time period and occupation
- use the required POV person and narrative tense consistently
- match the POV character's stored voice profile
- use natural contractions in contemporary narration, internal thought
and dialogue instead of pervasive stiff wording such as "I do not", "I
have", "he is", "cannot" and "it does not"
- cause meaningful external plot movement
- cause meaningful relationship movement or change the consequence of
the current intimacy milestone
- avoid replaying recent scenes, gestures, attraction beats, internal
conclusions and hooks
- avoid repeating the same memory, explanation, backstory fact or
emotional conclusion in different scenes of the same chapter
- preserve the exact planned romance milestone and burn stage
- end with a concrete, effective hook
- ensure the POV character has enough observed evidence to reach any
conclusion stated by the hook
- contain no mechanical failures

ROMANTIC KNOWLEDGE AND AWAKENING ARE HARD CONTINUITY:

Treat the Story Bible, chapter plan, continuity ledger and character
knowledge as binding limits on what the POV character consciously
understands.

For a gay awakening, bisexual awakening, first attraction or similar
discovery arc, distinguish unconscious physical or emotional reactions
from conscious knowledge. Before the planned recognition milestone, the
POV may misread fixation as rivalry, anger, jealousy, admiration,
territoriality or unresolved history. The POV must not already imagine
kissing or having sex with the love interest, label the feeling as
attraction, admit they have been lying about wanting them, or correctly
declare the other character's hidden attraction unless the supplied
continuity proves that recognition has already happened.

If the chapter prematurely gives the POV conscious romantic or sexual
knowledge that belongs to a later milestone, record an objective hard
failure. Do not excuse it as ordinary denial. Also record an objective
hard failure when the ending hook claims knowledge about another
character's motives or feelings without evidence established on the
page.

INTRA-CHAPTER CONTINUITY IS A HARD REQUIREMENT:

Track each named character through the chapter. Flag incompatible age
behaviour, unexplained location changes, duplicated introductions,
contradictory actions, impossible possession changes and repeated
versions of the same past event. A short ordinary transition may be
implied, but do not invent an off-page explanation to excuse a visible
contradiction.

Judge relationshipProgression by comparing the central relationship at
the opening and ending of the chapter. Identify whether at least one of
these has materially changed: attraction, trust, vulnerability,
conflict, physical intimacy, emotional intimacy, power balance, mutual
knowledge, mistaken belief or the consequence of an existing intimacy
milestone.

Progression may be positive, negative or destabilising. A new argument,
boundary, suspicion, private realisation, act of care, shift in leverage
or changed interpretation can count when it will affect later behaviour.
Mere physical description, repeated attraction, banter without
consequence, an almost-touch, private denial or thinking about the love
interest does not count by itself.

Respect the selected burn pacing. Do not lower the score because a
chapter contains no kiss, sex, declaration or new physical milestone
when those would be premature. Do lower it when the relationship ends in
substantially the same position and meaning as it began, especially when
the chapter merely repeats an earlier attraction or conflict beat.

Judge factualAuthenticity only on material that appears in the chapter.
Check professional terminology and behaviour, jurisdiction-specific law
and procedure, medicine, sport, technology, geography, travel time and
the established time period. Distinguish deliberately fictional
organisations or worldbuilding from accidental real-world errors.

Score factualAuthenticity below 6 only when there is a clear,
high-confidence error that could damage reader trust. Do not invent
nitpicks, demand unnecessary technical detail or penalise a sensible
general description merely because a more specialised version exists.
When uncertain, do not treat the detail as wrong.

Do not treat ordinary, plausible rule-breaking as a factual error merely
because a character is below a local legal age. In particular, do not fail a
chapter because a nineteen- or twenty-year-old has a beer or other alcoholic
drink in a private family home, dorm, party or similarly plausible setting.
Distinguish possessing or consuming alcohol from legally purchasing it or
being served in a licensed venue. Consider parental or guardian provision,
private-home exceptions and ordinary human behaviour. Only flag alcohol law
when the prose makes a specific legal claim that is clearly false or when an
age-restricted purchase or licensed sale is central to the scene.

The chapter brief is strong guidance, not a rigid checklist. Do not fail
an otherwise cohesive, commercially effective chapter merely because it
reaches the intended objective through different scene beats or omits a
nonessential planned detail.

Use hardFailures only for objective continuity contradictions,
incompatible age or family behaviour, premature romantic knowledge,
unsupported character conclusions, duplicated story information,
high-confidence factual errors central to the scene or premise, wrong
POV, wrong tense, malformed prose, unsafe age or consent problems, or a
chapter that is genuinely unfinished. Do not use hardFailures for
subjective preferences, isolated style words or minor deviations from
the planned beats.

Set passed to false when continuity or POV and tense scores below 7,
when any other score is below 6, or when an objective hard failure
exists.

Score voiceDistinctiveness below 6 when uncontracted phrasing is
pervasive enough to make a contemporary first-person voice sound stiff,
synthetic or unlike natural speech. Do not penalise rare uncontracted
phrasing used for emphasis or a deliberately formal character.

Do not fail a chapter merely because it contains explicit consensual
adult sexual content. Judge such content against the selected heat level
and burn pacing. Never recommend censoring, softening or fading out an
explicit scene that the brief requires.

repairInstructions must be concrete, local and actionable. Identify the
specific material that must change. Do not request a different story.

When the chapter fails, return one to four non-overlapping repairTargets.
Each oldText must be one exact contiguous passage copied from the completed
chapter, including its punctuation and paragraph breaks. Choose the smallest
passage that can be rewritten to correct the failure, but include enough text
to identify it uniquely. For a missing transition, consequence or hook, target
the existing passage immediately where that material belongs. Never invent an
oldText quotation. When the chapter passes, return an empty repairTargets
array.
        `.trim(),
      },
      {
        role: "user",
        content: `
STORY BIBLE:

${JSON.stringify(input.storyBible, null, 2)}

ACTUAL CONTINUITY LEDGER:

${JSON.stringify(cleanQualityStoryState(input.storyState), null, 2)}

CHAPTER BRIEF:

${input.chapterBrief}

CHAPTER METADATA:

Title: ${input.chapterTitle}
POV: ${input.povCharacter}

MECHANICAL FAILURES:

${JSON.stringify(input.mechanicalFailures, null, 2)}

COMPLETED CHAPTER:

${input.chapterContent}
        `.trim(),
      },
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "commercial_chapter_quality",
        strict: true,
        schema: qualitySchema,
      },
    },
    max_output_tokens: 2500,
  });
  const usage = response.usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const diagnostic: GenerationDiagnostic = {
    stage: "chapter_quality_assessment",
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
    attempt: input.attempt,
  };

  if (response.status === "incomplete") {
    throw new DiagnosticFailure(
      `The quality assessment was incomplete because ${
        response.incomplete_details?.reason ?? "the response was truncated"
      }.`,
      diagnostic,
    );
  }

  const outputText = response.output_text?.trim();

  if (!outputText) {
    throw new DiagnosticFailure(
      "The quality model returned no assessment.",
      diagnostic,
    );
  }

  let assessment: QualityAssessment;

  try {
    assessment = JSON.parse(outputText) as QualityAssessment;
  } catch {
    throw new DiagnosticFailure(
      "The quality model returned invalid JSON.",
      diagnostic,
    );
  }

  return {
    assessment,
    diagnostic,
  };
}

async function repairChapterLocally(input: {
  storyBible: unknown;
  storyState: unknown;
  chapterBrief: string;
  chapterTitle: string;
  povCharacter: string;
  chapterContent: string;
  assessment: QualityAssessment;
  attempt: number;
}): Promise<{
  chapterContent: string;
  diagnostics: GenerationDiagnostic[];
}> {
  const targets = verifyRepairTargets(
    input.chapterContent,
    input.assessment,
  );
  const replacements: Array<VerifiedRepairTarget & { newText: string }> = [];
  const diagnostics: GenerationDiagnostic[] = [];

  for (const [index, target] of targets.entries()) {
    const startedAt = Date.now();
    const contextStart = Math.max(0, target.start - 1800);
    const contextEnd = Math.min(
      input.chapterContent.length,
      target.end + 1800,
    );
    const response = await openrouter.chat.completions.create({
      model: REPAIR_MODEL,
      messages: [
        {
          role: "system",
          content: `You are NovelForge's precise commercial-romance passage
editor. Return only replacement novel prose for the supplied target passage.
Never return JSON, notes, headings, markdown or the surrounding context.`,
        },
        {
          role: "user",
          content: `
Rewrite only TARGET PASSAGE so it satisfies REPAIR REQUIREMENT and fits
smoothly between BEFORE CONTEXT and AFTER CONTEXT.

Preserve the established first-person POV, tense, character voice, natural
contractions, chronology, physical state and all unaffected facts. Do not
introduce a new scene, subplot, prior romance, attraction milestone, housing
solution or other convenient development unsupported by the binding chapter
plan. Preserve the selected heat level. If the target contains explicit
consensual adult intimacy, keep it explicit and do not censor, soften or fade
it out.

Return only the complete replacement passage. After its final sentence,
output <END_REPAIR> on its own line. Never copy BEFORE CONTEXT or AFTER
CONTEXT into the replacement.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY BEFORE THIS CHAPTER

${JSON.stringify(cleanQualityStoryState(input.storyState), null, 2)}

BINDING CHAPTER PLAN

${input.chapterBrief}

CHAPTER METADATA

Title: ${input.chapterTitle}
POV: ${input.povCharacter}

REPAIR REQUIREMENT

${target.instruction}

BEFORE CONTEXT, READ ONLY

${input.chapterContent.slice(contextStart, target.start)}

TARGET PASSAGE

${target.oldText}

AFTER CONTEXT, READ ONLY

${input.chapterContent.slice(target.end, contextEnd)}
          `.trim(),
        },
      ],
      max_tokens: 1400,
      temperature: 0.25,
      top_p: 0.9,
      frequency_penalty: 0.18,
      presence_penalty: 0.05,
      stop: ["<END_REPAIR>"],
    });
    const usage = response.usage as unknown as
      | Record<string, unknown>
      | undefined;
    const inputTokens =
      typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
    const outputTokens =
      typeof usage?.completion_tokens === "number"
        ? usage.completion_tokens
        : 0;
    const costUsd = typeof usage?.cost === "number" ? usage.cost : null;
    const diagnostic: GenerationDiagnostic = {
      stage: `chapter_quality_passage_repair_${index + 1}`,
      provider: "openrouter",
      model: REPAIR_MODEL,
      status: "succeeded",
      inputTokens,
      outputTokens,
      totalTokens:
        typeof usage?.total_tokens === "number"
          ? usage.total_tokens
          : inputTokens + outputTokens,
      costUsd,
      costType: costUsd === null ? "unavailable" : "reported",
      durationMs: Date.now() - startedAt,
      attempt: input.attempt,
    };
    const choice = response.choices[0];

    if (choice?.finish_reason === "length") {
      throw new DiagnosticFailure(
        "Magnum reached its limit while repairing one passage.",
        diagnostic,
      );
    }

    if (choice?.finish_reason === "content_filter") {
      throw new DiagnosticFailure(
        "The repair provider stopped the passage because of its content filter.",
        diagnostic,
      );
    }

    const newText = cleanGeneratedProse(
      cleanString(choice?.message?.content).replace(
        /(?:\n\s*)?<END_REPAIR>\s*$/i,
        "",
      ),
    );
    const beforeContext = input.chapterContent.slice(
      contextStart,
      target.start,
    );
    const afterContext = input.chapterContent.slice(
      target.end,
      contextEnd,
    );
    const oldWordCount = countWords(target.oldText);
    const newWordCount = countWords(newText);

    if (
      !newText ||
      newText === target.oldText ||
      newWordCount > Math.max(900, oldWordCount * 2) ||
      hasLongTextOverlap(newText, beforeContext) ||
      hasLongTextOverlap(newText, afterContext) ||
      /^\s*chapter\s+\d+\b/im.test(newText) ||
      /```|^\s{0,3}#{1,6}\s+\S+/mu.test(newText)
    ) {
      throw new DiagnosticFailure(
        "Magnum returned an invalid bounded replacement passage.",
        diagnostic,
      );
    }

    diagnostics.push(diagnostic);
    replacements.push({
      ...target,
      newText,
    });
  }

  let chapterContent = input.chapterContent;

  for (const replacement of [...replacements].sort(
    (left, right) => right.start - left.start,
  )) {
    chapterContent =
      chapterContent.slice(0, replacement.start) +
      replacement.newText +
      chapterContent.slice(replacement.end);
  }

  return {
    chapterContent: cleanGeneratedProse(chapterContent),
    diagnostics,
  };
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];
  let pipelineStartedAt = 0;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as QualityRequest;
    const chapterBrief = cleanString(body.chapterBrief);
    const chapterTitle = cleanString(body.chapterTitle);
    const povCharacter = cleanString(body.povCharacter);
    const chapterContent = removeExactDuplicateParagraphs(
      cleanGeneratedProse(cleanString(body.chapterContent)),
    );
    const minimumWordCount = getWordCount(body.minimumWordCount, 2000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      getWordCount(body.maximumWordCount, 4000),
    );
    const acceptedMinimumWordCount = minimumWordCount;
    const allowedMaximumWordCount = maximumWordCount;

    if (!chapterBrief || !povCharacter || !chapterContent) {
      return NextResponse.json(
        { error: "A complete chapter and chapter brief are required." },
        { status: 400 },
      );
    }

    const mechanicalFailures = validateMechanicalQuality(
      chapterContent,
      acceptedMinimumWordCount,
      allowedMaximumWordCount,
    );
    pipelineStartedAt = Date.now();
    const firstQualityResult = await assessChapter({
      storyBible: body.storyBible ?? {},
      storyState: body.storyState ?? {},
      chapterBrief,
      chapterTitle,
      povCharacter,
      chapterContent,
      mechanicalFailures,
      attempt: 1,
    });
    const firstAssessment = firstQualityResult.assessment;
    diagnostics.push(firstQualityResult.diagnostic);

    const initiallyAccepted = assessmentPasses(
      firstAssessment,
      mechanicalFailures,
    );

    if (initiallyAccepted) {
      return NextResponse.json({
        accepted: true,
        chapterContent,
        quality: firstAssessment,
        qualityWarnings: [],
        repaired: false,
        diagnostics,
      });
    }

    let repairResult: Awaited<ReturnType<typeof repairChapterLocally>>;

    try {
      repairResult = await repairChapterLocally({
        storyBible: body.storyBible ?? {},
        storyState: body.storyState ?? {},
        chapterBrief,
        chapterTitle,
        povCharacter,
        chapterContent,
        assessment: firstAssessment,
        attempt: 1,
      });
      diagnostics.push(...repairResult.diagnostics);
    } catch (repairError) {
      if (repairError instanceof DiagnosticFailure) {
        diagnostics.push(repairError.diagnostic);
      }

      return NextResponse.json({
        accepted: false,
        chapterContent,
        quality: firstAssessment,
        qualityWarnings: [
          ...mechanicalFailures,
          ...firstAssessment.hardFailures,
          ...firstAssessment.repairInstructions,
          repairError instanceof Error
            ? `Automatic local repair stopped: ${repairError.message}`
            : "Automatic local repair stopped.",
        ],
        repaired: false,
        diagnostics,
      });
    }

    const repairedContent = repairResult.chapterContent;
    const repairedMechanicalFailures = validateMechanicalQuality(
      repairedContent,
      acceptedMinimumWordCount,
      allowedMaximumWordCount,
    );
    const secondQualityResult = await assessChapter({
      storyBible: body.storyBible ?? {},
      storyState: body.storyState ?? {},
      chapterBrief,
      chapterTitle,
      povCharacter,
      chapterContent: repairedContent,
      mechanicalFailures: repairedMechanicalFailures,
      attempt: 2,
    });
    diagnostics.push(secondQualityResult.diagnostic);
    const accepted = assessmentPasses(
      secondQualityResult.assessment,
      repairedMechanicalFailures,
    );

    return NextResponse.json({
      accepted,
      // Never persist a repair that failed its own reassessment. Keeping the
      // clean pre-repair chapter makes Resume retry from a stable baseline
      // instead of compounding failed patches.
      chapterContent: accepted ? repairedContent : chapterContent,
      quality: secondQualityResult.assessment,
      qualityWarnings: accepted
        ? []
        : [
            ...repairedMechanicalFailures,
            ...secondQualityResult.assessment.hardFailures,
            ...secondQualityResult.assessment.repairInstructions,
          ],
      repaired: accepted,
      diagnostics,
    });
  } catch (error) {
    console.error("CHAPTER QUALITY GATE FAILED:", error);
    const message =
      error instanceof Error
        ? error.message
        : "The chapter quality gate failed.";

    if (error instanceof DiagnosticFailure) {
      diagnostics.push(error.diagnostic);
    } else if (pipelineStartedAt > 0) {
      const elapsedCompleted = diagnostics.reduce(
        (total, diagnostic) => total + diagnostic.durationMs,
        0,
      );

      diagnostics.push({
        stage: "chapter_quality_assessment",
        provider: "openai",
        model: "gpt-5.6-terra",
        status: "failed",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: null,
        costType: "unavailable",
        durationMs: Math.max(
          0,
          Date.now() - pipelineStartedAt - elapsedCompleted,
        ),
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
