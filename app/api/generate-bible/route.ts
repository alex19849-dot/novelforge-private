import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getTargetChapters(length: string) {
  if (length === "Short Novel") return 18;
  if (length === "Long Novel") return 30;
  return 10;
}

function getWordTarget(length: string) {
 if (length === "Short Novel") return "1500 to 2200 words";
 if (length === "Long Novel") return "1800 to 2500 words";
 return "1200 to 1800 words";
}

function getMaxTokens(length: string) {
 if (length === "Short Novel") return 8000;
 if (length === "Long Novel") return 11000;
 return 6500;
}

function detectLocale(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("london") ||
    lower.includes("uk") ||
    lower.includes("british") ||
    lower.includes("england") ||
    lower.includes("manchester") ||
    lower.includes("liverpool") ||
    lower.includes("scotland") ||
    lower.includes("wales")
  ) {
    return {
      regionalLanguage: "British English",
      locationTerms: ["flat", "phone", "car park", "trainers", "mum"],
      forbiddenTerms: ["apartment", "cell phone", "parking lot", "sneakers", "mom"],
    };
  }

  if (
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

  return {
    regionalLanguage: "American English",
    locationTerms: ["apartment", "phone", "parking lot", "sneakers", "mom"],
    forbiddenTerms: ["flat", "car park", "trainers", "mum"],
  };
}

function detectRelationship(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes(" mm ") ||
    lower.includes("m/m") ||
    lower.includes("male/male") ||
    lower.includes("two men") ||
    lower.includes("both men") ||
    lower.includes("gay") ||
    lower.includes("gfY".toLowerCase())
  ) {
    return "MM Romance";
  }

  if (
    lower.includes(" ff ") ||
    lower.includes("f/f") ||
    lower.includes("female/female") ||
    lower.includes("two women") ||
    lower.includes("both women") ||
    lower.includes("lesbian")
  ) {
    return "FF Romance";
  }

  return "Romance";
}

function detectHeat(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("explicit") ||
    lower.includes("spicy") ||
    lower.includes("smut") ||
    lower.includes("open door") ||
    lower.includes("fast burn")
  ) {
    return "Explicit adult";
  }

  if (lower.includes("fade to black") || lower.includes("closed door")) {
    return "Fade to black";
  }

  return "Spicy";
}

export async function POST(req: Request) {
  const body = await req.json();

  const storyIdea = body.plot || "";
  const characters = body.characterNotes || "";
  const mustAvoid = body.mustNotHave || "";

  const fullInput = `${storyIdea}\n\n${characters}\n\n${mustAvoid}`;
  const length = body.length || "Novella";
  const targetChapters = getTargetChapters(length);
  const wordTarget = getWordTarget(length);
  const maxTokens = getMaxTokens(length);
  const regional = detectLocale(fullInput);
  const relationship = body.relationship || detectRelationship(fullInput);
  const heat = body.heat || detectHeat(fullInput);

  const openingStoryState = {
    chapter: 1,
    targetChapters,
    wordTarget,
    relationship,
    heat,
    regionalLanguage: regional.regionalLanguage,
    locationTerms: regional.locationTerms,
    forbiddenTerms: regional.forbiddenTerms,

    relationshipStage: 1,
    physicalStage: 1,

    trust: 5,
    attraction: heat === "Explicit adult" ? 30 : 15,
    jealousy: 0,
    vulnerability: 2,
    sexualTension: heat === "Explicit adult" ? 35 : 18,

    lastMajorBeat: "Chapter 1 introduced the story, the main characters, the central conflict and the first emotional hook.",
    nextRequiredConsequence:
      "Chapter 2 must continue directly from Chapter 1 and carry forward the emotional and practical consequences. Do not reset the characters.",

    shouldWriteEpilogue: false,
    epilogueWritten: false,
    endingPhase: "opening",
  };

  const prompt = `
You are NovelForge.

Create a complete story bible for a commercial adult romance novel.

Return only valid JSON.
Do not write chapter prose.
Do not include markdown.
Do not include notes.
Do not include analysis.

STORY IDEA:
${storyIdea || "No story idea provided."}

CHARACTERS:
${characters || "No character notes provided."}

MUST AVOID:
${mustAvoid || "Nothing specific provided."}

STORY SETTINGS:
Relationship type: ${relationship}
Book length: ${length}
Target chapter count: ${targetChapters}
Heat level: ${heat}
Regional language: ${regional.regionalLanguage}
Preferred terms: ${regional.locationTerms.join(", ")}
Forbidden terms: ${regional.forbiddenTerms.join(", ")}

Create the following JSON structure:

{
  "storyDNA": {
    "workingTitle": "",
    "genre": "",
    "length": "",
    "heatLevel": "",
    "burnType": "",
    "tone": [],
    "coreTheme": "",
    "emotionalPromise": "",
    "centralQuestion": "",
    "readerExperienceGoal": ""
  },
  "mainCharacters": [],
  "supportingCharacters": [],
  "worldRules": {},
  "locations": [],
  "relationshipArc": [],
  "mandatoryStoryBeats": [],
  "chapterRoadmap": [],
  "openingStoryState": {}
}

Rules:
- Make all romantic and sexual characters adults.
- Keep the bible specific to the user's story idea.
- Include names, ages, appearances, personalities, fears, misbeliefs, needs and growth arcs for main characters.
- Include side characters with names, ages, roles, appearances, personalities and whether they know any secrets.
- Include clear world rules so continuity stays consistent.
- Include locations with names, descriptions, owners and story purpose.
- Include a chapter roadmap for the full target chapter count.
- Do not use em dashes or en dashes.
- Return JSON only.
`;

  try {
  const response = await openai.responses.create({
    model: "gpt-5.5",
    reasoning: { effort: "low" },
    text: { verbosity: "medium" },
    input: prompt,
    max_output_tokens: maxTokens,
  });

  if (response.status === "incomplete") {
    const partialBible = cleanOutput(response.output_text || "");

    return Response.json(
      {
        result:
          partialBible ||
          "Bible generation stopped before finishing, but no partial text was returned.",
        storyState: openingStoryState,
        warning:
          "The bible may be incomplete because the model hit the output limit.",
      },
      { status: 200 }
    );
  }

  const bibleText = cleanOutput(response.output_text || "");

  if (!bibleText.trim()) {
    return Response.json(
      {
        result: "No bible text was returned.",
        storyState: openingStoryState,
      },
      { status: 500 }
    );
  }

  return Response.json({
    result: bibleText,
    storyState: openingStoryState,
  });
} catch (error) {
  console.error(error);

  return Response.json(
    {
      result:
        "Something went wrong while generating the story bible. The vampire paperwork department has collapsed.",
      storyState: openingStoryState,
    },
    { status: 500 }
  );
}
}  
