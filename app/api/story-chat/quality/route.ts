import OpenAI from "openai";

import { NextResponse } from "next/server";

import type {
  ChapterQualityAssessment,
  GenerationDiagnostic,
} from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const QUALITY_MODEL = "gpt-5.6-terra";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

type QualityAssessment = ChapterQualityAssessment & {
  scores: ChapterQualityAssessment["scores"] & {
    factualAuthenticity: number;
  };
};

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
    passed: { type: "boolean" },
    hardFailures: {
      type: "array",
      items: { type: "string" },
    },
    repairInstructions: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
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

function requestedWordCount(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 500 &&
    value <= 10000
    ? Math.round(value)
    : fallback;
}

function qualityStoryState(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const state = { ...(value as Record<string, unknown>) };

  delete state.lastGenerationDiagnostics;
  delete state.chapterPlans;

  if (Array.isArray(state.chapterLedger)) {
    state.chapterLedger = state.chapterLedger.slice(-8);
  }

  return state;
}

function duplicateParagraphFailures(content: string): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const paragraph of paragraphs) {
    const fingerprint = paragraph
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    if (fingerprint.split(" ").length < 12) {
      continue;
    }

    if (seen.has(fingerprint)) {
      duplicates.push(
        "The chapter contains an exactly duplicated substantial paragraph.",
      );
      break;
    }

    seen.add(fingerprint);
  }

  return duplicates;
}

function mechanicalFailures(
  content: string,
  minimumWordCount: number,
  maximumWordCount: number,
): string[] {
  const failures: string[] = [];
  const words = countWords(content);

  if (words < minimumWordCount) {
    failures.push(
      "The chapter has " +
        words +
        " words, below the " +
        minimumWordCount +
        "-word minimum.",
    );
  }

  if (words > maximumWordCount) {
    failures.push(
      "The chapter has " +
        words +
        " words, above the " +
        maximumWordCount +
        "-word maximum.",
    );
  }

  if (/^\s*chapter\s+\d+\b/im.test(content)) {
    failures.push("The prose contains an unwanted chapter heading.");
  }

  if (/^\s{0,3}#{1,6}\s+\S+/mu.test(content) || /```/.test(content)) {
    failures.push("The prose contains markdown.");
  }

  if (
    /^\s*(outline|analysis|notes?|instructions?|chapter plan|word count)\s*:/im.test(
      content,
    )
  ) {
    failures.push("The prose contains instruction-like or planning text.");
  }

  if (/\\["“”‘’]/u.test(content)) {
    failures.push("The prose contains broken escaped quotation marks.");
  }

  if (!/[.!?…”’']$/u.test(content.trim())) {
    failures.push("The prose appears to stop mid-sentence.");
  }

  return [...failures, ...duplicateParagraphFailures(content)];
}

function passes(assessment: QualityAssessment, mechanical: string[]): boolean {
  return (
    assessment.passed &&
    mechanical.length === 0 &&
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

function failedDiagnostic(
  startedAt: number,
  message: string,
): GenerationDiagnostic {
  return {
    stage: "chapter_quality_assessment",
    provider: "openai",
    model: QUALITY_MODEL,
    status: "failed",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: null,
    costType: "unavailable",
    durationMs: Math.max(0, Date.now() - startedAt),
    attempt: 1,
    error: message,
  };
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];
  const startedAt = Date.now();

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as QualityRequest;
    const chapterBrief = cleanString(body.chapterBrief);
    const chapterTitle = cleanString(body.chapterTitle);
    const povCharacter = cleanString(body.povCharacter);
    const chapterContent = cleanString(body.chapterContent);
    const minimumWordCount = requestedWordCount(body.minimumWordCount, 2000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      requestedWordCount(body.maximumWordCount, 4000),
    );

    if (!chapterBrief || !povCharacter || !chapterContent) {
      return NextResponse.json(
        { error: "A complete chapter and canonical plan are required." },
        { status: 400 },
      );
    }

    const mechanical = mechanicalFailures(
      chapterContent,
      minimumWordCount,
      maximumWordCount,
    );
    const response = await openai.responses.create({
      model: QUALITY_MODEL,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: [
            "You are NovelForge's final commercial-romance quality assessor.",
            "Assess the supplied completed chapter once. Never rewrite, repair, edit or reproduce its prose.",
            "The Story Bible, canonical chapter plan and accepted continuity are binding.",
            "Read both technical halves as one chapter. Check that Part 2 continues rather than restarting Part 1.",
            "Hard-fail contradictory physical staging, impossible movements, repeated events, duplicated paragraphs, malformed prose, markdown, instruction-like text, obvious truncation, wrong POV or tense, invented canon and an unearned ending.",
            "Hard-fail premature conscious attraction or invented prior desire in a gay-for-you or delayed-awareness arc. Involuntary attention, physical reaction, denial and changed behaviour may precede conscious acknowledgement.",
            "Do not penalise an earned lack of kissing or sex in a slower chapter. Do require meaningful plot or relationship change.",
            "Consensual explicit adult MM content is allowed and must not be failed merely for being explicit.",
            "Use repairInstructions only to describe possible later human-selected fixes. Do not perform them.",
            "Set passed true only when the chapter is safe to accept unchanged.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "STORY BIBLE",
            JSON.stringify(body.storyBible ?? {}, null, 2),
            "CONTINUITY BEFORE CHAPTER",
            JSON.stringify(qualityStoryState(body.storyState), null, 2),
            "CANONICAL CHAPTER PLAN",
            chapterBrief,
            "CHAPTER METADATA",
            "Title: " + chapterTitle,
            "POV: " + povCharacter,
            "MECHANICAL FAILURES",
            JSON.stringify(mechanical, null, 2),
            "UNTOUCHED COMPLETED CHAPTER",
            chapterContent,
          ].join("\n\n"),
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "novelforge_single_quality_assessment",
          strict: true,
          schema: qualitySchema,
        },
      },
      max_output_tokens: 1800,
    });

    const usage = response.usage;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
    const diagnostic: GenerationDiagnostic = {
      stage: "chapter_quality_assessment",
      provider: "openai",
      model: QUALITY_MODEL,
      status: "succeeded",
      inputTokens,
      outputTokens,
      totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd:
        (uncachedTokens * 1.25 + cachedTokens * 0.125 + outputTokens * 7.5) /
        1_000_000,
      costType: "estimated",
      durationMs: Date.now() - startedAt,
      attempt: 1,
    };

    if (response.status === "incomplete") {
      diagnostic.status = "failed";
      diagnostic.error =
        "The quality assessment was incomplete because " +
        (response.incomplete_details?.reason ?? "its output was truncated") +
        ".";
      diagnostics.push(diagnostic);

      return NextResponse.json(
        {
          error: diagnostic.error,
          chapterContent,
          diagnostics,
        },
        { status: 502 },
      );
    }

    const outputText = response.output_text?.trim();

    if (!outputText) {
      diagnostic.status = "failed";
      diagnostic.error = "Terra returned no quality assessment.";
      diagnostics.push(diagnostic);

      return NextResponse.json(
        {
          error: diagnostic.error,
          chapterContent,
          diagnostics,
        },
        { status: 502 },
      );
    }

    let assessment: QualityAssessment;

    try {
      assessment = JSON.parse(outputText) as QualityAssessment;
    } catch {
      diagnostic.status = "failed";
      diagnostic.error = "Terra returned an invalid quality assessment.";
      diagnostics.push(diagnostic);

      return NextResponse.json(
        {
          error: diagnostic.error,
          chapterContent,
          diagnostics,
        },
        { status: 502 },
      );
    }

    diagnostics.push(diagnostic);
    const accepted = passes(assessment, mechanical);
    const combinedHardFailures = Array.from(
      new Set([...mechanical, ...assessment.hardFailures]),
    );
    const quality: QualityAssessment = {
      ...assessment,
      passed: accepted,
      hardFailures: combinedHardFailures,
    };

    return NextResponse.json({
      accepted,
      chapterContent,
      quality,
      qualityWarnings: accepted
        ? []
        : [...combinedHardFailures, ...assessment.repairInstructions],
      repaired: false,
      diagnostics,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The chapter quality assessment failed.";

    diagnostics.push(failedDiagnostic(startedAt, message));

    return NextResponse.json(
      {
        error: message,
        diagnostics,
      },
      { status: 502 },
    );
  }
}
