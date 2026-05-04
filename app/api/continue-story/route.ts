import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
You are NovelForge, a private romance continuation engine.

Write Chapter ${body.nextChapterNumber}.

Return ONLY the next chapter prose.

Story settings:
${JSON.stringify(body.form, null, 2)}

Chapter length guide:
- If Book Length is Novella, this chapter should be around 2,000 to 3,000 words.
- If Book Length is Short Novel, this chapter should be around 3,500 to 5,000 words.
- If Book Length is Long Novel, this chapter should be around 5,000 to 7,000 words.
- Do not mention the target word count.

Continuation rules:
- Continue naturally from the previous chapters.
- Keep the same characters, POV, tone, locale, voice style and burn pacing.
- Keep the selected sport, setting and subgenre consistent.
- Use natural contractions: can't, don't, isn't, it's, I've, you're, we're.
- Avoid stiff phrasing like "I cannot", "I do not", "it is", unless intentional.
- Do not use em dashes or long dash interruptions.
- Avoid purple prose, repeated similes, therapy-speak and AI-sounding phrasing.
- Keep dialogue natural and grounded.
- Do not resolve the main relationship too early.
- Do not repeat scenes from earlier chapters.
- Advance the romance, conflict and character arcs.
- End with a reason to continue.

Previous chapters:
${body.previousChapter}

Now write Chapter ${body.nextChapterNumber} only.
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
      { result: "Continue failed. The story engine had a tiny breakdown." },
      { status: 500 }
    );
  }
}
