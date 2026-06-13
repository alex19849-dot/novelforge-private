```ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getMaxTokens(length: string) {
  if (String(length).includes("Long Novel")) return 11000;
  if (String(length).includes("Short Novel")) return 8000;
  return 6500;
}

function getWordTarget(length: string) {
  if (String(length).includes("Long Novel")) return "1800 to 2500 words";
  if (String(length).includes("Short Novel")) return "1500 to 2200 words";
  return "1200 to 1800 words";
}

function getChapterRoadmapEntry(bible: any, chapterNumber: number) {
  return (
    bible?.chapterRoadmap?.find(
      (entry: any) => Number(entry.chapter) === Number(chapterNumber)
    ) || null
  );
}

function makeBibleSummary(bible: any) {
  if (!bible) return "No story bible provided.";

  const mainCharacters = (bible.mainCharacters || [])
    .map((c: any) => {
      return [
        "Name: " + (c.name || ""),
        "Age: " + (c.age || ""),
        "Role: " + (c.role || ""),
        "Species: " + (c.species || ""),
        "Appearance: " + JSON.stringify(c.appearance || {}),
        "Personality: " + (c.personality || []).join(", "),
        "Fear: " + (c.fears || []).join(", "),
        "Need: " + (c.need || ""),
        "Arc: " + (c.growthArc || ""),
        "Relationship Dynamic: " + (c.relationshipDynamic || ""),
        "Speech Style: " + (c.speechStyle || ""),
      ].join("\n");
    })
    .join("\n\n");

  const supportingCharacters = (bible.supportingCharacters || [])
    .map((c: any) => {
      return [
        "Name: " + (c.name || ""),
        "Role: " + (c.role || ""),
        "Appearance: " + (c.appearance || ""),
        "Personality: " + (c.personality || []).join(", "),
        "Story Purpose: " + (c.storyPurpose || ""),
      ].join("\n");
    })
    .join("\n\n");

  const locations = (bible.locations || [])
    .map((l: any) => {
      return [
        "Name: " + (l.name || ""),
        "Description: " + (l.description || ""),
        "Purpose: " + (l.storyPurpose || ""),
      ].join("\n");
    })
    .join("\n\n");

  return [
    "STORY DNA",
    "Title: " + (bible.storyDNA?.workingTitle || ""),
    "Genre: " + (bible.storyDNA?.genre || ""),
    "Subgenre: " + (bible.storyDNA?.subGenre || ""),
    "Length: " + (bible.storyDNA?.length || ""),
    "Heat: " + (bible.storyDNA?.heatLevel || ""),
    "Burn: " + (bible.storyDNA?.burnType || bible.storyDNA?.burnPacing || ""),
    "Theme: " + (bible.storyDNA?.coreTheme || ""),
    "Promise: " + (bible.storyDNA?.emotionalPromise || ""),
    "",
    "MAIN CHARACTERS",
    mainCharacters,
    "",
    "SUPPORTING CHARACTERS",
    supportingCharacters,
    "",
    "WORLD RULES",
    JSON.stringify(bible.worldRules?.settingRules || {}),
    JSON.stringify(bible.worldRules?.speciesRules || {}),
    JSON.stringify(bible.worldRules?.powerRules || {}),
    JSON.stringify(bible.worldRules?.weaknessRules || {}),
    JSON.stringify(bible.worldRules?.relationshipRules || {}),
    "",
    "LOCATIONS",
    locations,
  ].join("\n");
}

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form || {};
  const bible = body.bible || body.storyState?.bible || null;
  const previousChapter = body.previousChapter || "";
  const nextChapterNumber = body.nextChapterNumber || 1;
  const incomingState = body.storyState || {};
  const chapterGuidance = body.chapterGuidance || "";

  const length = bible?.storyDNA?.length || form.length || "Novella";
  const maxTokens = getMaxTokens(length);
  const wordTarget = getWordTarget(length);

  const roadmapEntry = getChapterRoadmapEntry(bible, nextChapterNumber);
  const targetChapters = bible?.chapterRoadmap?.length || incomingState.targetChapters || 10;
  const chapterLabel = "Chapter " + nextChapterNumber;

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
    shouldWriteEpilogue: nextChapterNumber >= targetChapters,
  };

  const prompt = [
    "You are NovelForge.",
    "",
    "Write the actual novel chapter prose.",
    "Do not write a story bible.",
    "Do not write JSON.",
    "Do not output character profiles.",
    "Do not output worldbuilding notes.",
    "Do not summarize the plan.",
    "",
    "Write " + chapterLabel + ".",
    "",
    "The output must begin exactly with:",
    chapterLabel,
    "POV_NAME",
    "",
    "STORY REFERENCE SUMMARY:",
    makeBibleSummary(bible),
    "",
    "ROADMAP FOR THIS CHAPTER:",
    roadmapEntry ? JSON.stringify(roadmapEntry, null, 2) : "No roadmap entry found.",
    "",
    "PREVIOUS CHAPTERS:",
    previousChapter || "No previous chapters. This is Chapter 1.",
    "",
    "USER GUIDANCE:",
    chapterGuidance || "None provided.",
    "",
    "MUST AVOID:",
    form.mustNotHave || "Nothing specific provided.",
    "",
    "CHAPTER JOB:",
    "- Write one complete chapter in prose.",
    "- Use the story reference only as background.",
    "- Follow the roadmap entry for this chapter.",
    "- Open with an immediate scene, action, dialogue, tension, or emotional hook.",
    "- Do not explain the bible.",
    "- Do not list facts.",
    "- Do not include JSON.",
    "- Do not include bullet points.",
    "- Do not include notes.",
    "- Do not include analysis.",
    "- Keep character names, appearances, world rules, secrets and locations consistent.",
    "- Advance romance, conflict, mystery, intimacy, character development, or worldbuilding.",
    "",
    "ROMANCE AND INTIMACY:",
    "- Follow the heat level and burn pacing.",
    "- If intimacy occurs, write it as adult romantic prose.",
    "- Do not fade to black when explicit content is expected.",
    "- Make intimacy emotional, character-specific and consequential.",
    "- All romantic and sexual content must involve adults only.",
    "",
    "STYLE:",
    "- Natural commercial romance prose.",
    "- Strong character voice.",
    "- Human dialogue.",
    "- Dark humour only where natural.",
    "- Avoid therapy-speak.",
    "- Avoid purple prose.",
    "- Avoid fake profound lines.",
    "- Avoid repeating the same romance beats.",
    "- Do not use em dashes or en dashes.",
    "",
    "LENGTH:",
    "- Target " + wordTarget + ".",
    "- Write a full chapter with a beginning, middle and end.",
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
            "Chapter generation stopped before finishing. Nothing has been saved.",
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
```
