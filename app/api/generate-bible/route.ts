import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
You are creating a detailed romance novel story bible.

Rules:
- All characters must be 18+.
- Keep the story legal, consensual and adult-safe.
- Make it feel human, emotionally grounded and commercially readable.
- Avoid cheesy AI-sounding prose.
- Do not write the actual novel yet.
- Create a planning document that can guide a full-length story.

Story Setup:
Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Tropes: ${body.tropes}
Tone: ${body.tone}
Heat Level: ${body.heat}
POV: ${body.pov}
Ending: ${body.ending}
Length: ${body.length}

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

Plot:
Setting: ${body.setting}
Basic Plot Idea: ${body.plot}
Main Conflict: ${body.conflict}
What Keeps Them Apart: ${body.keepsApart}
Must-Have Scene: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}

Return the story bible with these headings:

1. Core Premise
2. Reader Promise
3. Genre and Tone Rules
4. Character 1 Full Profile
5. Character 2 Full Profile
6. Chemistry and Relationship Dynamic
7. Main Conflict Engine
8. Emotional Arc
9. External Plot Arc
10. Intimacy and Heat Guidelines
11. Setting and Atmosphere
12. Side Character Suggestions
13. Continuity Rules
14. Things To Avoid
15. Chapter Direction Summary
`;

  const response = await openai.responses.create({
    model: "gpt-5",
    input: prompt,
  });

  return Response.json({
    result: response.output_text,
  });
}
