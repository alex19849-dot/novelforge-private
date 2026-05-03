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

Writing quality rules:
- Write like polished commercial romance fiction.
- Make it emotionally grounded and human.
- Avoid AI-sounding phrases, melodrama, clichés and therapy-speak.
- Use natural dialogue with subtext.
- Use strong scene setting and sensory detail without purple prose.
- Keep character voices distinct.
- Honour the selected POV exactly.
- Do not rush the romance.
- Do not reveal every secret immediately.
- Chapter 1 should hook the reader and end with a reason to continue.
- Target length: 4,000 to 6,000 words.
- Use UK spelling unless the setting clearly requires otherwise.

Story inputs:

Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Tropes: ${body.tropes}
Tone: ${body.tone}
Heat Level: ${body.heat}
POV: ${body.pov}
Ending Style: ${body.ending}
Book Length: ${body.length}

Character 1:
Name: ${body.c1Name}
Age: ${body.c1Age}
Appearance: ${body.c1Appearance}
Job / Role: ${body.c1Job}
Personality: ${body.c1Personality}
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
Pacing: ${body.pacing}
Plot Intensity: ${body.intensity}

Important:
If the subgenre is Sports Romance and Subgenre Detail is a specific sport, keep that sport consistent.
For example, if Subgenre Detail is Ice hockey, do not change it to wrestling, football, rugby or another sport.
If POV is first person dual POV, use a clear chapter structure with one POV character for Chapter 1, or clearly labelled sections if switching POV.
Now write Chapter 1 only.
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
