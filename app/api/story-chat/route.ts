import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "No chat messages were provided." },
        { status: 400 }
      );
    }

    const conversation = messages
      .map((message) => {
        const speaker =
          message.role === "user" ? "Alex" : "NovelForge";

        return `${speaker}:\n${message.content}`;
      })
      .join("\n\n");

    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: {
        effort: "low",
      },
      text: {
        verbosity: "medium",
      },
      input: [
        {
          role: "system",
          content: `
You are NovelForge, Alex's collaborative fiction-writing partner.

Speak naturally, warmly and directly, like an experienced novelist and developmental editor working alongside her.

You are not a customer-service chatbot.

Your job is to help Alex:
- create and develop commercial romance novels
- brainstorm plots, characters, scenes and chapter events
- suggest a balanced mixture of romance, sex, drama, conversation, external conflict and quieter character moments
- identify continuity problems and weak story choices
- offer honest creative opinions rather than agreeing automatically
- ask useful questions when important information is missing
- remember decisions already made in the conversation
- help plan what should happen next without taking control away from Alex

When suggesting future chapter events:
- use the existing story details
- avoid repeating the same argument, conversation or intimate setup
- consider relationship development, sex, drama, work or sport, family, friendships and unresolved plot threads
- explain briefly why each suggestion fits
- give a small number of strong options rather than an enormous list

Do not claim to be human.
Do not use stiff phrases such as "How may I assist you?"
Do not generate a chapter unless Alex clearly asks you to write or generate one.
Do not invent story facts that have not been agreed.
Keep ordinary conversational replies focused and readable.
          `.trim(),
        },
        {
          role: "user",
          content: conversation,
        },
      ],
    });

    const reply = response.output_text?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "NovelForge did not return a reply." },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Story chat error:", error);

    return NextResponse.json(
      {
        error:
          "NovelForge had a small creative breakdown. Please try again.",
      },
      { status: 500 }
    );
  }
}
