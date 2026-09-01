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

const CASTING_PROFILES = [
  "very tall with broad shoulders, a close-cropped hair outline and a heavy athletic silhouette",
  "slightly shorter with a lean runner's build, loose wavy hair and a narrow silhouette",
  "tall and powerfully stocky with a short curly hair outline and thick forearms",
  "long-limbed with swimmer's shoulders, a neat undercut outline and an upright stance",
  "medium height with a solid muscular build, swept-back hair and a relaxed stance",
  "compact and athletic with straight cropped hair and a sharply defined silhouette",
  "very tall and broad-chested with a buzz-cut outline and a guarded stance",
  "lean and muscular with tied-back shoulder-length hair and an open stance",
  "sturdy and athletic with short wavy hair and a strong squared silhouette",
  "tall and wiry with collar-length hair and a slightly restless stance",
] as const;

function stableTitleNumber(value: string): number {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }

  return result;
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

    const castingNumber = stableTitleNumber(book.title.toLowerCase());
    const firstCastingIndex = castingNumber % CASTING_PROFILES.length;
    let secondCastingIndex =
      (castingNumber * 7 + 3) % CASTING_PROFILES.length;

    if (secondCastingIndex === firstCastingIndex) {
      secondCastingIndex = (secondCastingIndex + 1) % CASTING_PROFILES.length;
    }

    const firstCasting = CASTING_PROFILES[firstCastingIndex];
    const secondCasting = CASTING_PROFILES[secondCastingIndex];

    const prompt = [
      "Create premium cinematic environmental artwork for an adult MM romance book promotion.",
      "The characters are fictional adult men aged twenty-one or older.",
      "Show exactly two fully clothed adult male silhouettes as secondary elements within the setting. They must be backlit, rim-lit or in deep shadow with no visible facial features, eyes, noses, mouths or realistic skin detail.",
      "Do not generate portrait faces, close-up faces, handsome catalogue models or photorealistic facial detail. The atmosphere and story setting are the hero, not the men's faces.",
      "The two silhouettes must be clearly different in height, build, hair outline, clothing outline, stance and body language. Never make them twins, clones or mirrored duplicates.",
      `Silhouette one: ${firstCasting}.`,
      `Silhouette two: ${secondCasting}.`,
      "Keep both figures tasteful and graphic. Their attraction should come through distance, tension, posture and lighting rather than kissing or visible facial expressions.",
      "Keep the image sensual, atmospheric and suitable for a mainstream social media feed. No nudity, explicit sexual action or fetish imagery.",
      "Do not add any words, letters, typography, logos, watermarks, book covers, product mockups or UI elements. NovelForge will add the real book cover and accurate text afterwards.",
      "Do not imitate a living artist, celebrity or identifiable public figure.",
      "Use strong composition, believable anatomy, natural masculine styling, dramatic lighting and enough uncluttered negative space for a cover and promotional hook.",
      `Book title for context only: ${book.title}`,
      `Subgenre: ${book.subgenre}`,
      `Tropes: ${book.tropes.join(", ")}`,
      `Blurb: ${book.blurb}`,
      `Campaign type: ${cleanString(body.campaignType, 100)}`,
      `Campaign visual concept: ${cleanString(body.visualDirection, 1200)}`,
      `Additional author direction: ${cleanString(body.instructions, 1000) || "None"}`,
      platform === "tiktok"
        ? "Compose for a tall 9:16 vertical frame. Keep both men together in the upper-left and middle-left area. Leave the right side calm and uncluttered for the real book cover. Keep faces away from interface zones."
        : "Compose for a portrait 4:5 post. Keep both men clearly visible within the left half of the frame. Leave the right half atmospheric and uncluttered for the real book cover. Do not place either face behind the right-side negative space.",
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
