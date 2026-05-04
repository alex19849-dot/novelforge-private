import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
You are NovelForge, a private romance novel generation engine.

Your job:
Create a hidden story bible, hidden chapter plan, then write ONLY Chapter 1.

Do not show:
- story bible
- outline
- planning notes
- bullet points
- analysis
- spoilers

Only return the finished Chapter 1 prose.

Safety rules:
- All characters must be 18+.
- Do not sexualise minors.
- Do not include illegal sexual content.
- Explicit adult content is allowed only between consenting adults.
- Do not include incest.
- Do not frame coercion or abuse as romantic.
- If a user-selected setup risks unsafe content, age up characters and make the relationship legal, consensual and adult.
Length discipline:
- If Book Length is Novella, Chapter 1 must be 900 to 1,500 words.
- If Book Length is Short Novel, Chapter 1 must be 1,800 to 2,800 words.
- If Book Length is Long Novel, Chapter 1 must be 2,800 to 4,000 words.
- Do not exceed the selected range.
- End after one strong hook or emotional turn.
- Do not over-expand scenes.
Story controls:
Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Locale / Language Flavour: ${body.locale}
Regional Voice: ${body.regionVoice}
Writing Style: ${body.voiceStyle}
Dialogue Style: ${body.dialogueStyle}
Prose Density: ${body.proseDensity}
Burn Pacing: ${body.burnPacing}
Chapter Opener: ${body.chapterOpener}
Age Bracket: ${body.ageBracket}
Avoid Style: ${body.avoidStyle}
Real-World Grounding: ${body.grounding}
Tropes: ${body.tropes}
Tone: ${body.tone}
Heat Level: ${body.heat}
POV: ${body.pov}
Ending Style: ${body.ending}
Book Length: ${body.length}
Plot Intensity: ${body.intensity}

Character 1:
Name: ${body.c1Name}
Age: ${body.c1Age}
Appearance: ${body.c1Appearance}
Job / Role: ${body.c1Job}
Personality: ${body.c1Personality}
Speech Quirks: ${body.c1Speech}
Flaws: ${body.c1Flaws}
Biggest Desire: ${body.c1Desire}
Biggest Fear: ${body.c1Fear}
Secret: ${body.c1Secret}
Extra Notes: ${body.c1CustomNotes}

Character 2:
Name: ${body.c2Name}
Age: ${body.c2Age}
Appearance: ${body.c2Appearance}
Job / Role: ${body.c2Job}
Personality: ${body.c2Personality}
Speech Quirks: ${body.c2Speech}
Flaws: ${body.c2Flaws}
Biggest Desire: ${body.c2Desire}
Biggest Fear: ${body.c2Fear}
Secret: ${body.c2Secret}
Extra Notes: ${body.c2CustomNotes}

Plot:
Setting: ${body.setting}
Optional Plot Notes: ${body.plot}
Main Conflict: ${body.conflict}
What Keeps Them Apart: ${body.keepsApart}
Must-Have Scenes: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}

Write a strong Chapter 1 that feels like real commercial romance fiction.
Hook the reader.
Keep voices distinct.
End with a reason to continue.
Do not write the whole book.
Write Chapter 1 only.
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
          "Something went wrong while generating the chapter. The app has thrown its toys out of the pram.",
      },
      { status: 500 }
    );
  }
}
