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
  visualDirection?: unknown;
  instructions?: unknown;
};

function cleanString(value: unknown, maximumLength = 4000): string {
  return typeof value === "string"
    ? value.trim().slice(0, maximumLength)
    : "";
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

    const prompt = [
      "Create a premium cinematic background image for an adult MM romance book promotion.",
      "The characters are fictional adult men aged twenty-one or older.",
      "Keep the image sensual, atmospheric and suitable for a mainstream social media feed. No nudity, explicit sexual action or fetish imagery.",
      "Do not add any words, letters, typography, logos, watermarks, book covers, product mockups or UI elements. NovelForge will add the real book cover and accurate text afterwards.",
      "Do not imitate a living artist, celebrity or identifiable public figure.",
      "Use strong composition, believable anatomy, natural masculine styling, realistic lighting and enough uncluttered negative space for a cover and promotional hook.",
      `Book title for context only: ${book.title}`,
      `Subgenre: ${book.subgenre}`,
      `Tropes: ${book.tropes.join(", ")}`,
      `Blurb: ${book.blurb}`,
      `Campaign type: ${cleanString(body.campaignType, 100)}`,
      `Campaign visual concept: ${cleanString(body.visualDirection, 1200)}`,
      `Additional author direction: ${cleanString(body.instructions, 1000) || "None"}`,
      platform === "tiktok"
        ? "Compose for a tall 9:16 vertical video frame. Keep important faces and details away from the bottom and right-side interface zones."
        : "Compose for a portrait 4:5 social media post with a clear central focal point.",
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
