import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_MODEL = "gpt-image-2";
const BACKGROUND_CHECK_MODEL = "gpt-5-mini";

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
  if (/hockey|ice|rink|coach|player/.test(source)) {
    return "Use an empty ice rink or atmospheric locker-room setting, ice reflections, cool arena lights, subtle skate marks and unbranded hockey equipment.";
  }
  if (/football|quarterback|touchdown|college sport/.test(source)) {
    return "Use an empty floodlit football field or atmospheric locker-room setting, turf texture, stadium haze and unbranded football equipment.";
  }
  if (/baseball|pitcher|catcher/.test(source)) {
    return "Use an empty floodlit baseball diamond or dugout setting with dust, stadium haze and unbranded baseball equipment.";
  }
  if (/motorcycle|biker|mc romance/.test(source)) {
    return "Use a rain-darkened workshop or night road setting with chrome reflections, smoke, worn leather texture and an unbranded motorcycle detail.";
  }
  if (/vampire|paranormal|gothic/.test(source)) {
    return "Use an elegant nocturnal gothic interior or rain-darkened street with moonlight, candle glow, mist, glass and deep jewel-toned shadows.";
  }
  return "Build a sophisticated romance still life from locations and symbolic objects clearly supported by the supplied blurb and tropes. Use tactile surfaces, practical lights and editorial prop styling.";
}

async function backgroundHasWriting(openai: OpenAI, imageDataUrl: string): Promise<boolean> {
  const response = await openai.responses.create({
    model: BACKGROUND_CHECK_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Inspect this advertising background plate. Reply with exactly REJECT if you can see any word, letter, number, logo, watermark, sign, label, scoreboard, jersey number, book cover, screen writing, fake typography or glyph-like gibberish anywhere. Reply with exactly PASS only if none of those appear. Ordinary unmarked sports equipment and environmental objects are allowed.",
          },
          { type: "input_image", image_url: imageDataUrl, detail: "low" },
        ],
      },
    ],
    max_output_tokens: 16,
  });
  return response.output_text.trim().toUpperCase() !== "PASS";
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
    const prompt = [
      "Create a premium photorealistic environmental background plate for a commercial romance book advertisement.",
      "The result must be environmental artwork only. Do not create an advertisement, poster, book cover, e-reader, tablet, phone, layout, frame, card, badge or user interface.",
      "ABSOLUTELY NO PEOPLE: no faces, bodies, silhouettes, hands, skin, reflections of people or human-shaped shadows.",
      "ABSOLUTELY NO WRITING: no words, letters, numbers, glyphs, logos, watermarks, signs, labels, scoreboards, jersey numbers, book spines, screens, fake typography or text-like marks. All props must be completely unbranded and unmarked.",
      "Use cinematic practical lighting, strong contrast, controlled bright jewel-tone accents, haze, subtle particles, reflections, tactile surfaces and believable depth. Avoid muddy brown colour grading.",
      "Keep the darkest value near black. Use no more than two vivid accent-light colours and one restrained supporting light colour. The final accurate palette and typography will be added separately in code.",
      genreDirection(book.subgenre, book.tropes, book.blurb),
      compositionDirection(template, platform),
      `Subgenre: ${book.subgenre || "romance"}`,
      `Tropes for environmental context only: ${book.tropes.join(", ") || "romance"}`,
      `Story context: ${book.blurb}`,
      `Campaign type: ${cleanString(body.campaignType, 100)}`,
      `Requested visual direction: ${cleanString(body.visualDirection, 1200) || "Use the story context."}`,
      `Additional author direction: ${cleanString(body.instructions, 1000) || "None"}`,
      platform === "tiktok"
        ? "Compose natively for a tall 9:16 frame. Keep all important props inside the central 82 percent and extend atmosphere naturally to every edge."
        : platform === "facebook"
          ? "Compose natively for a 4:5 Facebook portrait. Use a slightly wider visual balance and keep important detail clear of the outer 7 percent safe zone."
          : "Compose natively for a 4:5 Instagram feed portrait. Use a strong mobile-first focal hierarchy and keep important detail clear of the outer 6 percent safe zone.",
    ].join("\n\n");

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

    const imageDataUrl = `data:image/jpeg;base64,${base64}`;
    if (await backgroundHasWriting(openai, imageDataUrl)) {
      return NextResponse.json(
        { error: "The generated background was rejected because it contained writing, a logo or text-like gibberish. No unsafe background was added to the poster." },
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
