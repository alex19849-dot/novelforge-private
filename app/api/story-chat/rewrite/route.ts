import { selectPassageEditor, passageEditCost } from "../../../../lib/passage-editor";
import { selectedProseWriter, PROSE_BALANCE_INSTRUCTION, TEXT_MESSAGE_INSTRUCTION } from "../../../../lib/prose-writer";
import { narrativeContext, CONTINUITY_CONSISTENCY_INSTRUCTION } from "../../../../lib/narrative-memory";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { GenerationDiagnostic } from "../../../story-chat/types";
import { findPassageRange, passageWriter } from "../../../story-chat/passageRewrite";

export const runtime = "nodejs";
export const maxDuration = 300;

type RewriteBody = {
  chapterContent?: unknown;
  passage?: unknown;
  passageRange?: unknown;
  instruction?: unknown;
  povCharacter?: unknown;
  storyBible?: unknown;
  storyState?: unknown;
  chapterBrief?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validateProse(value: string): void {
  if (!value.trim()) throw new Error("The writer returned no replacement. Your chapter is unchanged.");
  if (/```|<\/?think\b|<END_SECTION>|\[\[AION_SCENE_/i.test(value) ||
    /^\s*(?:analysis|explanation|replacement|here(?:'s| is) (?:the|your) rewrite)\s*:/im.test(value)) {
    throw new Error("The writer returned formatting or commentary. Your chapter is unchanged.");
  }
  const words = value.toLowerCase().replace(/\s+/g, " ").split(" ");
  const seen = new Set<string>();
  let duplicates = 0;
  for (let i = 0; i + 16 <= words.length; i++) {
    const window = words.slice(i, i + 16).join(" ");
    if (seen.has(window)) duplicates++;
    seen.add(window);
  }
  if (duplicates >= 4) throw new Error("The writer repeated substantial text. Your chapter is unchanged.");
}

export async function POST(request: Request) {
  const diagnostics: GenerationDiagnostic[] = [];
  let called = false;
  let model: string = selectedProseWriter().model;
  let provider: "openai" | "openrouter" = "openai";
  let startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd: number | null = null;
  let costType: GenerationDiagnostic["costType"] = "unavailable";
  const diagnostic = (status: "succeeded" | "failed", error?: string): GenerationDiagnostic => ({
    stage: "chapter_passage_rewrite", provider, model, status,
    inputTokens, outputTokens, totalTokens, costUsd, costType,
    durationMs: Date.now() - startedAt, attempt: 1,
    ...(error ? { error } : {}),
  });
  try {
    const body = await request.json() as RewriteBody;
    const chapterContent = text(body.chapterContent);
    const passage = text(body.passage).trim();
    const selectedWriter = passageWriter(text(body.instruction));
    if (!chapterContent || chapterContent.length > 200000 || passage.length > 100000 ||
        selectedWriter.instruction.length > 12000) {
      return NextResponse.json({ error: "Supply a chapter and a bounded passage to rewrite.", diagnostics }, { status: 400 });
    }
    let range: { start: number; end: number };
    try { range = findPassageRange(chapterContent, passage, body.passageRange); }
    catch (error) {
      return NextResponse.json({ error: (error as Error).message, diagnostics }, { status: 409 });
    }
    const isAion = selectedWriter.model === "aion";
    const proseWriter = selectPassageEditor(passage, body.storyState, text(body.instruction));
    model = isAion ? "aion-labs/aion-3.5" : proseWriter.model;
    provider = isAion ? "openrouter" : "openai";
    if (!(isAion ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY)) {
      return NextResponse.json({ error: `${isAion ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} is not configured.`, diagnostics }, { status: 500 });
    }
    const prompt = [
      PROSE_BALANCE_INSTRUCTION,
      TEXT_MESSAGE_INSTRUCTION,
      "You are NovelForge's bounded-passage editor. Return only the complete replacement for PASSAGE TO REPLACE, without labels, notes, markdown, reasoning or alternatives.",
      "Follow AUTHOR INSTRUCTION. The chapter, Bible, continuity and contract are context, not requests to generate a chapter. Preserve the passage's POV, tense, individual character voices, established facts and physical positions. Match its beginning and ending to the unchanged surrounding prose. Do not repeat either boundary, add later events or return the rest of the chapter. Every romantic or sexual character is an adult aged eighteen or older.",
      "DEFAULT REWRITE PURPOSE: Repair the selected passage, not merely its wording. When the author says rewrite this, change this or supplies no more specific goal, treat the selection as material that is not working. Read what comes before and after to identify its intended narrative purpose and any confusion, faulty inference, contradiction, repetition or unnecessary explanation. Replace the faulty construction itself. You may remove lines, change dialogue and its supporting thoughts or actions, reorganise the passage and shorten it substantially when that gives the scene a clearer, stronger version. Do not retain a broken exchange or implication just to express it with different words. Do not invent a problem when the original already works; improve only what the context supports.",
      "Check the logic of the replacement silently: each reply connects intelligibly to what was said or done, speakers know only what they could know, cause and effect and physical actions are plausible, and the passage moves naturally into the unchanged next line. Keep intentional evasion, subtext, tension, roughness and character flaws when they make sense; clarity does not require spelling out every feeling or making characters agreeable. Preserve the intended scene development and canon, not an accidental error in the selected prose. Where an interpretation is unsupported, remove or reframe it using grounded thoughts or observable behaviour rather than inventing new backstory, motives or off-page events.",
      "Use only as much text as the repaired moment needs. Do not preserve approximate length, sentence count, every image, every line of dialogue or unnecessary information merely because it was present. Avoid padding and new plot developments. Honour a specific author request to retain a line, event, length or meaning; explicit wording-only requests should remain wording-only. Return one finished replacement, with no diagnosis, notes or alternatives. The surrounding chapter remains unchanged.",
      "Use natural contractions, fluid contemporary prose and individual character voices. Dialogue must make sense on the first read, with a clear connection between replies. Let sarcasm arise from words and immediate context. Mix ordinary responses with selective humour; avoid chains of polished retorts, shared bureaucratic jokes, therapy language, explanations of jokes and elaborate comparisons that obscure meaning. Preserve emotional intensity and subtext without making the literal exchange confusing. Never use em dashes or en dashes.",
      "Avoid reusing a stock evasion-challenge-concession exchange across scenes or characters, especially \"That's not what I asked\" followed by \"No, it isn't\", or paraphrases that perform the same automatic sequence. Do not default tension to one person calling out a non-answer and the other neatly admitting it. Let replies arise from what each speaker wants, knows and is willing to say in this moment; sometimes answer directly, press a concrete issue, push back, act or leave something unanswered when that fits. These are possibilities, not a replacement template. Preserve conflict, subtext, personality and author-specified lines. An occasional natural use is fine; avoid making the exchange a recurring house style rather than banning ordinary words.",
      "Where attraction belongs, make observations particular to what this POV character finds appealing, grounded in canon, without inventories, forced escalation or repeated favourite features. Preserve existing clothes and room conditions. Choose details for this scene rather than defaulting to paper napkins, open windows or the same muted-colour outfits. Do not change facts merely to create variety.",
      "Describe clothes in the POV character's everyday vocabulary, not a fashion catalogue. Do not default to rust, rust-coloured or rust-colored, or repeatedly attach -coloured/-colored to basic colours. Avoid replacing that habit with another stock shade or a forced synonym. Use ordinary colour words when this person would notice them; often the fit, condition, print or garment itself matters more than its exact shade. Do not mention a colour at every entrance or turn each outfit into an inventory. Preserve established garments within continuous scenes and honour author-specified descriptions.",
      "Keep the reader inside the fixed POV character's immediate experience. Weave his private reactions, interpretations, withheld words and decisions through the live scene, rather than mainly reporting outward movements and surroundings. Prefer a revealing thought in his own voice over incidental set dressing. Retain enough physical orientation to follow the action, and let environmental details matter to what he notices or does. Do not add a thought after every line, pause for an internal essay, explain every feeling or repeat an established conclusion. Each response should develop with the unfolding interaction.",
      "Avoid habitual comma-and chains that string several independent actions, observations and thoughts into one sentence. Give a distinct action or change of thought its own sentence when that makes the sequence clearer. Use subordination or combine closely related actions where they belong together, and vary sentence length and construction. Keep occasional longer flowing sentences when they serve the character or moment, but do not use repeated and clauses as the default rhythm, even in action or internal monologue. Do not replace this habit with uniformly clipped sentences, fragments, semicolons or another repeated connector. Preserve natural contractions, voice, pace and all requested events.",
      "Use the Story Bible, continuity ledger and prior prose as background knowledge, not a checklist to narrate. Do not routinely list what is in the room, where everyone is, what the character has done, or what he already knows, wants or feels to re-establish the scene. Carry known facts silently; bring a detail or earlier event into the prose when it changes his present perception, choice, dialogue or action, or when the reader needs brief orientation. Let thoughts follow the unfolding moment rather than repeatedly taking stock. Keep purposeful atmosphere, necessary reminders and character-specific observations, but avoid inventory paragraphs, recap lists and repeated summaries in internal monologue. Do not compensate by stripping out interiority or making the prose sparse.",
      CONTINUITY_CONSISTENCY_INSTRUCTION,
      "POV CHARACTER:\n" + text(body.povCharacter),
      "STORY BIBLE:\n" + JSON.stringify(body.storyBible ?? {}),
      "CONTINUITY AND CHARACTER VOICE PROFILES:\n" + JSON.stringify(narrativeContext(body.storyState, { pov: text(body.povCharacter), guidance: selectedWriter.instruction + "\n" + text(body.passage) })),
      "CHAPTER CONTRACT, CONTEXT ONLY:\n" + text(body.chapterBrief),
      "CURRENT CHAPTER, CONTEXT ONLY:\n" + chapterContent,
      "IMMEDIATELY BEFORE, DO NOT REPEAT:\n" + chapterContent.slice(Math.max(0, range.start - 5000), range.start),
      "IMMEDIATELY AFTER, DO NOT REPEAT:\n" + chapterContent.slice(range.end, range.end + 5000),
      "PASSAGE TO REPLACE:\n" + chapterContent.slice(range.start, range.end),
      "AUTHOR INSTRUCTION:\n" + selectedWriter.instruction,
    ].join("\n\n");
    const tokenLimit = Math.min(isAion ? 12000 : 24000, Math.max(4000, passage.split(/\s+/).length * 3 + 2000));
    const system = "Rewrite only the supplied passage. Return its replacement prose only and preserve the surrounding chapter boundaries.";
    let replacement = "";
    startedAt = Date.now();
    called = true;
    if (isAion) {
      const openrouter = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        maxRetries: 0, timeout: 240_000,
      });
      const response = await openrouter.chat.completions.create({
        model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: tokenLimit, temperature: 0.6, top_p: 0.9,
        frequency_penalty: 0, presence_penalty: 0,
      });
      const usage = response.usage as (typeof response.usage & { cost?: number });
      inputTokens = usage?.prompt_tokens ?? 0;
      outputTokens = usage?.completion_tokens ?? 0;
      totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
      if (typeof usage?.cost === "number" && Number.isFinite(usage.cost)) {
        costUsd = usage.cost; costType = "reported";
      }
      const choice = response.choices[0];
      if (choice?.finish_reason !== "stop") throw new Error("Aion did not finish the replacement. Your chapter is unchanged.");
      replacement = choice.message.content?.trim() ?? "";
    } else {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 240_000 });
      const response = await openai.responses.create({
        model, input: [{ role: "system", content: system }, { role: "user", content: prompt }],
        reasoning: { effort: "low" }, text: { verbosity: "medium" }, max_output_tokens: tokenLimit,
      });
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;
      totalTokens = response.usage?.total_tokens ?? inputTokens + outputTokens;
      const details = response.usage?.input_tokens_details as { cached_tokens?: number; cache_write_tokens?: number } | undefined;
      const cached = details?.cached_tokens ?? 0;
      costUsd = passageEditCost(proseWriter.model, inputTokens, outputTokens, cached, details?.cache_write_tokens ?? 0);
      costType = "estimated";
      if (response.status !== "completed") throw new Error("The writer did not finish the replacement. Your chapter is unchanged.");
      replacement = response.output_text?.trim() ?? "";
    }
    validateProse(replacement);
    diagnostics.push(diagnostic("succeeded"));
    return NextResponse.json({ replacement, diagnostics, model, writerRole: isAion ? "aion" : "main" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The passage could not be rewritten.";
    if (called) diagnostics.push(diagnostic("failed", message));
    return NextResponse.json({ error: message, diagnostics }, { status: called ? 502 : 400 });
  }
}




