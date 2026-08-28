// NovelForge realism fix, 2026-08-28.
import OpenAI from "openai";

import { NextResponse } from "next/server";

import type {
  GenerationDiagnostic,
  SectionWritingBrief,
} from "../../../story-chat/types";

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
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

class TechnicalWriterError extends Error {}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSectionBrief(value: string): Partial<SectionWritingBrief> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
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
    };
  } catch {
    return {};
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
    currentScene: state.currentScene ?? null,
    relationshipProgression: state.relationshipProgression ?? [],
    repetitionMemory: state.repetitionMemory ?? null,
  };
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
  const sectionBrief = readSectionBrief(input.chapterBrief);
  const sectionBriefForPrompt =
    input.action === "start"
      ? input.chapterBrief
      : JSON.stringify({
          chapterNumber: sectionBrief.chapterNumber,
          chapterKind: sectionBrief.chapterKind,
          chapterTitle: input.chapterTitle || sectionBrief.chapterTitle,
          povCharacter: input.povCharacter,
        });
  const fullDraftContext = completeDraftContext(input.chapterDraft);
  const exactContinuationBoundary = endingExcerpt(input.chapterDraft, 350);
  const draftRepetitionReport = chapterRepetitionReport(input.chapterDraft);
  const voiceProfiles = cleanVoiceProfiles(
    input.storyState,
    input.povCharacter,
  );
  const mandatoryGuidance = input.sectionInstruction
    ? input.sectionInstruction
    : input.action === "start"
      ? sectionBrief.authorDirection ||
        input.latestUserMessage ||
        "Open the chapter from the established continuity boundary."
      : input.action === "rewrite"
        ? "Rewrite only the selected passage while preserving its narrative purpose and boundaries."
        : "Continue directly from the current draft through only the immediate next development. Do not introduce a major new event without author direction.";
  const actionInstruction =
    input.action === "start"
      ? "Begin from this section's continuity boundary: " +
        (sectionBrief.continuationBoundary ||
          "the exact accepted ending supplied in continuity") +
        "."
      : input.action === "rewrite"
        ? "Replace SECTION TO REWRITE only. Preserve what happens immediately before and after it. Do not rewrite or advance any other part of the chapter."
        : "Continue from the exact final moment of EXACT CONTINUATION BOUNDARY. Do not recap, restart, repeat its final sentence, jump forward without instruction or begin a different scene.";

  return [
    "You are NovelForge's commercial adult MM romance novelist.",
    "SECTION CONTRACT",
    "CURRENT GUIDANCE is the complete creative instruction for this call. There is no binding full-chapter plan. Follow its events, participants, order, emotional movement, heat, endpoint and deliberate changes exactly.",
    "Accepted continuity and the Story Bible preserve established facts. They do not overrule a new direction the author requests. Never return a conflict warning.",
    "Read the complete current draft as finished material. Write only the immediate requested section, inventing no major event beyond what is needed to dramatise it. Do not repeat or recap completed material.",
    input.action === "rewrite"
      ? "Rewrite only the selected passage and preserve its boundaries."
      : "Begin at the supplied boundary and stop at the requested endpoint or the first natural completed moment within it.",
    "Write approximately 600 to 1,000 words. If CURRENT GUIDANCE asks to finish the chapter, write one bounded final section of approximately 800 to 1,400 words, resolve only the active immediate beat, land one ending state or hook and stop.",
    "Return only novel prose followed by <END_SECTION> on its own line. Finish every sentence before the marker.",
    "CHARACTER CAUSALITY AND VOICE",
    "Before each meaningful beat, ground the character in an immediate want, pressure, knowledge limit and face-saving strategy. Their action must follow from the person and circumstances, not from a generic romance role or the plot needing them to behave a certain way.",
    "Write male characters as specific adult men, not interchangeable gruff, dominant, sarcastic, hyper-protective or emotionally polished templates. Let background, work, culture, friendships, habits, pride, fear and experience shape how each man speaks, notices, argues, cares and wants.",
    "Use CHARACTER VOICE PROFILES as operational instructions. Keep syntax, line length, vocabulary, register, swearing, humour, disclosure, conflict tactics, internal decision speed and sensory attention observably different. If no profile exists yet, derive these differences from each Story Bible character entry without inventing biography.",
    "Care must be character-specific and proportionate. Do not turn either man into a default nurse, therapist, mind-reader or safety officer. Ordinary discomfort does not automatically become a relationship beat.",
    "DIALOGUE",
    "Every line must have an intelligible link to the previous line or visible action: answer it, challenge it, evade it, misread it, redirect it or act on it. A subject change needs a clear trigger. Deliberate evasion may be indirect, but it must still make sense.",
    "Give each speaker an immediate conversational aim. Let people interrupt, deflect, joke badly, leave implications unsaid or refuse a neat answer when that fits them, while keeping the exchange causally coherent.",
    "Do not write exposition both speakers know, interview-style question chains, confirmation ladders, therapy-speak, perfect emotional literacy, interchangeable quips, constant sarcasm or speeches that explain the scene.",
    "NARRATIVE ECONOMY",
    "Every paragraph must change action, knowledge, decision, pressure or relationship, or add irreplaceable character-specific texture. Cut routine choreography, room inventories, repeated setting introductions, transition waffle and reflection that performs no new work.",
    "Once an emotion, attraction observation, worry or conclusion has landed, do not notice, interpret, doubt and restate it again unless new external evidence changes its meaning. Trust the reader.",
    "Continuity is a fact register, not a list of details to foreground. A stable treated minor injury may be mentioned only when it changes, is directly aggravated, materially limits the immediate action or CURRENT GUIDANCE makes it important. After one necessary adjustment, drop it. Do not keep checking, watching, protecting, thinking about or reassuring over a bandage. Apply the same restraint to bruises, tiredness, clothing and ordinary objects.",
    "EROTIC SCENES",
    "Every romantic or sexual character is an adult aged eighteen or older.",
    "Treat an intimate scene as a story scene particular to this couple. Their histories, experience, inhibitions, humour, conflict, desire, vocabulary and current stakes must determine initiation, tempo, focus, physical choices and aftermath.",
    "When CURRENT GUIDANCE calls for open-door explicit prose, keep it physically legible and emotionally specific without fading out, summarising or replacing the scene with vague sensation. Do not use a standard escalation ladder, anatomy inventory, stock dirty talk, a safety briefing, repeated reassurance or an automatic tenderness script.",
    "Each intimate scene must reveal character, change understanding, alter the relationship or affect the plot. Do not repeat the same progression, language, power dynamic or aftermath used earlier merely because it is familiar.",
    "PROSE AND CONTINUITY",
    "Use the Story Bible's POV and tense. Default to first-person present only when neither is specified. Remain in " +
      input.povCharacter +
      "'s POV and never switch heads.",
    "Use contractions where natural to this narrator or speaker. Keep sentences complete, grammatical and idiomatic. Never use an em dash or en dash.",
    "Show emotion through specific action, choice, dialogue and perception. Do not explain what has already been shown or lean on stock breath, heartbeat, jaw, gaze, clenched-hand or vague unnamed-feeling reactions.",
    "Track physical positions and movements exactly. Preserve ages, time, locations, possessions, family facts and individual knowledge. Do not invent prior meetings, attraction, romance, sex, memories or off-page solutions.",
    "Attraction, conscious acknowledgement and physical escalation are separate stages. Do not turn awareness into a kiss, confession or sexual contact unless CURRENT GUIDANCE requests that step or accepted on-page progression makes it the immediate established action.",
    "STORY BIBLE, FIXED CANON\n" +
      JSON.stringify(input.storyBible ?? {}, null, 2),
    "CHARACTER VOICE PROFILES, ACTIVE POV FIRST\n" +
      (voiceProfiles.length
        ? JSON.stringify(voiceProfiles, null, 2)
        : "No persistent profile exists yet. Establish distinct voices from the Story Bible and current prose."),
    "CONTINUITY, FACTS NOT NARRATIVE PRIORITIES\n" +
      JSON.stringify(cleanStoryState(input.storyState), null, 2),
    "RECENT CHAPTER ENDINGS\n" + JSON.stringify(input.recentChapters, null, 2),
    "CURRENT SECTION BRIEF, THIS SECTION ONLY\n" + sectionBriefForPrompt,
    input.chapterDraft
      ? "COMPLETE CURRENT CHAPTER DRAFT, READ ONLY\n" + fullDraftContext
      : "",
    input.chapterDraft
      ? "EXACT CONTINUATION BOUNDARY, READ ONLY\n" +
        exactContinuationBoundary
      : "",
    "CURRENT CHAPTER REPETITION REPORT\n" +
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
    input.action === "start"
      ? "ORIGINAL SECTION REQUEST\n" +
        (input.latestUserMessage || "No separate original request supplied.")
      : "",
    "CURRENT GUIDANCE, HIGHEST PRIORITY\n" + mandatoryGuidance,
    "EXACT ACTION AND BOUNDARY\n" + actionInstruction,
    "SILENT FINAL PASS",
    "Delete any paragraph that adds no change or unique texture. Repair any dialogue line whose connection is unclear. Remove every unnecessary reference to a stable injury or caretaking. Confirm the two leads could not swap dialogue or internal narration without sounding wrong. Verify POV, factual continuity, physical staging, requested endpoint and complete final sentence. Return no analysis.",
    "Complete the section, output <END_SECTION>, then stop.",
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
        { error: "A current section brief and POV character are required." },
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
                "Write only the section required by CURRENT GUIDANCE and return complete novel prose followed by <END_SECTION>. Preserve accepted facts, fixed POV, tense and physical staging. Keep character voices distinct, dialogue causally coherent and every paragraph necessary. Treat continuity facts proportionately, never as a demand to foreground stable minor injuries or caretaking. Every romantic or sexual character is an adult aged eighteen or older. When explicit intimacy is requested, make it character-specific, physically legible and consequential. Never use em dashes or en dashes, repeat completed material, pad the scene or add an unrequested escalation.",
            },
            { role: "user", content: writingPrompt },
          ],
          text: {
            verbosity: "medium",
          },
          max_output_tokens: 32000,
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
          const status = retryable ? 502 : 422;

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

