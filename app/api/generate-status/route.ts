import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 300;

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

type ChapterSummary = {
  currentScene: string;
  lastEvent: string;
  emotionalState: string;
  relationshipState: string;
  immediateNextStep: string;
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const jobId =
      typeof body.jobId === "string" ? body.jobId.trim() : "";

    const form = body.form || {};
    const openingStoryState = body.openingStoryState || {};

    if (!jobId) {
      return Response.json(
        {
          status: "failed",
          failed: true,
          error: "No background job ID was provided.",
        },
        { status: 400 }
      );
    }

    const response = await openai.responses.retrieve(jobId);

    if (
      response.status === "queued" ||
      response.status === "in_progress"
    ) {
      return Response.json({
        status: response.status,
        complete: false,
      });
    }

    if (response.status === "incomplete") {
      return Response.json({
        status: "incomplete",
        complete: false,
        failed: true,
        reason:
          response.incomplete_details?.reason || "unknown",
        error:
          response.incomplete_details?.reason ===
          "max_output_tokens"
            ? "Chapter 1 hit the output limit before reaching the ending."
            : "Chapter 1 ended before completion.",
      });
    }

    if (response.status !== "completed") {
      return Response.json({
        status: response.status,
        complete: false,
        failed: true,
        error:
          response.error?.message ||
          "Chapter 1 generation failed.",
      });
    }

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter) {
      return Response.json({
        status: "completed",
        complete: false,
        failed: true,
        error:
          "The completed response contained no Chapter 1 text.",
      });
    }

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

    let generatedVoiceProfile = emptyVoiceProfile;
    let generatedStoryMemory = emptyStoryMemory;
    let generatedRepetitionReport = emptyRepetitionReport;
let generatedChapterSummary: ChapterSummary = {
  currentScene: "",
  lastEvent: "",
  emotionalState: "",
  relationshipState: "",
  immediateNextStep: "",
};
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

"chapterSummary": {
  "currentScene": "",
  "lastEvent": "",
  "emotionalState": "",
  "relationshipState": "",
  "immediateNextStep": ""
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
vocabulary, sentence length, humour, emotional openness, observations,
vulnerability avoidance, arguments, flirting and stress responses.

Avoid vague personality labels.

STORY MEMORY

Keep only continuity facts needed later.

Record established character details, relationship developments,
unresolved threads, past events and permanent rules.

Do not summarise the entire chapter.

REPETITION REPORT

Flag only noticeable habits that could weaken later prose.

Ignore names, pronouns and ordinary connecting language.

Give concise guidance for keeping the next chapter fresh without
creating a rigid blacklist.

STORY TITLE:
${form.title || "Untitled"}

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

CHAPTER 1:
${chapter}
`.trim();

      const analysisResponse =
        await openai.responses.create({
          model: "gpt-5.6-terra",
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          input: analysisPrompt,
          max_output_tokens: 4000,
        });

      if (analysisResponse.status === "completed") {
        const parsed = JSON.parse(
          cleanJsonOutput(
            analysisResponse.output_text || ""
          )
        );

        const voice = parsed.voiceProfile || {};
       const memory = parsed.storyMemory || {};
const summary = parsed.chapterSummary || {};
const repetition = parsed.repetitionReport || {};

        generatedVoiceProfile = {
          primaryTone: voice.primaryTone || "",
          emotionalCadence:
            voice.emotionalCadence || "",
          humourStyle: voice.humourStyle || "",
          humourMechanics:
            voice.humourMechanics || "",
          narrativeStyle:
            voice.narrativeStyle || "",
          narrativeDistance:
            voice.narrativeDistance || "",
          sentenceRhythm:
            voice.sentenceRhythm || "",
          dialogueStyle:
            voice.dialogueStyle || "",
          descriptionStyle:
            voice.descriptionStyle || "",
          internalMonologueStyle:
            voice.internalMonologueStyle || "",
          conflictStyle:
            voice.conflictStyle || "",
          romanticStyle:
            voice.romanticStyle || "",
          emotionalTexture:
            voice.emotionalTexture || "",
          povVoiceRules: stringArray(
            voice.povVoiceRules
          ),
          characterVoices: stringArray(
            voice.characterVoices
          ),
        };

        generatedStoryMemory = {
          importantFacts: stringArray(
            memory.importantFacts
          ),
          characterDetails: stringArray(
            memory.characterDetails
          ),
          relationshipHistory: stringArray(
            memory.relationshipHistory
          ),
          unresolvedThreads: stringArray(
            memory.unresolvedThreads
          ),
          pastEvents: stringArray(
            memory.pastEvents
          ),
          rules: stringArray(memory.rules),
        };

generatedChapterSummary = {
  currentScene: summary.currentScene || "",
  lastEvent: summary.lastEvent || "",
  emotionalState: summary.emotionalState || "",
  relationshipState: summary.relationshipState || "",
  immediateNextStep: summary.immediateNextStep || "",
};
        
        generatedRepetitionReport = {
          overusedWords: stringArray(
            repetition.overusedWords
          ),
          repeatedPhrases: stringArray(
            repetition.repeatedPhrases
          ),
          repeatedReactions: stringArray(
            repetition.repeatedReactions
          ),
          repeatedHumourPatterns: stringArray(
            repetition.repeatedHumourPatterns
          ),
          repeatedSentencePatterns: stringArray(
            repetition.repeatedSentencePatterns
          ),
          guidance: stringArray(
            repetition.guidance
          ),
        };
      }
    } catch (analysisError) {
      console.error(
        "INITIAL STORY ANALYSIS ERROR:",
        analysisError
      );
    }

   const storyState = {
  ...openingStoryState,
  chapter: 1,
  voiceProfile: generatedVoiceProfile,
  storyMemory: generatedStoryMemory,
  chapterSummary: generatedChapterSummary,
  repetitionReport: generatedRepetitionReport,
};
    return Response.json({
      status: "completed",
      complete: true,
      result: chapter,
      storyState,
    });
  } catch (error) {
    console.error("GENERATE STATUS ERROR:", error);

    return Response.json(
      {
        status: "failed",
        complete: false,
        failed: true,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Chapter 1 status error.",
      },
      { status: 500 }
    );
  }
}
