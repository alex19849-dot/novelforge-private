import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
Rewrite this chapter using the requested rewrite instruction.

Rules:
- Keep the same plot events.
- Keep the same characters.
- Improve the writing quality.
- Do not use em dashes.
- Remove obvious AI-style phrasing.
- Avoid repeated "Like..." and "As if..." sentence patterns.
- Keep dialogue natural.
- Keep the prose grounded and commercial.
- Do not add spoilers or planning notes.
- Return only the rewritten chapter.

Rewrite instruction:
${body.instruction}

Original chapter:
${body.chapter}
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
        result: "Rewrite failed. The gremlin tripped over the keyboard.",
      },
      { status: 500 }
    );
  }
}
