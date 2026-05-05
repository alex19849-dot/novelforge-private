import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const chapter = body.chapter;
  const instruction = body.instruction;

  const prompt = `
You are NovelForge, a strict romance fiction rewrite editor.

Rewrite the chapter according to the user's instruction.

USER REWRITE INSTRUCTION:
${instruction}

ORIGINAL CHAPTER:
${chapter}

REWRITE RULES:
- Return only the rewritten chapter prose.
- Keep the same core events unless the user specifically asks otherwise.
- Keep continuity intact.
- Do not introduce new major plot facts unless requested.
- Do not accidentally change who said what.
- Do not swap character memories, secrets, injuries, or emotional beats.
- If rewriting dialogue, make sure every reply logically answers the previous line.
- Remove fake profound lines that sound nice but do not make sense.
- Fix impossible physical actions.
- Fix awkward or unclear phrasing.
- Tighten bloated scenes.
- Do not make the chapter longer unless the user specifically asks.
- If the chapter feels too long, shorten it.
- Keep character voices distinct.
- Use natural dialogue with subtext.
- Do not use therapy-speak.
- Do not over-explain emotions.
- Avoid purple prose.
- Avoid stacked similes.
- Avoid poetic object descriptions.
- Do not use em dashes.
- Do not use long dash interruptions.
- Keep the prose grounded, readable and human.

SPECIFIC THINGS TO CATCH:
- If a line was clearly spoken by one character, do not later attribute it to another.
- If a sentence is pretty but meaningless, replace it with something plain and emotionally accurate.
- If a physical action is impossible, rewrite it naturally.
- If a line sounds like AI trying to be deep, cut or simplify it.
- If the user asks for more enemies-to-lovers tension, increase friction, resistance, rivalry, distrust or pride.
- If the user asks for shorter, cut repetition, internal waffle and overextended description first.
`;

  try {
   const response = await openai.responses.create({
  model: "gpt-5",
  reasoning: { effort: "low" },
  text: { verbosity: "low" },
  input: prompt,
  max_output_tokens: 8000,
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
