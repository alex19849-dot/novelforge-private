import OpenAI from "openai";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const SOCIAL_MODEL = "gpt-6-astra";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SocialPlatform = "facebook" | "instagram" | "tiktok";
type OutputType = "image" | "video";
type BlendMode = "source-over" | "screen" | "overlay" | "multiply" | "soft-light";
type ElementType = "cover" | "text" | "shape" | "svg" | "particles" | "texture";

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
  loop: "none" | "float" | "pulse" | "drift" | "glow" | "shimmer" | "parallax" | "flicker";
  intensity: number;
};

type SvgPath = {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  lineCap: "round" | "square" | "butt";
  lineJoin: "round" | "bevel" | "miter";
};

type TextHighlight = {
  text: string;
  colour: string;
  font: "display" | "sans" | "accent";
};

type DesignElement = {
  id: string;
  purpose: string;
  type: ElementType;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
  blur: number;
  motion: Motion;
  text?: string;
  font?: "display" | "sans" | "accent";
  fontSize?: number;
  minimumFontSize?: number;
  weight?: number;
  colour?: string;
  gradientColours?: string[];
  align?: "left" | "center" | "right";
  uppercase?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  maxLines?: number;
  stroke?: string;
  strokeWidth?: number;
  shadowColour?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  highlights?: TextHighlight[];
  presentation?: "flat" | "floating" | "kindle";
  crop?: "contain" | "cover";
  shadow?: number;
  glow?: number;
  glowColour?: string;
  deviceDepth?: number;
  deviceHighlight?: number;
  reflection?: number;
  shape?: "block" | "paint" | "line" | "ellipse" | "glow" | "gradient-band" | "spotlight";
  fill?: string;
  secondaryFill?: string;
  radius?: number;
  points?: number[];
  viewBox?: number[];
  paths?: SvgPath[];
  particleStyle?: "dust" | "spark" | "confetti" | "bokeh" | "petal" | "ember";
  count?: number;
  textureStyle?: "grain" | "fog" | "smoke" | "splatter" | "scratches" | "paper" | "light-rays";
  density?: number;
  seed?: number;
};

type DesignPlan = {
  width: number;
  height: number;
  safeMargin: number;
  durationSeconds: number;
  concept: string;
  requestedElements: string[];
  palette: {
    base: string;
    primary: string;
    secondary: string;
    text: string;
    rationale: string;
  };
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("The social designer returned no JSON object.");
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function colourValue(value: unknown, fallback: string): string {
  const colour = cleanString(value, 60);
  return /^(transparent|#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i.test(
    colour,
  )
    ? colour
    : fallback;
}

function safeSvgPath(value: unknown): string {
  const path = cleanString(value, 7000);
  if (!path || /[<>"'`;{}]/.test(path)) return "";
  return /^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]+$/.test(path) ? path : "";
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
    ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out", "rotate-in", "wipe"] as const,
    "none",
  );
  const exit = enumValue(
    item.exit,
    ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"] as const,
    "none",
  );
  const loop = enumValue(
    item.loop,
    ["none", "float", "pulse", "drift", "glow", "shimmer", "parallax", "flicker"] as const,
    "none",
  );
  const enterStart = numberValue(item.enterStart, 0, 0, duration);
  const enterEnd = numberValue(item.enterEnd, duration ? Math.min(0.9, duration) : 0, enterStart, duration);
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

function validateSvgPaths(value: unknown): SvgPath[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .map((rawPath) => {
      const path = record(rawPath);
      return {
        d: safeSvgPath(path.d),
        fill: colourValue(path.fill, "transparent"),
        stroke: colourValue(path.stroke, "#ffffff"),
        strokeWidth: numberValue(path.strokeWidth, 2.5, 0, 14),
        lineCap: enumValue(path.lineCap, ["round", "square", "butt"] as const, "round"),
        lineJoin: enumValue(path.lineJoin, ["round", "bevel", "miter"] as const, "round"),
      };
    })
    .filter((path) => path.d);
}

function validateHighlights(value: unknown): TextHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((rawHighlight) => {
    const highlight = record(rawHighlight);
    return {
      text: cleanString(highlight.text, 120),
      colour: colourValue(highlight.colour, "#ffffff"),
      font: enumValue(highlight.font, ["display", "sans", "accent"] as const, "display"),
    };
  }).filter((highlight) => highlight.text);
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
    ["cover", "text", "shape", "svg", "particles", "texture"] as const,
    "shape",
  );
  const x = numberValue(item.x, 0, 0, width - 1);
  const y = numberValue(item.y, 0, 0, height - 1);
  const elementWidth = numberValue(item.width, 100, 1, width - x);
  const elementHeight = numberValue(item.height, 100, 1, height - y);
  const base: DesignElement = {
    id: cleanString(item.id, 80) || `element-${index + 1}`,
    purpose: cleanString(item.purpose, 240),
    type,
    layer: Math.round(numberValue(item.layer, index, 0, 100)),
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    rotation: numberValue(item.rotation, 0, -35, 35),
    opacity: numberValue(item.opacity, 1, 0, 1),
    blendMode: enumValue(
      item.blendMode,
      ["source-over", "screen", "overlay", "multiply", "soft-light"] as const,
      "source-over",
    ),
    blur: numberValue(item.blur, 0, 0, 80),
    motion: validateMotion(item.motion, duration),
  };

  if (type === "text") {
    return {
      ...base,
      text: cleanString(item.text, 700),
      font: enumValue(item.font, ["display", "sans", "accent"] as const, "sans"),
      fontSize: numberValue(item.fontSize, 64, 22, 300),
      minimumFontSize: numberValue(item.minimumFontSize, 30, 18, 180),
      weight: Math.round(numberValue(item.weight, 800, 300, 900) / 100) * 100,
      colour: colourValue(item.colour, "#ffffff"),
      gradientColours: cleanStringArray(item.gradientColours, 5).map((colour) => colourValue(colour, "#ffffff")),
      align: enumValue(item.align, ["left", "center", "right"] as const, "left"),
      uppercase: item.uppercase === true,
      lineHeight: numberValue(item.lineHeight, 0.98, 0.72, 1.5),
      letterSpacing: numberValue(item.letterSpacing, 0, -3, 30),
      maxLines: Math.round(numberValue(item.maxLines, 4, 1, 10)),
      stroke: colourValue(item.stroke, "transparent"),
      strokeWidth: numberValue(item.strokeWidth, 0, 0, 12),
      shadowColour: colourValue(item.shadowColour, "transparent"),
      shadowBlur: numberValue(item.shadowBlur, 0, 0, 60),
      shadowOffsetX: numberValue(item.shadowOffsetX, 0, -30, 30),
      shadowOffsetY: numberValue(item.shadowOffsetY, 0, -30, 30),
      highlights: validateHighlights(item.highlights),
    };
  }

  if (type === "cover") {
    return {
      ...base,
      presentation: enumValue(item.presentation, ["flat", "floating", "kindle"] as const, "floating"),
      crop: enumValue(item.crop, ["contain", "cover"] as const, "contain"),
      shadow: numberValue(item.shadow, 0.75, 0, 1),
      glow: numberValue(item.glow, 0.25, 0, 1),
      glowColour: colourValue(item.glowColour, "#ffffff"),
      deviceDepth: numberValue(item.deviceDepth, 0.65, 0, 1),
      deviceHighlight: numberValue(item.deviceHighlight, 0.55, 0, 1),
      reflection: numberValue(item.reflection, 0.25, 0, 1),
    };
  }

  if (type === "shape") {
    return {
      ...base,
      shape: enumValue(
        item.shape,
        ["block", "paint", "line", "ellipse", "glow", "gradient-band", "spotlight"] as const,
        "block",
      ),
      fill: colourValue(item.fill, "transparent"),
      secondaryFill: colourValue(item.secondaryFill, "transparent"),
      stroke: colourValue(item.stroke, "transparent"),
      strokeWidth: numberValue(item.strokeWidth, 0, 0, 30),
      radius: numberValue(item.radius, 0, 0, Math.min(elementWidth, elementHeight) / 2),
      points: Array.isArray(item.points)
        ? item.points
            .filter((point): point is number => typeof point === "number" && Number.isFinite(point))
            .slice(0, 60)
        : [],
    };
  }

  if (type === "svg") {
    const paths = validateSvgPaths(item.paths);
    if (!paths.length) throw new Error(`The generated ${base.id} SVG contains no valid paths.`);
    const rawViewBox = Array.isArray(item.viewBox)
      ? item.viewBox.filter((number): number is number => typeof number === "number" && Number.isFinite(number)).slice(0, 4)
      : [];
    return {
      ...base,
      viewBox: rawViewBox.length === 4 ? rawViewBox : [0, 0, 100, 100],
      paths,
      shadowColour: colourValue(item.shadowColour, "transparent"),
      shadowBlur: numberValue(item.shadowBlur, 0, 0, 60),
    };
  }

  if (type === "particles") {
    return {
      ...base,
      particleStyle: enumValue(
        item.particleStyle,
        ["dust", "spark", "confetti", "bokeh", "petal", "ember"] as const,
        "dust",
      ),
      colour: colourValue(item.colour, "#ffffff"),
      secondaryFill: colourValue(item.secondaryFill, "transparent"),
      count: Math.round(numberValue(item.count, 18, 1, 100)),
      seed: Math.round(numberValue(item.seed, index * 97 + 11, 0, 999999)),
    };
  }

  return {
    ...base,
    textureStyle: enumValue(
      item.textureStyle,
      ["grain", "fog", "smoke", "splatter", "scratches", "paper", "light-rays"] as const,
      "grain",
    ),
    colour: colourValue(item.colour, "#ffffff"),
    secondaryFill: colourValue(item.secondaryFill, "transparent"),
    density: numberValue(item.density, 0.4, 0.05, 1),
    seed: Math.round(numberValue(item.seed, index * 101 + 17, 0, 999999)),
  };
}

function validatePlan(value: unknown, platform: SocialPlatform, outputType: OutputType): DesignPlan {
  const item = record(value);
  const expected = dimensions(platform);
  const duration = outputType === "video" ? numberValue(item.durationSeconds, 8, 5, 15) : 0;
  const paletteValue = record(item.palette);
  const backgroundValue = record(item.background);
  const colours = cleanStringArray(backgroundValue.colours, 5)
    .map((colour) => colourValue(colour, "#080910"))
    .slice(0, 5);
  const elements = Array.isArray(item.elements)
    ? item.elements
        .slice(0, 24)
        .map((element, index) =>
          validateElement(element, index, expected.width, expected.height, duration),
        )
        .sort((left, right) => left.layer - right.layer)
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
    safeMargin: numberValue(item.safeMargin, platform === "tiktok" ? 90 : 60, 44, 140),
    durationSeconds: duration,
    concept: cleanString(item.concept, 700),
    requestedElements: cleanStringArray(item.requestedElements, 30),
    palette: {
      base: colourValue(paletteValue.base, "#080910"),
      primary: colourValue(paletteValue.primary, "#ffffff"),
      secondary: colourValue(paletteValue.secondary, "#b92f56"),
      text: colourValue(paletteValue.text, "#ffffff"),
      rationale: cleanString(paletteValue.rationale, 500),
    },
    background: {
      angle: numberValue(backgroundValue.angle, 135, 0, 360),
      colours: colours.length >= 2 ? colours : ["#050609", "#15111b", "#08090d"],
      vignette: numberValue(backgroundValue.vignette, 0.5, 0, 1),
    },
    elements,
  };
}

function validatePosts(value: unknown, platforms: SocialPlatform[], outputType: OutputType): GeneratedPost[] {
  const rawPosts = record(value).posts;
  if (!Array.isArray(rawPosts)) throw new Error("The social designer returned no platform posts.");

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
      visualDirection: cleanString(post.visualDirection, 1800),
      designPlan: validatePlan(post.designPlan, platform, outputType),
    } satisfies GeneratedPost;
  });

  for (const platform of platforms) {
    if (!posts.some((post) => post.platform === platform)) {
      throw new Error(`The social designer omitted the ${platform} post.`);
    }
  }
  return posts.filter((post) => platforms.includes(post.platform));
}

function schemaInstructions(platforms: SocialPlatform[], outputType: OutputType): string {
  const sizes = platforms
    .map((platform) => {
      const size = dimensions(platform);
      return `${platform} ${size.width}x${size.height}`;
    })
    .join(", ");
  return [
    `Return one ${outputType} post for each platform: ${sizes}.`,
    "Return JSON only: {\"posts\":[{\"platform\":\"facebook|instagram|tiktok\",\"title\":\"...\",\"caption\":\"...\",\"hashtags\":[\"#Example\"],\"visualDirection\":\"...\",\"designPlan\":{...}}]}.",
    "designPlan requires width, height, safeMargin, durationSeconds, concept, requestedElements, palette, background and elements.",
    "palette is {base,primary,secondary,text,rationale}. background is {angle,colours,vignette}.",
    "Every element requires id, purpose, type, layer, x, y, width, height, rotation, opacity, blendMode, blur and motion.",
    "motion is {enter,enterStart,enterEnd,exit,exitStart,exitEnd,loop,intensity}.",
    "Element types: cover, text, shape, svg, particles, texture.",
    "cover adds presentation flat|floating|kindle, crop, shadow, glow, glowColour, deviceDepth, deviceHighlight, reflection.",
    "text adds text, font display|sans|accent, fontSize, minimumFontSize, weight, colour, gradientColours, align, uppercase, lineHeight, letterSpacing, maxLines, stroke, strokeWidth, shadowColour, shadowBlur, shadowOffsetX, shadowOffsetY and highlights.",
    "Each highlight is {text,colour,font} and its text must exactly occur inside the parent text.",
    "shape adds shape block|paint|line|ellipse|glow|gradient-band|spotlight, fill, secondaryFill, stroke, strokeWidth, radius and points.",
    "svg adds viewBox [0,0,100,100], paths and shadowColour/shadowBlur. Each path is {d,fill,stroke,strokeWidth,lineCap,lineJoin}. SVG d may use only standard path commands and numbers. Never include XML, SVG tags, text, URLs, scripts or foreign objects.",
    "particles adds particleStyle dust|spark|confetti|bokeh|petal|ember, colour, secondaryFill, count and seed.",
    "texture adds textureStyle grain|fog|smoke|splatter|scratches|paper|light-rays, colour, secondaryFill, density and seed.",
    "Use absolute pixel coordinates. Keep critical text and the cover within safeMargin. Decorative texture may bleed to the canvas edges.",
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
    const feedPlatform: SocialPlatform | null = platforms.includes("instagram")
      ? "instagram"
      : platforms.includes("facebook")
        ? "facebook"
        : null;
    const designPlatforms: SocialPlatform[] = [
      ...(feedPlatform ? [feedPlatform] : []),
      ...(platforms.includes("tiktok") ? ["tiktok" as const] : []),
    ];
    const outputType: OutputType = body.outputType === "video" ? "video" : "image";
    const instructions = cleanString(body.instructions, 5000);
    const revision = cleanString(body.revision, 2500);
    const suppliedQuote = cleanString(body.quote, 1200);
    const coverUrl = cleanString(bookValue.coverUrl, 2000);
    const book = {
      title: cleanString(bookValue.title, 300),
      author: cleanString(bookValue.author, 300) || "Marlow Quinn",
      subgenre: cleanString(bookValue.subgenre, 300),
      blurb: cleanString(bookValue.blurb, 7000),
      tropes: cleanStringArray(bookValue.tropes, 20),
      heat: cleanString(bookValue.heat, 50),
      ending: cleanString(bookValue.ending, 100),
      contentWarnings: cleanStringArray(bookValue.contentWarnings, 20),
      kindleUnlimited: bookValue.kindleUnlimited === true,
      amazonUrl: cleanString(bookValue.amazonUrl, 1000),
    };

    if (!book.title || !book.blurb || !coverUrl || !platforms.length || !instructions) {
      return NextResponse.json(
        { error: "A book with its genuine cover, your guidance and at least one platform are required." },
        { status: 400 },
      );
    }

    const previousPlans = Array.isArray(body.previousPlans) ? body.previousPlans.slice(0, 3) : [];
    const previousPlanText = JSON.stringify(previousPlans).slice(0, 24000);
    const generationNonce = crypto.randomUUID();
    const prompt = [
      "You are the senior art director for NovelForge, creating premium commercial BookTok and romance advertising.",
      "Study the supplied genuine cover at high detail before planning. Derive a near-black or clean light base, one vivid primary accent and one contrasting secondary accent from its visually useful colours. Do not default to muddy brown, beige or dull maroon.",
      schemaInstructions(designPlatforms, outputType),
      "AUTHOR CONTROL",
      "The author's guidance is the complete creative brief. Include every requested element and omit everything they did not request. Never automatically add a Kindle, icons, trope list, footer, branding, ribbons, paint, particles, textures, scenery or props.",
      "If the author requests a broad motif such as gothic elements, vampire elements, sports elements or floral elements, interpret that request creatively using a small coordinated set of relevant SVG, texture and lighting layers. Those elements are authorised by the broad request. Do not add people or silhouettes.",
      "If the author requests modern icons, create one recognisable, professionally proportioned SVG icon for each named item. Use smooth curves and complete shapes. A few disconnected slashes or abstract marks are never an icon. Keep all icons stylistically consistent.",
      "Do not use any photographic or AI-generated background image. Build atmosphere from gradients, SVG artwork, procedural texture, glow, haze, particles and lighting only.",
      "COMPOSITION QUALITY",
      "Create a fresh composition for this specific brief. Do not select a template or repeat a default skeleton.",
      "Make the real cover the dominant hero unless the author explicitly requests a type-led design. If Kindle is requested, make it large, dimensional and physically grounded with believable depth, edge highlights, glow, contact shadow and reflection.",
      "Create one unmistakable reading order. Use scale aggressively. The hook or offer must be prominent, the cover must have presence, and supporting information must be secondary but feed-readable.",
      "Integrate typography with artwork. Use large display type, controlled sans type and at most one short accent treatment. Use highlights for selected words. Avoid flat same-size text, corporate cards, dashboard rows, boxed labels and presentation-slide spacing.",
      "Avoid dead space. Use intentional overlap between decorative layers and the hero, without covering important cover wording or making text collide.",
      "SVG motifs must look intentional at the requested size. Use filled silhouettes or confident linework with enough detail to read immediately. Place related icons consistently, but do not put them inside generic corporate badges unless requested.",
      "For image output, set all motion to none with zero timings. For video, animate independent layers with purposeful staggered entrances, restrained parallax, atmospheric drift and a stable readable final composition. Never apply one global zoom to a flat poster.",
      "ACCURACY",
      "All quotes must be supplied verbatim. Never invent a quote, price, review, award, ranking, release status, reader reaction, character or plot event.",
      "When the author explicitly asks for a hook, headline or title without supplying its exact wording, create one short promotional hook grounded only in the blurb and known tropes. This is allowed. It must not masquerade as a quotation or factual claim.",
      "Only show Kindle Unlimited wording when both the book data confirms eligibility and the author requests it. Reproduce requested URLs exactly.",
      "Never use em dashes or en dashes.",
      "FINAL INTERNAL CHECK BEFORE JSON",
      "Confirm the requested composition, every requested phrase, every requested icon and every requested motif is present. Confirm no unrequested semantic element was added. Confirm the hero is large, icons are recognisable, hierarchy is strong, safe margins hold and the result would not look sparse, corporate or generic.",
      `Output type: ${outputType}`,
      `Design platforms: ${designPlatforms.join(", ")}. Facebook and Instagram share the same 1080x1350 artwork when both are requested.`,
      `Campaign label for backward compatibility only: ${cleanString(body.campaignType, 100) || "custom"}`,
      `Verified book facts: ${JSON.stringify(book)}`,
      `Approved genuine quote: ${suppliedQuote || "None supplied. Do not create a quotation."}`,
      `Author guidance: ${instructions}`,
      `Requested correction: ${revision || "None. Create a fresh version."}`,
      `Previous plans to revise or avoid repeating: ${previousPlanText || "None"}`,
      `Fresh-generation nonce: ${generationNonce}`,
    ].join("\n\n");

    const response = await openai.responses.create({
      model: SOCIAL_MODEL,
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
      input: [
        {
          role: "system",
          content:
            "Return strict JSON only. Follow the author's brief exactly. Inspect the genuine cover, create professional commercial art direction, and use supplied facts only.",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: coverUrl, detail: "high" },
          ],
        },
      ],
      max_output_tokens: 12000,
    }, { timeout: 75_000 });

    if (!response.output_text?.trim()) {
      throw new Error("The social designer returned an empty response.");
    }

    const designedPosts = validatePosts(extractJson(response.output_text), designPlatforms, outputType);
    const feedPost = designedPosts.find((post) => post.platform === feedPlatform);
    const posts = platforms.map((platform) => {
      const exact = designedPosts.find((post) => post.platform === platform);
      if (exact) return exact;
      if ((platform === "facebook" || platform === "instagram") && feedPost) {
        return {
          ...feedPost,
          platform,
          designPlan: {
            ...feedPost.designPlan,
            elements: feedPost.designPlan.elements.map((element) => ({ ...element })),
          },
        };
      }
      throw new Error(`The social designer omitted the ${platform} post.`);
    });
    return NextResponse.json({ posts, outputType, generationNonce, designer: SOCIAL_MODEL });
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
