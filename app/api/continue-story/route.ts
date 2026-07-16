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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );
}

function listOrNone(items: string[]) {
  return items.length > 0 ? `- ${items.join("\n- ")}` : "None";
}

function getTargetChapterWords(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 4000;

  return Math.min(Math.max(Math.round(parsed), 1500), 6000);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const form = body.form || {};
    const incomingState = body.storyState || {};

    const previousChapter =
      typeof body.previousChapter === "string"
        ? body.previousChapter.trim()
        : "";

    const chapterGuidance =
      typeof body.chapterGuidance === "string"
        ? body.chapterGuidance.trim()
        : "";

    const parsedChapterNumber = Number(body.nextChapterNumber);

    const nextChapterNumber =
      Number.isFinite(parsedChapterNumber) && parsedChapterNumber > 1
        ? Math.round(parsedChapterNumber)
        : 2;

    if (!previousChapter) {
      return Response.json(
        {
          result: "No previous chapter text was provided.",
          storyState: incomingState,
          incomplete: true,
        },
        { status: 400 }
      );
    }

    const targetChapterWords = getTargetChapterWords(
      form.targetChapterWords
    );

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
      importantFacts: stringArray(savedMemory.importantFacts),
      characterDetails: stringArray(savedMemory.characterDetails),
      relationshipHistory: stringArray(
        savedMemory.relationshipHistory
      ),
      unresolvedThreads: stringArray(savedMemory.unresolvedThreads),
      pastEvents: stringArray(savedMemory.pastEvents),
      rules: stringArray(savedMemory.rules),
    };

    const savedRepetition = incomingState.repetitionReport || {};

    const repetitionReport: RepetitionReport = {
      overusedWords: stringArray(savedRepetition.overusedWords),
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

type ChapterSummary = {
  currentScene: string;
  lastEvent: string;
  emotionalState: string;
  relationshipState: string;
  immediateNextStep: string;
};

const savedSummary = incomingState.chapterSummary || {};

const chapterSummary: ChapterSummary = {
  currentScene: savedSummary.currentScene || "",
  lastEvent: savedSummary.lastEvent || "",
  emotionalState: savedSummary.emotionalState || "",
  relationshipState: savedSummary.relationshipState || "",
  immediateNextStep: savedSummary.immediateNextStep || "",
};
    
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

Write between ${targetChapterWords - 250} and ${targetChapterWords} words.

Treat this as a hard requirement.

Plan the chapter before writing.

Limit the chapter to two or three meaningful scenes.

As you approach the target length, begin resolving the current scene.

Do not start a new scene after approximately 80% of the target length.

If additional story events remain, leave them for the next chapter.

Never continue writing simply because more story exists.

A chapter that ends naturally at the target length is always better than an overlong chapter.

STYLE

Use natural contractions in narration, internal thoughts and dialogue wherever a real person would use them.

Write:
I’m, I’d, I’ll, I’ve, it’s, isn’t, wasn’t, don’t, didn’t, can’t, won’t, shouldn’t, wouldn’t, he’s, she’s, they’re, we’re.

Avoid stiff, overly formal phrasing such as:
I am, I did not, it is, he is, she is, we are, they are, cannot, would not, should not,

unless the character is deliberately speaking formally, emphasising a point, or the full form sounds more natural in that specific sentence.

Narration should sound fluent, contemporary and spoken rather than mechanically expanded.

SCENE STRUCTURE

Write each chapter as a continuous reading experience rather than a collection of disconnected scenes.

Remain in the current scene until it has naturally concluded.

Do not skip conversations, emotional reactions or important character interactions that the reader expects to witness.

Do not jump ahead simply to reach the next plot point.

Characters should react naturally to events before the story moves forward.

Every scene should have a clear beginning, development and resolution.

Only move to a new location or time when the current scene has fully played out or a transition is clearly shown on the page.

Do not rush emotional beats, arguments, intimacy or reconciliation.

Allow important moments to breathe before introducing the next conflict.

If the chapter ends in the middle of an important interaction, end naturally at that moment rather than forcing another scene.

INTIMACY SCENES

All scenes of physical intimacy MUST be detailed, graphic, filthy and erotic. They MUST be immersive, character-driven, and written moment by moment rather than summarised. Show the progression of each interaction through clear actions, believable reactions, changing emotional states, body language, dialogue, pacing, and escalating tension. Avoid vague descriptions, repetitive phrasing, euphemisms, or fade-to-black transitions. Every intimate scene should reveal character, deepen the relationship, shift the power dynamic, or create meaningful consequences for later chapters.

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
Explicit adult

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

${chapterGuidance || "No additional guidance provided."}

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

Preserve the differences between each character's narration, speech, humour, observations and emotional habits.

Do not drift into generic romance narration, interchangeable sarcasm or constant banter.

CURRENT CONTINUITY CHECKPOINT

Current scene:
${chapterSummary.currentScene || "Not yet recorded"}

Last meaningful event:
${chapterSummary.lastEvent || "Not yet recorded"}

Current emotional state:
${chapterSummary.emotionalState || "Not yet recorded"}

Current relationship state:
${chapterSummary.relationshipState || "Not yet recorded"}

Immediate logical next step:
${chapterSummary.immediateNextStep || "Continue naturally from the previous chapter"}

Treat this checkpoint as authoritative.

Continue from this exact story position unless the previous chapter clearly ended with a time or location transition.

Do not invent events, conversations, decisions, discoveries or relationship developments that have not happened.

Do not skip past the immediate next step without showing it on page.

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

CONTINUITY IS THE HIGHEST PRIORITY

This chapter is a direct continuation of the novel.

Treat every established fact, conversation, action, location, timeline, emotional development and relationship development as immutable unless the previous chapter explicitly changes it.

Continue naturally from the end of the previous chapter.

Do not invent conversations that happened off-page.

Do not invent relationship progress.

Do not invent emotional breakthroughs.

Do not invent new conflicts.

Do not skip important scenes.

Do not skip hours or days unless the previous chapter clearly ends with a time transition.

Do not move to a new location unless the previous chapter naturally leaves the current one.

If the previous chapter ends in the middle of a conversation, continue that conversation.

If the previous chapter ends during a scene, continue that scene.

Continuity is always more important than creativity.

PREVIOUS CHAPTER

${previousChapter}

CONTINUATION JOB

Write the next chapter as a direct continuation of the previous one.

Build naturally from the final scene without repeating established information.

Continue existing conversations, emotional developments and unresolved situations before introducing anything new.

Carry forward every established fact including names, ages, jobs, relationships, injuries, promises, secrets, locations and knowledge.

Characters must remember what has already happened and behave consistently with previous chapters.

Build on emotional progress.

Never reset attraction, trust, conflict, intimacy or vulnerability.

Choose the most believable next development rather than a familiar romance trope or dramatic twist.

Finish existing scenes before beginning new ones.

Every scene must advance the characters, relationship, conflict or plot.

Deepen existing threads before creating new ones.

Do not introduce random illnesses, accidents, scandals, blackmail, family emergencies, custody disputes, villains or external drama unless they have already been established or arise naturally from previous events.

Dialogue must sound unique to each speaker.

Humour must arise from personality and situation rather than default sarcasm.

Internal thoughts should reveal new decisions, fears, desires or realisations instead of repeating what the reader already knows.

Use precise, character-specific physical and emotional reactions.

Avoid repetitive body language, stock emotional responses, therapy language, purple prose and over-explained descriptions.

This novel is Explicit Adult.

Intimacy should always develop naturally from the relationship and emotional state of the characters.

Never summarise or skip important relationship developments.

Maintain realistic pacing throughout.

Use British punctuation rules.

Never use em dashes or en dashes.

End the chapter with a completed scene and a meaningful emotional, relational or plot development that naturally leads into the following chapter.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-5.6-terra",
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: prompt,
      max_output_tokens: 16000,
      background: true,
      store: true,
    });

    return Response.json({
      jobId: response.id,
      status: response.status,
      nextChapterNumber,
    });
  } catch (error) {
    console.error("CONTINUE STORY ERROR:", error);

    return Response.json(
      {
        result:
          error instanceof Error
            ? `Continue error: ${error.message}`
            : "Unknown continue error.",
        incomplete: true,
      },
      { status: 500 }
    );
  }
}
