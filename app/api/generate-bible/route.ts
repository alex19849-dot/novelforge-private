import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
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

  const title = body.title || "Untitled";
  const storyIdea = body.plot || "";
const storyOutline = body.storyOutline || "";
const characters = body.characterNotes || "";
const supportingCharacters = body.sideCharacterNotes || "";
const mustInclude = body.mustHave || "";
const mustAvoid = body.mustNotHave || "";

 const fullInput = `
${storyIdea}

${storyOutline}

${characters}

${supportingCharacters}

${mustInclude}

${mustAvoid}
`.trim();
  const regional = detectLocale(fullInput);
  const relationship = body.relationship || detectRelationship(fullInput);
  const heat = body.heat || detectHeat(fullInput);

 const openingStoryState = {
  chapter: 1,
   title,
  relationship,
  heat,
  regionalLanguage: regional.regionalLanguage,
  locationTerms: regional.locationTerms,
  forbiddenTerms: regional.forbiddenTerms,
     voiceProfile: {
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
  povVoiceRules: [],
  characterVoices: [],
},
   repetitionReport: {
  overusedWords: [],
  repeatedPhrases: [],
  repeatedReactions: [],
  repeatedHumourPatterns: [],
  repeatedSentencePatterns: [],
  guidance: [],
},
  storyMemory: {
    importantFacts: [],
    characterDetails: [],
    relationshipHistory: [],
    unresolvedThreads: [],
    pastEvents: [],
    rules: [],
  },
};
  const prompt = `
You are NovelForge.

You are an award-winning, bestselling contemporary erotic romance author whose books have won major romance writing awards and sold millions of copies worldwide. Readers praise your ability to create intense chemistry, emotional vulnerability, compelling character arcs, addictive romantic tension, and unforgettable love stories.

Your goal is to write the strongest possible version of this specific novel.

Do not imitate a generic commercial romance voice.

Allow this novel to develop its own identity through its characters, setting, emotional tone, humour, pacing and narrative voice.

The writing should feel professionally edited, emotionally authentic and immersive, while remaining unique to this story.
Write Chapter 1 of a commercial adult romance novel.

Do not write with a target word count, chapter count or novel length in mind.

Write only what naturally belongs in this chapter.

Future chapters will continue the story until the user decides it has reached its conclusion.

Return only polished chapter prose.
Do not include notes.
Do not include analysis.
Do not include JSON.
Do not include markdown.

The chapter must begin exactly with:

Chapter 1

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

The chapter must begin exactly with:


STORY TITLE:
${title || "Untitled"}

STORY IDEA:
${storyIdea || "No story idea provided."}

STORY OUTLINE:
${storyOutline || "No story outline provided."}

MAIN CHARACTERS:
${characters || "No main character notes provided."}

SUPPORTING CHARACTERS:
${supportingCharacters || "No supporting character notes provided."}

MUST INCLUDE:
${mustInclude || "Nothing specific provided."}

MUST AVOID:
${mustAvoid || "Nothing specific provided."}

STYLE RULES

DIALOGUE

Avoid repetitive contemporary romance dialogue patterns.

Avoid overusing phrases such as:

• "You good?"
• "Fair."
• "Jesus Christ."
• "Christ."
• "Emotionally."
• "Spiritually."
• "I'm fine."
• "You're impossible."
• "You're an idiot."
• "Shut up."
• "Teeth."
• Excessive one-word responses.

Characters should have distinct voices.

Every major character should speak differently based on:

• Personality
• Age
• Education
• Social background
• Occupation
• Emotional state

No two characters should sound interchangeable.

HUMOUR

Avoid repetitive humour patterns.

Not every character should be sarcastic.

Not every character should tease in the same way.

Not every conversation should become banter.

Different characters should create humour through different methods:

• Dry observations
• Storytelling
• Self-deprecation
• Deadpan delivery
• Situational comedy
• Accidental humour
• Genuine wit

SIDE CHARACTERS

Avoid the common romance trope where everyone constantly notices the chemistry between the protagonists.

Friends should not repeatedly:

• Point out attraction.
• Comment on sexual tension.
• Suggest they are secretly in love.
• Act as relationship detectives.

Most people are focused on their own lives.

When side characters notice something, it should feel earned and occasional.

The protagonists should not feel like they are performing on a stage for an audience.

SCENE VARIETY

No duplicate scenes.

No scenes that accomplish the same emotional purpose repeatedly.

Each scene must introduce at least one of the following:

• New information
• New conflict
• Character growth
• Relationship progression
• Plot progression
• Emotional escalation

If a scene can be removed without affecting the story, it should not exist.

Avoid writing the same argument multiple times with different wording.

Avoid writing the same jealousy scene multiple times with different participants.

Avoid writing the same emotional breakthrough repeatedly.

EMOTIONAL VARIETY

Avoid repeating the same emotional beats.

Do not rely on:

• Constant jealousy
• Constant anger
• Constant sexual frustration

Create emotional range through:

• Humour
• Tenderness
• Fear
• Vulnerability
• Regret
• Hope
• Relief
• Pride
• Loneliness
• Comfort

CHARACTER REACTIONS

Avoid repetitive body language.

Do not repeatedly rely on:

• Smirks
• Raised eyebrows
• Growls
• Teeth showing
• Breath catching
• Eyes darkening
• Jaw ticking
• Rolling eyes
• Shrugging

Use fresh physical and emotional reactions that fit the individual character and moment.

INTIMACY SCENE VARIETY

Each intimate scene must serve a unique emotional purpose.

No two scenes should feel interchangeable.

Different scenes should explore different emotional states such as:

• Curiosity
• Competition
• Frustration
• Vulnerability
• Comfort
• Celebration
• Reconciliation
• Trust
• Emotional dependence
• Fear of loss

Avoid repeating the same emotional outcome after every intimate encounter.

The relationship should evolve because of these moments.

PACING

Keep the story evolving naturally.

Continue introducing meaningful conflict, emotional development, relationship evolution and plot progression for as long as the story requires.

Do not assume the story is approaching its ending because of chapter number or perceived novel length.

Allow the story to continue until the user decides it is time to end it.

OVERALL OBJECTIVE

Every chapter should feel necessary.

Every scene should feel distinct.

Every major interaction should reveal something new about the characters, the relationship, or the story.

The reader should never feel they have already read a scene simply because a similar emotion appeared earlier in the novel.

Every chapter should permanently change something, whether it is the plot, the relationship, the characters, the reader's understanding, or the world itself.

STORY SETTINGS:

Relationship:
${relationship}

Subgenre:
${body.subgenre || "Not specified"}

Subgenre Detail:
${body.subgenreDetail || "Not specified"}

Story Location:
${body.storyLocation || "Not specified"}

Point of View:
${body.pov || "First person, dual POV"}

Heat Level:
${heat}

Burn Pacing:
${body.burnPacing || "Medium burn"}

Ending:
${body.ending || "Happy ending"}

Voice Style:
${body.voiceStyle || "Commercial romance"}

Humour Style:
${body.humourStyle || "Mixed character-specific humour"}

Dialogue Style:
${body.dialogueStyle || "Natural / grounded"}

Prose Style:
${body.proseDensity || "Balanced"}

Chapter Opening:
${body.chapterOpener || "Character-driven"}

Regional Language:
${regional.regionalLanguage}

Preferred Terms:
${regional.locationTerms.join(", ")}

Forbidden Terms:
${regional.forbiddenTerms.join(", ")}

VOICE PROFILE

This novel must establish its own unique writing identity from Chapter 1.

Do not default to generic commercial romance writing.

The prose, dialogue, humour, pacing and emotional tone established in Chapter 1 will become the permanent Voice Profile for this novel.

Make deliberate stylistic choices that suit these specific characters and this specific story.

Allow different novels to sound noticeably different from one another.

The Voice Profile should emerge naturally through the writing rather than feeling artificially imposed.

Avoid defaulting to familiar GPT sentence rhythms, humour patterns or emotional beats simply because they are common in romance fiction.

CHAPTER 1 JOB:

* Open at the most interesting natural point for this story.
* Introduce the romantic interest whenever the story naturally creates the strongest first meeting.
* The first meaningful interaction between the romantic leads should happen early enough to engage the reader, but never feel rushed or forced.
* The romance should remain the emotional heart of the story, but allow worldbuilding, side characters and secondary plots to develop naturally when they strengthen the main story.
* Introduce supporting characters only when they naturally contribute to the story. Avoid overwhelming the reader with unnecessary introductions, but do not artificially limit the cast.
* Keep descriptions concise and purposeful.
* Make the setting feel like a real, lived-in place through natural action, dialogue, routine, atmosphere and sensory detail. The world should feel alive without overwhelming the story.
* Establish the central romantic dynamic.
* Establish attraction, friction, curiosity, chemistry, tension or conflict between the leads.
* Make names, ages, jobs, genders, locations and relationships clear through natural storytelling.
* Do not reveal every secret.
* Do not solve the central conflict.
* Do not spend multiple paragraphs introducing minor characters.
* Do not spend excessive time explaining the setting before the romantic storyline begins.
* End on a clean hook, emotional turn, complication, charged moment, revelation or decision that makes the reader want Chapter 2 immediately.


STYLE PRIORITIES, IN ORDER:

STYLE PRIORITIES

The permanent Voice Profile is the highest authority for this novel's writing style.

The Story Memory is the highest authority for continuity.

The Repetition Report identifies habits that should be reduced naturally, without replacing them with new repetitive habits.

Every sentence should achieve at least one meaningful purpose:

• Reveal character.
• Advance the relationship.
• Advance the plot.
• Increase emotional tension.
• Deepen atmosphere.
• Reveal new information.

If a sentence does none of these things, rewrite it or remove it.

Write polished, commercially published romance prose.

Dialogue should feel natural, grounded and specific to each character.

Characters should never sound interchangeable.

Avoid filler.

Avoid repeated explanations.

Avoid repeated emotional reactions.

Avoid repeated body language.

Avoid repeated sentence structures.

Internal thoughts should introduce a new realisation, decision or conflict rather than restating what the reader already knows.

Enter scenes as late as possible.

Leave scenes once their purpose has been achieved.

Show rather than tell when it strengthens the scene, but never over-describe.

Keep humour character-specific.

Avoid purple prose.

Avoid fake profound lines.

Avoid random object descriptions.

Avoid over-described rooms.

Do not use em dashes or en dashes.
Use commas, full stops, colons or brackets instead.
Physical Intimacy & Relationship Progression

Physical intimacy is an important part of romantic storytelling when it occurs. It should arise naturally from the characters, their emotional journey, and the needs of the story, never from an expected chapter number or relationship milestone. Every intimate scene should feel earned, emotionally significant, and unique to the characters involved.
When intimate scenes occur:
* Write them graphic and erotic.
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

Each intimate scene should reveal character, deepen emotional connection, create lasting consequences, or expose something new about the characters or their relationship. No intimate scene should feel interchangeable or exist only for repetition.

Physical intimacy should never feel separate from the emotional story.

# Spice Level Guidance

When the story's selected heat level allows explicit content:
* Detail intimacy fully on page.
* Show intimacy fully on-page.
* Allow scenes to be detailed and immersive.
* Use dirty talk.
* Include anticipation, build-up, physical intimacy, emotional interaction, and meaningful aftermath.
* Allow important intimacy scenes to occupy a significant portion of a chapter when appropriate.

Major romantic milestones should receive narrative weight equal to other major story events.

# Emotional Aftermath

After intimate scenes:
* Show the emotional, psychological and relational consequences.
* Let the characters react in ways that fit their personalities, history and current emotional state.
* Include conversation, humour, awkwardness, tenderness, conflict, vulnerability or quiet intimacy where appropriate.
* Physical intimacy should permanently influence future interactions, trust, confidence, desire or conflict rather than feeling isolated to a single scene.

Readers should leave intimate scenes feeling that the relationship has evolved, not simply that a physical act occurred.

# Character-Specific Intimacy

Physical intimacy should always reflect the personalities, emotional states, histories, fears, desires, and relationship dynamics of the characters involved.

No two intimate scenes should feel interchangeable.

The emotional and physical experience should feel unique to the specific characters and their stage of relationship development.


CONTINUITY RULES:
- Every established fact is canon unless the user explicitly changes it.
- Characters remember previous events, conversations, promises, conflicts, injuries, discoveries and emotional milestones unless there is a believable reason they would not.
- Never contradict an established fact in order to create drama or convenience.
- Once a fact is established, it becomes canon unless the user explicitly changes it.
- Follow the story idea and character notes above.
- Do not invent random illnesses, family emergencies, scandals, accidents, custody threats or villains unless the user seeded them.
- Do not change character genders, names, roles or relationships.
- Do not include anything from the must avoid section.

LENGTH:
- Write one complete chapter with a clear beginning, middle and end.
- Keep the chapter focused and do not over-expand setup, backstory, description or internal reflection.
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
      max_output_tokens: 10000,
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
let generatedVoiceProfile = openingStoryState.voiceProfile;
let generatedRepetitionReport = openingStoryState.repetitionReport;
let generatedStoryMemory = openingStoryState.storyMemory;
try {
  const analysisResponse = await openai.responses.create({
    model: "gpt-5.5",
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    input: `
Analyse the story details and Chapter 1 below.

Create:
1. A permanent voice profile for this specific novel.
2. A concise continuity memory for future chapters.
3. A repetition report that will help Chapter 2 avoid habits already noticeable in Chapter 1.

Return valid JSON only.
Do not include markdown.
Do not include commentary outside the JSON.

Use exactly this structure:

{
  "voiceProfile": {
    "primaryTone": "",
    "humourStyle": "",
    "narrativeStyle": "",
    "sentenceRhythm": "",
    "dialogueStyle": "",
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

VOICE PROFILE RULES

Create a permanent writing identity for this novel.

Do not describe the chapter.

Describe how future chapters should be written.

The Voice Profile should make this novel recognisably different from other novels generated by NovelForge.

Define:

• Narrative tone.
• Emotional cadence.
• Humour style.
• Dialogue rhythm.
• Sentence rhythm.
• Description style.
• Internal monologue style.
• Conflict style.
• Romantic style.

For every major POV character describe:

• Vocabulary.
• Sentence length.
• Humour style.
• Emotional openness.
• What they notice first.
• What they rarely notice.
• How they avoid vulnerability.
• How they argue.
• How they flirt.
• How they react under stress.

Avoid generic descriptions.

Avoid clichés.

Avoid describing personalities.

Describe writing behaviour instead.

Every rule should help future chapters sound more like this novel and less like every other romance novel.
STORY MEMORY RULES:

- Include only details needed for future continuity.
- Record established facts, character details, relationship developments, unresolved threads and permanent story rules.
- Do not summarise the entire chapter.
- Do not include temporary emotions unless they will affect future chapters.

REPETITION RULES:

- Only flag repetition that is noticeable enough to weaken the prose.
- Ignore necessary names, pronouns and ordinary connecting words.
- Identify repeated phrases, body language, emotional reactions, humour styles and sentence habits.
- Guidance must contain concise, practical instructions for keeping the next chapter fresh.
- Do not turn normal language into a rigid blacklist.

STORY TITLE:
${title}

STORY IDEA:
${storyIdea || "No story idea provided."}

CHARACTERS:
${characters || "No character notes provided."}

MUST AVOID:
${mustAvoid || "Nothing specific provided."}

CHAPTER 1:
${chapter}
`,
    max_output_tokens: 3500,
  });

  const analysisText = (analysisResponse.output_text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsedAnalysis = JSON.parse(analysisText);

  const parsedVoiceProfile = parsedAnalysis.voiceProfile || {};
  const parsedStoryMemory = parsedAnalysis.storyMemory || {};
  const parsedRepetitionReport = parsedAnalysis.repetitionReport || {};

  generatedVoiceProfile = {
    primaryTone: parsedVoiceProfile.primaryTone || "",
    humourStyle: parsedVoiceProfile.humourStyle || "",
    narrativeStyle: parsedVoiceProfile.narrativeStyle || "",
    sentenceRhythm: parsedVoiceProfile.sentenceRhythm || "",
    dialogueStyle: parsedVoiceProfile.dialogueStyle || "",
    emotionalTexture: parsedVoiceProfile.emotionalTexture || "",
    povVoiceRules: Array.isArray(parsedVoiceProfile.povVoiceRules)
      ? parsedVoiceProfile.povVoiceRules
      : [],
    characterVoices: Array.isArray(parsedVoiceProfile.characterVoices)
      ? parsedVoiceProfile.characterVoices
      : [],
  };

  generatedStoryMemory = {
    importantFacts: Array.isArray(parsedStoryMemory.importantFacts)
      ? parsedStoryMemory.importantFacts
      : [],
    characterDetails: Array.isArray(parsedStoryMemory.characterDetails)
      ? parsedStoryMemory.characterDetails
      : [],
    relationshipHistory: Array.isArray(parsedStoryMemory.relationshipHistory)
      ? parsedStoryMemory.relationshipHistory
      : [],
    unresolvedThreads: Array.isArray(parsedStoryMemory.unresolvedThreads)
      ? parsedStoryMemory.unresolvedThreads
      : [],
    pastEvents: Array.isArray(parsedStoryMemory.pastEvents)
      ? parsedStoryMemory.pastEvents
      : [],
    rules: Array.isArray(parsedStoryMemory.rules)
      ? parsedStoryMemory.rules
      : [],
  };

  generatedRepetitionReport = {
    overusedWords: Array.isArray(parsedRepetitionReport.overusedWords)
      ? parsedRepetitionReport.overusedWords
      : [],
    repeatedPhrases: Array.isArray(parsedRepetitionReport.repeatedPhrases)
      ? parsedRepetitionReport.repeatedPhrases
      : [],
    repeatedReactions: Array.isArray(parsedRepetitionReport.repeatedReactions)
      ? parsedRepetitionReport.repeatedReactions
      : [],
    repeatedHumourPatterns: Array.isArray(
      parsedRepetitionReport.repeatedHumourPatterns
    )
      ? parsedRepetitionReport.repeatedHumourPatterns
      : [],
    repeatedSentencePatterns: Array.isArray(
      parsedRepetitionReport.repeatedSentencePatterns
    )
      ? parsedRepetitionReport.repeatedSentencePatterns
      : [],
    guidance: Array.isArray(parsedRepetitionReport.guidance)
      ? parsedRepetitionReport.guidance
      : [],
  };
} catch (analysisError) {
  console.error("Initial story analysis failed:", analysisError);
}
const storyState = {
  ...openingStoryState,
  chapter: 1,
  voiceProfile: generatedVoiceProfile,
  repetitionReport: generatedRepetitionReport,
  storyMemory: {
    ...generatedStoryMemory,
    importantFacts: [
      ...generatedStoryMemory.importantFacts,
      "Chapter 1 has been written. Use the actual chapter text and user-provided story details as the source of truth for future continuity.",
    ],
  },
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
