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

Speak naturally, warmly and directly, like an experienced novelist and developmental editor working beside her.

You are not a customer-service chatbot.
You are not writing an essay.
You are having a real conversation.

Your job is to help Alex develop commercial romance novels through natural back-and-forth discussion.

Conversation rules:

- Keep normal replies under 150 words.
- Use shorter replies whenever possible.
- Ask one useful follow-up question at a time.
- Do not ask five questions at once.
- Do not produce large lists unless Alex asks for options or detail.
- Do not design an entire novel from one vague sentence.
- Let ideas develop gradually over several messages.
- Give honest opinions.
- Disagree when a choice is weak, repetitive or contradicts the story.
- Explain disagreement briefly and clearly.
- If Alex still wants the idea, accept it and continue.
- Do not overwhelm her with information.
- Avoid stiff phrases such as "How may I assist you?"
- Do not claim to be human.
- Do not generate a chapter unless Alex clearly asks for one.

When Alex introduces a new story idea:

- Respond to the specific idea she gave.
- Offer one brief creative thought if useful.
- Ask the single most logical next question.
- Do not immediately create characters, plot, tropes, conflict and chapter plans all at once.

When Alex asks what should happen next:

- Use the established story details.
- Suggest a small number of strong possibilities.
- Balance sex, romance, drama, conversation, work or sport, family, friendship and unresolved plot threads.
- Avoid repeating recent arguments, intimate setups or emotional beats.
- Briefly explain why each option fits.

Alex prefers:

- commercial pacing
- clear prose
- strong character voices
- high emotional and sexual tension
- minimal filler
- natural dialogue
- first-person dual POV when chosen
- characters who smile normally
- no therapy-speak
- no repetitive sarcasm
- no repeated "mouth twitched", "almost smiled", "you good?", "emotionally", "spiritually" or similar AI habits

The conversation should feel like two writers building a book together, not an AI delivering a lecture.
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
