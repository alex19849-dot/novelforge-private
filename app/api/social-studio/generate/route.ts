import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const SOCIAL_MODEL = "gpt-5.6-terra";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SocialPlatform = "facebook" | "instagram" | "tiktok";
type OutputType = "image" | "video";
type ElementType = "cover" | "text" | "shape" | "vector" | "particles";

type CampaignRequest = {
  book?: unknown;
  campaignType?: unknown;
  platforms?: unknown;
  quote?: unknown;
  instructions?: unknown;
  outputType?: unknown;
  revision?: unknown;
  previousPlans?: unknown;
};

type Motion = {
  enter:
    | "none"
    | "fade"
    | "slide-left"
    | "slide-right"
    | "slide-up"
    | "slide-down"
    | "zoom-in"
    | "zoom-out"
    | "rotate-in"
    | "wipe";
  enterStart: number;
  enterEnd: number;
  exit: "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down";
  exitStart: number;
  exitEnd: number;
  loop: "none" | "float" | "pulse" | "drift" | "glow" | "shimmer";
  intensity: number;
};

type Primitive = {
  kind: "line" | "ellipse" | "rect" | "polyline";
  x: number;
  y: number;
  width: number;
  height: number;
  points: number[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
};

type DesignElement = {
  id: string;
  type: ElementType;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  motion: Motion;
  text?: string;
  font?: "display" | "sans" | "accent";
  fontSize?: number;
  minimumFontSize?: number;
  weight?: number;
  colour?: string;
  align?: "left" | "center" | "right";
  uppercase?: boolean;
  lineHeight?: number;
  maxLines?: number;
  presentation?: "flat" | "floating" | "kindle";
  crop?: "contain" | "cover";
  shadow?: number;
  glow?: number;
  glowColour?: string;
  shape?: "block" | "paint" | "line" | "ellipse" | "glow" | "gradient-band";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  points?: number[];
  primitives?: Primitive[];
  particleStyle?: "dust" | "spark" | "confetti" | "bokeh";
  count?: number;
};

type DesignPlan = {
  width: number;
  height: number;
  durationSeconds: number;
  concept: string;
  background: {
    angle: number;
    colours: string[];
    vignette: number;
  };
  elements: DesignElement[];
};

type GeneratedPost = {
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  visualDirection: string;
  designPlan: DesignPlan;
};

function cleanString(value: unknown, maximumLength = 5000): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
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
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function colourValue(value: unknown, fallback: string): string {
  const colour = cleanString(value, 40);
  return /^(#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i.test(
    colour,
  )
    ? colour
    : fallback;
}

function dimensions(platform: SocialPlatform) {
  return platform === "tiktok"
    ? { width: 1080, height: 1920 }
    : { width: 1080, height: 1350 };
}

function validateMotion(value: unknown, duration: number): Motion {
  const item = record(value);
  const enter = enumValue(
    item.enter,
    [
      "none",
      "fade",
      "slide-left",
      "slide-right",
      "slide-up",
      "slide-down",
      "zoom-in",
      "zoom-out",
      "rotate-in",
      "wipe",
    ] as const,
    "fade",
  );
  const exit = enumValue(
    item.exit,
    ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"] as const,
    "none",
  );
  const loop = enumValue(
    item.loop,
    ["none", "float", "pulse", "drift", "glow", "shimmer"] as const,
    "none",
  );
  const enterStart = numberValue(item.enterStart, 0, 0, duration);
  const enterEnd = numberValue(item.enterEnd, Math.min(0.8, duration), enterStart, duration);
  const exitStart = numberValue(item.exitStart, duration, 0, duration);
  const exitEnd = numberValue(item.exitEnd, duration, exitStart, duration);
  return {
    enter,
    enterStart,
    enterEnd,
    exit,
    exitStart,
    exitEnd,
    loop,
    intensity: numberValue(item.intensity, 0.35, 0, 1),
  };
}

function validatePrimitives(value: unknown): Primitive[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((primitive) => {
    const item = record(primitive);
    return {
      kind: enumValue(item.kind, ["line", "ellipse", "rect", "polyline"] as const, "line"),
      x: numberValue(item.x, 0, 0, 100),
      y: numberValue(item.y, 0, 0, 100),
      width: numberValue(item.width, 10, 0, 100),
      height: numberValue(item.height, 10, 0, 100),
      points: Array.isArray(item.points)
        ? item.points
            .filter((point): point is number => typeof point === "number" && Number.isFinite(point))
            .slice(0, 40)
            .map((point) => numberValue(point, 0, 0, 100))
        : [],
      fill: colourValue(item.fill, "rgba(255,255,255,0)"),
      stroke: colourValue(item.stroke, "#ffffff"),
      strokeWidth: numberValue(item.strokeWidth, 3, 0, 20),
      radius: numberValue(item.radius, 0, 0, 50),
    };
  });
}

function validateElement(
  value: unknown,
  index: number,
  width: number,
  height: number,
  duration: number,
): DesignElement {
  const item = record(value);
  const type = enumValue(
    item.type,
    ["cover", "text", "shape", "vector", "particles"] as const,
    "shape",
  );
  const x = numberValue(item.x, 0, 0, width - 1);
  const y = numberValue(item.y, 0, 0, height - 1);
  const elementWidth = numberValue(item.width, 100, 1, width - x);
  const elementHeight = numberValue(item.height, 100, 1, height - y);
  const base: DesignElement = {
    id: cleanString(item.id, 80) || `element-${index + 1}`,
    type,
    layer: Math.round(numberValue(item.layer, index, 0, 100)),
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    rotation: numberValue(item.rotation, 0, -30, 30),
    opacity: numberValue(item.opacity, 1, 0, 1),
    motion: validateMotion(item.motion, duration),
  };

  if (type === "text") {
    return {
      ...base,
      text: cleanString(item.text, 600),
      font: enumValue(item.font, ["display", "sans", "accent"] as const, "sans"),
      fontSize: numberValue(item.fontSize, 64, 20, 240),
      minimumFontSize: numberValue(item.minimumFontSize, 28, 16, 160),
      weight: Math.round(numberValue(item.weight, 700, 300, 900) / 100) * 100,
      colour: colourValue(item.colour, "#ffffff"),
      align: enumValue(item.align, ["left", "center", "right"] as const, "left"),
      uppercase: item.uppercase === true,
      lineHeight: numberValue(item.lineHeight, 0.98, 0.75, 1.5),
      maxLines: Math.round(numberValue(item.maxLines, 4, 1, 10)),
    };
  }

  if (type === "cover") {
    return {
      ...base,
      presentation: enumValue(item.presentation, ["flat", "floating", "kindle"] as const, "floating"),
      crop: enumValue(item.crop, ["contain", "cover"] as const, "contain"),
      shadow: numberValue(item.shadow, 0.7, 0, 1),
      glow: numberValue(item.glow, 0.25, 0, 1),
      glowColour: colourValue(item.glowColour, "#ffffff"),
    };
  }

  if (type === "shape") {
    return {
      ...base,
      shape: enumValue(
        item.shape,
        ["block", "paint", "line", "ellipse", "glow", "gradient-band"] as const,
        "block",
      ),
      fill: colourValue(item.fill, "rgba(255,255,255,0)"),
      stroke: colourValue(item.stroke, "rgba(255,255,255,0)"),
      strokeWidth: numberValue(item.strokeWidth, 0, 0, 30),
      radius: numberValue(item.radius, 0, 0, Math.min(elementWidth, elementHeight) / 2),
      points: Array.isArray(item.points)
        ? item.points
            .filter((point): point is number => typeof point === "number" && Number.isFinite(point))
            .slice(0, 40)
        : [],
    };
  }

  if (type === "vector") {
    return { ...base, primitives: validatePrimitives(item.primitives) };
  }

  return {
    ...base,
    particleStyle: enumValue(
      item.particleStyle,
      ["dust", "spark", "confetti", "bokeh"] as const,
      "dust",
    ),
    colour: colourValue(item.colour, "#ffffff"),
    count: Math.round(numberValue(item.count, 18, 1, 80)),
  };
}

function validatePlan(value: unknown, platform: SocialPlatform, outputType: OutputType): DesignPlan {
  const item = record(value);
  const expected = dimensions(platform);
  const duration = outputType === "video" ? numberValue(item.durationSeconds, 8, 5, 15) : 0;
  const backgroundValue = record(item.background);
  const colours = cleanStringArray(backgroundValue.colours, 5)
    .map((colour) => colourValue(colour, "#090b14"))
    .slice(0, 5);
  const elements = Array.isArray(item.elements)
    ? item.elements
        .slice(0, 28)
        .map((element, index) =>
          validateElement(element, index, expected.width, expected.height, duration),
        )
        .sort((a, b) => a.layer - b.layer)
    : [];

  if (elements.filter((element) => element.type === "cover").length !== 1) {
    throw new Error(`The ${platform} design must contain exactly one cover element.`);
  }
  if (!elements.some((element) => element.type === "text" && element.text)) {
    throw new Error(`The ${platform} design contains no readable text.`);
  }

  return {
    width: expected.width,
    height: expected.height,
    durationSeconds: duration,
    concept: cleanString(item.concept, 500),
    background: {
      angle: numberValue(backgroundValue.angle, 135, 0, 360),
      colours: colours.length >= 2 ? colours : ["#070910", "#13182b", "#090b14"],
      vignette: numberValue(backgroundValue.vignette, 0.5, 0, 1),
    },
    elements,
  };
}

function validatePosts(
  value: unknown,
  requestedPlatforms: SocialPlatform[],
  outputType: OutputType,
): GeneratedPost[] {
  const rawPosts = record(value).posts;
  if (!Array.isArray(rawPosts)) {
    throw new Error("The social designer returned no platform posts.");
  }

  const posts = rawPosts.map((rawPost) => {
    const post = record(rawPost);
    const platform = cleanString(post.platform).toLowerCase();
    if (platform !== "facebook" && platform !== "instagram" && platform !== "tiktok") {
      throw new Error("The social designer returned an unknown platform.");
    }
    return {
      platform,
      title: cleanString(post.title, 300),
      caption: cleanString(post.caption, 6000),
      hashtags: cleanStringArray(post.hashtags, 10).map((tag) =>
        tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`,
      ),
      visualDirection: cleanString(post.visualDirection, 1500),
      designPlan: validatePlan(post.designPlan, platform, outputType),
    } satisfies GeneratedPost;
  });

  for (const platform of requestedPlatforms) {
    if (!posts.some((post) => post.platform === platform)) {
      throw new Error(`The social designer omitted the ${platform} post.`);
    }
  }
  return posts.filter((post) => requestedPlatforms.includes(post.platform));
}

function sceneSchema(platforms: SocialPlatform[], outputType: OutputType) {
  const sizes = platforms
    .map((platform) => {
      const size = dimensions(platform);
      return `${platform}: ${size.width} x ${size.height}`;
    })
    .join(", ");

  return [
    `Create exactly one ${outputType} plan for each requested platform. Canvas sizes: ${sizes}.`,
    "Return JSON only in this exact top-level shape: {\"posts\":[{\"platform\":\"facebook\",\"title\":\"...\",\"caption\":\"...\",\"hashtags\":[\"#Example\"],\"visualDirection\":\"...\",\"designPlan\":{...}}]}.",
    "Each designPlan must contain width, height, durationSeconds, concept, background and elements.",
    "background is {angle, colours, vignette}. Use 2 to 5 CSS hex colours chosen from the cover description and campaign direction.",
    "elements is a layered array. Every element needs id, type, layer, x, y, width, height, rotation, opacity and motion.",
    "motion is {enter, enterStart, enterEnd, exit, exitStart, exitEnd, loop, intensity}. For images use none. For videos use purposeful staggered motion.",
    "Allowed element types are cover, text, shape, vector and particles.",
    "A cover element also has presentation flat|floating|kindle, crop contain, shadow 0..1, glow 0..1 and glowColour.",
    "A text element also has exact text, font display|sans|accent, fontSize, minimumFontSize, weight, colour, align, uppercase, lineHeight and maxLines.",
    "A shape element also has shape block|paint|line|ellipse|glow|gradient-band, fill, stroke, strokeWidth, radius and points.",
    "A vector element has primitives. Each primitive is line|ellipse|rect|polyline with x,y,width,height in local 0..100 coordinates, points, fill, stroke, strokeWidth and radius.",
    "A particles element has particleStyle dust|spark|confetti|bokeh, colour and count.",
    "All coordinates are absolute pixels. Keep every element fully inside the canvas and respect generous feed safe zones.",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json()) as CampaignRequest;
    const bookValue = record(body.book);
    const platforms = cleanPlatforms(body.platforms);
    const campaignType = cleanString(body.campaignType, 100) || "custom";
    const quote = cleanString(body.quote, 1000);
    const instructions = cleanString(body.instructions, 4000);
    const revision = cleanString(body.revision, 2000);
    const outputType: OutputType = body.outputType === "video" ? "video" : "image";
    const book = {
      title: cleanString(bookValue.title, 300),
      author: cleanString(bookValue.author, 300),
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 6000),
      tropes: cleanStringArray(bookValue.tropes),
      heat: cleanString(bookValue.heat, 20),
      ending: cleanString(bookValue.ending, 100),
      contentWarnings: cleanStringArray(bookValue.contentWarnings),
      kindleUnlimited: bookValue.kindleUnlimited === true,
      amazonUrl: cleanString(bookValue.amazonUrl, 1000),
    };

    if (!book.title || !book.blurb || platforms.length === 0 || !instructions) {
      return NextResponse.json(
        { error: "A book, your guidance and at least one platform are required." },
        { status: 400 },
      );
    }

    const previousPlans = Array.isArray(body.previousPlans)
      ? body.previousPlans.slice(0, 3)
      : [];
    const generationNonce = crypto.randomUUID();
    const prompt = [
      "You are NovelForge's art director and social copywriter for professional commercial romance advertising.",
      "Return valid JSON only. Do not use markdown fences.",
      sceneSchema(platforms, outputType),
      "The author's guidance is the creative brief and has priority. Build a genuinely new composition from it. Do not select from templates or reuse a default layout.",
      "Use exactly the visual elements the author requests. Do not add people, silhouettes, rooms, scenery, props, icons, badges, ribbons, paint, particles or decorative objects unless the guidance asks for them.",
      "When the author does not specify a background, use only a refined abstract gradient, lighting, controlled colour fields and negative space. Never invent a photographic environment.",
      "Include the real supplied cover exactly once and make it a dominant hero. Do not redraw or describe replacement cover art.",
      "Do not place text in corporate cards, dashboard rows or presentation panels. Avoid repeated headings, rigid trope lists and generic promotional furniture.",
      "Create strong hierarchy with modern display and sans typography. Accent typography is only for a short phrase when suitable. Text must be large, readable and deliberately aligned.",
      "Every visible word must come from the supplied book facts, approved quote, offer or author's guidance. Never invent a quote, price, review, award, ranking, release claim, character detail or plot fact.",
      "If the author requests an icon or illustrated prop, construct a clean original line illustration using vector primitives. Do not substitute a generic built-in symbol.",
      "For video, animate separate layers with restrained depth, staggered entrances and subtle looping motion. Do not make a flat poster with one global zoom.",
      "For image, set all motion values to none and all timing values to 0.",
      "Keep the cover, key text and calls to action within safe zones. Make the cover substantially larger than incidental elements.",
      "Facebook copy may be fuller with 5 to 8 hashtags. Instagram must be visually led with exactly 5 hashtags. TikTok must have a searchable title, natural keyword-rich description and exactly 5 hashtags.",
      "Do not use the author name or book title as hashtags. Avoid corporate language, generic hype, fake questions and engagement bait.",
      "Never use an em dash or en dash.",
      `Output: ${outputType}`,
      `Campaign label for context only: ${campaignType}`,
      `Platforms: ${platforms.join(", ")}`,
      `Book facts: ${JSON.stringify(book)}`,
      `Approved genuine quote: ${quote || "None supplied. Do not create one."}`,
      `Author guidance: ${instructions}`,
      `Requested correction: ${revision || "None. Create a fresh first version."}`,
      `Previous plans to revise or avoid repeating: ${JSON.stringify(previousPlans)}`,
      `Fresh-generation nonce: ${generationNonce}`,
    ].join("\n\n");

    const response = await openai.responses.create({
      model: SOCIAL_MODEL,
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: [
        {
          role: "system",
          content:
            "Follow the author's visual brief precisely. Produce a fresh, renderable scene plan and accurate platform copy using supplied facts only.",
        },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 12000,
    });

    if (!response.output_text?.trim()) {
      throw new Error("The social designer returned an empty response.");
    }

    const posts = validatePosts(extractJson(response.output_text), platforms, outputType);
    return NextResponse.json({ posts, outputType, generationNonce });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The social design could not be generated.",
      },
      { status: 500 },
    );
  }
}
