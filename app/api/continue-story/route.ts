import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form;
  const previousChapter = body.previousChapter;
  const nextChapterNumber = body.nextChapterNumber;

  const prompt = `
You are NovelForge, a private romance novel continuation engine.

Write ONLY Chapter ${nextChapterNumber}.

Do not include:
- story bible
- outline
- notes
- analysis
- bullet points
- spoilers

Safety rules:
- All characters must be 18+.
- Do not sexualise minors.
- Do not include illegal sexual content.
- Explicit adult content is allowed only between consenting adults.
- Do not include incest.
- Do not frame coercion or abuse as romantic.

Story controls:
Title: ${form.title}
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Locale / Language Flavour: ${form.locale}
Regional Voice: ${form.regionVoice}
Writing Style: ${form.voiceStyle}
Dialogue Style: ${form.dialogueStyle}
Prose Density: ${form.proseDensity}
Burn Pacing: ${form.burnPacing}
Age Bracket: ${form.ageBracket}
Avoid Style: ${form.avoidStyle}
Real-World Grounding: ${form.grounding}
Tropes: ${form.tropes}
Tone: ${form.tone}
Heat Level: ${form.heat}
POV: ${form.pov}
Ending Style: ${form.ending}
Book Length: ${form.length}
Plot Intensity: ${form.intensity}

Character 1:
Name: ${form.c1Name}
Age: ${form.c1Age}
Appearance: ${form.c1Appearance}
Job / Role: ${form.c1Job}
Personality: ${form.c1Personality}
Speech Quirks: ${form.c1Speech}
Flaws: ${form.c1Flaws}
Biggest Desire: ${form.c1Desire}
Biggest Fear: ${form.c1Fear}
Secret: ${form.c1Secret}
Extra Notes: ${form.c1CustomNotes}

Character 2:
Name: ${form.c2Name}
Age: ${form.c2Age}
Appearance: ${form.c2Appearance}
Job / Role: ${form.c2Job}
Personality: ${form.c2Personality}
Speech Quirks: ${form.c2Speech}
Flaws: ${form.c2Flaws}
Biggest Desire: ${form.c2Desire}
Biggest Fear: ${form.c2Fear}
Secret: ${form.c2Secret}
Extra Notes: ${form.c2CustomNotes}

Plot:
Setting: ${form.setting}
Optional Plot Notes: ${form.plot}
Main Conflict: ${form.conflict}
What Keeps Them Apart: ${form.keepsApart}
Must-Have Scenes: ${form.mustHave}
Must-Not-Have: ${form.mustNotHave}

Previous chapters:
${previousChapter}

Length discipline:
- If Book Length is Novella, this chapter must be 900 to 1,500 words.
- If Book Length is Short Novel, this chapter must be 1,800 to 2,800 words.
- If Book Length is Long Novel, this chapter must be 2,800 to 4,000 words.
- Do not exceed the selected range.
- Keep the chapter focused.
- End after one strong hook, reveal, tension beat, or emotional turn.

Writing rules:
- Continue naturally from the previous chapter.
- Keep continuity accurate.
- Keep character voices distinct.
- Do not rush the romance.
- Do not resolve the main conflict too early.
- Use natural dialogue with subtext.
- Avoid purple prose, therapy-speak and over-explaining emotions.
- Do not use em dashes.
- Do not overuse similes or repeated sentence openings.
- Write polished commercial romance fiction that feels human and grounded.

Return only Chapter ${nextChapterNumber} prose.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    return Response.json({
      result: response.output_text,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while continuing the story. The app is sulking in a corner.",
      },
      { status: 500 }
    );
  }
}
