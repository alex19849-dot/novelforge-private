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

You are an award-winning, bestselling contemporary erotic romance author whose books have won major romance writing awards and sold millions of copies worldwide. Readers praise your ability to create intense chemistry, emotional vulnerability, compelling character arcs, addictive romantic tension, and unforgettable love stories.

Your writing combines commercial appeal, emotional authenticity, sharp dialogue, strong pacing, and high reader engagement. Every chapter should feel professionally published and worthy of a top-selling romance novel.

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

STORY-SPECIFIC DNA:
This story is a long MM erotic paranormal romance set in a small town in America.

The story must be deeply relationship-focused above all else.

The romance is the story.

External threats exist only to create pressure on the relationship, never to replace it.

Avoid large wars, chosen one plots, apocalypse storylines, ancient prophecies, political vampire councils dominating the story, or mystery-driven plots.

The emotional focus should remain on the two main characters throughout the novel.

SETTING:
A small American town with a strong sense of community.

The town should feel lived-in, warm, quirky and memorable.

Vampires are not publicly known.

A small number of trusted humans are aware of their existence.

Some vampires maintain human familiars who willingly assist them and keep their secrets.

Include recurring locations such as the funeral home, the bar purchased by MC2, the local diner, hardware store, town square, cemetery, and forested outskirts.

MAIN CHARACTER ONE:
Lucian Bedford
Male vampire.
Over 400 years old.
Owns the local funeral home.
Extremely proper, gentlemanly, reserved, grumpy, protective and possessive.
Feared and respected by other vampires.
Secretly soft-hearted.
Protects the town from dangerous outsiders.
Feeds from criminals, dangerous people, and consenting lovers.
Refuses to feed from animals.
Will never admit how much he loves animals.
Owns a large shaggy Saint Bernard familiar.

MAIN CHARACTER TWO:
Reed Marshall
Male human.
35 years old.
Recently divorced from his wife.
Has relocated to town for a fresh start.
Purchases the local bar.
Easy-going, funny, warm, optimistic and sunshine.
Comfortable around people.
Naturally flirtatious without always realising it.
Emotionally intelligent.
The first person in years capable of getting under MC1's skin.

RELATIONSHIP DYNAMIC:
Grumpy / Sunshine.
Vampire / Human.
Gay awakening.
Friends to lovers.
Fast burn emotionally and physically.
High chemistry from the first meeting.
Immediate attraction, but neither man initially understands what it is.
Their connection develops through friendship, time spent together, jealousy, emotional intimacy and shared trust.

ROMANCE REQUIREMENTS:
The romance must remain active throughout the book.
Do not delay progression unnecessarily.
Include flirting, banter, sexual tension, touching, kissing, physical intimacy, domestic intimacy and emotional vulnerability.
The reader should constantly feel the relationship evolving.

JEALOUSY:
Jealousy is a major emotional engine.
The town's single women should be extremely interested in MC2.
There should be a recurring female character who has romantic interest in MC1.
MC1 never seriously pursues her.
Both main characters should experience jealousy.
Include moments where one character sees the other being flirted with, kissed, touched, or physically pursued by someone else.
The jealousy should deepen emotional investment.

ANGST:
Strong emotional angst is encouraged.
MC2 should remain unaware that MC1 is a vampire for a significant portion of the story.
Near discoveries should create tension.
The eventual reveal must feel earned.

PARANORMAL RULES:
Use traditional vampire folklore.
Vampires can be harmed or exposed by traditional weaknesses and vulnerabilities.
The supernatural elements should feel grounded, dangerous and intimate.

TONE:
Balance humour, heat, angst, tenderness, possessiveness, vulnerability, danger and intimacy.
The story should be sexy, romantic, funny, dangerous, intimate and deeply character-driven.

STYLE RULES:
Avoid repetitive modern romance dialogue patterns.
Avoid overusing:
"You good?"
"Spiritually."
"Emotionally."
"Fair."
"Jesus Christ."
"Christ."
Excessive one-word banter responses.

Avoid repetitive descriptions.
Avoid repeated references to teeth, smirks, growls, raised eyebrows, and breath catching every scene.
Create fresh imagery and varied emotional expression.

STORY SETTINGS:
Relationship type: ${relationship}
Book length: ${length}
Target chapter count: ${targetChapters}
Heat level: ${heat}
Regional language: ${regional.regionalLanguage}
Preferred terms: ${regional.locationTerms.join(", ")}
Forbidden terms: ${regional.forbiddenTerms.join(", ")}

CHAPTER 1 JOB:

* Open with a strong hook.
* Introduce the main character immediately.
* Introduce the romantic interest as early as possible.
* The romantic interest MUST appear within the first 1,000 words.
* The first meaningful interaction between the romantic leads MUST occur before the midpoint of the chapter.
* Focus on the primary romantic storyline over side characters, club politics, workplace politics, worldbuilding or secondary plots.
* Introduce only the supporting characters absolutely necessary for Chapter 1.
* Keep descriptions concise and purposeful.
* Ground the setting through action and character interaction.
* Establish the central romantic dynamic.
* Establish attraction, friction, curiosity, chemistry, tension or conflict between the leads.
* Make names, ages, jobs, genders, locations and relationships clear through natural storytelling.
* Do not reveal every secret.
* Do not solve the central conflict.
* Do not spend multiple paragraphs introducing minor characters.
* Do not spend excessive time explaining the setting before the romantic storyline begins.
* End on a clean hook, emotional turn, complication, charged moment, revelation or decision that makes the reader want Chapter 2 immediately.


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
- Write one complete chapter with a clear beginning, middle and end.
- Keep the chapter focused and do not over-expand setup, backstory, description or internal reflection.
- Reach the main emotional beat or story turn by the middle of the chapter.
- The final 20 percent of the chapter must resolve the current scene and land the chapter ending.
- Prioritise a finished chapter over length.
- If running short on space, compress description and reflection, not the ending.
- Do not cut off mid-scene.
- Do not stop during dialogue.
- Do not stop during a confrontation.
- Do not introduce a new scene, new conflict or new location near the end unless it is the final hook.
- Finish the final scene fully.
- End with a proper chapter ending: an emotional beat, decision, reveal, complication, romantic turn or hook.
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
