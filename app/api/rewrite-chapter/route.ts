import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const chapter = body.chapter;
  const instruction = body.instruction;

  const prompt = `
You are NovelForge, a romance chapter rewriting engine.

Rewrite the chapter according to the user's instruction.

User rewrite instruction:
${instruction}

Original chapter:
${chapter}

Rewrite rules:
- Keep the same core events unless the user asks otherwise.
- Keep continuity intact.
- Improve the prose without making it sound artificial.
- Use natural dialogue with subtext.
- Keep character voices distinct.
- Avoid purple prose.
- Avoid therapy-speak.
- Avoid over-explaining emotions.
- Do not use em dashes.
- Do not make the chapter longer unless the user specifically asks.
- If the chapter is too long, tighten it.
- Aim for a cleaner, sharper, more readable chapter.
- Return only the rewritten chapter prose.
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
          "Something went wrong while rewriting the chapter. The rewrite goblin tripped over itself.",
      },
      { status: 500 }
    );
  }
}
