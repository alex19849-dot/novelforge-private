import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_MODEL = "gpt-image-2";
const BACKGROUND_CHECK_MODEL = "gpt-4.1-mini";

type PosterTemplate =
  | "cinematic-quote"
  | "trope-showcase"
  | "kindle-hero"
  | "offer-promotion"
  | "modern-editorial";

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
    ? [...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      )].slice(0, maximumItems)
    : [];
}

function cleanTemplate(value: unknown): PosterTemplate {
  const template = cleanString(value, 80);
  if (
    template === "cinematic-quote" ||
    template === "trope-showcase" ||
    template === "kindle-hero" ||
    template === "offer-promotion" ||
    template === "modern-editorial"
  ) {
    return template;
  }
  return "kindle-hero";
}

function compositionDirection(template: PosterTemplate, platform: string): string {
  const tall = platform === "tiktok";
  if (template === "cinematic-quote") {
    return tall
      ? "Reserve the upper 38 percent as a calm, very dark, low-detail field for a large quote. Build the environment through the lower half and outer edges. Leave a clear stage for a large angled e-reader from 40 to 86 percent down the frame."
      : "Reserve a calm, very dark vertical field across the left 46 percent for a large quote. Concentrate the environment and practical lighting on the right, leaving a clear stage for an angled e-reader.";
  }
  if (template === "trope-showcase") {
    return tall
      ? "Reserve the left 40 percent from 22 to 80 percent down the frame as a dark, low-detail editorial column. Concentrate props, light and depth on the right around a large e-reader stage."
      : "Reserve the left 45 percent from 20 to 78 percent down the frame as a dark, low-detail editorial column. Build the cinematic environment on the right around a large e-reader stage.";
  }
  if (template === "offer-promotion") {
    return "Reserve the left 42 percent as a strong, dark promotional field with a bright circular pool of light behind where a price will be added. Keep the right side dimensional and clear for a large angled e-reader.";
  }
  if (template === "modern-editorial") {
    return tall
      ? "Use a bold asymmetrical composition. Reserve the upper 30 percent for oversized editorial typography and a narrow dark column on the left below it. Build colour, texture and props diagonally through the right and lower frame."
      : "Use a bold asymmetrical composition. Reserve the upper 24 percent for oversized editorial typography and a narrow dark column on the left below it. Build colour, texture and props diagonally through the right side.";
  }
  return "Create a dramatic central stage for a large dimensional e-reader. Keep the top 20 percent and bottom 16 percent calm, dark and uncluttered. Frame the central stage with relevant props, haze, light and reflections without placing objects through the centre.";
}

function genreDirection(subgenre: string, tropes: string[], blurb: string): string {
  const source = `${subgenre} ${tropes.join(" ")} ${blurb}`.toLowerCase();
  if (/football|quarterback|touchdown|college sport/.test(source)) {
    return "Use an empty floodlit football field, close turf texture, stadium haze and plain unmarked football equipment. Exclude locker signage, jerseys, scoreboards, boundary lettering and screens.";
  }
  if (/baseball|pitcher|catcher/.test(source)) {
    return "Use an empty floodlit baseball diamond with infield dust, stadium haze and plain unmarked baseball equipment. Exclude dugout signage, uniforms, scoreboards and screens.";
  }
  if (/hockey|ice rink|ice hockey|goalie|puck/.test(source)) {
    return "Use an empty ice rink, clean ice reflections, cool arena haze and plain unmarked hockey equipment. Exclude locker signage, jerseys, scoreboards, rink lettering and screens.";
  }
  if (/motorcycle|biker|mc romance/.test(source)) {
    return "Use a rain-darkened workshop or night road setting with chrome reflections, smoke, worn leather texture and an unbranded motorcycle detail.";
  }
  if (/vampire|paranormal|gothic/.test(source)) {
    return "Use an elegant nocturnal gothic interior or rain-darkened street with moonlight, candle glow, mist, glass and deep jewel-toned shadows.";
  }
  return "Build a sophisticated cinematic romance still life using abstract light, glass, fabric, flowers and atmospheric architectural depth. Every object must be blank, unmarked and free of writing.";
}

function campaignDirection(campaignType: string): string {
  const source = campaignType.toLowerCase();
  if (/sale|offer|99|free|price|promotion/.test(source)) {
    return "Create energetic promotional lighting with one clean circular glow area, but do not render a price, currency symbol, badge or label.";
  }
  if (/quote/.test(source)) {
    return "Create an emotionally dramatic, restrained setting with a generous calm shadow area for typography that will be added later.";
  }
  if (/trope/.test(source)) {
    return "Create editorial rhythm using light, depth and a few separated unmarked props, leaving a calm column for typography that will be added later.";
  }
  return "Create a polished hero environment with cinematic depth and generous calm areas for typography that will be added later.";
}

type BackgroundCheck = {
  decision: "pass" | "reject";
  reason: string;
};

async function inspectBackground(openai: OpenAI, imageDataUrl: string): Promise<BackgroundCheck> {
  const response = await openai.responses.create({
    model: BACKGROUND_CHECK_MODEL,
    text: {
      format: {
        type: "json_schema",
        name: "background_inspection",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            decision: { type: "string", enum: ["pass", "reject"] },
            reason: { type: "string" },
          },
          required: ["decision", "reason"],
        },
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Inspect only the environmental background. Reject it only for clearly readable writing or numbers, a recognizable logo or watermark, or an obvious deliberate cluster of fake typographic glyphs. Pass natural seams, stitching, scratches, reflections, bokeh, foliage, surface texture and ambiguous incidental marks. Explain the specific visible reason briefly.",
          },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    max_output_tokens: 300,
  });

  if (!response.output_text?.trim()) {
    throw new Error("The background inspection returned no result.");
  }

  const parsed = JSON.parse(response.output_text) as Partial<BackgroundCheck>;
  if (
    (parsed.decision !== "pass" && parsed.decision !== "reject") ||
    typeof parsed.reason !== "string"
  ) {
    throw new Error("The background inspection returned an invalid result.");
  }

  return { decision: parsed.decision, reason: parsed.reason };
}

async function generateBackground(openai: OpenAI, prompt: string): Promise<string> {
  const image = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: "1024x1536",
    quality: "medium",
    output_format: "jpeg",
    output_compression: 88,
  });
  const base64 = image.data?.[0]?.b64_json;
  if (!base64) throw new Error("The image model returned no background artwork.");
  return `data:image/jpeg;base64,${base64}`;
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
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

    if (!book.title || !book.blurb || !["facebook", "instagram", "tiktok"].includes(platform)) {
      return NextResponse.json({ error: "Valid book data and platform are required." }, { status: 400 });
    }

    const template = cleanTemplate(body.template);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const visualPrompt = [
      "Create a premium photorealistic environmental background plate for a commercial romance book advertisement.",
      "Show only an empty cinematic environment with tasteful story-relevant props around the edges. Every visible surface and prop is plain, blank and unbranded.",
      "Keep the scene completely unpopulated, including reflections and shadows. Reserve clean negative space for a real cover and accurate typography that will be added later in code.",
      "The finished plate contains no readable marks, symbols, signage, displays, packaging, printed material or decorative glyph patterns.",
      "Use cinematic practical lighting, strong contrast, controlled bright jewel-tone accents, haze, subtle particles, reflections, tactile surfaces and believable depth. Avoid muddy brown colour grading.",
      "Keep the darkest value near black. Use no more than two vivid accent-light colours and one restrained supporting light colour. The final accurate palette and typography will be added separately in code.",
      genreDirection(book.subgenre, book.tropes, book.blurb),
      campaignDirection(cleanString(body.campaignType, 100)),
      compositionDirection(template, platform),
      "Do not visualize, quote, spell or imitate any source wording. Do not place decorative marks that resemble characters. The source material has already been converted into the visual directions above and must not appear in the image.",
      platform === "tiktok"
        ? "Compose natively for a tall 9:16 frame. Keep all important props inside the central 82 percent and extend atmosphere naturally to every edge."
        : platform === "facebook"
          ? "Compose natively for a 4:5 Facebook portrait. Use a slightly wider visual balance and keep important detail clear of the outer 7 percent safe zone."
          : "Compose natively for a 4:5 Instagram feed portrait. Use a strong mobile-first focal hierarchy and keep important detail clear of the outer 6 percent safe zone.",
    ].join("\n\n");

    const imageDataUrl = await generateBackground(openai, visualPrompt);
    const inspection = await inspectBackground(openai, imageDataUrl);

    if (inspection.decision === "reject") {
      return NextResponse.json(
        {
          error: "The generated background failed the visible-writing safety check. No unsafe background was added.",
          reason: inspection.reason,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ imageDataUrl, model: IMAGE_MODEL, checked: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The promotional background could not be created." },
      { status: 500 },
    );
  }
}
