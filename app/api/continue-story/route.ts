import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getMaxTokens(length: string) {
  if (String(length).includes("Short Novel")) return 8000;
  if (String(length).includes("Long Novel")) return 11000;
  return 6500;
}

function getWordTarget(length: string) {
  if (String(length).includes("Short Novel")) return "1500 to 2200 words";
  if (String(length).includes("Long Novel")) return "1800 to 2500 words";
  return "1200 to 1800 words";
}

function getBibleLength(bible: any, form: any) {
  return bible?.storyDNA?.length || form?.length || "Novella";
}

function getChapterRoadmapEntry(bible: any, chapterNumber: number) {
  return (
    bible?.chapterRoadmap?.find(
      (entry: any) => Number(entry.chapter) === Number(chapterNumber)
    ) || null
  );
}

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form || {};
  const bible = body.bible || body.storyState?.bible || null;
  const previousChapter = body.previousChapter || "";
  const nextChapterNumber = body.nextChapterNumber || 1;
  const incomingState = body.storyState || {};
  const chapterGuidance = body.chapterGuidance || "";

  const length = getBibleLength(bible, form);
  const maxTokens = getMaxTokens(length);
  const wordTarget = getWordTarget(length);

  const roadmapEntry = getChapterRoadmapEntry(bible, nextChapterNumber);
  const targetChapters = bible?.chapterRoadmap?.length || incomingState.targetChapters || 10;

  const isEpilogue = nextChapterNumber > targetChapters;
  const chapterLabel = isEpilogue ? "Epilogue" : "Chapter " + nextChapterNumber;

  const updatedStoryState = {
    ...incomingState,
    bible,
    chapter: nextChapterNumber,
    targetChapters,
    currentRoadmapEntry: roadmapEntry,
    lastMajorBeat:
      roadmapEntry?.summary || "Chapter " + nextChapterNumber + " continued the story.",
    nextRequiredConsequence:
      "Chapter " +
      (nextChapterNumber + 1) +
      " must continue directly from Chapter " +
      nextChapterNumber +
      " without resetting continuity.",
    shouldWriteEpilogue: nextChapterNumber === targetChapters,
    epilogueWritten: isEpilogue,
  };

  const prompt = [
    "You are NovelForge.",
    "",
    "Write " + chapterLabel + " of a commercial adult romance novel.",
    "",
    "Return only polished chapter prose.",
    "Do not include notes.",
    "Do not include analysis.",
    "Do not include JSON.",
    "Do not include markdown.",
    "",
    "The output must begin exactly with:",
    "",
    chapterLabel,
    "POV_NAME",
    "",
    "Replace POV_NAME with the correct point-of-view character name in uppercase.",
    "",
    "STORY BIBLE:",
    bible ? JSON.stringify(bible, null, 2) : "No story bible provided.",
    "",
    "USER STORY INPUT:",
    form.plot || "No story idea provided.",
    "",
    "USER CHARACTER NOTES:",
    form.characterNotes || "No character notes provided.",
    "",
    "USER MUST AVOID:",
    form.mustNotHave || "Nothing specific provided.",
    "",
    "CHAPTER GUIDANCE:",
    chapterGuidance || "None provided.",
    "",
    "CURRENT STORY STATE:",
    JSON.stringify(updatedStoryState, null, 2),
    "",
    "ROADMAP ENTRY FOR THIS CHAPTER:",
    roadmapEntry ? JSON.stringify(roadmapEntry, null, 2) : "No roadmap entry found.",
    "",
    "PREVIOUS CHAPTERS:",
    previousChapter ||
      "No previous chapter text provided. If this is Chapter 1, begin the novel using the story bible.",
    "",
    "PRIMARY JOB:",
    "- Use the STORY BIBLE as the source of truth.",
    "- Follow the chapter roadmap entry for this chapter.",
    "- Preserve all character names, appearances, ages, roles, personalities, wounds, secrets, locations, world rules and relationship dynamics.",
    "- Do not contradict the continuity database.",
    "- Do not invent random new villains, exes, scandals, illnesses, accidents, pregnancies, custody threats or family emergencies unless already seeded in the bible.",
    "- Every chapter must advance romance, character development, mystery, external conflict, worldbuilding or intimacy.",
    "",
    "ROMANCE AND INTIMACY:",
    "- Follow the heat level and burn pacing in the story bible.",
    "- Track physical intimacy and emotional intimacy separately.",
    "- If intimacy occurs, make it character-specific and emotionally consequential.",
    "- Do not fade to black if the bible calls for explicit adult content.",
    "- All romantic and sexual content must involve adults only.",
    "",
    "STYLE:",
    "- Natural commercial romance prose.",
    "- Keep dialogue grounded and character-specific.",
    "- Avoid therapy-speak.",
    "- Avoid purple prose.",
    "- Avoid fake profound lines.",
    "- Do not use em dashes or en dashes.",
    "",
    "LENGTH:",
    "- Target " + wordTarget + ".",
    "- Write one complete chapter with a clear beginning, middle and end.",
    "- Do not cut off mid-scene.",
    "- End with an emotional beat, decision, reveal, complication, romantic turn or hook.",
  ].join("\n");

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
            ? "Continue error: " + error.message
            : "Unknown continue error.",
        storyState: incomingState,
        incomplete: true,
      },
      { status: 200 }
    );
  }
}
