import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const DIRECTOR_MODEL = "gpt-6-astra";
const IMAGE_MODEL = "gpt-image-2";
const CHECK_MODEL = "gpt-5.6-terra";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SocialPlatform = "facebook" | "instagram" | "tiktok";
type CreativeOutput = "image" | "video";

type CampaignRequest = {
  book?: unknown;
  platforms?: unknown;
  instructions?: unknown;
  outputType?: unknown;
  revision?: unknown;
  previousResponseIds?: unknown;
};

type BookFacts = {
  title: string;
  author: string;
  subgenre: string;
  blurb: string;
  tropes: string[];
  kindleUnlimited: boolean;
  amazonUrl: string;
  coverUrl: string;
};

type SocialCopy = {
  title: string;
  caption: string;
  hashtags: string[];
};

type QualityCheck = {
  decision: "pass" | "review";
  summary: string;
  promptAdherence: number;
  legibility: number;
  coverFidelity: number;
};

type InspectionResult = {
  qualityCheck: QualityCheck;
  socialCopy: SocialCopy;
};

type GeneratedPost = SocialCopy & {
  platform: SocialPlatform;
  visualDirection: string;
  imageDataUrl: string;
  sourceResponseId: string;
  qualityCheck: QualityCheck;
};

function cleanString(value: unknown, maximumLength = 5000): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maximumLength)
    : "";
}

function cleanStringArray(value: unknown, maximumItems = 20): string[] {
  return Array.isArray(value)
    ? [...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => cleanString(item, 180))
          .filter(Boolean),
      )].slice(0, maximumItems)
    : [];
}

function cleanPlatforms(value: unknown): SocialPlatform[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)].filter(
    (item): item is SocialPlatform =>
      item === "facebook" || item === "instagram" || item === "tiktok",
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function platformSize(): "1024x1536" {
  return "1024x1536";
}

function outputLabel(outputType: CreativeOutput): string {
  return outputType === "video"
    ? "Create the premium key artwork for a short social video. It must also work as the opening and closing frame."
    : "Create one complete premium social-media poster.";
}

function fallbackCopy(book: BookFacts, platform: SocialPlatform): SocialCopy {
  const tags = [book.subgenre, ...book.tropes]
    .map((value) => `#${value.replace(/[^a-z0-9]+/gi, "")}`)
    .filter((value) => value.length > 1)
    .slice(0, platform === "facebook" ? 8 : 5);
  const tropeText = book.tropes.slice(0, 4).join(", ");
  const availability = book.kindleUnlimited
    ? "Available to read on Kindle Unlimited."
    : "Discover it on Amazon.";
  return {
    title: `Meet your next ${book.subgenre || "romance"} obsession`,
    caption: [
      `Looking for your next ${book.subgenre || "romance"}?`,
      `${book.title} by ${book.author}${tropeText ? ` features ${tropeText}` : ""}.`,
      availability,
      book.amazonUrl,
    ].filter(Boolean).join("\n\n"),
    hashtags: tags,
  };
}

function parseCopy(
  value: string,
  book: BookFacts,
  platform: SocialPlatform,
): SocialCopy | null {
  const fallback = fallbackCopy(book, platform);
  if (!value.trim()) return null;
  try {
    const parsed = record(JSON.parse(value));
    const caption = cleanString(parsed.caption, 5000);
    const hashtags = cleanStringArray(parsed.hashtags, 8)
      .map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/[^a-z0-9]+/gi, "")}`)
      .filter((tag) => tag.length > 1);
    if (caption.split(/\s+/).filter(Boolean).length < 45 || hashtags.length < 5) {
      return null;
    }
    return {
      title: cleanString(parsed.title, 240) || fallback.title,
      caption,
      hashtags: hashtags.slice(0, platform === "facebook" ? 8 : 5),
    };
  } catch {
    return null;
  }
}

function previousResponseId(value: unknown, platform: SocialPlatform): string {
  return cleanString(record(value)[platform], 200);
}

function posterPrompt(
  book: BookFacts,
  platform: SocialPlatform,
  outputType: CreativeOutput,
  guidance: string,
  revision: string,
): string {
  return [
    "You are creating finished commercial artwork for NovelForge, not a wireframe, dashboard, presentation slide or coded template.",
    outputLabel(outputType),
    platform === "tiktok"
      ? "The tool output will be centre-cropped from 2:3 to a final 9:16 TikTok poster. Keep every important word, face, cover and call to action inside the central 84 percent of the width. Keep important content away from interface areas near the right and bottom edges. Compose specifically for that final crop."
      : "The tool output will be centre-cropped from 2:3 to a final 4:5 Facebook or Instagram feed poster. Keep every important word, face, cover and call to action inside the central 83 percent of the height. Compose specifically for that final crop.",
    "AUTHOR CONTROL",
    "The author's guidance below is the creative brief. Each generation must be art-directed specifically for that brief and must not reuse a fixed layout.",
    "The author may request any combination of people, environments, rooms, landscapes, objects, props, devices, typography, icons, illustration, photography, collage, paint, texture, lighting or abstract graphics. Create what the guidance requests and make cohesive supporting decisions from its theme.",
    "Do not impose a gothic, sports, office, floral, dark, Kindle, trope-list or any other default style. Do not add a permanent footer, fixed icon row, standard heading position or repeated composition.",
    "Do not introduce irrelevant imagery. Every visible element must support the author's brief, the supplied cover or the verified book facts.",
    "COVER FIDELITY",
    "The supplied image is the genuine book cover. Use that exact cover as the hero. Preserve its artwork, title, author name, spelling, colours and proportions. Never redesign, rewrite, crop away or replace its contents.",
    "If the guidance requests a Kindle or device, place the genuine cover naturally inside a large realistic dimensional device with matching perspective, screen reflections, rim lighting, contact shadow and environmental integration.",
    "If no device is requested, present the genuine cover in the manner requested by the author.",
    "DESIGN STANDARD",
    "Create professional contemporary BookTok and romance advertising artwork with strong visual hierarchy, confident scale, deliberate spacing, readable typography, depth and a clear reading order.",
    "Avoid corporate cards, dashboard boxes, tiny covers, generic icon rows, rigid left columns, excessive dead space, weak detached CTAs and flat template-like arrangements unless the author explicitly asks for one of those treatments.",
    "Render requested wording clearly and accurately. Never invent a quote, price, review, award, ranking, release claim or promotion. A short original promotional hook may be created only when the author explicitly requests a hook without providing its wording, and it must be grounded in the supplied facts.",
    "Do not use em dashes or en dashes.",
    "The poster must feel like one integrated piece of finished artwork, not a background with separate items pasted on top.",
    `Verified book facts: ${JSON.stringify({
      title: book.title,
      author: book.author,
      subgenre: book.subgenre,
      blurb: book.blurb,
      tropes: book.tropes,
      kindleUnlimited: book.kindleUnlimited,
      amazonUrl: book.amazonUrl,
    })}`,
    `Author guidance: ${guidance}`,
    revision
      ? `Edit request: ${revision}. Edit the existing generated artwork. Keep everything not mentioned in this correction.`
      : "This is a fresh generation. Do not imitate a previous NovelForge poster.",
    "Use the image-generation tool now. After the image is complete, return only the requested social-copy JSON.",
  ].join("\n\n");
}

async function inspectPoster(
  imageDataUrl: string,
  book: BookFacts,
  platform: SocialPlatform,
  guidance: string,
): Promise<InspectionResult> {
  const fallback = fallbackCopy(book, platform);
  try {
    const response = await openai.responses.create({
      model: CHECK_MODEL,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "poster_quality_check",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decision: { type: "string", enum: ["pass", "review"] },
              summary: { type: "string" },
              promptAdherence: { type: "number" },
              legibility: { type: "number" },
              coverFidelity: { type: "number" },
              socialTitle: { type: "string" },
              caption: { type: "string" },
              hashtags: {
                type: "array",
                items: { type: "string" },
                maxItems: 8,
              },
            },
            required: [
              "decision",
              "summary",
              "promptAdherence",
              "legibility",
              "coverFidelity",
              "socialTitle",
              "caption",
              "hashtags",
            ],
          },
        },
      },
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Inspect this generated social poster once.",
              `Platform: ${platform}.`,
              `Author guidance: ${guidance}`,
              `Verified book facts: ${JSON.stringify({
                title: book.title,
                author: book.author,
                subgenre: book.subgenre,
                blurb: book.blurb,
                tropes: book.tropes,
                kindleUnlimited: book.kindleUnlimited,
                amazonUrl: book.amazonUrl,
              })}`,
              "The first image is the finished poster. The second image is the genuine cover reference.",
              "Check prompt adherence, wording legibility and cover fidelity. Use scores from 0 to 100.",
              "Mark review when any score is below 70. Keep the summary under 240 characters.",
              "Also write the finished social post that accompanies this artwork. Create an engaging hook title, a substantial natural caption, a clear reading call to action and strong relevant hashtags.",
              platform === "facebook"
                ? "For Facebook, write 90 to 170 words and provide 6 to 8 relevant hashtags."
                : platform === "instagram"
                  ? "For Instagram, write 70 to 140 words and provide exactly 5 strong relevant hashtags."
                  : "For TikTok, write a keyword-rich title, a lively 80 to 160 word description and exactly 5 strong relevant hashtags.",
              "Use only the verified book facts and author guidance. Do not invent quotes, prices, reviews, awards, rankings, release status or plot claims. Do not use em dashes or en dashes.",
            ].join(" "),
          },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
          { type: "input_image", image_url: book.coverUrl, detail: "high" },
        ],
      }],
      max_output_tokens: 1200,
    }, { timeout: 45_000 });
    const parsed = record(JSON.parse(response.output_text || "{}"));
    const score = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.min(100, Math.max(0, Math.round(value)))
        : 0;
    const hashtagLimit = platform === "facebook" ? 8 : 5;
    const hashtags = cleanStringArray(parsed.hashtags, hashtagLimit)
      .map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/[^a-z0-9]+/gi, "")}`)
      .filter((tag) => tag.length > 1);
    return {
      qualityCheck: {
        decision: parsed.decision === "pass" ? "pass" : "review",
        summary: cleanString(parsed.summary, 240) || "The automatic inspection could not provide a useful summary.",
        promptAdherence: score(parsed.promptAdherence),
        legibility: score(parsed.legibility),
        coverFidelity: score(parsed.coverFidelity),
      },
      socialCopy: {
        title: cleanString(parsed.socialTitle, 240) || fallback.title,
        caption: cleanString(parsed.caption, 5000) || fallback.caption,
        hashtags: hashtags.length ? hashtags : fallback.hashtags,
      },
    };
  } catch {
    return {
      qualityCheck: {
        decision: "review",
        summary: "The poster was created, but the automatic inspection could not be completed.",
        promptAdherence: 0,
        legibility: 0,
        coverFidelity: 0,
      },
      socialCopy: fallback,
    };
  }
}

async function generatePoster(
  book: BookFacts,
  platform: SocialPlatform,
  outputType: CreativeOutput,
  guidance: string,
  revision: string,
  priorResponseId: string,
): Promise<GeneratedPost> {
  const response = await openai.responses.create({
    model: DIRECTOR_MODEL,
    ...(revision && priorResponseId ? { previous_response_id: priorResponseId } : {}),
    store: true,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "social_copy",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" }, maxItems: 8 },
          },
          required: ["title", "caption", "hashtags"],
        },
      },
    },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: posterPrompt(book, platform, outputType, guidance, revision) },
        { type: "input_image", image_url: book.coverUrl, detail: "high" },
      ],
    }],
    tools: [{
      type: "image_generation",
      model: IMAGE_MODEL,
      action: revision && priorResponseId ? "edit" : "auto",
      size: platformSize(),
      quality: "medium",
      output_format: "jpeg",
      output_compression: 92,
      background: "opaque",
    }],
    tool_choice: { type: "image_generation" },
    max_output_tokens: 1400,
  }, { timeout: 240_000 });

  const imageCall = response.output.find(
    (item): item is Extract<typeof item, { type: "image_generation_call" }> =>
      item.type === "image_generation_call",
  );
  if (!imageCall?.result) {
    throw new Error("The image model returned no poster artwork.");
  }
  const imageDataUrl = `data:image/jpeg;base64,${imageCall.result}`;
  const inspection = await inspectPoster(imageDataUrl, book, platform, guidance);
  const socialCopy =
    parseCopy(response.output_text, book, platform) ?? inspection.socialCopy;
  return {
    platform,
    ...socialCopy,
    visualDirection: "Generated directly from the author's current guidance.",
    imageDataUrl,
    sourceResponseId: response.id,
    qualityCheck: inspection.qualityCheck,
  };
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }
    const body = (await request.json()) as CampaignRequest;
    const bookValue = record(body.book);
    const platforms = cleanPlatforms(body.platforms);
    const instructions = cleanString(body.instructions, 5000);
    const revision = cleanString(body.revision, 2500);
    const outputType: CreativeOutput = body.outputType === "video" ? "video" : "image";
    const book: BookFacts = {
      title: cleanString(bookValue.title, 300),
      author: cleanString(bookValue.author, 300) || "Marlow Quinn",
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 7000),
      tropes: cleanStringArray(bookValue.tropes, 20),
      kindleUnlimited: bookValue.kindleUnlimited === true,
      amazonUrl: cleanString(bookValue.amazonUrl, 1000),
      coverUrl: cleanString(bookValue.coverUrl, 3000),
    };

    if (!book.title || !book.blurb || !book.coverUrl || !platforms.length || !instructions) {
      return NextResponse.json(
        { error: "A book with its genuine cover, your guidance and at least one platform are required." },
        { status: 400 },
      );
    }

    const feedPlatform: SocialPlatform | null = platforms.includes("instagram")
      ? "instagram"
      : platforms.includes("facebook")
        ? "facebook"
        : null;
    const generationPlatforms: SocialPlatform[] = [
      ...(feedPlatform ? [feedPlatform] : []),
      ...(platforms.includes("tiktok") ? ["tiktok" as const] : []),
    ];
    const generated = await Promise.all(
      generationPlatforms.map((platform) =>
        generatePoster(
          book,
          platform,
          outputType,
          instructions,
          revision,
          previousResponseId(body.previousResponseIds, platform),
        ),
      ),
    );
    const feedPost = generated.find((post) => post.platform === feedPlatform);
    const posts = platforms.map((platform) => {
      const exact = generated.find((post) => post.platform === platform);
      if (exact) return exact;
      if ((platform === "facebook" || platform === "instagram") && feedPost) {
        return { ...feedPost, platform };
      }
      throw new Error(`The image model omitted the ${platform} poster.`);
    });

    return NextResponse.json({ posts, outputType, director: DIRECTOR_MODEL, imageModel: IMAGE_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The poster could not be generated." },
      { status: 500 },
    );
  }
}
