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

const REPAIR_MODEL = "mistralai/mistral-large-2512";

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

function assessmentPasses(
  assessment: QualityAssessment,
  mechanicalFailures: string[],
): boolean {
  return (
    mechanicalFailures.length === 0 &&
    assessment.hardFailures.length === 0 &&
    assessment.scores.continuity >= 7 &&
    assessment.scores.relationshipProgression >= 6 &&
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

async function repairChapter(input: {
  storyBible: unknown;
  storyState: unknown;
  chapterBrief: string;
  chapterTitle: string;
  povCharacter: string;
  chapterContent: string;
  assessment: QualityAssessment;
  minimumWordCount: number;
  maximumWordCount: number;
  attempt: number;
}): Promise<{
  chapterContent: string;
  diagnostic: GenerationDiagnostic;
}> {
  const startedAt = Date.now();
  const response = await openrouter.chat.completions.create({
    model: REPAIR_MODEL,
    messages: [
      {
        role: "user",
        content: `
You are performing a surgical editorial repair on one completed commercial
romance chapter.

Return the complete corrected chapter prose only. Do not return commentary,
analysis, headings, markdown, a summary, a plan or JSON.

Change only material required to correct the supplied failures. Preserve every
unaffected scene, paragraph, line of dialogue, characterisation choice, joke,
sensory detail and plot beat as closely as possible. Do not replace the chapter
with a different story and do not add a new subplot.

Maintain the exact first-person POV, tense, character voice and formatting.
Keep the chapter between ${input.minimumWordCount} and
${input.maximumWordCount} words.

Resolve contradictions using the Story Bible, continuity state, chapter plan
and facts established earlier in the chapter. Keep character behaviour
credible for established ages and roles. Remove duplicated versions of the
same memory, explanation or emotional conclusion.

Romantic knowledge is binding continuity. Do not let the POV consciously know,
name or accurately explain attraction before the planned recognition
milestone. For a gay awakening or first-attraction arc, preserve uncertainty
and misinterpretation until the plan explicitly earns conscious recognition.
Do not let the ending hook claim knowledge about another character's motives
or attraction unless the chapter establishes evidence for that conclusion.

Follow the Story Bible's heat level and burn pacing. All romantic and sexual
characters are consenting adults aged eighteen or older. Preserve required
explicit consensual adult content without censorship or fade to black.

STORY BIBLE

${JSON.stringify(input.storyBible, null, 2)}

CONTINUITY BEFORE THIS CHAPTER

${JSON.stringify(cleanQualityStoryState(input.storyState), null, 2)}

CHAPTER PLAN

${input.chapterBrief}

CHAPTER METADATA

Title: ${input.chapterTitle}
POV: ${input.povCharacter}

OBJECTIVE FAILURES TO REPAIR

${JSON.stringify(input.assessment.hardFailures, null, 2)}

SPECIFIC REPAIR INSTRUCTIONS

${JSON.stringify(input.assessment.repairInstructions, null, 2)}

QUALITY SUMMARY

${input.assessment.summary}

ORIGINAL COMPLETE CHAPTER

${input.chapterContent}
        `.trim(),
      },
    ],
    max_tokens: 6000,
    temperature: 0.35,
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
  const totalTokens =
    typeof usage?.total_tokens === "number"
      ? usage.total_tokens
      : inputTokens + outputTokens;
  const costUsd = typeof usage?.cost === "number" ? usage.cost : null;
  const diagnostic: GenerationDiagnostic = {
    stage: "chapter_quality_targeted_repair",
    provider: "openrouter",
    model: REPAIR_MODEL,
    status: "succeeded",
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    costType: costUsd === null ? "unavailable" : "reported",
    durationMs: Date.now() - startedAt,
    attempt: input.attempt,
  };
  const choice = response.choices[0];

  if (choice?.finish_reason === "length") {
    throw new DiagnosticFailure(
      "The targeted repair reached its token limit before completing the chapter.",
      diagnostic,
    );
  }

  if (choice?.finish_reason === "content_filter") {
    throw new DiagnosticFailure(
      "The writing provider stopped the targeted repair because of its content filter.",
      diagnostic,
    );
  }

  const chapterContent = cleanGeneratedProse(
    cleanString(choice?.message?.content),
  );

  if (!chapterContent) {
    throw new DiagnosticFailure(
      "The targeted repair model returned no chapter prose.",
      diagnostic,
    );
  }

  return {
    chapterContent,
    diagnostic,
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
    const chapterContent = cleanGeneratedProse(
      cleanString(body.chapterContent),
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

    if (assessmentPasses(firstAssessment, mechanicalFailures)) {
      return NextResponse.json({
        accepted: true,
        chapterContent,
        quality: firstAssessment,
        qualityWarnings: [],
        repaired: false,
        diagnostics,
      });
    }

    const repairResult = await repairChapter({
      storyBible: body.storyBible ?? {},
      storyState: body.storyState ?? {},
      chapterBrief,
      chapterTitle,
      povCharacter,
      chapterContent,
      assessment: firstAssessment,
      minimumWordCount: acceptedMinimumWordCount,
      maximumWordCount: allowedMaximumWordCount,
      attempt: 1,
    });
    diagnostics.push(repairResult.diagnostic);
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
    const secondAssessment = secondQualityResult.assessment;
    diagnostics.push(secondQualityResult.diagnostic);
    const accepted = assessmentPasses(
      secondAssessment,
      repairedMechanicalFailures,
    );

    return NextResponse.json({
      accepted,
      chapterContent: repairedContent,
      quality: secondAssessment,
      qualityWarnings: [
        ...secondAssessment.hardFailures,
        ...secondAssessment.repairInstructions,
      ],
      repaired: true,
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
