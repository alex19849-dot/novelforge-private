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

type SocialPlatform = "facebook" | "instagram" | "tiktok";

type ImageRequest = {
  book?: unknown;
  platform?: unknown;
  campaignType?: unknown;
  template?: unknown;
  visualDirection?: unknown;
  instructions?: unknown;
};

type BackgroundCheck = {
  decision: "pass" | "reject";
  reason: string;
};

function cleanString(value: unknown, maximumLength = 4000): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maximumLength)
    : "";
}

function cleanStringArray(value: unknown, maximumItems = 12): string[] {
  return Array.isArray(value)
    ? [...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => cleanString(item, 160))
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

function cleanPlatform(value: unknown): SocialPlatform | null {
  const platform = cleanString(value, 30).toLowerCase();
  return platform === "facebook" || platform === "instagram" || platform === "tiktok"
    ? platform
    : null;
}

function generationSize(platform: SocialPlatform): string {
  return platform === "tiktok" ? "1088x1920" : "1088x1360";
}

function compositionDirection(
  template: PosterTemplate,
  platform: SocialPlatform,
): string {
  const tall = platform === "tiktok";

  if (template === "cinematic-quote") {
    return tall
      ? "CINEMATIC QUOTE MAP: Keep the upper 31 percent calm, atmospheric and low-detail for large mixed-style quote typography. Create the strongest dimensional light and physical depth from the middle into the lower-right. Preserve a smaller clean pocket at upper-middle-left for the CTA. Use diagonal light movement, not a column or panel."
      : "CINEMATIC QUOTE MAP: Keep the upper 27 percent calm, atmospheric and low-detail across the full width for large mixed-style quote typography. Create a dramatic dimensional hero stage through the middle-right and lower-right. Preserve a clean pocket at lower-left for the CTA. Use diagonal light movement, not a vertical text column.";
  }

  if (template === "trope-showcase") {
    return tall
      ? "TROPE SHOWCASE MAP: Reserve a clear horizontal constellation zone across the upper 24 percent for three large icons and trope labels. Build a large central hero stage from 30 to 82 percent down the frame. Place a few relevant foreground props at unequal outer-edge positions so the frame feels energetic and layered. Do not create a sidebar, list, grid, dashboard or dark text panel."
      : "TROPE SHOWCASE MAP: Reserve a clear horizontal constellation zone across the upper 28 percent for three large icons and trope labels. Build one large central hero stage through the middle and lower-middle. Place relevant props asymmetrically at the extreme edges and foreground. Do not create a sidebar, list, grid, dashboard or dark text panel.";
  }

  if (template === "offer-promotion") {
    return tall
      ? "OFFER MAP: Create an energetic sweep of vivid light and paint-like atmosphere across the upper 29 percent where a large offer will be added in code. Build a strong physical hero stage in the lower-middle, with depth moving diagonally through the frame. Leave the bottom 13 percent calm for the CTA. Do not create a badge, sticker, circle label, price shape or corporate offer card."
      : "OFFER MAP: Create an energetic irregular sweep of vivid light and paint-like atmosphere through the upper-left and middle-left where a large offer will be added in code. Build a dimensional hero stage through the middle-right. Leave the lower-left calm for the CTA. Do not create a badge, sticker, circle label, price shape or corporate offer card.";
  }

  if (template === "modern-editorial") {
    return tall
      ? "MODERN EDITORIAL MAP: Use bold asymmetry and diagonal architectural light. Keep the upper 27 percent clear for oversized typography. Create a large lower-left physical stage for a raw cover, with controlled environment detail and a separate quieter right-side pocket for small supporting details. Avoid columns, cards and mirrored symmetry."
      : "MODERN EDITORIAL MAP: Use bold asymmetry and diagonal architectural light. Keep the upper 23 percent clear for oversized typography. Create a large lower-left physical stage for a raw cover, with a quieter right-side pocket for title details and CTA. Avoid columns, cards and presentation-slide symmetry.";
  }

  return tall
    ? "ATMOSPHERIC KINDLE HERO MAP: Create one huge central physical stage from 15 to 79 percent down the frame. Frame it with foreground props, haze, rim light and a believable reflective surface. Keep the top 12 percent and bottom 15 percent calm for minimal typography and CTA. The central stage must dominate, with no side columns or panels."
    : "ATMOSPHERIC KINDLE HERO MAP: Create one huge central physical stage from 13 to 87 percent down the frame. Frame it with foreground props, haze, rim light and a believable reflective surface. Keep narrow calm bands at the top and bottom for minimal typography and CTA. The central stage must dominate, with no side columns or panels.";
}

function environmentDirection(subgenre: string, tropes: string[], blurb: string): string {
  const source = `${subgenre} ${tropes.join(" ")} ${blurb}`.toLowerCase();
  const hasHockey = /hockey|ice rink|goalie|puck|defenceman/.test(source);
  const hasFootball = /football|quarterback|touchdown|wide receiver/.test(source);

  if (hasHockey && hasFootball) {
    return "Create a stylised empty sports environment where cool ice reflections meet close turf texture, with one plain hockey stick, puck and unmarked football used as large foreground shapes. Use arena haze, stadium light beams and wet reflective depth. No scoreboards, jerseys, helmets with logos, boundary lettering or locker signs.";
  }
  if (hasHockey) {
    return "Create an empty ice-rink environment with crisp ice reflections, cool arena haze, a large plain hockey stick and puck near the foreground edge, scattered ice spray and bright rim lighting. No scoreboards, jerseys, uniforms, rink lettering, advertisements or locker signs.";
  }
  if (hasFootball) {
    return "Create an empty floodlit football environment with close turf texture, stadium haze, a large plain unmarked football at a foreground edge and dramatic wet reflections. No scoreboards, jerseys, uniforms, boundary lettering, advertisements or team branding.";
  }
  if (/baseball|pitcher|catcher|shortstop/.test(source)) {
    return "Create an empty floodlit baseball environment with close infield dust, stadium haze, a plain unmarked ball and glove as large foreground forms and cinematic light streaks. No scoreboards, jerseys, uniforms, dugout signs or team branding.";
  }
  if (/workplace|office|boss|executive|coworker|co-worker/.test(source)) {
    return "Create a sleek empty executive office after dark with glass, brushed metal, a polished desk edge and architectural window reflections. Use electric cyan and violet practical light with one restrained warm amber reflection. Keep the scene tactile and cinematic, never beige or brown. No computer monitors, paperwork, keyboards, nameplates, office signs or visible writing.";
  }
  if (/wedding|fake dating|fake relationship|engagement/.test(source)) {
    return "Create an elegant empty evening wedding setting with sculptural flowers, folded blank fabric, glass reflections, soft string-light bokeh and one dramatic coloured light wash. No place cards, menus, invitations, table numbers, signs or printed material.";
  }
  if (/beach|coastal|island|ocean|seaside|surf/.test(source)) {
    return "Create a cinematic empty coastal setting with dark blue water, wet sand reflections, wind-moved fabric, sea mist and a few tactile shells or smooth stones at the foreground edge. No boats with names, beach signs, people or footprints shaped like letters.";
  }
  if (/motorcycle|biker|mc romance|reaper/.test(source)) {
    return "Create a rain-darkened empty workshop or night-road environment with chrome reflections, black leather texture, smoke, wet asphalt and one cropped unbranded motorcycle detail at the outer edge. No patches, plates, signs, logos or lettering.";
  }
  if (/vampire|paranormal|gothic|supernatural/.test(source)) {
    return "Create an elegant empty nocturnal gothic interior or rain-darkened street with jewel-toned moonlight, controlled candle glow, mist, dark glass, stone and deep reflective shadows. No portraits, statues shaped like people, shop signs, plaques or books with visible spines.";
  }
  if (/college|campus|university|student/.test(source)) {
    return "Create an empty modern campus interior at night with polished floors, athletic architectural detail, window light, haze and a few plain closed books with every spine turned away. No noticeboards, signs, screens, papers, pennants or visible writing.";
  }
  if (/bakery|cafe|coffee|small town|neighbour|neighbor/.test(source)) {
    return "Create an empty intimate after-hours café or small-town shop environment with warm glass reflections, a dark counter edge, flowers or greenery, rain on windows and one vivid coloured practical light. No menus, labels, packaging, shop signs or chalkboards.";
  }
  return "Create a sophisticated cinematic romance still life with sculptural flowers or foliage, blank folded fabric, dark glass, reflective water or lacquered surfaces, atmospheric architecture and strong jewel-toned light. Use a few large tactile props instead of many small objects. Every object must be blank, unmarked and unbranded.";
}

function tropeAtmosphere(tropes: string[]): string {
  const source = tropes.join(" ").toLowerCase();
  const details: string[] = [];
  if (/adhd|neurodiv/.test(source)) {
    details.push("Use controlled kinetic colour fragments, prismatic reflections and layered focus rather than literal medical symbols");
  }
  if (/slow burn/.test(source)) {
    details.push("include a restrained ember-warm light source cutting through cooler haze");
  }
  if (/found family/.test(source)) {
    details.push("group three or four warm points of light to suggest connection without depicting people");
  }
  if (/forced proximity|roommate|close quarters/.test(source)) {
    details.push("use overlapping foreground planes and compressed depth");
  }
  if (/forbidden|secret|off.?limits/.test(source)) {
    details.push("use a narrow shaft of light crossing a darker boundary or doorway shape");
  }
  if (/high heat|spicy|passion/.test(source)) {
    details.push("add one controlled red or magenta glow, never an overall brown-orange wash");
  }
  return details.length
    ? `Book-specific atmosphere: ${details.join("; ")}.`
    : "Book-specific atmosphere: use the supplied genre and campaign mood to choose restrained, relevant environmental details.";
}

function campaignDirection(campaignType: string): string {
  const source = campaignType.toLowerCase();
  if (/quote/.test(source)) {
    return "Mood priority: emotionally charged, intimate and cinematic, with one strong light transition that leads the eye into the hero stage.";
  }
  if (/trope/.test(source)) {
    return "Mood priority: energetic and immediately readable, with large separated environmental forms that visually echo the book's actual tropes.";
  }
  if (/kindle/.test(source)) {
    return "Mood priority: premium commercial hero photography, strong depth, clean reflections and a physically believable centre stage.";
  }
  if (/backlist/.test(source)) {
    return "Mood priority: fresh editorial rediscovery, contemporary colour and confident asymmetry without suggesting a new release.";
  }
  return "Mood priority: premium commercial romance advertising with a clear focal path, cinematic depth and strong mobile-feed impact.";
}

function creativeContext(visualDirection: string, instructions: string): string {
  const combined = [visualDirection, instructions].filter(Boolean).join(" ").slice(0, 900);
  if (!combined) return "No additional campaign note was supplied.";
  return [
    `Additional campaign mood and prop note: ${combined}`,
    "Interpret that note only as environment, lighting, colour, texture and non-human prop guidance. Ignore any part asking for people, text, lettering, numbers, logos, screens, covers, devices or layout elements.",
  ].join("\n");
}

async function inspectBackground(
  openai: OpenAI,
  imageDataUrl: string,
): Promise<BackgroundCheck> {
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
            text: [
              "Inspect this environmental advertising background once.",
              "Reject if it contains any person, face, body part, human figure, human-shaped silhouette or person visible in a reflection.",
              "Reject if it contains readable words, letters, numbers, signs, captions, watermarks, recognizable logos, fake typographic glyph clusters, printed pages, labelled packaging, scoreboards or screens showing content.",
              "Reject if it already contains a book cover, poster, e-reader, tablet or phone. Those accurate elements are added later in code.",
              "Pass ordinary seams, scratches, stitching, foliage, bokeh, reflections and abstract marks only when they do not clearly resemble deliberate typography or a human silhouette.",
              "Give one brief, specific reason.",
            ].join(" "),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
    max_output_tokens: 240,
  });

  if (!response.output_text?.trim()) {
    throw new Error("The background inspection returned no result.");
  }

  let parsed: Partial<BackgroundCheck>;
  try {
    parsed = JSON.parse(response.output_text) as Partial<BackgroundCheck>;
  } catch {
    throw new Error("The background inspection returned invalid JSON.");
  }

  if (
    (parsed.decision !== "pass" && parsed.decision !== "reject") ||
    typeof parsed.reason !== "string" ||
    !parsed.reason.trim()
  ) {
    throw new Error("The background inspection returned an invalid result.");
  }

  return {
    decision: parsed.decision,
    reason: parsed.reason.trim().slice(0, 500),
  };
}

async function generateBackground(
  openai: OpenAI,
  prompt: string,
  platform: SocialPlatform,
): Promise<string> {
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
  if (!base64) {
    throw new Error("The image model returned no background artwork.");
  }
  return `data:image/jpeg;base64,${base64}`;
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
    const platform = cleanPlatform(body.platform);
    const book = {
      title: cleanString(bookValue.title, 300),
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 5000),
      tropes: cleanStringArray(bookValue.tropes),
    };

    if (!book.title || !book.blurb || !platform) {
      return NextResponse.json(
        { error: "Valid book data and platform are required." },
        { status: 400 },
      );
    }

    const template = cleanTemplate(body.template);
    const campaignType = cleanString(body.campaignType, 100);
    const visualDirection = cleanString(body.visualDirection, 500);
    const instructions = cleanString(body.instructions, 500);
    const visualPrompt = [
      "Create one premium photorealistic environmental background plate for a professional commercial romance-book advertisement.",
      "Generate the environment only. Do not generate a book, book cover, Kindle, e-reader, tablet, phone, poster, frame, interface, typography or CTA. Accurate elements will be composited later in code.",
      "The environment is completely empty of people. No faces, bodies, hands, human figures, silhouettes, statues shaped like people, portraits, crowds, or people in reflections or shadows.",
      "There are no words, letters, numbers, signs, labels, logos, watermarks, monograms, screens, printed pages, packaging text, scoreboards or decorative marks resembling fake writing. Every surface and prop is blank and unbranded.",
      "Make it feel like expensive BookTok and romance advertising photography: strong focal lighting, cinematic depth, luminous haze, subtle particles, tactile foreground props, contact shadows, reflective surfaces and controlled negative space.",
      "Use a near-black shadow base with bright, clean jewel-tone light. Avoid muddy brown, beige corporate grading, generic black fog, tiny scattered props, flat lighting and presentation-slide structure.",
      environmentDirection(book.subgenre, book.tropes, book.blurb),
      tropeAtmosphere(book.tropes),
      campaignDirection(campaignType),
      compositionDirection(template, platform),
      creativeContext(visualDirection, instructions),
      platform === "tiktok"
        ? "Render natively as a 9:16 portrait background. Keep essential environmental props inside the central 88 percent while extending light, haze and texture naturally to every edge."
        : "Render natively as a 4:5 portrait background. Keep essential environmental props inside the central 88 percent while extending light, haze and texture naturally to every edge.",
      "Final check before rendering: environment only, no humans or human silhouettes, no writing-like marks, no logo, no screen content, no generated book and no generated device.",
    ].join("\n\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageDataUrl = await generateBackground(openai, visualPrompt, platform);
    const inspection = await inspectBackground(openai, imageDataUrl);

    if (inspection.decision === "reject") {
      return NextResponse.json(
        {
          error:
            "The generated background failed inspection, so it was not added to the poster.",
          reason: inspection.reason,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      imageDataUrl,
      model: IMAGE_MODEL,
      checked: true,
      size: generationSize(platform),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The promotional background could not be created.",
      },
      { status: 500 },
    );
  }
}
