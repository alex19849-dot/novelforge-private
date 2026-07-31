import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const WRITING_MODEL = "anthracite-org/magnum-v4-72b";
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

type SectionAction = "start" | "continue" | "rewrite";

type WriterRequest = {
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
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

class TechnicalWriterError extends Error {}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function cleanStoryState(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

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
}): string {
  const draftContext = endingExcerpt(input.chapterDraft, 1400);
  const actionInstruction =
    input.action === "start"
      ? "Begin the chapter at the canonical plan's exact opening state."
      : input.action === "rewrite"
        ? "Write a replacement for SECTION TO REWRITE only. Preserve the surrounding chapter continuity and satisfy the user's section instruction."
        : "Continue immediately after CURRENT CHAPTER ENDING. Do not recap, restart or quote its final sentence.";

  return [
    "You are NovelForge's commercial adult MM romance prose writer.",
    "Write one polished section of approximately 600 to 1,000 words.",
    "Return only novel prose followed by <END_SECTION> on its own line.",
    "Use the Story Bible's POV and tense. Default to first-person present tense only when the Story Bible does not specify them.",
    "Remain in " + input.povCharacter + "'s POV. Never switch heads.",
    "Use natural contractions, a distinct character voice and readable paragraphing.",
    "Every sentence must be complete, grammatical and naturally phrased. Never omit articles, pronouns, auxiliary verbs, prepositions or connecting words for brevity or style.",
    "Never use an em dash or en dash. Use full stops, commas, colons, semicolons or parentheses where grammatically appropriate. Ordinary hyphens are allowed only inside genuine compound words.",
    "Write controlled commercial prose, not a summary of what the viewpoint character thinks and feels. Build the scene through specific action, dialogue, sensory detail and individual observation.",
    "Do not explain an emotion after the action or physical response has already shown it. Do not repeatedly announce nerves, determination, confusion, attraction or discomfort.",
    "Avoid generic reaction crutches such as a pounding heart, a caught breath, taking a deep breath, being unable to help thinking or noticing, and reminding oneself why one is here unless that exact reaction is both fresh and necessary.",
    "Do not begin successive paragraphs with the same construction. Vary sentence length naturally without fragments, clipped article-free phrasing or run-on sentences.",
    "Dialogue must sound like the specific people speaking. Avoid formal exposition disguised as dialogue, generic interview language and speeches that explain facts both characters already know.",
    "Do not invent previous meetings, conversations, opinions, memories or familiarity. A viewpoint character may know only what the Story Bible, continuity, plan or on-page events establish they know.",
    "The Story Bible, canonical chapter plan and accepted continuity are binding.",
    "Follow the plan in order, but write only the next useful portion. Do not rush to the chapter's final hook unless the remaining plan and user instruction require it.",
    "Preserve ages, timeline, locations, possessions, family facts, physical positions and character knowledge.",
    "Do not invent prior romance, attraction or intimacy. In a gay-for-you or delayed-awareness arc, involuntary attention, physical reaction, denial and changed behaviour must precede conscious acknowledgement.",
    "Do not repeat completed actions, conversations, jokes, gestures, attraction observations, internal conclusions or paragraphs.",
    "Write direct consensual explicit adult sexual content when the established story progression and current instruction require it. Never censor, summarise or fade to black.",
    "Do not include a chapter heading, POV label, outline, notes, markdown, warnings, analysis or commentary.",
    "STORY BIBLE\n" + JSON.stringify(input.storyBible ?? {}, null, 2),
    "CANONICAL CHAPTER PLAN\n" + input.chapterBrief,
    "CONTINUITY\n" + JSON.stringify(cleanStoryState(input.storyState), null, 2),
    "RECENT CHAPTER ENDINGS\n" + JSON.stringify(input.recentChapters, null, 2),
    input.chapterDraft
      ? "CURRENT CHAPTER ENDING, READ ONLY\n" + draftContext
      : "",
    input.action === "rewrite"
      ? "SECTION TO REWRITE, READ ONLY\n" + input.sectionToRewrite
      : "",
    "CHAPTER METADATA\nTitle: " +
      input.chapterTitle +
      "\nPOV: " +
      input.povCharacter,
    "USER'S CHAPTER REQUEST\n" +
      (input.latestUserMessage || "Write the chapter naturally."),
    "SECTION INSTRUCTION\n" +
      (input.sectionInstruction || "Write the next planned section."),
    "ACTION\n" + actionInstruction,
    "Complete the section on a finished sentence, then output <END_SECTION>. Do not continue after the marker.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractCompletedSection(raw: string): string {
  const trimmed = raw.trim();

  if (!/<END_SECTION>\s*$/i.test(trimmed)) {
    throw new Error(
      "The writing model did not deliberately complete the section.",
    );
  }

  const section = trimmed.replace(/\s*<END_SECTION>\s*$/i, "").trim();

  if (!section) {
    throw new Error("The writing model returned no section prose.");
  }

  return section;
}

function validateSection(section: string): void {
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

  if (!/[.!?…”’']$/u.test(section)) {
    throw new Error(
      "The writing model returned an obviously truncated section.",
    );
  }

  if (countWords(section) < 120) {
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

  const reactionCrutches = [
    /\bmy heart (?:is )?pound(?:s|ing)\b/gi,
    /\bi (?:take|draw) a deep breath\b/gi,
    /\bi can(?:not|'t) help but\b/gi,
    /\bi remind myself\b/gi,
  ];

  if (
    reactionCrutches.some(
      (pattern) => Array.from(section.matchAll(pattern)).length > 1,
    )
  ) {
    warnings.push(
      "This section repeats a generic physical or internal reaction. Review it before continuing.",
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
  status: "succeeded" | "failed";
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
    stage: "chapter_section_writing",
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
    const action = getAction(body.action);
    const chapterBrief = cleanString(body.chapterBrief);
    const chapterTitle = cleanString(body.chapterTitle);
    const povCharacter = cleanString(body.povCharacter);
    const chapterDraft = cleanString(body.chapterDraft);
    const sectionToRewrite = cleanString(body.sectionToRewrite);

    if (!chapterBrief || !povCharacter) {
      return NextResponse.json(
        { error: "A canonical chapter plan and POV character are required." },
        { status: 400 },
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
      sectionInstruction: cleanString(body.sectionInstruction),
      latestUserMessage: cleanString(body.latestUserMessage),
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
                "Write only polished, grammatically complete commercial romance prose. Canon, POV, established character knowledge, punctuation rules and user direction are binding. Never use em dashes or en dashes, omit necessary words, summarise the scene or pad it with generic emotional explanation.",
            },
            { role: "user", content: writingPrompt },
          ],
          max_tokens: 1600,
          temperature: 0.55,
          top_p: 0.88,
          frequency_penalty: 0,
          presence_penalty: 0,
        });
        usage = response.usage as Usage | undefined;
        const choice = response.choices[0];

        if (choice?.finish_reason === "length") {
          throw new Error(
            "The writing model reached its output limit before completing the section.",
          );
        }

        if (choice?.finish_reason === "content_filter") {
          throw new Error(
            "The writing provider stopped the section with a content filter.",
          );
        }

        const raw = choice?.message?.content;

        if (!raw?.trim()) {
          throw new TechnicalWriterError(
            "The writing model returned an empty response.",
          );
        }

        const section = extractCompletedSection(raw);
        validateSection(section);
        const warnings = repetitionWarnings(
          chapterDraft,
          section,
          sectionToRewrite,
        );

        diagnostics.push(
          diagnostic({
            status: "succeeded",
            usage,
            durationMs: Date.now() - startedAt,
            attempt,
          }),
        );

        return NextResponse.json({
          section,
          wordCount: countWords(section),
          warnings,
          action,
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
            status: "failed",
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
              preservedDraft: chapterDraft || null,
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
          error instanceof Error ? error.message : "The section writer failed.",
        diagnostics,
      },
      { status: 500 },
    );
  }
}
