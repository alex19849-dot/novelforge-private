import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
Create a rich romance story bible.

Relationship Type: ${body.relationship}
Heat Level: ${body.heat}
Story Title: ${body.title}
Plot Idea: ${body.plot}

Write:

1. Premise
2. Character 1
3. Character 2
4. Relationship Dynamic
5. Main Conflict
6. Emotional Arc
7. Story Promise
`;

  const response = await openai.responses.create({
    model: "gpt-5",
    input: prompt,
  });

  return Response.json({
    result: response.output_text,
  });
}
