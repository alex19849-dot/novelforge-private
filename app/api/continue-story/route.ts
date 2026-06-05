import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getMaxTokens(length: string) {
 if (length === "Short Novel") return 8000;
 if (length === "Long Novel") return 11000;
 return 6500;
}
function getWordTarget(length: string) {
 if (length === "Short Novel") return "1500 to 2200 words";
 if (length === "Long Novel") return "1800 to 2500 words";
 return "1200 to 1800 words";
}

function nextRelationshipStage(current: number, chapter: number) {
  if (chapter <= 2) return Math.min(current + 1, 2);
  if (chapter <= 4) return Math.min(current + 1, 4);
  if (chapter <= 6) return Math.min(current + 1, 5);
  if (chapter <= 8) return Math.min(current + 1, 6);
  return Math.min(current + 1, 8);
}

function nextPhysicalStage(current: number, form: any, chapter: number) {
  const heat = form.heat || "";
  const burn = form.burnPacing || "";

  if (heat === "Fade to black") return Math.min(current + 1, 3);

  if (heat === "Mild") {
    if (chapter <= 2) return 1;
    if (chapter <= 4) return 2;
    return 3;
  }

  if (heat === "Spicy") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 3;
    if (chapter === 4) return 4;
    if (chapter === 5) return 5;
    return 6;
  }

  if (heat === "Explicit adult" && burn === "Fast burn") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 4;
    if (chapter === 4) return 5;
    if (chapter === 5) return 6;
    return 7;
  }

  if (heat === "Explicit adult" && burn === "Medium burn") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 3;
    if (chapter === 4) return 4;
    if (chapter === 5) return 5;
    if (chapter === 6) return 6;
    return 7;
  }

  if (heat === "Explicit adult") {
    if (chapter <= 3) return 2;
    if (chapter === 4) return 3;
    if (chapter === 5) return 4;
    if (chapter === 6) return 5;
    return 6;
  }

  return Math.min(current + 1, 4);
}

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form || {};
  const previousChapter = body.previousChapter || "";
  const nextChapterNumber = body.nextChapterNumber || 2;
  const incomingState = body.storyState || {};
  const chapterGuidance = body.chapterGuidance || "";

  const length = form.length || "Novella";
  const maxTokens = getMaxTokens(length);
  const wordTarget = getWordTarget(length);

  const targetRelationshipStage = nextRelationshipStage(
    incomingState.relationshipStage || 1,
    nextChapterNumber
  );

  const targetPhysicalStage = nextPhysicalStage(
    incomingState.physicalStage || 1,
    form,
    nextChapterNumber
  );

  const targetChapters = incomingState.targetChapters || 10;

  const endingPhase =
    nextChapterNumber >= targetChapters + 1
      ? "epilogue"
      : nextChapterNumber >= targetChapters - 2
      ? "resolution-runway"
      : "middle-build";

  const shouldWriteEpilogue = nextChapterNumber === targetChapters + 1;

  const updatedStoryState = {
    ...incomingState,
    chapter: nextChapterNumber,
    relationshipStage: targetRelationshipStage,
    physicalStage: targetPhysicalStage,
    trust: Math.min((incomingState.trust || 5) + 6, 100),
    attraction: Math.min((incomingState.attraction || 20) + 8, 100),
    jealousy: Math.min((incomingState.jealousy || 0) + 4, 100),
    vulnerability: Math.min((incomingState.vulnerability || 2) + 5, 100),
    sexualTension: Math.min((incomingState.sexualTension || 20) + 8, 100),
    endingPhase,
    shouldWriteEpilogue,
    epilogueWritten: shouldWriteEpilogue ? true : incomingState.epilogueWritten || false,
    lastMajorBeat: `Chapter ${nextChapterNumber} continued the relationship, conflict and emotional consequences.`,
    nextRequiredConsequence: `Chapter ${
      nextChapterNumber + 1
    } must continue directly from Chapter ${nextChapterNumber} without resetting the characters.`,
  };

  const chapterLabel = shouldWriteEpilogue
    ? "Epilogue"
    : `Chapter ${nextChapterNumber}`;

  const prompt = `
You are NovelForge.

Continue the current commercial adult romance story.

Return only polished chapter prose.
Do not include notes.
Do not include analysis.
Do not include JSON.
Do not include markdown.

Write ${chapterLabel} only.

The output must begin exactly with:

${chapterLabel}

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

If writing an Epilogue, begin exactly with:

Epilogue

STORY IDEA:
${form.plot || "No story idea provided."}

CHARACTERS:
${form.characterNotes || "No character notes provided."}

MUST AVOID:
${form.mustNotHave || "Nothing specific provided."}

CHAPTER GUIDANCE:
${chapterGuidance || "None provided."}

CURRENT STORY STATE:
${JSON.stringify(updatedStoryState, null, 2)}

PREVIOUS CHAPTERS:
${previousChapter || "No previous chapter text provided."}

CONTINUATION JOB:
- Continue directly from the previous chapter.
- Do not restart the story.
- Do not repeat the opening setup.
- Do not reintroduce characters as if they are new.
- Carry forward the emotional fallout from the previous chapter.
- Keep all names, genders, jobs, relationships and locations consistent.
- Follow the user's chapter guidance unless it contradicts established continuity.
- Do not invent random illnesses, accidents, scandals, family emergencies, blackmail, custody threats or new villains unless already seeded.
- Do not add filler scenes just to make the chapter longer.

CHAPTER ARC:
- This is Chapter ${nextChapterNumber} of around ${targetChapters}.
- Current relationship stage: ${targetRelationshipStage}.
- Current physical stage: ${targetPhysicalStage}.
- Current ending phase: ${endingPhase}.
- If this is the middle of the book, escalate conflict, attraction, trust, vulnerability or stakes.
- If this is near the ending, start resolving the main emotional and romantic conflict.
- If this is the epilogue, give soft future-facing payoff and do not introduce new major drama.

ROMANCE PACING:
- Let the relationship evolve cumulatively.
- Do not reset attraction, trust, conflict or intimacy.
- Do not make the couple emotionally safe too quickly.
- Keep flaws, friction and uncertainty alive.
- Show attraction through specific behaviour, not generic staring.
- Include emotional intimacy as well as romantic or physical tension.
- If intimacy occurs, it must change the relationship dynamic afterwards.
- Keep all romantic and sexual content adult-only.

STYLE:
- Natural commercial romance prose.
- First person if the story is already first person.
- Preserve the established POV style and character voices.
- Keep dialogue human and grounded.
- Avoid constant banter.
- Avoid over-polished comebacks every line.
- Use short replies, interruptions, hesitation and deflection where natural.
- Keep humour character-specific.
- Avoid therapy-speak.
- Avoid purple prose.
- Avoid random object descriptions.
- Avoid over-described rooms.
- Avoid fake profound lines.
- Avoid repeated symbolic closing lines.
- Avoid repeated phrases like "his eyes darkened", "my pulse kicked", "something shifted", "his jaw tightened", "he went still".
- Do not use em dashes or en dashes. Use commas, full stops, colons or brackets instead.

REGIONAL LANGUAGE:
Use ${incomingState.regionalLanguage || form.locale || "British English"}.
Preferred terms: ${(incomingState.locationTerms || []).join(", ")}.
Forbidden terms: ${(incomingState.forbiddenTerms || []).join(", ")}.

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
  return Response.json(
    {
      result:
        "Chapter generation stopped before finishing. Nothing has been saved. Try shorter guidance or reduce the chapter length.",
      storyState: incomingState,
      incomplete: true,
    },
    { status: 200 }
  );
}

const chapter = cleanOutput(response.output_text || "");

if (!chapter.trim()) {
  return Response.json(
    {
      result: "No chapter text was returned.",
      storyState: incomingState,
      incomplete: true,
    },
    { status: 200 }
  );
}

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
    storyState: incomingState,
    incomplete: true,
  },
  { status: 200 }
);
}
}
