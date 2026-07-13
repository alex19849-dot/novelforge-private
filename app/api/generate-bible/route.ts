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

function getRegionalSettings(localeInput: unknown, sourceText: string) {
  const selectedLocale =
    typeof localeInput === "string" ? localeInput.trim() : "";

  const lower = `${selectedLocale}\n${sourceText}`.toLowerCase();

  if (
    selectedLocale === "British English" ||
    lower.includes("united kingdom") ||
    lower.includes("british") ||
    lower.includes("england") ||
    lower.includes("scotland") ||
    lower.includes("wales") ||
    lower.includes("london") ||
    lower.includes("manchester") ||
    lower.includes("liverpool")
  ) {
    return {
      regionalLanguage: "British English",
      locationTerms: ["flat", "phone", "car park", "trainers", "mum"],
      forbiddenTerms: [
        "apartment",
        "cell phone",
        "parking lot",
        "sneakers",
        "mom",
      ],
    };
  }

  if (
    selectedLocale === "Canadian English" ||
    lower.includes("canada") ||
    lower.includes("toronto") ||
    lower.includes("vancouver") ||
    lower.includes("montreal")
  ) {
    return {
      regionalLanguage: "Canadian English",
      locationTerms: ["apartment", "phone", "parking lot", "sneakers", "mum"],
      forbiddenTerms: ["flat", "car park"],
    };
  }

  if (
    selectedLocale === "Australian English" ||
    lower.includes("australia") ||
    lower.includes("sydney") ||
    lower.includes("melbourne") ||
    lower.includes("brisbane")
  ) {
    return {
      regionalLanguage: "Australian English",
      locationTerms: ["unit", "mobile", "car park", "trainers", "mum"],
      forbiddenTerms: ["cell phone", "parking lot", "mom"],
    };
  }

  return {
    regionalLanguage: "American English",
    locationTerms: ["apartment", "phone", "parking lot", "sneakers", "mom"],
    forbiddenTerms: ["flat", "car park", "trainers", "mum"],
  };
}

function getTargetChapterWords(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 4000;

  return Math.min(Math.max(Math.round(parsed), 1500), 6000);
}

export async function POST(req: Request) {
  let openingStoryState: {
    chapter: number;
    title: string;
    relationship: string;
    heat: string;
    regionalLanguage: string;
    locationTerms: string[];
    forbiddenTerms: string[];
    voiceProfile: VoiceProfile;
    repetitionReport: RepetitionReport;
    storyMemory: StoryMemory;
  } | null = null;

  try {
    const body = await req.json();

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Untitled";

    const storyIdea =
      typeof body.plot === "string" ? body.plot.trim() : "";

    const storyOutline =
      typeof body.storyOutline === "string"
        ? body.storyOutline.trim()
        : "";

    const mainCharacters =
      typeof body.characterNotes === "string"
        ? body.characterNotes.trim()
        : "";

    const supportingCharacters =
      typeof body.sideCharacterNotes === "string"
        ? body.sideCharacterNotes.trim()
        : "";

    const mustInclude =
      typeof body.mustHave === "string" ? body.mustHave.trim() : "";

    const mustAvoid =
      typeof body.mustNotHave === "string"
        ? body.mustNotHave.trim()
        : "";

    const sourceText = [
      storyIdea,
      storyOutline,
      mainCharacters,
      supportingCharacters,
      mustInclude,
      mustAvoid,
      body.storyLocation || "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const regional = getRegionalSettings(body.locale, sourceText);

    const relationship =
      typeof body.relationship === "string" && body.relationship.trim()
        ? body.relationship.trim()
        : "Romance";

    const heat =
      typeof body.heat === "string" && body.heat.trim()
        ? body.heat.trim()
        : "Open door";

    const targetChapterWords = getTargetChapterWords(
      body.targetChapterWords
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

    const emptyRepetitionReport: RepetitionReport = {
      overusedWords: [],
      repeatedPhrases: [],
      repeatedReactions: [],
      repeatedHumourPatterns: [],
      repeatedSentencePatterns: [],
      guidance: [],
    };

    const emptyStoryMemory: StoryMemory = {
      importantFacts: [],
      characterDetails: [],
      relationshipHistory: [],
      unresolvedThreads: [],
      pastEvents: [],
      rules: [],
    };

    openingStoryState = {
      chapter: 1,
      title,
      relationship,
      heat,
      regionalLanguage: regional.regionalLanguage,
      locationTerms: regional.locationTerms,
      forbiddenTerms: regional.forbiddenTerms,
      voiceProfile: emptyVoiceProfile,
      repetitionReport: emptyRepetitionReport,
      storyMemory: emptyStoryMemory,
    };

    const prompt = `
You are NovelForge.

Write Chapter 1 of this adult romance novel.

Return only polished chapter prose.
Do not include notes, analysis, JSON or markdown.

FORMAT

Begin exactly with:

Chapter 1

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

CHAPTER LENGTH

Target approximately ${targetChapterWords} words.

Complete the chapter within that target.
Do not exceed the target by more than 10 percent.

Keep the chapter focused.
Limit its scope to material that can be completed naturally within the available length.
Do not begin another major scene near the end unless it can be completed.
Prioritise a satisfying ending over extra setup, description, backstory or internal reflection.

STORY BIBLE

Title:
${title}

Story idea:
${storyIdea || "No story idea provided."}

Story outline:
${storyOutline || "No story outline provided."}

Main characters:
${mainCharacters || "No main character notes provided."}

Supporting characters:
${supportingCharacters || "No supporting character notes provided."}

Must include:
${mustInclude || "Nothing specific provided."}

Must avoid:
${mustAvoid || "Nothing specific provided."}

STORY SETTINGS

Relationship:
${relationship}

Subgenre:
${body.subgenre || "Not specified"}

Subgenre detail:
${body.subgenreDetail || "Not specified"}

Story location:
${body.storyLocation || "Not specified"}

Point of view:
${body.pov || "First person, dual POV"}

Heat level:
${heat}

Burn pacing:
${body.burnPacing || "Medium burn"}

Ending:
${body.ending || "Happy ending"}

Regional language:
${regional.regionalLanguage}

Preferred regional terms:
${regional.locationTerms.join(", ")}

Avoid conflicting regional terms:
${regional.forbiddenTerms.join(", ")}

VOICE AND STYLE

Overall voice:
${body.voiceStyle || "Commercial romance"}

Humour style:
${body.humourStyle || "Mixed character-specific humour"}

Dialogue style:
${body.dialogueStyle || "Natural and grounded"}

Prose style:
${body.proseDensity || "Balanced"}

Chapter opening style:
${body.chapterOpener || "Character-driven"}

Additional style notes:
${body.avoidStyle || "None provided."}

Establish a distinct writing identity for this particular novel.

Let the prose, humour, dialogue rhythm and emotional tone arise from these characters and this setting.

Do not default to interchangeable sarcasm, constant banter or generic romance narration.

Give each major character a recognisable voice based on their background, personality, emotional openness and way of noticing the world.

Humour must be character-specific. Not every character should joke in the same way.

WRITING PRIORITIES

Open at the most interesting natural point for this story.

Introduce the viewpoint character immediately.

Introduce the romantic interest when it creates the strongest natural first meeting. Do not delay them artificially, but do not force them into the opening line.

Make the central romantic dynamic clear through behaviour, dialogue and circumstances.

Allow supporting characters and world details only when they strengthen the scene or story.

Every scene must advance character, relationship, conflict or plot.

Do not repeat information the reader already understands.

Do not explain dialogue after the dialogue has already made the meaning clear.

Internal thoughts must add a new realisation, decision, fear or conflict.

Use precise, character-specific physical and emotional reactions.

Avoid stock reactions, repetitive body language, therapy-speak, purple prose, fake profound lines and over-described rooms.

Respect the selected heat level. Do not force intimacy into Chapter 1 merely because the novel is high heat.

Any romantic or intimate development must involve consenting adults and must affect the relationship afterwards.

Do not use em dashes or en dashes. Use commas, full stops, colons or brackets instead.

CHAPTER 1 PURPOSE

Establish the viewpoint character, setting and immediate situation.

Create meaningful movement in the central romantic dynamic.

Make names, roles, relationships and essential circumstances clear through natural storytelling.

Do not reveal every secret or solve the central conflict.

End with a completed scene and a strong emotional turn, decision, complication, discovery or charged moment that creates genuine interest in Chapter 2.
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
            "Chapter 1 stopped before completion and was not saved.",
          storyState: openingStoryState,
          incomplete: true,
        },
        { status: 422 }
      );
    }

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter) {
      return Response.json(
        {
          result: "No chapter text was returned.",
          storyState: openingStoryState,
        },
        { status: 500 }
      );
    }

    let generatedVoiceProfile: VoiceProfile = emptyVoiceProfile;
    let generatedStoryMemory: StoryMemory = emptyStoryMemory;
    let generatedRepetitionReport: RepetitionReport =
      emptyRepetitionReport;

    try {
      const analysisPrompt = `
Analyse Chapter 1 and create the saved guidance needed for future chapters.

Return valid JSON only.
Do not include markdown, notes or commentary.

Use exactly this structure:

{
  "voiceProfile": {
    "primaryTone": "",
    "emotionalCadence": "",
    "humourStyle": "",
    "humourMechanics": "",
    "narrativeStyle": "",
    "narrativeDistance": "",
    "sentenceRhythm": "",
    "dialogueStyle": "",
    "descriptionStyle": "",
    "internalMonologueStyle": "",
    "conflictStyle": "",
    "romanticStyle": "",
    "emotionalTexture": "",
    "povVoiceRules": [],
    "characterVoices": []
  },
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

VOICE PROFILE

Describe how future chapters should be written, not merely what happened.

Make the profile specific to this novel.

For each major viewpoint character, describe practical writing behaviour:
vocabulary, sentence length, humour, emotional openness, observations, vulnerability avoidance, arguments, flirting and stress responses.

Avoid vague personality labels.

STORY MEMORY

Keep only continuity facts needed later.

Record established character details, relationship developments, unresolved threads, past events and permanent rules.

Do not summarise the entire chapter.

REPETITION REPORT

Flag only noticeable habits that could weaken later prose.

Ignore names, pronouns and ordinary connecting language.

Give concise guidance for keeping the next chapter fresh without creating a rigid blacklist.

STORY TITLE:
${title}

STORY IDEA:
${storyIdea || "No story idea provided."}

STORY OUTLINE:
${storyOutline || "No story outline provided."}

MAIN CHARACTERS:
${mainCharacters || "No main character notes provided."}

SUPPORTING CHARACTERS:
${supportingCharacters || "No supporting character notes provided."}

MUST INCLUDE:
${mustInclude || "Nothing specific provided."}

MUST AVOID:
${mustAvoid || "Nothing specific provided."}

CHAPTER 1:
${chapter}
`.trim();

      const analysisResponse = await openai.responses.create({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        input: analysisPrompt,
        max_output_tokens: 3500,
      });

      if (analysisResponse.status === "completed") {
        const parsed = JSON.parse(
          cleanJsonOutput(analysisResponse.output_text || "")
        );

        const voice = parsed.voiceProfile || {};
        const memory = parsed.storyMemory || {};
        const repetition = parsed.repetitionReport || {};

        generatedVoiceProfile = {
          primaryTone: voice.primaryTone || "",
          emotionalCadence: voice.emotionalCadence || "",
          humourStyle: voice.humourStyle || "",
          humourMechanics: voice.humourMechanics || "",
          narrativeStyle: voice.narrativeStyle || "",
          narrativeDistance: voice.narrativeDistance || "",
          sentenceRhythm: voice.sentenceRhythm || "",
          dialogueStyle: voice.dialogueStyle || "",
          descriptionStyle: voice.descriptionStyle || "",
          internalMonologueStyle:
            voice.internalMonologueStyle || "",
          conflictStyle: voice.conflictStyle || "",
          romanticStyle: voice.romanticStyle || "",
          emotionalTexture: voice.emotionalTexture || "",
          povVoiceRules: stringArray(voice.povVoiceRules),
          characterVoices: stringArray(voice.characterVoices),
        };

        generatedStoryMemory = {
          importantFacts: stringArray(memory.importantFacts),
          characterDetails: stringArray(memory.characterDetails),
          relationshipHistory: stringArray(
            memory.relationshipHistory
          ),
          unresolvedThreads: stringArray(memory.unresolvedThreads),
          pastEvents: stringArray(memory.pastEvents),
          rules: stringArray(memory.rules),
        };

        generatedRepetitionReport = {
          overusedWords: stringArray(repetition.overusedWords),
          repeatedPhrases: stringArray(repetition.repeatedPhrases),
          repeatedReactions: stringArray(
            repetition.repeatedReactions
          ),
          repeatedHumourPatterns: stringArray(
            repetition.repeatedHumourPatterns
          ),
          repeatedSentencePatterns: stringArray(
            repetition.repeatedSentencePatterns
          ),
          guidance: stringArray(repetition.guidance),
        };
      }
    } catch (analysisError) {
      console.error(
        "Initial story analysis failed:",
        analysisError
      );
    }

    const storyState = {
      ...openingStoryState,
      voiceProfile: generatedVoiceProfile,
      repetitionReport: generatedRepetitionReport,
      storyMemory: generatedStoryMemory,
    };

    return Response.json({
      result: chapter,
      storyState,
    });
  } catch (error) {
    console.error("GENERATE STORY ERROR:", error);

    return Response.json(
      {
        result:
          error instanceof Error
            ? `Generate error: ${error.message}`
            : "Unknown generation error.",
        storyState: openingStoryState || {},
      },
      { status: 500 }
    );
  }
}
