import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_MODEL = "gpt-image-2";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ImageRequest = {
  book?: unknown;
  platform?: unknown;
  campaignType?: unknown;
  template?: unknown;
  visualDirection?: unknown;
  instructions?: unknown;
};

function cleanString(value: unknown, maximumLength = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function cleanStringArray(value: unknown, maximumItems = 12): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maximumItems)
    : [];
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as ImageRequest;
    const bookValue =
      body.book && typeof body.book === "object" && !Array.isArray(body.book)
        ? (body.book as Record<string, unknown>)
        : {};
    const platform = cleanString(body.platform, 30).toLowerCase();
    const book = {
      title: cleanString(bookValue.title, 300),
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 5000),
      tropes: cleanStringArray(bookValue.tropes),
    };

    if (
      !book.title ||
      !book.blurb ||
      (platform !== "facebook" &&
        platform !== "instagram" &&
        platform !== "tiktok")
    ) {
      return NextResponse.json(
        { error: "Valid book data and platform are required." },
        { status: 400 },
      );
    }

    const template = cleanString(body.template, 100);
    const layoutDirection =
      template === "cinematic-quote"
        ? "Keep the upper 45 percent calm, dark and uncluttered for a large quote. Concentrate the strongest environmental detail around the lower corners and outer edges."
        : template === "trope-showcase"
          ? "Leave a clean dark vertical area down the left 42 percent for four large trope lines. Place the strongest lighting, dimensional props and visual energy on the right half, with room for a large angled Kindle mockup."
          : "Create a dramatic central stage with a reflective foreground and contextual props around the outer edges. Leave the central middle area open for a large Kindle mockup and the top area clean for a bold headline.";

    const prompt = [
      "Create a premium cinematic background plate for a modern commercial MM romance book advertisement.",
      "This must look like high-end BookTok and romance advertising artwork, never a corporate flyer, website template, presentation slide or dashboard.",
      "Create a photorealistic editorial still life using story-specific locations, sporting equipment and symbolic props inferred from the supplied tropes and blurb. Use only props that genuinely fit this book.",
      "Use vivid jewel-tone lighting, strong contrast, practical stadium or environmental lights, atmospheric haze, subtle particles, reflections and real depth. Select two or three harmonious bright accent colours such as electric blue, hot magenta, teal, violet or warm gold.",
      "Do not generate any people, men, women, faces, bodies, silhouettes, hands or human figures. The environment, lighting and objects are the entire image.",
      "Do not add any words, letters, typography, logos, watermarks, book covers, product mockups or UI elements. NovelForge will add the real book cover and accurate text afterwards.",
      "Do not imitate a living artist, celebrity or identifiable public figure.",
      "Keep important visual detail away from the reserved text and cover zones. Make the frame feel deliberately art-directed even before typography is added.",
      layoutDirection,
      `Book title for context only: ${book.title}`,
      `Subgenre: ${book.subgenre}`,
      `Tropes: ${book.tropes.join(", ")}`,
      `Blurb: ${book.blurb}`,
      `Campaign type: ${cleanString(body.campaignType, 100)}`,
      `Campaign visual concept: ${cleanString(body.visualDirection, 1200)}`,
      `Additional author direction: ${cleanString(body.instructions, 1000) || "None"}`,
      platform === "tiktok"
        ? "Compose for a tall 9:16 vertical frame with strong detail extending naturally to every edge."
        : "Compose for a portrait 4:5 social post with strong detail extending naturally to every edge.",
    ].join("\n\n");

    const image = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 85,
    });
    const base64 = image.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error("The image model returned no finished image.");
    }

    return NextResponse.json({
      imageDataUrl: `data:image/jpeg;base64,${base64}`,
      model: IMAGE_MODEL,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The promotional image could not be created.",
      },
      { status: 500 },
    );
  }
}
