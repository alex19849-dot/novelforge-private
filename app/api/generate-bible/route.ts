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
  if (length === "Short Novel") return "2000 to 3000 words";
  if (length === "Long Novel") return "2500 to 3500 words";
  return "1500 to 2500 words";
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

Write Chapter 1 of a commercial adult romance novel.

Return only polished chapter prose.
Do not include notes.
Do not include analysis.
Do not include JSON.
Do not include markdown.

The chapter must begin exactly with:

Chapter 1

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

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

CHAPTER 1 JOB:
- Open with a strong hook.
- Establish the main character's immediate problem, pressure, want, or emotional wound.
- Introduce the other main character naturally.
- Establish the central romantic dynamic.
- Establish attraction, friction, curiosity, or tension.
- Ground the setting through action, not long description.
- Make names, genders, jobs, ages, locations and relationships clear.
- Do not reveal every secret.
- Do not solve the central conflict.
- End on a clean hook, emotional turn, decision, complication, or charged moment.

STYLE:
- Natural commercial romance prose.
- First person if the story idea or characters imply it, otherwise use the most natural romance POV.
- Keep the prose readable, grounded, emotionally alive and character-led.
- Use distinct character voices.
- Dialogue should sound human, not over-polished.
- Keep humour and banter natural, not constant.
- Avoid therapy-speak.
- Avoid purple prose.
- Avoid random object descriptions.
- Avoid over-described rooms.
- Avoid fake profound lines.
- Avoid repeating the same phrase or sentence rhythm.
- Do not use em dashes or en dashes. Use commas, full stops, colons or parentheses instead.

ROMANCE RULES:
- Do not make the couple emotionally safe too quickly.
- Do not rush full intimacy in Chapter 1.
- If the story is explicit or fast burn, include clear physical awareness and one charged physical beat, but do not jump to full sexual payoff unless the user's story idea specifically requires it.
- If the story is slow burn or closed door, focus on tension, emotion and restraint.
- All romantic and sexual content must involve adults only.

# Physical Intimacy & Relationship Progression

Physical intimacy is an important part of romantic storytelling and should be treated as meaningful character and relationship development rather than a brief event or transition.

When intimate scenes occur:

* Write them fully on-page descriptive and detailed.
* Do not fade to black.
* Do not skip directly from anticipation to aftermath.
* Allow intimacy to occupy substantial page space when earned by the story.
* Build tension and anticipation before physical intimacy begins.
* Allow scenes to unfold naturally rather than rushing through major moments.

Physical intimacy should feel:

* Emotional.
* Romantic.
* Passionate.
* Character-driven.
* Personal.
* Relationship-specific.

Avoid:

* Clinical descriptions.
* Mechanical sequences of actions.
* Generic intimacy that could belong to any characters.
* Abrupt scene endings.
* Repetitive language and phrasing.
* Overly brief intimacy scenes that fail to satisfy narrative expectations.

Each intimate scene should reveal character, deepen emotional connection, and advance the relationship.

Physical intimacy should never feel separate from the emotional story.

# Spice Level Guidance

When the story's selected heat level allows explicit content:

* Show intimacy fully on-page.
* Allow scenes to be detailed and immersive.
* Allow dirty talk.
* Include anticipation, build-up, physical intimacy, emotional interaction, and meaningful aftermath.
* Allow important intimacy scenes to occupy a significant portion of a chapter when appropriate.

Major romantic milestones should receive narrative weight equal to other major story events.

# Emotional Aftermath

After intimate scenes:

* Include emotional reactions.
* Include relationship development.
* Include vulnerability, humour, affection, conversation, or reflection where appropriate.
* Show how intimacy changes the emotional dynamic between the characters.

Readers should leave intimate scenes feeling that the relationship has evolved, not simply that a physical act occurred.

# Character-Specific Intimacy

Physical intimacy should always reflect the personalities, emotional states, histories, fears, desires, and relationship dynamics of the characters involved.

No two intimate scenes should feel interchangeable.

The emotional and physical experience should feel unique to the specific characters and their stage of relationship development.


CONTINUITY RULES:
- Follow the story idea and character notes above.
- Do not invent random illnesses, family emergencies, scandals, accidents, custody threats or villains unless the user seeded them.
- Do not change character genders, names, roles or relationships.
- Do not include anything from the must avoid section.

LENGTH:
- Target ${wordTarget}.
- Write one complete Chapter 1.
- Prioritise a complete chapter over a longer chapter.
- Do not cut off mid-scene.
- Do not stop during dialogue.
- End with a proper chapter ending.
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
  const partialChapter = cleanOutput(response.output_text || "");

  return Response.json(
    {
      result:
        partialChapter ||
        "Chapter generation stopped before finishing, but no partial text was returned.",
      storyState: openingStoryState,
      warning:
        "The chapter may be incomplete because the model hit the output limit."
    },
    { status: 200 }
  );
}

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter.trim()) {
      return Response.json(
        {
          result: "No chapter text was returned.",
          storyState: openingStoryState,
        },
        { status: 500 }
      );
    }

    const storyState = {
      ...openingStoryState,
      chapter: 1,
      lastMajorBeat:
        "Chapter 1 introduced the leads, central conflict, attraction and opening consequence.",
      nextRequiredConsequence:
        "Chapter 2 must directly follow the emotional and practical fallout from Chapter 1. Do not reset the characters.",
    };

    return Response.json({
      result: chapter,
      storyState,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while generating Chapter 1. The app is sulking in a corner.",
        storyState: openingStoryState,
      },
      { status: 500 }
    );
  }
}
