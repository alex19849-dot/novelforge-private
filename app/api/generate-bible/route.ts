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
The bible must be written as a professional story development document.

Think like an experienced romance editor, developmental editor, and series planner.

Prioritize:
- Strong emotional arcs
- Character consistency
- Long-term continuity
- Story cohesion
- Reader satisfaction
- Commercial romance expectations

The bible should be detailed enough that a separate AI could write the entire novel while remaining consistent.
Infer genre, tone, length, burn pacing, relationship type, setting, themes and heat level from the user's story idea and character notes.

If information is missing, make the most commercially appropriate choice based on the story concept.

Prefer strong story-specific decisions over generic defaults.

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

Before creating the bible, analyse the user's story idea and identify:

- Genre
- Subgenre
- Relationship type
- Heat level
- Burn pacing
- Setting
- Main tropes
- Character archetypes
- Emotional theme
- Emotional promise
- External conflict
- Internal conflict

Use those findings to drive every section of the bible.

All characters, locations, world rules, mysteries, side characters and chapter roadmap entries must directly support the identified story.
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
 "mainCharacters": [
  {
    "name": "",
    "age": "",
    "role": "",
    "species": "",
    "romanticOrientation": "",
    "appearance": {},
    "personality": [],
    "fears": [],
    "misbelief": "",
    "need": "",
    "want": "",
    "growthArc": "",
    "relationshipDynamic": "",
    "speechStyle": "",
    "backstory": ""
  }
],
  "supportingCharacters": [
  {
    "name": "",
    "age": "",
    "role": "",
    "appearance": "",
    "personality": [],
    "knowsSecrets": false,
    "secretsKnown": [],
    "storyPurpose": ""
  }
],
  "worldRules": {
  "continuityDatabase": {
  "characterFacts": [],
  "locationFacts": [],
  "worldFacts": [],
  "knownSecrets": [],
  "unknownSecrets": [],
  "activeMysteries": [],
  "activeThreats": [],
  "importantObjects": [],
  "importantDates": [],
  "importantRelationships": []
},
  "settingRules": {},
  "speciesRules": {},
  "powerRules": {},
  "weaknessRules": {},
  "societyRules": {},
  "relationshipRules": {},
  "continuityRules": {}
},
 "locations": [
  {
    "name": "",
    "type": "",
    "owner": "",
    "description": "",
    "storyPurpose": "",
    "secrets": []
  }
],
  "relationshipArc": [
  {
    "stage": "",
    "chapters": [],
    "summary": "",
    "physicalProgression": "",
    "emotionalProgression": "",
    "relationshipState": ""
  }
],
"mandatoryStoryBeats": [
  {
    "beat": "",
    "description": "",
    "completed": false,
    "importance": "major"
  }
],
  "chapterRoadmap": [
  {
    "chapter": 1,
    "title": "",
    "pov": "",
    "summary": "",
    "romanceBeat": "",
    "plotBeat": "",
    "characterDevelopment": "",
    "mysteryProgress": "",
    "heatBeat": "",
    "cliffhangerOrHook": ""
  }
],
 "openingStoryState": {
  "currentChapter": 1,
  "currentPOV": "",
  "relationshipStatus": "",
  "physicalRelationshipStatus": "",
  "emotionalRelationshipStatus": "",
  "knownSecrets": [],
  "unknownSecrets": [],
  "activeMysteries": [],
  "activeThreats": [],
  "unresolvedConflicts": [],
  "completedBeats": [],
  "pendingBeats": []
}
  "subGenre": "",
"setting": "",
"burnPacing": "",
"primaryTropes": [],
"secondaryTropes": []
}

Rules:
- Make all romantic and sexual characters adults.
- Generate only story elements that directly support the user's concept.
- Do not introduce unrelated subplots, genres, themes, occupations, settings, creatures, powers, organizations, or conflicts.
- Every character, location, mystery, threat, and chapter beat must connect back to the core story.
- Prefer depth over breadth.
- A smaller number of highly relevant elements is better than a large number of loosely connected elements.
- Never override user supplied tropes, sexuality, romantic history, relationship dynamics, genre, heat level, story length, burn type, character roles, or worldbuilding.
- Every main character must have a complete character profile.
- Every supporting character must have a complete character profile.
- Every location must contain at least one story purpose and one secret if relevant.
- Every mystery introduced must appear in activeMysteries.
- Every unresolved conflict introduced must appear in unresolvedConflicts.
- Relationship progression must be tracked separately for physical intimacy and emotional intimacy.
- The chapter roadmap must cover the entire requested book length.
- Long Novel defaults to approximately 25-35 chapters unless otherwise specified.
- User supplied information always takes priority over inferred information.
- If the user specifies Gay First Time, the character cannot have previous sexual experience with men.
- If the user specifies Long Novel, the story length must be Long Novel.
- If the user specifies Paranormal Romance, do not replace it with Sports Romance, Contemporary Romance, or any other genre.
- Include names, ages, appearances, personalities, fears, misbeliefs, needs and growth arcs for main characters.
- Include side characters with names, ages, roles, appearances, personalities, secrets known, story purpose, relationship to the main characters, and their impact on the plot.
- Every supporting character must serve at least one function:
  - Ally
  - Mentor
  - Antagonist
  - Rival
  - Comic Relief
  - Found Family
  - Gatekeeper
  - Informant
  - Love Interest Support
  - Threat
- Do not create filler characters.
- Every supporting character must affect either the romance, mystery, worldbuilding, conflict, or protagonist growth.
- Create a continuity database that can be used by future chapter generation.
- Every fact introduced must have a permanent home in the bible.
- Character facts belong in character profiles.
- Location facts belong in locations.
- Species facts belong in world rules.
- Secrets belong in knownSecrets or unknownSecrets.
- Mysteries belong in activeMysteries.
- Threats belong in activeThreats.
- The bible must function as a reference database for the entire novel.
- Include locations with names, descriptions, owners, story purpose, secrets, recurring characters, and plot relevance.
- Every major location must answer:
  - Why does this location exist?
  - What story purpose does it serve?
  - What secrets are connected to it?
  - Which characters are most associated with it?
- Do not create locations that are unlikely to appear in the story.
- Locations should support the romance, mystery, worldbuilding, conflict, or character development.
- Include a chapter roadmap for the full target chapter count.
- Every chapter must have a purpose.
- Every chapter must advance at least one of:
  - Romance
  - Character Development
  - Mystery
  - External Conflict
  - Worldbuilding
- No chapter should exist purely as filler.
- The roadmap should show how the story escalates from beginning, to midpoint, to climax, to resolution.
- Relationship progression, mystery progression, and character growth should all move forward throughout the roadmap.
- Do not use em dashes or en dashes.
- Return JSON only.
The JSON must be internally consistent.

Do not contradict previously established facts.

Character ages, appearances, personalities, fears, motivations, locations, species rules, mysteries, relationships and worldbuilding must remain logically consistent throughout the entire bible.

Do not leave placeholder fields empty.

- Create long-term continuity anchors.
- Identify all important objects, secrets, relationships, locations, organizations, enemies, allies, and mysteries.
- Add them to the continuityDatabase.
- Anything likely to matter after Chapter 5 should appear somewhere in the continuityDatabase.
- The continuityDatabase should be sufficient for another AI to continue the novel without reading the full bible.
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
