import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}


export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form || {};
  const previousChapter = body.previousChapter || "";
  const nextChapterNumber = body.nextChapterNumber || 2;
  const incomingState = body.storyState || {};
  const chapterGuidance = body.chapterGuidance || "";
 const storyMemory = incomingState.storyMemory || {
  importantFacts: [],
  characterDetails: [],
  relationshipHistory: [],
  unresolvedThreads: [],
  pastEvents: [],
  rules: [],
};
const voiceProfile = incomingState.voiceProfile || {
  primaryTone: "",
  humourStyle: "",
  narrativeStyle: "",
  sentenceRhythm: "",
  dialogueStyle: "",
  emotionalTexture: "",
  povVoiceRules: [],
  characterVoices: [],
};
const manualMemory = chapterGuidance.trim()
  ? `\nUSER CHAPTER GUIDANCE:\n${chapterGuidance.trim()}`
  : "";

const chapterLabel = `Chapter ${nextChapterNumber}`;
const repetitionReport = incomingState.repetitionReport || {
  overusedWords: [],
  repeatedPhrases: [],
  repeatedReactions: [],
  repeatedHumourPatterns: [],
  repeatedSentencePatterns: [],
  guidance: [],
};
  const prompt = `
You are NovelForge.

You are an award-winning, bestselling contemporary EROTIC romance author whose books have won major romance writing awards and sold millions of copies worldwide. Readers praise your ability to create intense chemistry, emotional vulnerability, compelling character arcs, addictive romantic tension, and unforgettable love stories.

Your writing combines commercial appeal, emotional authenticity, sharp dialogue, strong pacing, and high reader engagement. Every chapter should feel professionally published and worthy of a top-selling romance novel.

Continue an ongoing commercial adult EROTIC romance novel.

Return only polished chapter prose.
Do not include notes.
Do not include analysis.
Do not include JSON.
Do not include markdown.

Write ${chapterLabel} only.

The output must begin exactly with:

${chapterLabel}

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.


STORY IDEA:
${form.plot || "No story idea provided."}

STORY OUTLINE:
${form.storyOutline || "No story outline provided."}

MAIN CHARACTERS:
${form.characterNotes || "No main character notes provided."}

SUPPORTING CHARACTERS:
${form.sideCharacterNotes || "No supporting character notes provided."}

MUST INCLUDE:
${form.mustHave || "Nothing specific provided."}

MUST AVOID:
${form.mustNotHave || "Nothing specific provided."}

CHAPTER GUIDANCE:
${chapterGuidance || "None provided."}

CURRENT STORY STATE:
${JSON.stringify(updatedStoryState, null, 2)}

PERMANENT STORY VOICE PROFILE:

Primary Tone:
${voiceProfile.primaryTone || "Not yet defined"}

Humour Style:
${voiceProfile.humourStyle || "Not yet defined"}

Narrative Style:
${voiceProfile.narrativeStyle || "Not yet defined"}

Sentence Rhythm:
${voiceProfile.sentenceRhythm || "Not yet defined"}

Dialogue Style:
${voiceProfile.dialogueStyle || "Not yet defined"}

Emotional Texture:
${voiceProfile.emotionalTexture || "Not yet defined"}

POV Voice Rules:
${voiceProfile.povVoiceRules.join("\n- ") || "None"}

Character Voices:
${voiceProfile.characterVoices.join("\n- ") || "None"}

Treat this voice profile as a permanent stylistic constraint for the novel.

Do not drift back into generic romance prose, interchangeable banter, repetitive sarcasm or stock AI reactions.

Preserve the differences between each character's speech, internal voice, humour and way of noticing the world.

RECENT REPETITION ANALYSIS:

Overused Words:
${repetitionReport.overusedWords.join("\n- ") || "None"}

Repeated Phrases:
${repetitionReport.repeatedPhrases.join("\n- ") || "None"}

Repeated Reactions:
${repetitionReport.repeatedReactions.join("\n- ") || "None"}

Repeated Humour Patterns:
${repetitionReport.repeatedHumourPatterns.join("\n- ") || "None"}

Repeated Sentence Patterns:
${repetitionReport.repeatedSentencePatterns.join("\n- ") || "None"}

Freshness Guidance:
${repetitionReport.guidance.join("\n- ") || "None"}

Use this report as guidance, not as a rigid blacklist.

Avoid repeating noticeable habits from recent chapters unless the wording is genuinely necessary for continuity, character voice or clarity.

Do not replace one repeated cliché with another equally generic cliché.

Create fresh phrasing, reactions, humour and sentence movement that still fit the permanent voice profile.

STORY MEMORY (CANON FACTS):

Important Facts:
${storyMemory.importantFacts.join("\n- ") || "None"}

Character Details:
${storyMemory.characterDetails.join("\n- ") || "None"}

Relationship History:
${storyMemory.relationshipHistory.join("\n- ") || "None"}

Unresolved Threads:
${storyMemory.unresolvedThreads.join("\n- ") || "None"}

Past Events:
${storyMemory.pastEvents.join("\n- ") || "None"}

Story Rules:
${storyMemory.rules.join("\n- ") || "None"}

PREVIOUS CHAPTERS:
${previousChapter || "No previous chapter text provided."}

MUST AVOID:
${form.mustNotHave || "Nothing specific provided."}

CHAPTER GUIDANCE:

Treat the previous chapters and story memory as the source of truth.

If there is ever a conflict between assumptions and established continuity, established continuity always wins.

Never rewrite history. Build upon it.

STORY CONTINUITY RULES

Maintain complete consistency with all established character personalities, histories, relationships, motivations, emotional wounds, speech patterns, and story events.

Characters must remember previous conversations, conflicts, promises, arguments, mistakes, and emotional milestones.

Relationship progression must feel earned and cumulative.

Avoid resetting emotional progress between chapters.

Each chapter should build upon previous chapters rather than repeating the same conflicts.

Track and evolve:

• Relationship development
• Character growth
• Emotional intimacy
• Sexual intimacy
• Trust
• Jealousy
• Possessiveness
• Vulnerability
• External conflicts

Every chapter must introduce meaningful change.

Every chapter should permanently change at least one aspect of the story, whether it is the plot, a relationship, a character, the reader's understanding, or the world itself.

No filler scenes.

No repetitive arguments.

No repetitive emotional beats.

No repetitive intimacy scenes.

The protagonists should never feel emotionally identical to how they felt five chapters earlier unless there is a story reason.

Side characters should continue developing lives, relationships, and goals outside the protagonists.

The story world should feel alive and evolving.

Always escalate or deepen existing conflicts rather than restarting them.

Before writing any chapter, identify:

1. What has changed since the previous chapter.
2. Which established facts and continuity must be preserved.
3. Which unresolved threads naturally deserve attention in this chapter.
4. What meaningful change this chapter will leave behind.

Every chapter must move the story forward.


CONTINUATION JOB:
- Continue directly from the previous chapter.
- Do not restart the story.
- Do not repeat the opening setup.
- Do not reintroduce characters as if they are new.
- Carry forward the emotional fallout from the previous chapter.
- Keep all names, genders, jobs, relationships and locations consistent.
- Follow the user's chapter guidance unless it contradicts established continuity.
- Do not invent random illnesses, accidents, scandals, family emergencies, blackmail, custody threats or new villains unless already seeded.
- Do not add filler scenes just to make the chapter longer.

CHAPTER ARC:
- Continue from the previous chapter naturally.
- Let the characters, conflict and consequences determine the pacing.
- Do not advance romance, intimacy, trust, conflict or resolution because of chapter number.
- Escalate, slow down, pause or resolve only when earned by the story.

DIALOGUE RULES

Every conversation must have a unique purpose.

Every character should have a recognisable voice.

Dialogue should reflect:
• Personality
• Education
• Background
• Age
• Occupation
• Emotional state
• Relationship with the person they are speaking to

No two major characters should sound interchangeable.

Avoid repeated exchanges where characters:

• Trade the same insults.
• Repeat the same argument.
• Discuss reactions repeatedly.
• Revisit identical emotional territory.

Conversations should reveal:

• Character.
• History.
• Vulnerability.
• Humour.
• Desire.
• Frustration.
• Ambition.
• Fear.
• Real life concerns.

Characters should occasionally surprise each other and the reader.

Avoid predictable romance patterns.

Characters should make decisions that feel inevitable because of who they are, not because the plot requires a familiar romance beat.

Choose the most believable outcome, not the most obvious one.

Avoid multiple chapters where conversations serve only to maintain sexual tension.

Sexual tension should evolve and change rather than repeat.

ROMANCE:

- Let the relationship evolve naturally from the characters, their choices and the consequences of previous chapters.
- Never advance or delay the relationship because of chapter number or expected romance structure.
- Keep flaws, friction, uncertainty and personal growth authentic to the characters.
- Show attraction through meaningful behaviour, dialogue and emotional connection rather than repetitive physical clichés.
- Emotional intimacy, romantic intimacy and physical intimacy should each develop at their own natural pace.
- Every meaningful romantic or intimate moment should permanently influence the relationship going forward.
- Keep all romantic and sexual content between consenting adults.

STYLE PRIORITIES, IN ORDER:

1. CONTINUITY AND VOICE
- Preserve the established POV, narrative voice, character voices and overall style.
- Write polished, immersive commercial romance prose.
- Keep dialogue human, grounded and character-specific. Avoid constant banter, therapy-speak and overly polished comebacks.

2. PROSE DISCIPLINE
- Every paragraph must advance character, relationship, conflict, atmosphere, humour or plot.
- Prefer one precise sentence over several sentences expressing the same idea.
- Do not restate information, thoughts or emotions the reader already understands.
- Do not explain dialogue after the dialogue has already made the meaning clear.
- Do not express the same emotion through narration, internal thought and physical reaction.
- Internal reflection must add a new realisation, decision, conflict or emotional development.
- Do not narrate routine actions step by step unless they matter.
- Enter scenes late, leave scenes early, and move on once a scene has achieved its purpose.
- Never add filler, repetition, extra description or unnecessary reflection to increase chapter length.

3. NATURAL WRITING
- Show rather than tell when it strengthens the scene, but do not over-describe actions to avoid telling.
- Use short replies, interruptions, hesitation and deflection where natural.
- Keep humour character-specific.
- Avoid purple prose, fake profound lines, random object descriptions and over-described rooms.
- Avoid repeated symbolic chapter endings.
- Avoid repetitive stock reactions or phrases such as "his eyes darkened", "my pulse kicked", "something shifted", "his jaw tightened" and "he went still".

4. PUNCTUATION
- Do not use em dashes or en dashes. Use commas, full stops, colons or brackets instead.

REGIONAL LANGUAGE:
Use ${incomingState.regionalLanguage || form.locale || "British English"}.
Preferred terms: ${(incomingState.locationTerms || []).join(", ")}.
Forbidden terms: ${(incomingState.forbiddenTerms || []).join(", ")}.

LENGTH:
- Target chapter length: ${form.targetChapterWords} words.
- This is a hard target, not a suggestion.
- Never intentionally exceed the target by more than 10%.
- If the chapter approaches the target length, end at the nearest natural emotional or narrative stopping point.
- If a scene cannot be completed naturally within the limit, end the chapter cleanly and continue the scene in the next chapter.
- Do not artificially pad chapters.
- Do not rush scenes to reach the target.
- Every chapter must still feel complete and satisfying.
`;
  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: prompt,
      max_output_tokens: 10000,
    });


   if (response.status === "incomplete") {
  return Response.json(
    {
      result:
        "Chapter generation stopped before finishing. Nothing has been saved. Try shorter guidance or reduce the chapter length.",
      storyState: incomingState,
      incomplete: true,
    },
    { status: 200 }
  );
}

const chapter = cleanOutput(response.output_text || "");
  const memoryPrompt = `
Analyse the newly generated chapter for this ongoing romance novel.

Update:
1. The continuity memory.
2. The repetition report that should guide the next chapter.

Return valid JSON only.
Do not include markdown.
Do not include notes or commentary.

Existing story memory:
${JSON.stringify(storyMemory, null, 2)}

Previous repetition report:
${JSON.stringify(repetitionReport, null, 2)}

New chapter:
${chapter}

Return exactly this structure:

{
  "storyMemory": {
    "importantFacts": [],
    "characterDetails": [],
    "relationshipHistory": [],
    "unresolvedThreads": [],
    "pastEvents": [],
    "rules": []
  },
  "repetitionReport": {
    "overusedWords": [],
    "repeatedPhrases": [],
    "repeatedReactions": [],
    "repeatedHumourPatterns": [],
    "repeatedSentencePatterns": [],
    "guidance": []
  }
}

STORY MEMORY RULES:

- Preserve important existing memory unless it is clearly outdated.
- Add only details needed for future continuity.
- Record established facts, character details, relationship developments, unresolved threads, past events and permanent rules.
- Do not summarise the entire chapter.
- Do not include temporary emotions unless they will affect future chapters.

REPETITION RULES:

- Analyse the new chapter together with the previous report.
- Keep patterns that are still becoming noticeable.
- Remove old warnings that are no longer relevant.
- Identify overused words, repeated dialogue, body language, emotional reactions, humour styles and sentence habits.
- Ignore necessary names, pronouns and ordinary connecting language.
- Only flag repetition that genuinely weakens the prose.
- Guidance must contain concise, practical instructions for keeping the next chapter fresh.
- Do not create a rigid blacklist of normal language.
`;
let updatedMemory = storyMemory;
let updatedRepetitionReport = repetitionReport;

try {
  const memoryResponse = await openai.responses.create({
    model: "gpt-5.5",
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    input: memoryPrompt,
    max_output_tokens: 2500,
  });

  const memoryText = (memoryResponse.output_text || "")
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();

const parsedAnalysis = JSON.parse(memoryText);

const parsedMemory = parsedAnalysis.storyMemory || {};
const parsedRepetition = parsedAnalysis.repetitionReport || {};

updatedMemory = {
  importantFacts: Array.isArray(parsedMemory.importantFacts)
    ? parsedMemory.importantFacts
    : storyMemory.importantFacts,
  characterDetails: Array.isArray(parsedMemory.characterDetails)
    ? parsedMemory.characterDetails
    : storyMemory.characterDetails,
  relationshipHistory: Array.isArray(parsedMemory.relationshipHistory)
    ? parsedMemory.relationshipHistory
    : storyMemory.relationshipHistory,
  unresolvedThreads: Array.isArray(parsedMemory.unresolvedThreads)
    ? parsedMemory.unresolvedThreads
    : storyMemory.unresolvedThreads,
  pastEvents: Array.isArray(parsedMemory.pastEvents)
    ? parsedMemory.pastEvents
    : storyMemory.pastEvents,
  rules: Array.isArray(parsedMemory.rules)
    ? parsedMemory.rules
    : storyMemory.rules,
};

updatedRepetitionReport = {
  overusedWords: Array.isArray(parsedRepetition.overusedWords)
    ? parsedRepetition.overusedWords
    : repetitionReport.overusedWords,
  repeatedPhrases: Array.isArray(parsedRepetition.repeatedPhrases)
    ? parsedRepetition.repeatedPhrases
    : repetitionReport.repeatedPhrases,
  repeatedReactions: Array.isArray(parsedRepetition.repeatedReactions)
    ? parsedRepetition.repeatedReactions
    : repetitionReport.repeatedReactions,
  repeatedHumourPatterns: Array.isArray(parsedRepetition.repeatedHumourPatterns)
    ? parsedRepetition.repeatedHumourPatterns
    : repetitionReport.repeatedHumourPatterns,
  repeatedSentencePatterns: Array.isArray(parsedRepetition.repeatedSentencePatterns)
    ? parsedRepetition.repeatedSentencePatterns
    : repetitionReport.repeatedSentencePatterns,
  guidance: Array.isArray(parsedRepetition.guidance)
    ? parsedRepetition.guidance
    : repetitionReport.guidance,
};
} catch (memoryError) {
  console.error("STORY MEMORY UPDATE ERROR:", memoryError);
}
    updatedStoryState = {
  ...updatedStoryState,
  storyMemory: updatedMemory,
};
if (!chapter.trim()) {
  return Response.json(
    {
      result: "No chapter text was returned.",
      storyState: incomingState,
      incomplete: true,
    },
    { status: 200 }
  );
}

return Response.json({
  result: chapter,
  storyState: updatedStoryState,
});
} catch (error) {
console.error("CONTINUE STORY ERROR:", error);

return Response.json(
  {
    result:
      error instanceof Error
        ? `Continue error: ${error.message}`
        : "Unknown continue error.",
    storyState: incomingState,
    incomplete: true,
  },
  { status: 200 }
);
}
}
