import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const chapter = body.chapter;
  const instruction = body.instruction;

  const prompt = `
You are NovelForge, a strict human-style romance rewrite editor.

Rewrite the chapter according to the user's instruction.

Return only the rewritten chapter prose. No notes. No bullet points. No commentary.

USER REWRITE INSTRUCTION:
${instruction}

ORIGINAL CHAPTER:
${chapter}

CORE REWRITE RULES:
- Keep the same core events unless the user specifically asks otherwise.
- Do not introduce new major plot facts unless requested.
- Do not accidentally change who said what.
- Do not swap character memories, secrets, injuries, or emotional beats.
- Keep character voices distinct.
- Keep continuity intact.
- Do not make the chapter longer unless the user specifically asks.
- If the chapter feels too long, tighten it.

LOGIC EDIT:
Fix:
- dialogue that does not logically answer the previous line
- pretty-but-meaningless lines
- fake profound sentences
- impossible physical actions
- unclear pronouns
- confusing emotional beats
- repeated lines or repeated imagery
- mid-sentence or unfinished endings

STYLE EDIT:
- Use natural commercial romance prose.
- Use natural dialogue with subtext.
- Avoid therapy-speak.
- Avoid over-explaining emotions.
- Avoid purple prose.
- Avoid stacked similes.
- Avoid poetic object descriptions.
- Do not use em dashes.
- Do not use long dash interruptions.
- Avoid over-polished banter.
- Avoid body-part clichés.
- Avoid “electric touch”, “storm in his eyes”, “second heartbeat”, “his breath hitched”, unless rare and genuinely needed.
- Keep prose grounded, readable and human.

TROPE EDIT:
If the user asks for stronger enemies-to-lovers:
- Increase friction, rivalry, resentment, distrust, pride, or emotional defence.
- Make any softness feel reluctant, unwanted, or resisted.
- Remove anything that makes them feel too couple-like too early.
- Attraction should feel inconvenient, irritating, or unwanted.
- Do not let a kiss, touch, or vulnerable moment solve the conflict.

If the user asks for tighter pacing:
- Cut repetition first.
- Cut over-explained inner thoughts.
- Cut decorative description.
- End earlier with a cleaner hook.

If the user asks for more natural dialogue:
- Make replies shorter.
- Add deflection, interruption, silence, sarcasm, or avoidance where appropriate.
- Do not make characters explain exactly how they feel.

ENDING RULE:
- The rewritten chapter must end on a complete sentence.
- Never stop mid-thought, mid-dialogue, or mid-paragraph.
- If the chapter is too long, end the scene earlier with a clean hook.
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
