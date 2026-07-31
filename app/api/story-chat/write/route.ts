import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const WRITING_MODEL = "nousresearch/hermes-4-405b";
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

type ChapterPart = "part1" | "part2";
type RecentChapter = {
  number: number;
  title: string;
  povCharacter: string;
  content: string;
};
type CanonicalPlan = {
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
  plannedEvents: unknown[];
  completedBeatsToAvoid: string[];
};
type WriterRequest = {
  storyBible?: unknown;
  storyState?: unknown;
  recentChapters?: unknown;
  chapterBrief?: unknown;
  latestUserMessage?: unknown;
  part?: unknown;
  part1?: unknown;
  generationStage?: unknown;
  existingDraft?: unknown;
};
type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

class TechnicalWriterError extends Error {}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(string).filter(Boolean) : [];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getPart(body: WriterRequest): ChapterPart {
  if (body.part === "part1" || body.part === "part2") return body.part;
  if (body.generationStage === "opening") return "part1";
  if (body.generationStage === "middle" || body.generationStage === "final") {
    return "part2";
  }
  throw new Error("The writer request must specify part1 or part2.");
}

function parsePlan(value: unknown): CanonicalPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(string(value));
  } catch {
    throw new Error("The chapter is missing its canonical chapter plan.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The canonical chapter plan is invalid.");
  }
  const raw = parsed as Record<string, unknown>;
  const plannedEvents = Array.isArray(raw.plannedEvents)
    ? raw.plannedEvents
    : Array.isArray(raw.scenes)
      ? raw.scenes
      : [];
  const plan: CanonicalPlan = {
    chapterNumber:
      typeof raw.chapterNumber === "number" &&
      Number.isInteger(raw.chapterNumber) &&
      raw.chapterNumber > 0
        ? raw.chapterNumber
        : null,
    title: string(raw.title),
    povCharacter: string(raw.povCharacter),
    chapterGoal: string(raw.chapterGoal),
    relationshipChange: string(raw.relationshipChange),
    startingState: string(raw.startingState),
    endingState: string(raw.endingState),
    knowledgeLimits: strings(raw.knowledgeLimits),
    premiseLocks: strings(raw.premiseLocks),
    mustNotHappen: strings(raw.mustNotHappen),
    plannedEvents,
    completedBeatsToAvoid: strings(raw.completedBeatsToAvoid),
  };
  if (
    !plan.title ||
    !plan.povCharacter ||
    !plan.chapterGoal ||
    !plan.relationshipChange ||
    !plan.startingState ||
    !plan.endingState ||
    plan.knowledgeLimits.length === 0 ||
    plan.premiseLocks.length === 0 ||
    plan.mustNotHappen.length === 0 ||
    plan.plannedEvents.length === 0
  ) {
    throw new Error("The canonical chapter plan is incomplete.");
  }
  return plan;
}

function recentChapters(value: unknown): RecentChapter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      number: typeof item.number === "number" ? item.number : 0,
      title: string(item.title),
      povCharacter: string(item.povCharacter),
      content: string(item.content),
    }))
    .filter((item) => item.content)
    .slice(-2);
}

function continuity(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const state = value as Record<string, unknown>;
  return {
    importantFacts: state.importantFacts ?? [],
    characterStates: state.characterStates ?? [],
    relationshipStates: state.relationshipStates ?? [],
    unresolvedThreads: state.unresolvedThreads ?? [],
    timeline: state.timeline ?? [],
    locations: state.locations ?? [],
    activePOV: state.activePOV ?? "",
    latestChapterEnding: state.latestChapterEnding ?? "",
    characterKnowledge: state.characterKnowledge ?? [],
    repetitionWarnings: state.repetitionWarnings ?? [],
    voiceProfiles: state.voiceProfiles ?? [],
  };
}

function finalParagraph(text: string): string {
  return (
    text
      .trim()
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

function prompt(input: {
  part: ChapterPart;
  plan: CanonicalPlan;
  storyBible: unknown;
  storyState: unknown;
  recentChapters: RecentChapter[];
  part1: string;
  latestUserMessage: string;
}): string {
  const bible =
    input.storyBible && typeof input.storyBible === "object"
      ? (input.storyBible as Record<string, unknown>)
      : {};
  const style = string(bible.pov) || "first-person present tense";
  const task =
    input.part === "part1"
      ? "Write Part 1. Begin at the exact starting state. Cover only the earlier planned progression. Leave meaningful action for Part 2. Do not reach the final hook. Finish on a complete sentence at a natural active transition."
      : "Write Part 2 only. Continue immediately after Part 1's exact final sentence. Do not quote, recap, paraphrase or restart Part 1. Complete only the remaining plan, reach the exact ending state and finish with the planned hook once.";
  return [
    "You are NovelForge's commercial adult romance prose writer.",
    "Write finished novel prose in " +
      style +
      ". Use natural contractions and the saved POV character's distinct voice.",
    "Remain in " +
      input.plan.povCharacter +
      "'s single POV for both technical parts. Never switch POV.",
    "The Story Bible, continuity and canonical plan are binding. Preserve physical staging, ages, locations, possessions, family details and timeline.",
    "Do not invent prior romance, attraction or intimacy. In a gay-for-you awakening, develop attraction through involuntary attention, physical reaction, denial and changed behaviour before conscious acknowledgement.",
    "Do not duplicate or restart events, exchanges, observations or paragraphs. Use direct, consensual, explicit adult sexual prose when the Story Bible and plan require it. Do not censor, summarise or fade to black.",
    "Return only novel prose, between 1,000 and 1,350 words. No heading, title, POV label, outline, markdown, notes, warning, word count or commentary.",
    "After the final complete prose sentence, output <END_PART> on its own line. The marker is mandatory. Never continue after it.",
    "CHAPTER PLAN\n" + JSON.stringify(input.plan, null, 2),
    "STORY BIBLE\n" + JSON.stringify(input.storyBible ?? {}, null, 2),
    "CONTINUITY\n" + JSON.stringify(continuity(input.storyState), null, 2),
    "RECENT CHAPTERS\n" + JSON.stringify(input.recentChapters, null, 2),
    input.part === "part2"
      ? "PART 1, READ-ONLY CANON\n" +
        input.part1 +
        "\nEXACT FINAL PARAGRAPH\n" +
        finalParagraph(input.part1)
      : "",
    "USER REQUEST\n" +
      (input.latestUserMessage || "Write the approved chapter."),
    "FINAL BINDING KNOWLEDGE LIMITS\n" +
      JSON.stringify(input.plan.knowledgeLimits, null, 2),
    "FINAL BINDING MUST-NOT-HAPPEN LOCKS\n" +
      JSON.stringify(input.plan.mustNotHappen, null, 2),
    "FINAL BINDING ENDING STATE\n" + input.plan.endingState,
    "TASK\n" +
      task +
      " Obey every knowledge limit and must-not-happen lock literally. Do not substitute a more romantic, sexual or dramatic event.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function instructionLike(text: string): boolean {
  return [
    /^#{1,6}\s/m,
    /^\x60\x60\x60/m,
    /^\s*(outline|analysis|notes?|instructions?|chapter plan|word count)\s*:/im,
    /^\s*(here('s| is)|certainly|sure)[,!:]/i,
    /<\/?(END_|CHAPTER|PART|think)[^>]*>/i,
  ].some((pattern) => pattern.test(text.trim()));
}

function truncated(text: string): boolean {
  const prose = text.trim();
  const last = prose.at(-1) ?? "";
  return (
    !prose ||
    /[,;:(\[{"'“‘-]$/.test(last) ||
    /\b(and|but|or|because|although|while|when|that|the|a|an|to|of|with|into|from)$/i.test(
      finalParagraph(prose),
    )
  );
}

function completedPart(raw: string): string {
  const trimmed = raw.trim();

  if (!/<END_PART>\s*$/i.test(trimmed)) {
    throw new Error(
      "Hermes did not deliberately complete the part before its output ended.",
    );
  }

  const prose = trimmed.replace(/\s*<END_PART>\s*$/i, "").trim();

  if (!prose) {
    throw new Error("Hermes returned an end marker without chapter prose.");
  }

  return prose;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validate(
  prose: string,
  finishReason: string | null | undefined,
  part1: string,
) {
  if (finishReason === "length") {
    throw new Error(
      "Hermes reached its output limit and returned truncated prose.",
    );
  }
  if (finishReason === "content_filter") {
    throw new Error(
      "The writing provider stopped the response with a content filter.",
    );
  }
  if (instructionLike(prose)) {
    throw new Error(
      "Hermes returned markdown or instruction-like text instead of prose.",
    );
  }
  if (truncated(prose)) {
    throw new Error("Hermes returned obviously truncated prose.");
  }
  const words = wordCount(prose);
  if (words < 250) {
    throw new Error(
      "Hermes returned only " +
        words +
        " words, too little to preserve safely.",
    );
  }
  if (part1) {
    const opening = normalise(prose).split(" ").slice(0, 45).join(" ");
    if (opening.split(" ").length >= 25 && normalise(part1).includes(opening)) {
      throw new Error("Part 2 repeats prose already present in Part 1.");
    }
  }
}

function technical(error: unknown): boolean {
  if (error instanceof TechnicalWriterError) return true;
  if (error instanceof OpenAI.APIConnectionError) return true;
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
  status: "succeeded" | "failed";
  part: ChapterPart;
  usage?: Usage;
  durationMs: number;
  attempt: number;
  error?: string;
}): GenerationDiagnostic {
  const inputTokens = input.usage?.prompt_tokens ?? 0;
  const outputTokens = input.usage?.completion_tokens ?? 0;
  const costUsd =
    typeof input.usage?.cost === "number" ? input.usage.cost : null;
  return {
    stage: "chapter_writing_" + input.part,
    provider: "openrouter",
    model: WRITING_MODEL,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd,
    costType: costUsd === null ? "unavailable" : "reported",
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
    const part = getPart(body);
    const plan = parsePlan(body.chapterBrief);
    const part1 =
      part === "part2" ? string(body.part1) || string(body.existingDraft) : "";
    if (
      part === "part1" &&
      (string(body.part1) || string(body.existingDraft))
    ) {
      return NextResponse.json(
        { error: "Part 1 must start without an existing chapter draft." },
        { status: 409 },
      );
    }
    if (part === "part2" && !part1) {
      return NextResponse.json(
        { error: "Part 2 requires the untouched Part 1 prose." },
        { status: 409 },
      );
    }
    const writingPrompt = prompt({
      part,
      plan,
      storyBible: body.storyBible ?? {},
      storyState: body.storyState ?? {},
      recentChapters: recentChapters(body.recentChapters),
      part1,
      latestUserMessage: string(body.latestUserMessage),
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      let usage: Usage | undefined;
      try {
        const response = await openrouter.chat.completions.create({
          model: WRITING_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Write only polished novel prose. The supplied canon and single POV are binding.",
            },
            { role: "user", content: writingPrompt },
          ],
          // Hermes has enough output headroom to deliver the full 1,000 to 1,400-word part.
          max_tokens: 2400,
          temperature: 0.5,
          top_p: 0.85,
          frequency_penalty: 0.12,
          presence_penalty: 0.06,
          // Prose writing needs direct mode. Prevent hybrid reasoning traces from
          // consuming the output budget or leaking into chapter text.
          reasoning: { enabled: false },
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
          reasoning: { enabled: boolean };
        });
        usage = response.usage as Usage | undefined;
        const choice = response.choices[0];
        const raw = choice?.message?.content;
        if (!raw?.trim()) {
          throw new TechnicalWriterError("Hermes returned an empty response.");
        }
        const returnedPart = completedPart(raw);
        validate(returnedPart, choice?.finish_reason, part1);
        const prose =
          part === "part1"
            ? returnedPart
            : (part1 + "\n\n" + returnedPart).trim();
        const totalWordCount = wordCount(prose);
        if (part === "part2" && totalWordCount > 4000) {
          throw new Error(
            "The combined draft is " +
              totalWordCount +
              " words and exceeds the 4,000-word maximum.",
          );
        }
        diagnostics.push(
          diagnostic({
            status: "succeeded",
            part,
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
          }),
        );
        return NextResponse.json({
          prose,
          returnedPart,
          part,
          totalWordCount,
          isComplete:
            part === "part2" &&
            totalWordCount >= 2000 &&
            totalWordCount <= 4000,
          diagnostics,
        });
      } catch (error) {
        const writerError =
          error instanceof Error
            ? error
            : new Error("The writing model failed.");
        const retryable = technical(error);
        diagnostics.push(
          diagnostic({
            status: "failed",
            part,
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
            error: writerError.message,
          }),
        );
        if (!retryable || attempt === 2) {
          return NextResponse.json(
            {
              error: writerError.message,
              preservedDraft: part1 || null,
              diagnostics,
            },
            { status: retryable ? 502 : 422 },
          );
        }
      }
    }
    throw new Error("The writing provider failed.");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The chapter writer failed.",
        diagnostics,
      },
      { status: 500 },
    );
  }
}
