import OpenAI from "openai";

import { NextResponse } from "next/server";

import type {
  ChapterQualityAssessment,
  GenerationDiagnostic,
  SectionWritingBrief,
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

type Severity = "minor" | "moderate" | "major" | "critical";

type QualityAssessment = ChapterQualityAssessment & {
  overallStatus: "pass" | "pass_with_warnings" | "needs_attention";
  findings: {
    category:
      | "guidance"
      | "beat_order"
      | "endpoint"
      | "exclusion"
      | "invented_event"
      | "continuity"
      | "pov_tense"
      | "voice"
      | "prose_repetition"
      | "pacing"
      | "word_count";
    severity: Severity;
    message: string;
    beatOrder: number | null;
  }[];
  beatAssessments: {
    order: number;
    instruction: string;
    status: "satisfied" | "partial" | "missing";
    evidence: string;
  }[];
  guidanceAdherence: NonNullable<
    ChapterQualityAssessment["guidanceAdherence"]
  > & { exclusionViolations: string[] };
  wordCountCompliance: NonNullable<
    ChapterQualityAssessment["wordCountCompliance"]
  >;
  scores: ChapterQualityAssessment["scores"] & {
    factualAuthenticity: number;
    guidanceAdherence: number;
    endpointCompliance: number;
  };
};

const qualitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "passed",
    "overallStatus",
    "hardFailures",
    "repairInstructions",
    "summary",
    "findings",
    "beatAssessments",
    "guidanceAdherence",
    "wordCountCompliance",
    "scores",
  ],
  properties: {
    passed: { type: "boolean" },
    overallStatus: {
      type: "string",
      enum: ["pass", "pass_with_warnings", "needs_attention"],
    },
    hardFailures: {
      type: "array",
      items: { type: "string" },
    },
    repairInstructions: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "message", "beatOrder"],
        properties: {
          category: {
            type: "string",
            enum: [
              "guidance", "beat_order", "endpoint", "exclusion",
              "invented_event", "continuity", "pov_tense", "voice",
              "prose_repetition", "pacing", "word_count",
            ],
          },
          severity: {
            type: "string",
            enum: ["minor", "moderate", "major", "critical"],
          },
          message: { type: "string" },
          beatOrder: { type: ["integer", "null"] },
        },
      },
    },
    beatAssessments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "instruction", "status", "evidence"],
        properties: {
          order: { type: "integer", minimum: 1 },
          instruction: { type: "string" },
          status: {
            type: "string",
            enum: ["satisfied", "partial", "missing"],
          },
          evidence: { type: "string" },
        },
      },
    },
    guidanceAdherence: {
      type: "object",
      additionalProperties: false,
      required: [
        "missingBeats", "orderViolations", "endpointViolations",
        "inventedMajorEvents", "exclusionViolations",
      ],
      properties: {
        missingBeats: { type: "array", items: { type: "string" } },
        orderViolations: { type: "array", items: { type: "string" } },
        endpointViolations: { type: "array", items: { type: "string" } },
        inventedMajorEvents: { type: "array", items: { type: "string" } },
        exclusionViolations: { type: "array", items: { type: "string" } },
      },
    },
    wordCountCompliance: {
      type: "object",
      additionalProperties: false,
      required: ["actual", "minimum", "maximum", "withinRange"],
      properties: {
        actual: { type: "integer", minimum: 0 },
        minimum: { type: "integer", minimum: 500 },
        maximum: { type: "integer", minimum: 500 },
        withinRange: { type: "boolean" },
      },
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
        "guidanceAdherence",
        "endpointCompliance",
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
        guidanceAdherence: { type: "number", minimum: 1, maximum: 10 },
        endpointCompliance: { type: "number", minimum: 1, maximum: 10 },
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

function readChapterContract(value: string): Partial<SectionWritingBrief> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawBeats = Array.isArray(parsed.requiredBeats)
      ? parsed.requiredBeats
      : [];
    const requiredBeats = rawBeats
      .filter(
        (beat): beat is Record<string, unknown> =>
          Boolean(beat) && typeof beat === "object" && !Array.isArray(beat),
      )
      .map((beat, index) => ({
        order: index + 1,
        instruction: cleanString(beat.instruction),
        ...(typeof beat.approximateWordTarget === "number" &&
        Number.isInteger(beat.approximateWordTarget) &&
        beat.approximateWordTarget > 0
          ? { approximateWordTarget: beat.approximateWordTarget }
          : {}),
      }))
      .filter((beat) => Boolean(beat.instruction));
    const rawRange =
      parsed.targetWordRange &&
      typeof parsed.targetWordRange === "object" &&
      !Array.isArray(parsed.targetWordRange)
        ? (parsed.targetWordRange as Record<string, unknown>)
        : null;
    const minimum = Number(rawRange?.minimum);
    const preferred = Number(rawRange?.preferred);
    const maximum = Number(rawRange?.maximum);
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
      chapterNumber:
        typeof parsed.chapterNumber === "number"
          ? parsed.chapterNumber
          : undefined,
      chapterKind: parsed.chapterKind === "epilogue" ? "epilogue" : "chapter",
      chapterTitle: cleanString(parsed.chapterTitle || parsed.title),
      povCharacter: cleanString(parsed.povCharacter),
      authorDirection: cleanString(parsed.authorDirection),
      continuationBoundary: cleanString(parsed.continuationBoundary),
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

function mechanicalFailures(content: string): string[] {
  const failures: string[] = [];

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
  const seriousFinding = assessment.findings.some(
    (finding) =>
      finding.severity === "major" || finding.severity === "critical",
  );

  return (
    assessment.passed &&
    assessment.overallStatus !== "needs_attention" &&
    mechanical.length === 0 &&
    assessment.hardFailures.length === 0 &&
    !seriousFinding &&
    assessment.scores.continuity >= 7 &&
    assessment.scores.povAndTense >= 7 &&
    assessment.scores.guidanceAdherence >= 7 &&
    assessment.scores.endpointCompliance >= 7
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
    const contract = readChapterContract(chapterBrief);
    const chapterTitle = cleanString(body.chapterTitle);
    const povCharacter = cleanString(body.povCharacter);
    const chapterContent = cleanString(body.chapterContent);
    const minimumWordCount =
      contract.targetWordRange?.minimum ??
      requestedWordCount(body.minimumWordCount, 2000);
    const maximumWordCount = Math.max(
      minimumWordCount,
      contract.targetWordRange?.maximum ??
        requestedWordCount(body.maximumWordCount, 4000),
    );
    const actualWordCount = countWords(chapterContent);

    if (!chapterBrief || !povCharacter || !chapterContent) {
      return NextResponse.json(
        { error: "A complete chapter and canonical plan are required." },
        { status: 400 },
      );
    }

    const mechanical = mechanicalFailures(chapterContent);
    const deterministicWordCount = {
      actual: actualWordCount,
      minimum: minimumWordCount,
      maximum: maximumWordCount,
      withinRange:
        actualWordCount >= minimumWordCount &&
        actualWordCount <= maximumWordCount,
    };
    const response = await openai.responses.create({
      model: QUALITY_MODEL,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: [
            "You are NovelForge's completed-chapter diagnostic inspector. QA IS AN INSPECTOR, NOT AN AUTHOR.",
            "Assess the chapter once. Never rewrite, edit, repair, regenerate or reproduce its prose. Never supply replacement scenes or dialogue, and never alter the Story Bible, continuity or Chapter Contract.",
            "AUTHOR AUTHORITY: The complete Chapter Contract controls what must happen. Original guidance is the fallback authority when an extracted beat omits or weakens nuance. Do not substitute your preferred plot, emotion, stakes, style or ending.",
            "Assess every required beat individually as satisfied, partial or missing. Vague similarity is not completion. Return exactly one beatAssessment for every supplied beat, using its supplied order and instruction.",
            "Check meaningful beat-order violations, but ignore ordinary connective actions between beats.",
            "Check whether the endpoint occurs and whether the chapter continues materially beyond it. Distinguish missing endpoint from endpoint overrun.",
            "Check every explicit exclusion. Do not invent exclusions.",
            "Flag only consequential invented events unsupported by the contract, original guidance, Story Bible or continuity. Dialogue, gestures, thoughts, humour, environmental interaction, attraction, minor reactions, micro-conflict and connective actions are normal creative freedom.",
            "Check meaningful continuity contradictions involving facts, character and relationship states, time, location, previous events, unresolved threads and especially character knowledge. Do not flag harmless wording differences.",
            "Check the specified POV character, person and tense. Distinguish real drift or head-hopping from dialogue, memories and grammatically necessary tense changes.",
            "Use available voice profiles and established information to flag only clear narration or dialogue drift, inappropriate vocabulary, or characters becoming indistinguishable. Allow emotional range.",
            "Inspect prose for patterns, not isolated examples: action-list narration, redundant emotional explanation, excessive staccato or one-line paragraphs, generic AI phrasing, repeated reactions or sentence structures, circular thought, exposition, purple prose, unnatural dialogue or lack of contractions, excessive comparisons, repeated mannerisms and inappropriate therapy-speak.",
            "Assess causal scene flow and pacing across all required beats. Flag a bloated opening with a rushed ending, later beats crammed into a small final passage, beats merely mentioned rather than developed, padding, circular filler or an abrupt endpoint. Do not demand equal space per beat.",
            "The supplied deterministic word count is authoritative. A trivial miss is minor. A material miss is moderate or major according to scale.",
            "Major or critical findings include missing required scenes, exclusion violations, wrong POV, major continuity contradictions, substantial endpoint overrun or several missing beats. Minor findings include limited repetition, small style patterns and trivial word-count misses.",
            "hardFailures contains only major or critical defects that make the chapter unsafe to accept unchanged. repairInstructions are concise diagnostic actions for a later author-selected recovery, never replacement prose.",
            "Set overallStatus to pass for no findings, pass_with_warnings for minor or moderate findings only, and needs_attention for any major or critical finding. Set passed false for needs_attention and true otherwise.",
            "Keep feedback concrete and evidence-based. Do not ask vaguely for more resonance, richer prose, higher stakes or a deeper relationship.",
            "Explicit consensual adult content must not be failed merely for being explicit. Every romantic or sexual character must be eighteen or older.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "STORY BIBLE, FIXED CANON",
            JSON.stringify(body.storyBible ?? {}, null, 2),
            "CONTINUITY BEFORE CHAPTER, INCLUDING KNOWLEDGE AND VOICE DATA",
            JSON.stringify(qualityStoryState(body.storyState), null, 2),
            "COMPLETE CHAPTER CONTRACT, AUTHOR AUTHORITY",
            JSON.stringify(contract, null, 2),
            "ORIGINAL GUIDANCE, FALLBACK AUTHORITY",
            contract.originalGuidance ||
              contract.authorDirection ||
              "No separate original guidance is available in this legacy plan.",
            "CHAPTER METADATA",
            "Chapter: " + (contract.chapterNumber ?? "unknown"),
            "Title: " + (chapterTitle || contract.chapterTitle),
            "POV: " + (povCharacter || contract.povCharacter),
            "AUTHORITATIVE DETERMINISTIC WORD COUNT",
            JSON.stringify(deterministicWordCount, null, 2),
            "DETERMINISTIC TECHNICAL FAILURES",
            JSON.stringify(mechanical, null, 2),
            "UNTOUCHED COMPLETED CHAPTER, INSPECT ONLY",
            chapterContent,
          ].join("\n\n"),
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "novelforge_contract_quality_assessment",
          strict: true,
          schema: qualitySchema,
        },
      },
      max_output_tokens: 5000,
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

    const contractBeats = contract.requiredBeats ?? [];
    const beatAssessmentIsComplete =
      assessment.beatAssessments.length === contractBeats.length &&
      contractBeats.every(
        (beat, index) =>
          assessment.beatAssessments[index]?.order === beat.order &&
          assessment.beatAssessments[index]?.instruction === beat.instruction,
      );

    if (!beatAssessmentIsComplete) {
      diagnostic.status = "failed";
      diagnostic.error =
        "Terra did not assess every required chapter beat in contract order.";
      diagnostics.push(diagnostic);
      return NextResponse.json(
        { error: diagnostic.error, chapterContent, diagnostics },
        { status: 502 },
      );
    }

    diagnostics.push(diagnostic);
    const combinedHardFailures = Array.from(
      new Set([...mechanical, ...assessment.hardFailures]),
    );
    const accepted = passes(assessment, mechanical);
    const quality: QualityAssessment = {
      ...assessment,
      passed: accepted,
      overallStatus: accepted
        ? assessment.findings.length > 0
          ? "pass_with_warnings"
          : "pass"
        : "needs_attention",
      hardFailures: combinedHardFailures,
      wordCountCompliance: deterministicWordCount,
    };

    return NextResponse.json({
      accepted,
      chapterContent,
      quality,
      qualityWarnings: accepted
        ? quality.findings.map((finding) => finding.message)
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
