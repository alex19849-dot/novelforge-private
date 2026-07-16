import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type VoiceProfile = {
  primaryTone: string;
  emotionalCadence: string;
  humourStyle: string;
  humourMechanics: string;
  narrativeStyle: string;
  narrativeDistance: string;
  sentenceRhythm: string;
  dialogueStyle: string;
  descriptionStyle: string;
  internalMonologueStyle: string;
  conflictStyle: string;
  romanticStyle: string;
  emotionalTexture: string;
  povVoiceRules: string[];
  characterVoices: string[];
};

type StoryMemory = {
  importantFacts: string[];
  characterDetails: string[];
  relationshipHistory: string[];
  unresolvedThreads: string[];
  pastEvents: string[];
  rules: string[];
};

type RepetitionReport = {
  overusedWords: string[];
  repeatedPhrases: string[];
  repeatedReactions: string[];
  repeatedHumourPatterns: string[];
  repeatedSentencePatterns: string[];
  guidance: string[];
};

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",").trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );
}

function listOrNone(items: string[]) {
  return items.length ? `- ${items.join("\n- ")}` : "None";
}

function countWords(text: string) {
  const trimmed = text.trim();

  if (!trimmed) return 0;

  return trimmed.split(/\s+/).length;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const chapter =
      typeof body.chapter === "string" ? body.chapter.trim() : "";

    const instruction =
      typeof body.instruction === "string"
        ? body.instruction.trim()
        : "";

    const form = body.form || {};
    const storyState = body.storyState || {};

    if (!chapter) {
      return Response.json(
        {
          result: "No chapter text was provided.",
          storyState,
        },
        { status: 400 }
      );
    }

    const savedVoice = storyState.voiceProfile || {};

    const voiceProfile: VoiceProfile = {
      primaryTone: savedVoice.primaryTone || "",
      emotionalCadence: savedVoice.emotionalCadence || "",
      humourStyle: savedVoice.humourStyle || "",
      humourMechanics: savedVoice.humourMechanics || "",
      narrativeStyle: savedVoice.narrativeStyle || "",
      narrativeDistance: savedVoice.narrativeDistance || "",
      sentenceRhythm: savedVoice.sentenceRhythm || "",
      dialogueStyle: savedVoice.dialogueStyle || "",
      descriptionStyle: savedVoice.descriptionStyle || "",
      internalMonologueStyle:
        savedVoice.internalMonologueStyle || "",
      conflictStyle: savedVoice.conflictStyle || "",
      romanticStyle: savedVoice.romanticStyle || "",
      emotionalTexture: savedVoice.emotionalTexture || "",
      povVoiceRules: stringArray(savedVoice.povVoiceRules),
      characterVoices: stringArray(savedVoice.characterVoices),
    };

    const savedMemory = storyState.storyMemory || {};

    const storyMemory: StoryMemory = {
      importantFacts: stringArray(savedMemory.importantFacts),
      characterDetails: stringArray(savedMemory.characterDetails),
      relationshipHistory: stringArray(
        savedMemory.relationshipHistory
      ),
      unresolvedThreads: stringArray(savedMemory.unresolvedThreads),
      pastEvents: stringArray(savedMemory.pastEvents),
      rules: stringArray(savedMemory.rules),
    };

    const savedRepetition = storyState.repetitionReport || {};

    const repetitionReport: RepetitionReport = {
      overusedWords: stringArray(savedRepetition.overusedWords),
      repeatedPhrases: stringArray(savedRepetition.repeatedPhrases),
      repeatedReactions: stringArray(
        savedRepetition.repeatedReactions
      ),
      repeatedHumourPatterns: stringArray(
        savedRepetition.repeatedHumourPatterns
      ),
      repeatedSentencePatterns: stringArray(
        savedRepetition.repeatedSentencePatterns
      ),
      guidance: stringArray(savedRepetition.guidance),
    };

    const originalWordCount = countWords(chapter);
    const minimumWordCount = Math.max(
      Math.round(originalWordCount * 0.9),
      1
    );
    const maximumWordCount = Math.max(
      Math.round(originalWordCount * 1.1),
      minimumWordCount
    );

    const prompt = `
You are NovelForge.

Rewrite the supplied chapter from this ongoing adult romance novel.

Return only the complete rewritten chapter.
Do not include notes, analysis, JSON or markdown.

USER REWRITE INSTRUCTION

${
  instruction ||
  "Improve the chapter while preserving its events, purpose and direction."
}

REWRITE LENGTH

The original chapter is approximately ${originalWordCount} words.

Unless the user explicitly requests a substantial expansion or reduction, keep the rewrite between approximately ${minimumWordCount} and ${maximumWordCount} words.

Preserve the chapter's overall scope and shape.

Do not add new scenes merely to increase length.

Do not remove important scenes merely to shorten it.

Prioritise a complete chapter and fully resolved final scene.

STYLE

Use natural contractions in narration, internal thoughts and dialogue wherever a real person would use them.

Write:
I’m, I’d, I’ll, I’ve, it’s, isn’t, wasn’t, don’t, didn’t, can’t, won’t, shouldn’t, wouldn’t, he’s, she’s, they’re, we’re.

Avoid stiff, overly formal phrasing such as:
I am, I did not, it is, he is, she is, we are, they are, cannot, would not, should not,

unless the character is deliberately speaking formally, emphasising a point, or the full form sounds more natural in that specific sentence.

Narration should sound fluent, contemporary and spoken rather than mechanically expanded.

INTIMACY SCENES

All scenes of physical intimacy MUST be detailed, graphic, filthy and erotic. They MUST be immersive, character-driven, and written moment by moment rather than summarised. Show the progression of each interaction through clear actions, believable reactions, changing emotional states, body language, dialogue, pacing, and escalating tension. Avoid vague descriptions, repetitive phrasing, euphemisms, or fade-to-black transitions. Every intimate scene should reveal character, deepen the relationship, shift the power dynamic, or create meaningful consequences for later chapters.

STORY BIBLE

Title:
${form.title || storyState.title || "Untitled"}

Story idea:
${form.plot || "No story idea provided."}

Story outline:
${form.storyOutline || "No story outline provided."}

Main characters:
${form.characterNotes || "No main character notes provided."}

Supporting characters:
${form.sideCharacterNotes || "No supporting character notes provided."}

Must include:
${form.mustHave || "Nothing specific provided."}

Must avoid:
${form.mustNotHave || "Nothing specific provided."}

STORY SETTINGS

Relationship:
${form.relationship || storyState.relationship || "Romance"}

Subgenre:
${form.subgenre || "Not specified"}

Subgenre detail:
${form.subgenreDetail || "Not specified"}

Story location:
${form.storyLocation || "Not specified"}

Point of view:
${form.pov || "First person, dual POV"}

Heat level:
${form.heat || storyState.heat || "Open door"}

Burn pacing:
${form.burnPacing || "Medium burn"}

Ending:
${form.ending || "Happy ending"}

Regional language:
${storyState.regionalLanguage || form.locale || "British English"}

Preferred regional terms:
${listOrNone(stringArray(storyState.locationTerms))}

Avoid conflicting regional terms:
${listOrNone(stringArray(storyState.forbiddenTerms))}

PERMANENT VOICE PROFILE

Primary tone:
${voiceProfile.primaryTone || "Not yet defined"}

Emotional cadence:
${voiceProfile.emotionalCadence || "Not yet defined"}

Humour style:
${voiceProfile.humourStyle || "Not yet defined"}

Humour mechanics:
${voiceProfile.humourMechanics || "Not yet defined"}

Narrative style:
${voiceProfile.narrativeStyle || "Not yet defined"}

Narrative distance:
${voiceProfile.narrativeDistance || "Not yet defined"}

Sentence rhythm:
${voiceProfile.sentenceRhythm || "Not yet defined"}

Dialogue style:
${voiceProfile.dialogueStyle || "Not yet defined"}

Description style:
${voiceProfile.descriptionStyle || "Not yet defined"}

Internal monologue style:
${voiceProfile.internalMonologueStyle || "Not yet defined"}

Conflict style:
${voiceProfile.conflictStyle || "Not yet defined"}

Romantic style:
${voiceProfile.romanticStyle || "Not yet defined"}

Emotional texture:
${voiceProfile.emotionalTexture || "Not yet defined"}

POV voice rules:
${listOrNone(voiceProfile.povVoiceRules)}

Character voices:
${listOrNone(voiceProfile.characterVoices)}

Preserve this voice profile unless the user's rewrite instruction explicitly asks for a different tone or style.

Do not flatten distinct character voices into generic romance narration.

CONTINUITY MEMORY

Important facts:
${listOrNone(storyMemory.importantFacts)}

Character details:
${listOrNone(storyMemory.characterDetails)}

Relationship history:
${listOrNone(storyMemory.relationshipHistory)}

Unresolved threads:
${listOrNone(storyMemory.unresolvedThreads)}

Past events:
${listOrNone(storyMemory.pastEvents)}

Permanent story rules:
${listOrNone(storyMemory.rules)}

RECENT REPETITION GUIDANCE

Overused words:
${listOrNone(repetitionReport.overusedWords)}

Repeated phrases:
${listOrNone(repetitionReport.repeatedPhrases)}

Repeated reactions:
${listOrNone(repetitionReport.repeatedReactions)}

Repeated humour patterns:
${listOrNone(repetitionReport.repeatedHumourPatterns)}

Repeated sentence patterns:
${listOrNone(repetitionReport.repeatedSentencePatterns)}

Freshness guidance:
${listOrNone(repetitionReport.guidance)}

Use this report as guidance, not as a rigid blacklist.

Do not replace one repeated phrase or reaction with a different stock cliché.

ORIGINAL CHAPTER

${chapter}

REWRITE JOB

Rewrite this chapter only.

Preserve:

- The same chapter number.
- The same POV heading.
- The same viewpoint character.
- The same core events.
- The same story outcomes.
- The same established facts.
- The same relationship progression.
- The chapter's position in the wider novel.
- Important romantic or intimate moments unless the user asks to change them.

Do not:

- Restart the story.
- Turn the rewrite into a new chapter.
- Change names, ages, genders, jobs, locations or relationships.
- Change who knows what.
- Reset attraction, trust, conflict, intimacy or vulnerability.
- Add unrelated illnesses, accidents, scandals, villains, blackmail, custody threats, family emergencies or ex drama.
- Invent major new plotlines unless the user explicitly requests them.
- Fade out or summarise an important scene unless the user explicitly asks.

Improve where appropriate:

- Prose clarity and flow.
- Dialogue realism.
- Character-specific voice.
- Emotional precision.
- Pacing.
- Scene immersion.
- Sensory detail.
- Romantic tension.
- Paragraph rhythm.
- Timeline clarity.
- Weak transitions.
- Awkward phrasing.
- Repetition.
- Unnecessary exposition.
- Internal reflection that merely repeats what the reader already knows.

Every scene must retain a clear purpose.

Dialogue should sound natural and specific to the speaker.

Humour should arise from character and circumstance rather than automatic sarcasm or constant banter.

Physical and emotional reactions should be precise to the individual character and moment.

Avoid therapy-speak, purple prose, fake profound lines, repetitive body language, generic romance clichés and over-described rooms.

Respect the selected heat level and the chapter's established romantic purpose.

Any romantic or intimate material must involve consenting adults and remain emotionally connected to the relationship.

Do not use em dashes or en dashes. Use commas, full stops, colons or brackets instead.

FORMAT

If the original chapter begins with:

Chapter Number

POV_NAME

the rewrite must begin with the same chapter number and correct uppercase POV heading.

Do not duplicate or omit either heading.

Finish the final scene completely.

Return only the rewritten chapter.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-5.6-terra",
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: prompt,
      max_output_tokens: 10000,
    });

    if (response.status === "incomplete") {
      return Response.json(
        {
          result:
            "Chapter rewrite stopped before completion and was not saved.",
          storyState,
          incomplete: true,
        },
        { status: 422 }
      );
    }

    const rewritten = cleanOutput(response.output_text || "");

    if (!rewritten) {
      return Response.json(
        {
          result: "No rewritten chapter text was returned.",
          storyState,
        },
        { status: 500 }
      );
    }

    return Response.json({
      result: rewritten,
      storyState,
    });
  } catch (error) {
    console.error("REWRITE CHAPTER ERROR:", error);

    return Response.json(
      {
        result:
          error instanceof Error
            ? `Rewrite error: ${error.message}`
            : "Unknown rewrite error.",
        storyState: {},
      },
      { status: 500 }
    );
  }
}
