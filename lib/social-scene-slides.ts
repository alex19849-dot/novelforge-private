import type { SocialPlatform } from "./social-calendar";
export type SceneSlide = {
  text: string;
  imagePrompt: string;
  sourceQuote: string;
};
export type ScenePlan = {
  format: "scene-slides";
  sourceMode: "excerpt" | "premise";
  hook: string;
  design?: number;
  cast: [string, string];
  slides: [SceneSlide, SceneSlide];
};
export type SceneDelivery = "native" | "automatic";
export const SCENE_CHANNELS: SocialPlatform[] = [
  "facebook",
  "tiktok",
  "instagram",
  "youtube",
];
const normal = (v: string) =>
  v
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export function sceneSeconds(text: string) {
  return Math.max(4, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 4));
}
/** Twelve seconds for the story and three for the cover. Long exact extracts retain reading time. */
export function sceneTimings(texts:string[]):[number,number,number] {
  const words=texts.map(t=>Math.max(1,t.trim().split(/\s+/).filter(Boolean).length));
  const minimum=texts.map(sceneSeconds);
  const story=Math.max(12,minimum[0]+minimum[1]);
  const first=Math.max(minimum[0],Math.min(story-minimum[1],Math.round(story*words[0]/(words[0]+words[1]))));
  return [first,story-first,3];
}
export function validateScenePlan(value: unknown, excerpt: string): ScenePlan {
  const p = value as ScenePlan;
  if (
    !p ||
    p.format !== "scene-slides" ||
    !["excerpt", "premise"].includes(p.sourceMode) ||
    p.sourceMode !== (excerpt.trim() ? "excerpt" : "premise") ||
    !p.hook?.trim() ||
    p.hook.length > 100 ||
    !Array.isArray(p.cast) ||
    p.cast.length !== 2 ||
    p.cast.some(
      (c) => typeof c !== "string" || c.length < 20 || c.length > 900,
    ) ||
    !Array.isArray(p.slides) ||
    p.slides.length !== 2
  )
    throw Error(
      "The scene plan is incomplete. Keep two scene slides and two distinct character descriptions.",
    );
  if (normal(p.cast[0]) === normal(p.cast[1]))
    throw Error("Give the two leads different appearance descriptions.");
  let sourceCursor = 0;
  for (const slide of p.slides) {
    if (
      typeof slide.text !== "string" ||
      !slide.text.trim() ||
      slide.text.length > 280 ||
      slide.text.split(/\s+/).length > 46 ||
      typeof slide.imagePrompt !== "string" ||
      slide.imagePrompt.length < 25 ||
      slide.imagePrompt.length > 1800 ||
      typeof slide.sourceQuote !== "string"
    )
      throw Error(
        "Keep each scene slide under 46 words with a clear scene description.",
      );
    if (
      p.sourceMode === "excerpt" &&
      (!slide.sourceQuote.trim() ||
        !normal(excerpt).includes(normal(slide.sourceQuote)) ||
        normal(slide.text) !== normal(slide.sourceQuote))
    )
      throw Error(
        "Excerpt slides must use the original manuscript wording. Edit the source passage or select another exact excerpt.",
      );
    if (p.sourceMode === "excerpt") {
      const at = normal(excerpt).indexOf(
        normal(slide.sourceQuote),
        sourceCursor,
      );
      if (at < 0)
        throw Error(
          "Keep the manuscript extracts in their original story order.",
        );
      sourceCursor = at + normal(slide.sourceQuote).length;
    }
    if (p.sourceMode === "premise" && slide.sourceQuote)
      throw Error(
        "Premise-based copy must not be presented as a manuscript quote.",
      );
  }
  return {
    format: "scene-slides",
    sourceMode: p.sourceMode,
    hook: p.hook.trim(),
    ...(Number.isInteger(p.design) && p.design! >= 0 && p.design! < 6 ? {design:p.design} : {}),
    cast: [p.cast[0].trim(), p.cast[1].trim()],
    slides: p.slides.map((s) => ({
      text: s.text.trim(),
      imagePrompt: s.imagePrompt.trim(),
      sourceQuote: s.sourceQuote.trim(),
    })) as [SceneSlide, SceneSlide],
  };
}
export function scenePlatformList(value: unknown) {
  const p = SCENE_CHANNELS.filter(
    (p) => Array.isArray(value) && value.includes(p),
  );
  if (!p.length)
    throw Error("Choose Facebook, TikTok, Instagram Reels or YouTube Shorts.");
  return p;
}
export function scenePhotoPrompt(plan: ScenePlan, index: number) {
  return [
    "Photorealistic cinematic still for an adult MM romantic fiction scene, like a photographed live-action adaptation. Preserve story-supported fantasy traits when specified in the cast (such as a demon’s horns), rendered with believable practical-effects texture rather than cartoon styling. These are fictional adult characters, not public figures or real-person likenesses. Realistic natural skin texture, facial asymmetry, believable proportions and physical lighting. Masculine adult men with clearly different faces, hair, body builds and wardrobes. No identical twins, duplicate faces, plastic skin, waxy AI beauty faces or exaggerated muscles. No text, covers, lettering, watermarks, bows, ribbons, scrapbook frames or decorative labels. Romance must be immediately visible through specific mutual attraction cues: intimate source-appropriate proximity, softened drawn eye contact, a gaze lingering at his mouth, a restrained almost-touch or source-supported affection. Keep a masculine, natural, emotionally charged intimacy. Do not stage an office conversation, unrelated eyelines, cold neutral poses or two distant stern men. Do not force a kiss or physical contact if unsupported by the story. Romance is expressed by this body language and the actual setting, never decorative props. Natural anatomy; keep hands out of frame or naturally at rest unless essential to the described scene. Compose vertically, keep faces in the upper/middle area, leave the lower part less busy for readable story text.",
    `Lead one: ${plan.cast[0]}`,
    `Lead two: ${plan.cast[1]}`,
    index === 1
      ? "CONTINUITY REFERENCE: preserve the exact same two men, identities, clothing and setting from the supplied first image. Create a genuinely different angle/action for the next moment. Do not exchange their identities."
      : "Establish the two distinct adult leads so their identities can be carried into the next shot.",
    `Scene direction: ${plan.slides[index].imagePrompt}`,
  ].join("\n\n");
}
