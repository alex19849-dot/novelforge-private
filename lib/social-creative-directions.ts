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
export const PALETTES = [
  {
    name: "wine and champagne",
    dark: "#210c19",
    light: "#fff0d1",
    accent: "#e0b47c",
  },
  {
    name: "evergreen and candlelight",
    dark: "#082a25",
    light: "#fff3d8",
    accent: "#ddb565",
  },
  {
    name: "storm blue and copper",
    dark: "#11263e",
    light: "#f4f3e9",
    accent: "#eba778",
  },
  {
    name: "plum and pearl",
    dark: "#291733",
    light: "#fff0fa",
    accent: "#e4a8c7",
  },
  {
    name: "midnight and warm peach",
    dark: "#142037",
    light: "#fff0e7",
    accent: "#efb5a3",
  },
  {
    name: "ruby and ivory",
    dark: "#300e17",
    light: "#fff6ed",
    accent: "#f3b9a5",
  },
  {
    name: "deep teal and amber",
    dark: "#082a35",
    light: "#fff4dd",
    accent: "#f2c983",
  },
  {
    name: "slate and moonlight",
    dark: "#1b2635",
    light: "#f4f5ff",
    accent: "#bacbed",
  },
] as const;
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
  fontStyle?: "serif" | "sans";
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
): CreativeRecipe {
  const used = new Set(history.map((h) => h.concept_key));
  const candidates: CreativeRecipe[] = [];
  for (let s = 0; s < SCENES.length; s++)
    for (let l = 0; l < 4; l++)
      for (let p = 0; p < PALETTES.length; p++)
        for (let h = 0; h < HOOK_ANGLES.length; h++) {
          const key = [s, l, p, h].join(":");
          if (!used.has(key))
            candidates.push({
              key,
              sceneMode: s,
              layout: l,
              palette: p,
              hookAngle: h,
            });
        }
  if (!candidates.length)
    throw Error(
      "All creative directions have been used. Add new directions before generating more.",
    );
  const penalty = (r: CreativeRecipe) =>
    history
      .slice(0, 8)
      .reduce(
        (sum, h, i) =>
          sum +
          (h.recipe.sceneMode === r.sceneMode ? 12 : 0) +
          (h.recipe.layout === r.layout && i < 2 ? 10 : 0) +
          (h.recipe.palette === r.palette && i < 3 ? 8 : 0) +
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
    `Composition: ${["Kindle on the left, text on the right", "Kindle on the right, text on the left", "centred Kindle beneath the hook", "asymmetric editorial composition with a lower Kindle"][recipe.layout]}. Colour and light: ${palette.name}. Typography: ${typography}.`,
    `Exact opening hook: ${hook}`,
    `Include the ORIGINAL supplied book cover intact on a Kindle screen. The application inserts the genuine cover and Kindle frame after generating the scene. Never invent a paperback or redraw the cover.`,
    `Include these verified tropes: ${book.tropes.slice(0, 4).join(" • ")}.`,
    book.kindleUnlimited
      ? "Availability line: Available on Kindle Unlimited."
      : "Availability line: Available on Kindle. Kindle Unlimited is not verified for this book.",
    "No AI-generated people. Do not copy recent scenes, props, compositions or hooks. Keep all text clear and readable on a phone.",
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
  const layout = composition.includes("kindle on the left")
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
  const fontStyle = typography.includes("sans")
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
    recipe: { ...recipe, layout, fontStyle },
    book: { ...book, tropes, kindleUnlimited: ku && book.kindleUnlimited },
  };
}
