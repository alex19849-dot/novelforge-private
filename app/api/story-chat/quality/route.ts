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

function assessmentPasses(
  assessment: QualityAssessment,
  mechanicalFailures: string[],
): boolean {
  const scores = Object.values(assessment.scores);

  return (
    assessment.hardFailures.length === 0 &&
    mechanicalFailures.length === 0 &&
    assessment.scores.continuity >= 7 &&
    assessment.scores.povAndTense >= 7 &&
    scores.every((score) => Number.isFinite(score) && score >= 6)
  );
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

Score each category from 1 to 10.

A passing chapter must:

- preserve names, facts, chronology, locations and character knowledge
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
- end with a concrete, effective hook
- contain no mechanical failures

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
high-confidence factual errors central to the scene or premise, wrong
POV, wrong tense, malformed prose, unsafe age or consent problems, or a
chapter that is genuinely unfinished. Do not use hardFailures for
subjective preferences or minor deviations from the planned beats.

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

${JSON.stringify(input.storyState, null, 2)}

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

type TargetedRepairPatch = {
  find: string;
  replace: string;
};

function parseTargetedRepairPatches(response: string): TargetedRepairPatch[] {
  const cleaned = response
    .replace(/^\`\`\`(?:text|markdown|md)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "")
    .trim();
  const pattern =
    /<<<PATCH>>>\s*<<<FIND>>>([\s\S]*?)<<<END_FIND>>>\s*<<<REPLACE>>>([\s\S]*?)<<<END_REPLACE>>>\s*<<<END_PATCH>>>/g;
  const patches: TargetedRepairPatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    const find = match[1].trim();
    const replace = match[2].trim();

    if (!find) {
      throw new Error("A targeted repair patch contained no original text.");
    }

    patches.push({ find, replace });
  }

  if (patches.length === 0) {
    throw new Error("Aion returned no usable targeted repair patches.");
  }

  if (patches.length > 8) {
    throw new Error("Aion returned too many targeted repair patches.");
  }

  return patches;
}

function applyTargetedRepairPatches(
  chapterContent: string,
  patches: TargetedRepairPatch[],
): string {
  let repaired = chapterContent;

  for (const patch of patches) {
    const firstMatch = repaired.indexOf(patch.find);

    if (firstMatch < 0) {
      throw new Error(
        "A targeted repair patch did not match the preserved chapter.",
      );
    }

    if (repaired.indexOf(patch.find, firstMatch + patch.find.length) >= 0) {
      throw new Error(
        "A targeted repair patch was ambiguous and was not applied.",
      );
    }

    repaired =
      repaired.slice(0, firstMatch) +
      patch.replace +
      repaired.slice(firstMatch + patch.find.length);
  }

  return repaired.trim();
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
}): Promise<{
  content: string;
  diagnostic: GenerationDiagnostic;
}> {
  const startedAt = Date.now();
  const response = await openrouter.chat.completions.create({
    model: "aion-labs/aion-3.0-mini",
    messages: [
      {
        role: "user",
        content: `
You are making targeted repairs to a completed commercial romance
chapter. Preserve the chapter and return only exact replacement patches
for the specific failures identified by the quality assessment.

Do not return the complete chapter. Do not explain, analyse, outline,
summarise or use JSON. Do not add a chapter heading or markdown.

Use this exact format for every patch:

<<<PATCH>>>
<<<FIND>>>Copy one exact, unique passage from the original chapter here<<<END_FIND>>>
<<<REPLACE>>>Put the corrected version of that passage here<<<END_REPLACE>>>
<<<END_PATCH>>>

The FIND passage must be copied character-for-character from the
original chapter and must be long enough to occur exactly once. Include
enough surrounding context to make it unique. Return no text outside the
patch blocks.

Use no more than eight patches. Repair only passages required by
repairInstructions or objective hardFailures. Preserve every strong
section unchanged. Never rewrite the whole chapter through one enormous
patch.

Preserve the required POV person, narrative tense, character voice,
continuity, heat level and burn pacing. Preserve explicit consensual
adult sexual content required by the brief. Do not censor it, soften it
or fade it to black.

If relationship progression failed, alter the smallest existing
interaction, decision, subtext or interpretation that can create a
material shift. Do not bolt on a kiss, sex scene, declaration or
artificial confrontation.

If factual authenticity failed, correct only the identified
high-confidence error. Do not add a technical lecture or replace it with
another unverified precise claim.

The patched chapter must remain between ${input.minimumWordCount} and
${input.maximumWordCount} words.

STORY BIBLE:

${JSON.stringify(input.storyBible, null, 2)}

ACTUAL CONTINUITY LEDGER:

${JSON.stringify(input.storyState, null, 2)}

CHAPTER BRIEF:

${input.chapterBrief}

CHAPTER METADATA:

Title: ${input.chapterTitle}
POV: ${input.povCharacter}

FAILED QUALITY ASSESSMENT:

${JSON.stringify(input.assessment, null, 2)}

ORIGINAL CHAPTER:

${input.chapterContent}
        `.trim(),
      },
    ],
    max_tokens: 3500,
  });
  const rawUsage = response.usage as unknown as
    | Record<string, unknown>
    | undefined;
  const inputTokens =
    typeof rawUsage?.prompt_tokens === "number" ? rawUsage.prompt_tokens : 0;
  const outputTokens =
    typeof rawUsage?.completion_tokens === "number"
      ? rawUsage.completion_tokens
      : 0;
  const diagnostic: GenerationDiagnostic = {
    stage: "chapter_quality_targeted_repair",
    provider: "openrouter",
    model: "aion-labs/aion-3.0-mini",
    status: "succeeded",
    inputTokens,
    outputTokens,
    totalTokens:
      typeof rawUsage?.total_tokens === "number"
        ? rawUsage.total_tokens
        : inputTokens + outputTokens,
    costUsd: typeof rawUsage?.cost === "number" ? rawUsage.cost : null,
    costType: typeof rawUsage?.cost === "number" ? "reported" : "unavailable",
    durationMs: Date.now() - startedAt,
    attempt: 1,
  };
  const repairResponse = response.choices[0]?.message?.content;

  if (!repairResponse?.trim()) {
    throw new DiagnosticFailure(
      "Aion returned no targeted chapter repairs.",
      diagnostic,
    );
  }

  try {
    const patches = parseTargetedRepairPatches(repairResponse);
    const repaired = applyTargetedRepairPatches(input.chapterContent, patches);

    return {
      content: cleanGeneratedProse(repaired),
      diagnostic,
    };
  } catch (error) {
    throw new DiagnosticFailure(
      error instanceof Error
        ? error.message
        : "The targeted chapter repairs could not be applied.",
      diagnostic,
    );
  }
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
      minimumWordCount,
      maximumWordCount: allowedMaximumWordCount,
    });
    const repairedContent = repairResult.content;
    diagnostics.push(repairResult.diagnostic);
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
      const lastStage = diagnostics.at(-1)?.stage;
      const stage =
        diagnostics.length === 0 ||
        lastStage === "chapter_quality_targeted_repair"
          ? "chapter_quality_assessment"
          : "chapter_quality_targeted_repair";
      const provider =
        stage === "chapter_quality_targeted_repair"
          ? "openrouter"
          : "openai";
      const elapsedCompleted = diagnostics.reduce(
        (total, diagnostic) => total + diagnostic.durationMs,
        0,
      );

      diagnostics.push({
        stage,
        provider,
        model:
          provider === "openrouter"
            ? "aion-labs/aion-3.0-mini"
            : "gpt-5.6-terra",
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
        attempt:
          stage === "chapter_quality_assessment" &&
          diagnostics.some(
            (diagnostic) => diagnostic.stage === "chapter_quality_assessment",
          )
            ? 2
            : 1,
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
