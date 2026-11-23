import type { SocialPlatform } from "./social-calendar";
export type StudioBook = {
  slug: string;
  title: string;
  blurb: string;
  tropes: string[];
  subgenre: string;
  kindleUnlimited: boolean;
  amazonUrl: string;
  coverUrl: string;
};
export const STUDIO_CHANNELS: SocialPlatform[] = [
  "facebook",
  "tiktok",
  "youtube",
  "instagram",
];
import {
  DESIGN_PALETTES as PALETTES,
  FONT_PAIRS,
  DESIGN_LAYOUTS,
} from "./social-poster-design";
export { PALETTES };
export const SCENES = [
  "an immersive wide scene from the verified story world",
  "an atmospheric architectural threshold or framing device",
  "a single meaningful story detail in extreme close-up",
  "weather, movement and light expressing the romantic stakes",
  "a cinematic view through a setting element with strong depth",
  "an expressive material or texture from the story world",
  "a dramatic aerial or high-angle environment composition",
  "a low-angle environment with a strong vanishing point",
  "a warm intimate setting contrasted with its exterior",
  "a strong silhouette of a NON-HUMAN setting feature",
  "reflected setting light with no human reflections",
  "a painterly interpretation of the verified setting",
] as const;
export const HOOK_ANGLES = [
  "forbidden attraction",
  "emotional stakes",
  "curiosity about the premise",
  "romantic longing",
  "conflict between the leads",
  "playful chemistry",
] as const;
export type CreativeRecipe = {
  designVersion?: 3;
  fontPair?: number;
  fontStyle?: "serif" | "sans" | "script";
  key: string;
  sceneMode: number;
  layout: number;
  palette: number;
  hookAngle: number;
};
export type CreativeHistory = {
  concept_key: string;
  recipe: CreativeRecipe;
  hook?: string;
  scene?: string;
  prompt?: string;
};
export function nextCreativeDirection(
  history: CreativeHistory[],
  seed = 0,
  _book?: Pick<StudioBook, "subgenre">,
  recentStyles: CreativeRecipe[] = history.map((h) => h.recipe),
): CreativeRecipe {
  const used = new Set(history.map((h) => h.concept_key));
  const blockedLayouts = new Set(recentStyles.slice(0, 2).map((r) => r.layout));
  const blockedPalettes = new Set(
    recentStyles.slice(0, 3).map((r) => r.palette),
  );
  const lastPlacement = recentStyles[0]
    ? Math.floor(recentStyles[0].layout % 3)
    : -1;
  const blockedColourFamilies = new Set(
    recentStyles
      .slice(0, 2)
      .map((r) => PALETTES[r.palette % PALETTES.length].family),
  );
  const blockedFonts = new Set(
    recentStyles
      .slice(0, 2)
      .map((r) => r.fontPair)
      .filter((v) => v !== undefined),
  );
  const candidates: CreativeRecipe[] = [];
  for (let sceneMode = 0; sceneMode < SCENES.length; sceneMode++)
    for (let layout = 0; layout < DESIGN_LAYOUTS.length; layout++)
      for (let palette = 0; palette < PALETTES.length; palette++)
        for (let fontPair = 0; fontPair < FONT_PAIRS.length; fontPair++)
          for (let hookAngle = 0; hookAngle < HOOK_ANGLES.length; hookAngle++) {
            const key = [
              "v3",
              sceneMode,
              layout,
              palette,
              fontPair,
              hookAngle,
            ].join(":");
            if (
              used.has(key) ||
              blockedLayouts.has(layout) ||
              layout % 3 === lastPlacement ||
              blockedColourFamilies.has(PALETTES[palette].family) ||
              blockedPalettes.has(palette) ||
              blockedFonts.has(fontPair)
            )
              continue;
            candidates.push({
              key,
              designVersion: 3,
              sceneMode,
              layout,
              palette,
              fontPair,
              hookAngle,
              fontStyle: FONT_PAIRS[fontPair].style,
            });
          }
  if (!candidates.length)
    throw Error(
      "No unused design combination remains. Add new styles before generating more.",
    );
  const penalty = (r: CreativeRecipe) =>
    history
      .slice(0, 8)
      .reduce(
        (n, h, i) =>
          n +
          (h.recipe.sceneMode === r.sceneMode ? 12 : 0) +
          (h.recipe.hookAngle === r.hookAngle && i < 2 ? 4 : 0),
        0,
      );
  const min = Math.min(...candidates.map(penalty));
  const fresh = candidates.filter((r) => penalty(r) === min);
  return fresh[Math.abs(seed) % fresh.length];
}
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            "with",
            "from",
            "that",
            "this",
            "their",
            "there",
            "light",
            "scene",
            "romantic",
            "book",
            "marlow",
            "quinn",
          ].includes(w),
      ),
  );
export function similarCreative(a: string, b: string) {
  const x = words(a),
    y = words(b);
  if (!x.size || !y.size) return false;
  return (
    [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size) > 0.62
  );
}
export function buildCreativePrompt(
  book: StudioBook,
  recipe: CreativeRecipe,
  hook: string,
  scene: string,
  typography: string,
) {
  const palette = PALETTES[recipe.palette];
  return [
    `Create a romantic, eye-catching poster for ${book.title} by Marlow Quinn, grounded in this story's themes.`,
    `Scene: ${scene}`,
    `Composition: ${recipe.designVersion === 3 ? DESIGN_LAYOUTS[recipe.layout].name : ["Kindle on the left, text on the right", "Kindle on the right, text on the left", "centred Kindle beneath the hook", "asymmetric editorial composition with a lower Kindle"][recipe.layout]}. Colour and light: ${palette.name}. Typography: ${recipe.designVersion === 3 ? FONT_PAIRS[recipe.fontPair ?? 0].name : typography}.`,
    `Exact opening hook: ${hook}`,
    `Include the ORIGINAL supplied book cover intact on a Kindle screen. The application inserts the genuine cover and Kindle frame after generating the scene. Never invent a paperback or redraw the cover.`,
    `Include these verified tropes: ${book.tropes.slice(0, 4).join(" • ")}.`,
    book.kindleUnlimited
      ? "Availability line: Available on Kindle Unlimited."
      : "Availability line: Available on Kindle. Kindle Unlimited is not verified for this book.",
    "No AI-generated people or hands. Do not copy recent scenes, props, compositions or hooks. Use tactile romance reading aesthetics. Keep text on opaque contrasting paper, tape, marker swashes or ribbons, never low-contrast text floating over busy imagery. No invented review stars. The application renders the selected font pairing, label arrangement and ink colours. Keep all text clear and readable on a phone.",
  ].join("\n\n");
}
export function validatePlatformCopies(
  value: unknown,
  platforms: SocialPlatform[],
  book: StudioBook,
) {
  if (!Array.isArray(value) || value.length !== platforms.length)
    throw Error("The copy generator omitted a selected platform.");
  const seen = new Set<string>();
  const captions = new Set<string>();
  const tagsSeen = new Set<string>();
  return platforms.map((platform) => {
    const item = value.find((p) => p?.platform === platform);
    if (!item || seen.has(platform))
      throw Error("Duplicate or missing platform copy.");
    seen.add(platform);
    const title = String(item.title ?? "").trim(),
      caption = String(item.caption ?? "").trim(),
      hashtags = Array.isArray(item.hashtags)
        ? item.hashtags.map((v: unknown) => String(v).trim())
        : [];
    if (
      !title ||
      !caption ||
      caption.length > 2000 ||
      title.length > (platform === "youtube" ? 100 : 240) ||
      hashtags.some((t: string) => !/^#[\p{L}\p{N}_]+$/u.test(t)) ||
      new Set(hashtags.map((t: string) => t.toLowerCase())).size !==
        hashtags.length
    )
      throw Error("The platform copy is incomplete or too long.");
    if (
      !caption.toLowerCase().includes(book.title.toLowerCase()) ||
      !caption.toLowerCase().includes("marlow quinn")
    )
      throw Error("The caption must identify the actual book and author.");
    const tagsLower = hashtags.map((t: string) => t.toLowerCase());
    if (
      (platform === "tiktok" && !tagsLower.includes("#booktok")) ||
      (platform === "instagram" && !tagsLower.includes("#bookstagram")) ||
      (platform !== "youtube" && tagsLower.includes("#shorts")) ||
      (platform !== "tiktok" && tagsLower.includes("#booktok"))
    )
      throw Error("The hashtag set does not match its platform.");
    const expected =
      platform === "youtube" ? 3 : platform === "facebook" ? 3 : 5;
    if (hashtags.length !== expected)
      throw Error(`The ${platform} hashtag set is incomplete.`);
    if (
      platform === "youtube" &&
      !hashtags.some((t: string) => t.toLowerCase() === "#shorts")
    )
      throw Error("YouTube needs its Shorts hashtag.");
    if (platform === "facebook" && !caption.includes(book.amazonUrl))
      throw Error("The Facebook caption is missing the verified book link.");
    if (platform !== "facebook" && /https?:\/\//i.test(caption))
      throw Error(
        "Use a platform-appropriate profile link direction instead of a raw URL.",
      );
    if (
      !book.kindleUnlimited &&
      /kindle\s*unlimited|#kindleunlimited/i.test(
        caption + " " + hashtags.join(" "),
      )
    )
      throw Error("Kindle Unlimited is not verified for this book.");
    const c = caption.toLowerCase().replace(/\s+/g, " "),
      tags = [...hashtags]
        .map((t: string) => t.toLowerCase())
        .sort()
        .join(" ");
    if (captions.has(c) || tagsSeen.has(tags))
      throw Error(
        "The copy generator repeated a caption or hashtag set across platforms.",
      );
    captions.add(c);
    tagsSeen.add(tags);
    return { platform, title, caption, hashtags };
  });
}

/** Honour edits to the explicit controls in the reviewed prompt. */
export function reviewedPosterBrief(
  book: StudioBook,
  recipe: CreativeRecipe,
  prompt: string,
  defaultHook: string,
) {
  const hook =
    prompt.match(/^Exact opening hook:\s*(.+)$/im)?.[1]?.trim() || defaultHook;
  if (!hook || hook.length > 110)
    throw Error("Keep the opening hook under 110 characters.");
  const composition =
    prompt.match(/^Composition:\s*([^\n.]+)/im)?.[1]?.toLowerCase() ?? "";
  const designedLayout =
    recipe.designVersion === 3
      ? DESIGN_LAYOUTS.findIndex(
          (l) => l.name.toLowerCase() === composition.trim(),
        )
      : -1;
  const layout =
    designedLayout >= 0
      ? designedLayout
      : composition.includes("kindle on the left")
        ? 0
        : composition.includes("kindle on the right")
          ? 1
          : composition.includes("centred kindle")
            ? 2
            : composition.includes("asymmetric")
              ? 3
              : recipe.layout;
  const typography =
    prompt.match(/Typography:\s*([^\n.]+)/i)?.[1]?.toLowerCase() ?? "";
  const designedFont =
    recipe.designVersion === 3
      ? FONT_PAIRS.findIndex((f) => f.name.toLowerCase() === typography.trim())
      : -1;
  const fontStyle =
    designedFont >= 0
      ? FONT_PAIRS[designedFont].style
      : typography.includes("script")
        ? "script"
        : typography.includes("sans")
          ? "sans"
          : typography.includes("serif")
            ? "serif"
            : recipe.fontStyle;
  const line = prompt.match(/^Include these verified tropes:\s*(.+)$/im)?.[1];
  let tropes = book.tropes.slice(0, 4);
  if (line) {
    const requested = line
      .replace(/\.$/, "")
      .split("•")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!requested.length || requested.length > 4)
      throw Error("Choose one to four verified tropes for readable artwork.");
    tropes = requested.map((value) => {
      const found = book.tropes.find(
        (t) => t.toLowerCase() === value.toLowerCase(),
      );
      if (!found)
        throw Error(
          "A requested trope is not in this book’s verified catalogue.",
        );
      return found;
    });
  }
  const ku = /^Availability line:\s*Available on Kindle Unlimited\b/im.test(
    prompt,
  );
  if (ku && !book.kindleUnlimited)
    throw Error("Kindle Unlimited is not verified for this book.");
  return {
    hook,
    recipe: {
      ...recipe,
      layout,
      fontStyle,
      ...(designedFont >= 0 ? { fontPair: designedFont } : {}),
    },
    book: { ...book, tropes, kindleUnlimited: ku && book.kindleUnlimited },
  };
}
