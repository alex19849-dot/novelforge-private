import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const chapter =
      typeof body.chapter === "string"
        ? body.chapter.trim()
        : "";

    const storyState = body.storyState || {};

    if (!chapter) {
      return Response.json(
        {
          error: "No chapter text was provided.",
        },
        { status: 400 }
      );
    }

    const savedMemory = storyState.storyMemory || {};

    const storyMemory: StoryMemory = {
      importantFacts: stringArray(savedMemory.importantFacts),
      characterDetails: stringArray(savedMemory.characterDetails),
      relationshipHistory: stringArray(
        savedMemory.relationshipHistory
      ),
      unresolvedThreads: stringArray(
        savedMemory.unresolvedThreads
      ),
      pastEvents: stringArray(savedMemory.pastEvents),
      rules: stringArray(savedMemory.rules),
    };

    const savedRepetition =
      storyState.repetitionReport || {};

    const repetitionReport: RepetitionReport = {
      overusedWords: stringArray(
        savedRepetition.overusedWords
      ),
      repeatedPhrases: stringArray(
        savedRepetition.repeatedPhrases
      ),
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

    const prompt = `
Analyse the newly generated chapter and update the saved guidance for future chapters.

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

Record important character details, relationship developments, unresolved threads, past events and permanent rules.

Remove an unresolved thread only when the new chapter clearly resolves it.

Do not summarise the entire chapter.

Do not include temporary emotions unless they affect later chapters.

REPETITION RULES

Consider the previous report and the new chapter together.

Keep warnings that remain relevant.

Remove warnings that no longer represent a noticeable pattern.

Flag only repetition likely to weaken future prose.

Ignore names, pronouns and ordinary connecting language.

Give concise, practical guidance without creating a rigid blacklist.

NEW CHAPTER:

${chapter}
`.trim();

    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: prompt,
      max_output_tokens: 4000,
    });

    if (response.status === "incomplete") {
      return Response.json(
        {
          error:
            "Chapter analysis stopped before completion.",
        },
        { status: 422 }
      );
    }

    const parsed = JSON.parse(
      cleanJsonOutput(response.output_text || "")
    );

    const memory = parsed.storyMemory || {};
    const repetition = parsed.repetitionReport || {};

    const updatedMemory: StoryMemory = {
      importantFacts: Array.isArray(
        memory.importantFacts
      )
        ? stringArray(memory.importantFacts)
        : storyMemory.importantFacts,

      characterDetails: Array.isArray(
        memory.characterDetails
      )
        ? stringArray(memory.characterDetails)
        : storyMemory.characterDetails,

      relationshipHistory: Array.isArray(
        memory.relationshipHistory
      )
        ? stringArray(memory.relationshipHistory)
        : storyMemory.relationshipHistory,

      unresolvedThreads: Array.isArray(
        memory.unresolvedThreads
      )
        ? stringArray(memory.unresolvedThreads)
        : storyMemory.unresolvedThreads,

      pastEvents: Array.isArray(memory.pastEvents)
        ? stringArray(memory.pastEvents)
        : storyMemory.pastEvents,

      rules: Array.isArray(memory.rules)
        ? stringArray(memory.rules)
        : storyMemory.rules,
    };

    const updatedRepetitionReport: RepetitionReport = {
      overusedWords: Array.isArray(
        repetition.overusedWords
      )
        ? stringArray(repetition.overusedWords)
        : repetitionReport.overusedWords,

      repeatedPhrases: Array.isArray(
        repetition.repeatedPhrases
      )
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
        ? stringArray(
            repetition.repeatedHumourPatterns
          )
        : repetitionReport.repeatedHumourPatterns,

      repeatedSentencePatterns: Array.isArray(
        repetition.repeatedSentencePatterns
      )
        ? stringArray(
            repetition.repeatedSentencePatterns
          )
        : repetitionReport.repeatedSentencePatterns,

      guidance: Array.isArray(repetition.guidance)
        ? stringArray(repetition.guidance)
        : repetitionReport.guidance,
    };

    return Response.json({
      storyMemory: updatedMemory,
      repetitionReport: updatedRepetitionReport,
    });
  } catch (error) {
    console.error("ANALYSE CHAPTER ERROR:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown chapter analysis error.",
      },
      { status: 500 }
    );
  }
}
