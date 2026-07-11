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

function cleanJsonOutput(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );
}

function getTargetChapterWords(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 4000;

  return Math.min(Math.max(Math.round(parsed), 1500), 6000);
}

function listOrNone(items: string[]) {
  return items.length ? `- ${items.join("\n- ")}` : "None";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const form = body.form || {};

    const previousChapter =
      typeof body.previousChapter === "string"
        ? body.previousChapter.trim()
        : "";

    const nextChapterNumber =
      Number.isFinite(Number(body.nextChapterNumber)) &&
      Number(body.nextChapterNumber) > 1
        ? Math.round(Number(body.nextChapterNumber))
        : 2;

    const incomingState = body.storyState || {};

    const chapterGuidance =
      typeof body.chapterGuidance === "string"
        ? body.chapterGuidance.trim()
        : "";

    const targetChapterWords = getTargetChapterWords(
      form.targetChapterWords
    );

    const emptyVoiceProfile: VoiceProfile = {
      primaryTone: "",
      emotionalCadence: "",
      humourStyle: "",
      humourMechanics: "",
      narrativeStyle: "",
      narrativeDistance: "",
      sentenceRhythm: "",
      dialogueStyle: "",
      descriptionStyle: "",
      internalMonologueStyle: "",
      conflictStyle: "",
      romanticStyle: "",
      emotionalTexture: "",
      povVoiceRules: [],
      characterVoices: [],
    };

    const emptyStoryMemory: StoryMemory = {
      importantFacts: [],
      characterDetails: [],
      relationshipHistory: [],
      unresolvedThreads: [],
      pastEvents: [],
      rules: [],
    };

    const emptyRepetitionReport: RepetitionReport = {
      overusedWords: [],
      repeatedPhrases: [],
      repeatedReactions: [],
      repeatedHumourPatterns: [],
      repeatedSentencePatterns: [],
      guidance: [],
    };

    const savedVoice = incomingState.voiceProfile || {};

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

    const savedMemory = incomingState.storyMemory || {};

    const storyMemory: StoryMemory = {
      importantFacts:
        stringArray(savedMemory.importantFacts).length > 0
          ? stringArray(savedMemory.importantFacts)
          : emptyStoryMemory.importantFacts,
      characterDetails:
        stringArray(savedMemory.characterDetails).length > 0
          ? stringArray(savedMemory.characterDetails)
          : emptyStoryMemory.characterDetails,
      relationshipHistory:
        stringArray(savedMemory.relationshipHistory).length > 0
          ? stringArray(savedMemory.relationshipHistory)
          : emptyStoryMemory.relationshipHistory,
      unresolvedThreads:
        stringArray(savedMemory.unresolvedThreads).length > 0
          ? stringArray(savedMemory.unresolvedThreads)
          : emptyStoryMemory.unresolvedThreads,
      pastEvents:
        stringArray(savedMemory.pastEvents).length > 0
          ? stringArray(savedMemory.pastEvents)
          : emptyStoryMemory.pastEvents,
      rules:
        stringArray(savedMemory.rules).length > 0
          ? stringArray(savedMemory.rules)
          : emptyStoryMemory.rules,
    };

    const savedRepetition = incomingState.repetitionReport || {};

    const repetitionReport: RepetitionReport = {
      overusedWords:
        stringArray(savedRepetition.overusedWords).length > 0
          ? stringArray(savedRepetition.overusedWords)
          : emptyRepetitionReport.overusedWords,
      repeatedPhrases:
        stringArray(savedRepetition.repeatedPhrases).length > 0
          ? stringArray(savedRepetition.repeatedPhrases)
          : emptyRepetitionReport.repeatedPhrases,
      repeatedReactions:
        stringArray(savedRepetition.repeatedReactions).length > 0
          ? stringArray(savedRepetition.repeatedReactions)
          : emptyRepetitionReport.repeatedReactions,
      repeatedHumourPatterns:
        stringArray(savedRepetition.repeatedHumourPatterns).length > 0
          ? stringArray(savedRepetition.repeatedHumourPatterns)
          : emptyRepetitionReport.repeatedHumourPatterns,
      repeatedSentencePatterns:
        stringArray(savedRepetition.repeatedSentencePatterns).length > 0
          ? stringArray(savedRepetition.repeatedSentencePatterns)
          : emptyRepetitionReport.repeatedSentencePatterns,
      guidance:
        stringArray(savedRepetition.guidance).length > 0
          ? stringArray(savedRepetition.guidance)
          : emptyRepetitionReport.guidance,
    };

    if (!previousChapter) {
      return Response.json(
        {
          result: "No previous chapter text was provided.",
          storyState: incomingState,
          incomplete: true,
        },
        { status: 200 }
      );
    }

    const chapterLabel = `Chapter ${nextChapterNumber}`;

    const prompt = `
You are NovelForge.

Continue this adult romance novel by writing ${chapterLabel}.

Return only polished chapter prose.
Do not include notes, analysis, JSON or markdown.

FORMAT

Begin exactly with:

${chapterLabel}

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

CHAPTER LENGTH

Target approximately ${targetChapterWords} words.

Complete the chapter within that target.
Do not exceed the target by more than 10 percent.

Limit the chapter to scenes that can be completed naturally within the available length.

Do not begin another major scene near the end unless it can be completed.

Prioritise a complete and satisfying final scene over extra description, backstory or internal reflection.

STORY BIBLE

Title:
${form.title || incomingState.title || "Untitled"}

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
${form.relationship || incomingState.relationship || "Romance"}

Subgenre:
${form.subgenre || "Not specified"}

Subgenre detail:
${form.subgenreDetail || "Not specified"}

Story location:
${form.storyLocation || "Not specified"}

Point of view:
${form.pov || "First person, dual POV"}

Heat level:
${form.heat || incomingState.heat || "Open door"}

Burn pacing:
${form.burnPacing || "Medium burn"}

Ending:
${form.ending || "Happy ending"}

Regional language:
${incomingState.regionalLanguage || form.locale || "British English"}

Preferred regional terms:
${listOrNone(stringArray(incomingState.locationTerms))}

Avoid conflicting regional terms:
${listOrNone(stringArray(incomingState.forbiddenTerms))}

USER GUIDANCE FOR THIS CHAPTER

${chapterGuidance || "No additional chapter guidance provided."}

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

Treat this profile as the authority for how this novel sounds.

Preserve the distinctions between each character's narration, speech, humour, observations and emotional habits.

Do not drift back into generic romance narration, interchangeable sarcasm or constant banter.

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

Do not replace one repeated cliché with another generic reaction.

PREVIOUS CHAPTER

${previousChapter}

CONTINUATION JOB

Continue naturally from the previous chapter.

Do not restart the story or repeat its setup.

Do not reintroduce established characters.

Carry forward the immediate emotional, relational and practical consequences of the previous chapter.

Preserve established names, jobs, locations, relationships, promises, secrets, injuries and knowledge.

Build on previous emotional progress. Do not reset attraction, trust, conflict, intimacy or vulnerability.

Choose the most believable next development for these characters rather than a familiar romance beat.

Every scene must advance character, relationship, conflict or plot.

Resolve or deepen existing threads before inventing unrelated drama.

Do not introduce random illnesses, accidents, scandals, blackmail, family emergencies, custody threats or new villains unless already established in the Story Bible.

Dialogue must sound human and specific to the speaker.

Humour must arise from character and circumstance, not automatic sarcasm.

Avoid repeated arguments, repeated emotional breakthroughs and repeated jealousy scenes.

Internal thoughts must add a new realisation, decision, fear or conflict rather than explaining what the reader already understands.

Use precise, character-specific physical and emotional reactions.

Avoid stock reactions, repetitive body language, therapy-speak, purple prose, fake profound lines and over-described rooms.

Respect the selected heat level and established relationship progression.

Any romantic or intimate development must involve consenting adults and must influence the relationship afterwards.

Do not use em dashes or en dashes. Use commas, full stops, colons or brackets instead.

End with a completed scene and a meaningful emotional turn, decision, complication, discovery or charged moment.
`.trim();

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
            `${chapterLabel} stopped before completion and was not saved.`,
          storyState: incomingState,
          incomplete: true,
        },
        { status: 200 }
      );
    }

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter) {
      return Response.json(
        {
          result: "No chapter text was returned.",
          storyState: incomingState,
          incomplete: true,
        },
        { status: 200 }
      );
    }

    let updatedMemory = storyMemory;
    let updatedRepetitionReport = repetitionReport;

    try {
      const analysisPrompt = `
Analyse the new chapter and update the saved guidance for future chapters.

Return valid JSON only.
Do not include markdown, notes or commentary.

Use exactly this structure:

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

EXISTING STORY MEMORY:
${JSON.stringify(storyMemory, null, 2)}

PREVIOUS REPETITION REPORT:
${JSON.stringify(repetitionReport, null, 2)}

STORY MEMORY RULES

Preserve established continuity unless the new chapter explicitly changes it.

Add only facts needed for future chapters.

Record character details, relationship developments, unresolved threads, past events and permanent rules.

Remove an unresolved thread only when the new chapter clearly resolves it.

Do not summarise the entire chapter.

REPETITION RULES

Consider the previous report and the new chapter together.

Keep warnings that remain relevant.

Remove warnings that no longer represent a noticeable pattern.

Flag only repetition that could weaken future prose.

Ignore names, pronouns and ordinary connecting language.

Give concise, practical guidance without creating a rigid blacklist.

NEW CHAPTER:

${chapter}
`.trim();

      const analysisResponse = await openai.responses.create({
        model: "gpt-5.5",
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        input: analysisPrompt,
        max_output_tokens: 2500,
      });

      if (analysisResponse.status === "completed") {
        const parsed = JSON.parse(
          cleanJsonOutput(analysisResponse.output_text || "")
        );

        const memory = parsed.storyMemory || {};
        const repetition = parsed.repetitionReport || {};

        updatedMemory = {
          importantFacts:
            stringArray(memory.importantFacts).length > 0
              ? stringArray(memory.importantFacts)
              : storyMemory.importantFacts,
          characterDetails:
            stringArray(memory.characterDetails).length > 0
              ? stringArray(memory.characterDetails)
              : storyMemory.characterDetails,
          relationshipHistory:
            stringArray(memory.relationshipHistory).length > 0
              ? stringArray(memory.relationshipHistory)
              : storyMemory.relationshipHistory,
          unresolvedThreads: Array.isArray(memory.unresolvedThreads)
            ? stringArray(memory.unresolvedThreads)
            : storyMemory.unresolvedThreads,
          pastEvents:
            stringArray(memory.pastEvents).length > 0
              ? stringArray(memory.pastEvents)
              : storyMemory.pastEvents,
          rules:
            stringArray(memory.rules).length > 0
              ? stringArray(memory.rules)
              : storyMemory.rules,
        };

        updatedRepetitionReport = {
          overusedWords: Array.isArray(repetition.overusedWords)
            ? stringArray(repetition.overusedWords)
            : repetitionReport.overusedWords,
          repeatedPhrases: Array.isArray(repetition.repeatedPhrases)
            ? stringArray(repetition.repeatedPhrases)
            : repetitionReport.repeatedPhrases,
          repeatedReactions: Array.isArray(
            repetition.repeatedReactions
          )
            ? stringArray(repetition.repeatedReactions)
            : repetitionReport.repeatedReactions,
          repeatedHumourPatterns: Array.isArray(
            repetition.repeatedHumourPatterns
          )
            ? stringArray(repetition.repeatedHumourPatterns)
            : repetitionReport.repeatedHumourPatterns,
          repeatedSentencePatterns: Array.isArray(
            repetition.repeatedSentencePatterns
          )
            ? stringArray(repetition.repeatedSentencePatterns)
            : repetitionReport.repeatedSentencePatterns,
          guidance: Array.isArray(repetition.guidance)
            ? stringArray(repetition.guidance)
            : repetitionReport.guidance,
        };
      }
    } catch (analysisError) {
      console.error(
        "Chapter analysis update failed:",
        analysisError
      );
    }

    const updatedStoryState = {
      ...incomingState,
      chapter: nextChapterNumber,
      voiceProfile,
      storyMemory: updatedMemory,
      repetitionReport: updatedRepetitionReport,
    };

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
        storyState: {},
        incomplete: true,
      },
      { status: 200 }
    );
  }
}
