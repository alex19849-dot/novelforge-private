import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const SOCIAL_MODEL = "gpt-5.6-terra";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type SocialPlatform = "facebook" | "instagram" | "tiktok";

type CampaignRequest = {
  book?: unknown;
  campaignType?: unknown;
  platforms?: unknown;
  quote?: unknown;
  instructions?: unknown;
};

type GeneratedPost = {
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  visualDirection: string;
};

function cleanString(value: unknown, maximumLength = 5000): string {
  return typeof value === "string"
    ? value.trim().slice(0, maximumLength)
    : "";
}

function cleanStringArray(value: unknown, maximumItems = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maximumItems)
    : [];
}

function cleanPlatforms(value: unknown): SocialPlatform[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value)].filter(
    (item): item is SocialPlatform =>
      item === "facebook" || item === "instagram" || item === "tiktok",
  );
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(withoutFence);
}

function validatePosts(
  value: unknown,
  requestedPlatforms: SocialPlatform[],
): GeneratedPost[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The social writer returned invalid campaign data.");
  }

  const rawPosts = (value as Record<string, unknown>).posts;

  if (!Array.isArray(rawPosts)) {
    throw new Error("The social writer returned no platform posts.");
  }

  const posts = rawPosts
    .filter(
      (post): post is Record<string, unknown> =>
        Boolean(post) && typeof post === "object" && !Array.isArray(post),
    )
    .map((post) => {
      const platform = cleanString(post.platform).toLowerCase();

      if (
        platform !== "facebook" &&
        platform !== "instagram" &&
        platform !== "tiktok"
      ) {
        throw new Error("The social writer returned an unknown platform.");
      }

      return {
        platform,
        title: cleanString(post.title, 300),
        caption: cleanString(post.caption, 6000),
        hashtags: cleanStringArray(post.hashtags, 10).map((tag) =>
          tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`,
        ),
        visualDirection: cleanString(post.visualDirection, 1500),
      } satisfies GeneratedPost;
    });

  for (const platform of requestedPlatforms) {
    if (!posts.some((post) => post.platform === platform)) {
      throw new Error(`The social writer omitted the ${platform} post.`);
    }
  }

  return posts.filter((post) => requestedPlatforms.includes(post.platform));
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as CampaignRequest;
    const bookValue =
      body.book && typeof body.book === "object" && !Array.isArray(body.book)
        ? (body.book as Record<string, unknown>)
        : {};
    const platforms = cleanPlatforms(body.platforms);
    const campaignType = cleanString(body.campaignType, 100);
    const quote = cleanString(body.quote, 1000);
    const instructions = cleanString(body.instructions, 1500);
    const book = {
      title: cleanString(bookValue.title, 300),
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 6000),
      tropes: cleanStringArray(bookValue.tropes),
      heat: cleanString(bookValue.heat, 20),
      ending: cleanString(bookValue.ending, 100),
      contentWarnings: cleanStringArray(bookValue.contentWarnings),
      kindleUnlimited: bookValue.kindleUnlimited === true,
      amazonUrl: cleanString(bookValue.amazonUrl, 1000),
    };

    if (!book.title || !book.blurb || !campaignType || platforms.length === 0) {
      return NextResponse.json(
        { error: "A book, campaign type and at least one platform are required." },
        { status: 400 },
      );
    }

    if (campaignType === "quote-post" && !quote) {
      return NextResponse.json(
        { error: "Paste a genuine quote before creating a quote campaign." },
        { status: 400 },
      );
    }

    const prompt = [
      "Create polished organic social media promotion for an adult MM romance author.",
      "Return valid JSON only. Do not use markdown fences.",
      "Required shape: {\"posts\":[{\"platform\":\"facebook|instagram|tiktok\",\"title\":\"...\",\"caption\":\"...\",\"hashtags\":[\"#Example\"],\"visualDirection\":\"...\"}]}",
      "Create exactly one post for each requested platform and no others.",
      "Write platform-specific versions, not the same caption copied three times.",
      "Facebook may use a fuller sales-focused caption and 5 to 8 relevant hashtags.",
      "Instagram should be concise, visually led and use exactly 5 relevant hashtags.",
      "TikTok needs a strong searchable title, a keyword-rich natural description and exactly 5 relevant hashtags.",
      "Do not use the author name or book title as hashtags. Do not invent awards, rankings, reviews, reader reactions, plot events, character details or quotations.",
      "Never call an older book a new release. Backlist revival must use a genuinely fresh angle without false urgency.",
      "Keep the copy emotionally compelling, modern and specific. Avoid corporate language, generic hype, fake questions, engagement bait and repetitive hooks.",
      "The material may be described as high heat or explicit adult MM romance, but keep social copy and visual direction suitable for mainstream platform feeds.",
      "Never use an em dash or en dash.",
      `Campaign type: ${campaignType}`,
      `Requested platforms: ${platforms.join(", ")}`,
      `Book data: ${JSON.stringify(book)}`,
      `Approved genuine quote: ${quote || "No quote supplied. Do not create one."}`,
      `Author instructions: ${instructions || "No additional instructions."}`,
      "The visualDirection describes one practical promotional graphic, carousel or short video concept using the real cover. Do not claim that an image has already been created.",
    ].join("\n\n");

    const response = await openai.responses.create({
      model: SOCIAL_MODEL,
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: [
        {
          role: "system",
          content:
            "You are NovelForge Social Studio. Create accurate, distinctive book marketing from supplied facts only. Return strict JSON and no commentary.",
        },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 6000,
    });

    if (!response.output_text?.trim()) {
      throw new Error("The social writer returned an empty response.");
    }

    const posts = validatePosts(extractJson(response.output_text), platforms);

    return NextResponse.json({ posts });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The social campaign could not be generated.",
      },
      { status: 500 },
    );
  }
}
