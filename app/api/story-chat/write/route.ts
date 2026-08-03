import OpenAI from "openai";

import { NextResponse } from "next/server";

import type { GenerationDiagnostic } from "../../../story-chat/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const WRITING_MODEL = "gpt-5.6-terra";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
};

class TechnicalWriterError extends Error {}

class InstructionConflictError extends Error {}

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
    currentScene: state.currentScene ?? null,
    relationshipProgression: state.relationshipProgression ?? [],
    repetitionMemory: state.repetitionMemory ?? null,
  };
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
  const fullDraftContext = completeDraftContext(input.chapterDraft);
  const exactContinuationBoundary = endingExcerpt(input.chapterDraft, 350);
  const draftRepetitionReport = chapterRepetitionReport(input.chapterDraft);
  const mandatoryGuidance =
    input.sectionInstruction ||
    input.latestUserMessage ||
    "Write only the next uncompleted beat of the canonical chapter plan.";
  const actionInstruction =
    input.action === "start"
      ? "Begin at the canonical plan's exact opening state. Do not skip its opening beat."
      : input.action === "rewrite"
        ? "Replace SECTION TO REWRITE only. Preserve what happens immediately before and after it. Do not rewrite or advance any other part of the chapter."
        : "Continue from the exact final moment of EXACT CONTINUATION BOUNDARY. Do not recap, restart, repeat its final sentence, jump forward without instruction or begin a different scene.";

  return [
    "You are NovelForge's commercial adult MM romance prose writer.",
    "MANDATORY INSTRUCTION CONTRACT",
    "The canonical chapter plan and the user's current section guidance are requirements, not inspiration, suggestions or optional context.",
    "Authority order is strict: CURRENT GUIDANCE comes first, then the canonical chapter plan for everything the guidance does not change, then established continuity and the Story Bible.",
    "The user is allowed to deliberately advance, delay or alter a planned emotional or romantic beat through CURRENT GUIDANCE. When that happens, obey the guidance without treating the change as a conflict. Keep every unrelated planned beat intact.",
    "Read the complete current chapter draft before writing. Treat every action, thought, conclusion, description and exchange already present anywhere in that draft as completed material, not merely the final paragraphs.",
    "Write the events requested by the guidance exactly as part of the canonical plan. Preserve their participants, order, location, timing, emotional stage, intended outcome and stopping point.",
    "You may invent only the dialogue, physical business, sensory details and connective prose needed to dramatise those specified events.",
    "Never replace a requested event with a similar event. Never omit, reinterpret, contradict or soften a requirement. Never add an event that changes the plan.",
    "Do not write later planned beats unless the current guidance explicitly requests them. Do not resolve a conflict, reveal information, create attraction awareness, introduce intimacy or reach the chapter hook early.",
    "If the current guidance names an exact action, line, fact, location, time or endpoint, it must appear accurately in the prose.",
    "Return <INSTRUCTION_CONFLICT> only when the guidance is impossible to reconcile with a fixed factual continuity detail and does not clearly instruct you to change that detail. A deliberate change to attraction, awareness, pacing, intimacy, dialogue or a future planned beat is not a conflict.",
    "Write one polished section of approximately 600 to 1,000 words.",
    "Return only novel prose followed by <END_SECTION> on its own line.",
    "Use the Story Bible's POV and tense. Default to first-person present tense only when the Story Bible does not specify them.",
    "Remain in " + input.povCharacter + "'s POV. Never switch heads.",
    "Use natural contractions by default in narration, internal thought and dialogue: I'm, I've, I'd, it's, that's, you're, he's, she's, we're, they're, don't, doesn't, didn't, can't, couldn't, won't and wouldn't. Use uncontracted forms such as I am, it is, that is, you are, he is, she is, do not and cannot only for deliberate emphasis or an established formal voice, never as the ordinary sentence pattern.",
    "Every sentence must be complete, grammatical and naturally phrased. Never omit articles, pronouns, auxiliary verbs, prepositions or connecting words for brevity or style.",
    "Never use an em dash or en dash. Use full stops, commas, colons, semicolons or parentheses where grammatically appropriate. Ordinary hyphens are allowed only inside genuine compound words.",
    "Write controlled commercial prose, not a summary of what the viewpoint character thinks and feels. Build the scene through specific action, dialogue, sensory detail and individual observation.",
    "Do not explain an emotion after the action or physical response has already shown it. Do not repeatedly announce nerves, determination, confusion, attraction or discomfort.",
    "Avoid generic reaction crutches such as a pounding heart, a caught breath, taking a deep breath, being unable to help thinking or noticing, and reminding oneself why one is here unless that exact reaction is both fresh and necessary.",
    "Do not begin successive paragraphs with the same construction. Vary sentence length naturally without fragments, clipped article-free phrasing or run-on sentences.",
    "Use colons sparingly in narration and dialogue. Do not make the prose sound like a report, slide deck, list or essay merely because the viewpoint character is analytical.",
    "Dialogue must sound like the specific people speaking. Avoid formal exposition disguised as dialogue, generic interview language and speeches that explain facts both characters already know.",
    "Keep exposition brief enough for the scene to move. When a plan, interview, presentation or explanation has established its purpose, advance to the next planned action instead of supplying more examples and lists.",
    "Track every character's exact physical position before writing a movement. A standing character cannot stand again, crossed arms cannot simultaneously rest on furniture, and nobody may become physically close without an on-page movement that closes the distance.",
    "When recurring side characters speak or perform important actions, introduce and use their established names or roles. Do not repeatedly call them only the man, the woman or another generic label.",
    "Avoid vague attraction placeholders such as something I cannot name, not anger exactly, an unfamiliar feeling, something tighter, a charged look or an unexplained pull. In delayed-awareness stories, describe only what the viewpoint character can presently interpret unless CURRENT GUIDANCE explicitly requires acknowledgement or a new stage of awareness.",
    "Do not repeatedly use eyes, gaze, jaw, teeth, breath, heartbeat, clenched hands or body tension as interchangeable shortcuts for emotion. Any ordinary gesture may appear when apt, but vary the evidence and do not overuse it across the chapter.",
    "Do not invent previous meetings, conversations, opinions, memories or familiarity. A viewpoint character may know only what the Story Bible, continuity, plan or on-page events establish they know.",
    "The Story Bible and accepted continuity are fixed facts. They support the plan and guidance but do not give permission to ignore either.",
    "Follow the canonical plan in order. Write only the beats explicitly permitted by the current guidance. Stop once those beats reach a natural finished moment.",
    "Preserve ages, timeline, locations, possessions, family facts, physical positions and character knowledge.",
    "Do not invent prior romance, attraction or intimacy. In a gay-for-you or delayed-awareness arc, involuntary attention, physical reaction, denial and changed behaviour normally precede conscious acknowledgement, but CURRENT GUIDANCE may explicitly move the character into acknowledgement now.",
    "Do not repeat completed actions, conversations, jokes, gestures, attraction observations, internal conclusions or paragraphs.",
    "Use the chapter-level repetition report as evidence, not as a crude banned-word list. Avoid adding to an overused pattern, but keep ordinary language natural when a word is genuinely needed.",
    "Write long, open-door consensual adult intimacy when the established progression requires it. Keep the characters and their emotional progression on the page throughout the complete intimate scene and its aftermath rather than abruptly cutting away.",
    "Do not include a chapter heading, POV label, outline, notes, markdown, warnings, analysis or commentary.",
    "STORY BIBLE, FIXED CANON\n" +
      JSON.stringify(input.storyBible ?? {}, null, 2),
    "CANONICAL CHAPTER PLAN, MANDATORY\n" + input.chapterBrief,
    "CONTINUITY\n" + JSON.stringify(cleanStoryState(input.storyState), null, 2),
    "RECENT CHAPTER ENDINGS\n" + JSON.stringify(input.recentChapters, null, 2),
    input.chapterDraft
      ? "COMPLETE CURRENT CHAPTER DRAFT, READ ONLY\n" + fullDraftContext
      : "",
    input.chapterDraft
      ? "EXACT CONTINUATION BOUNDARY, READ ONLY\n" + exactContinuationBoundary
      : "",
    "CURRENT CHAPTER REPETITION REPORT\n" +
      (draftRepetitionReport.length
        ? draftRepetitionReport.join("\n")
        : "No chapter-level lexical pattern has crossed its review threshold."),
    input.action === "rewrite"
      ? "SECTION TO REWRITE, READ ONLY\n" + input.sectionToRewrite
      : "",
    "CHAPTER METADATA\nTitle: " +
      input.chapterTitle +
      "\nPOV: " +
      input.povCharacter,
    "ORIGINAL CHAPTER REQUEST, BINDING WHERE RELEVANT\n" +
      (input.latestUserMessage || "No separate original request supplied."),
    "CURRENT GUIDANCE, HIGHEST PRIORITY WRITING REQUIREMENT\n" +
      mandatoryGuidance,
    "EXACT ACTION AND BOUNDARY\n" + actionInstruction,
    "SILENT COMPLIANCE CHECK BEFORE RETURNING PROSE",
    "Check every sentence against the current guidance and canonical plan. Confirm that every requested beat is present, no requested fact changed, no later beat was pulled forward, continuity begins at the exact prior endpoint, POV remains fixed and the section stops where instructed. Correct any failure silently before returning the prose.",
    "Complete the section on a finished sentence, then output <END_SECTION>. Do not continue after the marker.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractCompletedSection(raw: string): string {
  const trimmed = raw.trim();

  if (/^<INSTRUCTION_CONFLICT>/i.test(trimmed)) {
    const explanation = trimmed
      .replace(/^<INSTRUCTION_CONFLICT>\s*/i, "")
      .trim();

    throw new InstructionConflictError(
      explanation ||
        "The current guidance conflicts with the canonical chapter plan or established continuity.",
    );
  }

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

  if (repeatedWindowOccurrences(section, 16) >= 4) {
    throw new Error(
      "The writing model repeated substantial prose within the same section. The duplicated output was discarded.",
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
  if (error instanceof InstructionConflictError) {
    return false;
  }

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
  const inputTokens = input.usage?.input_tokens ?? 0;
  const outputTokens = input.usage?.output_tokens ?? 0;
  const cachedTokens = input.usage?.input_tokens_details?.cached_tokens ?? 0;
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const costUsd =
    (uncachedTokens * 1.25 + cachedTokens * 0.125 + outputTokens * 7.5) /
    1_000_000;

  return {
    stage: "chapter_section_writing",
    provider: "openai",
    model: WRITING_MODEL,
    status: input.status,
    inputTokens,
    outputTokens,
    totalTokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    costUsd,
    costType: "estimated",
    durationMs: input.durationMs,
    attempt: input.attempt,
    ...(input.error ? { error: input.error } : {}),
  };
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
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
        const response = await openai.responses.create({
          model: WRITING_MODEL,
          reasoning: {
            effort: "low",
          },
          input: [
            {
              role: "system",
              content:
                "CURRENT GUIDANCE is the highest authority for this section. Obey it exactly, including when the user deliberately advances or changes an emotional, romantic or future planned beat. Use the canonical chapter plan for every detail the guidance does not change. Do not call a deliberate pacing, attraction, awareness or intimacy change a conflict. Return the conflict marker only for an unaddressed, impossible factual continuity contradiction. Write polished, grammatically complete commercial romance prose with natural contractions. Keep consensual adult intimacy on the page when required. Never switch POV, use em dashes or en dashes, omit necessary words, summarise the requested scene or pad it with generic emotional explanation.",
            },
            { role: "user", content: writingPrompt },
          ],
          text: {
            verbosity: "medium",
          },
          max_output_tokens: 2600,
        });
        usage = response.usage as Usage | undefined;

        if (response.status === "incomplete") {
          throw new Error(
            `The writing model did not complete the section because ${
              response.incomplete_details?.reason ??
              "the response was interrupted"
            }.`,
          );
        }

        const raw = response.output_text;

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
          const status =
            error instanceof InstructionConflictError
              ? 409
              : retryable
                ? 502
                : 422;

          return NextResponse.json(
            {
              error: writerError.message,
              preservedDraft: chapterDraft || null,
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
