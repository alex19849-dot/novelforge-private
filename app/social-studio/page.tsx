"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabaseClient";

type CatalogueBook = {
  slug: string;
  title: string;
  subgenre: string;
  blurb: string;
  tropes: string[];
  heat: string;
  length: string;
  ending: string;
  contentWarnings: string[];
  kindleUnlimited: boolean;
  asin: string | null;
  amazonUrl: string;
  coverUrl: string;
  bookPageUrl: string;
};

type CatalogueResponse = {
  schemaVersion: number;
  source: string;
  count: number;
  books: CatalogueBook[];
};

type SocialPlatform = "facebook" | "instagram" | "tiktok";
type CreativeOutput = "image" | "video";
type ElementType = "cover" | "text" | "shape" | "vector" | "particles";

type Motion = {
  enter: "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom-in" | "zoom-out" | "rotate-in" | "wipe";
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
  background: { angle: number; colours: string[]; vignette: number };
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

type GeneratedMedia = { platform: SocialPlatform; dataUrl: string };
type GeneratedVideo = {
  platform: SocialPlatform;
  url: string;
  mimeType: string;
  extension: "mp4" | "webm";
};

type MotionState = {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  wipe: number;
};

const CATALOGUE_URL = "https://www.marlowquinn.com/api/books";
const PLATFORM_OPTIONS: Array<{ id: SocialPlatform; label: string }> = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

const POSTER_FONT_URLS = [
  ["PosterDisplay", "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.1.1/files/bebas-neue-latin-400-normal.woff2", "400"],
  ["PosterSans", "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.1.1/files/montserrat-latin-800-normal.woff2", "800"],
  ["PosterAccent", "https://cdn.jsdelivr.net/npm/@fontsource/caveat@5.1.1/files/caveat-latin-700-normal.woff2", "700"],
] as const;

let fontsReady: Promise<void> | null = null;

function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = Promise.all(
    POSTER_FONT_URLS.map(async ([family, url, weight]) => {
      const face = new FontFace(family, `url(${url})`, { weight });
      document.fonts.add(await face.load());
      await document.fonts.load(`${weight} 40px "${family}"`);
      if (!document.fonts.check(`${weight} 40px "${family}"`)) {
        throw new Error(`The ${family} font did not finish loading.`);
      }
    }),
  ).then(() => undefined);
  return fontsReady;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The genuine book cover could not be loaded."));
    image.src = source;
  });
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function ease(value: number): number {
  const amount = clamp(value);
  return 1 - Math.pow(1 - amount, 3);
}

function seededNumber(seed: string): number {
  let result = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    result ^= seed.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function randomUnit(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function motionState(element: DesignElement, time: number, duration: number): MotionState {
  const motion = element.motion;
  const state: MotionState = { alpha: element.opacity, dx: 0, dy: 0, scale: 1, rotation: element.rotation, wipe: 1 };
  const enterSpan = Math.max(0.001, motion.enterEnd - motion.enterStart);
  const enterProgress = ease((time - motion.enterStart) / enterSpan);

  if (motion.enter !== "none") {
    state.alpha *= enterProgress;
    const distance = Math.max(70, Math.min(element.width, element.height) * 0.24);
    if (motion.enter === "slide-left") state.dx += (1 - enterProgress) * distance;
    if (motion.enter === "slide-right") state.dx -= (1 - enterProgress) * distance;
    if (motion.enter === "slide-up") state.dy += (1 - enterProgress) * distance;
    if (motion.enter === "slide-down") state.dy -= (1 - enterProgress) * distance;
    if (motion.enter === "zoom-in") state.scale *= 0.72 + enterProgress * 0.28;
    if (motion.enter === "zoom-out") state.scale *= 1.25 - enterProgress * 0.25;
    if (motion.enter === "rotate-in") state.rotation += (1 - enterProgress) * -10;
    if (motion.enter === "wipe") state.wipe = enterProgress;
  }

  if (motion.exit !== "none" && time >= motion.exitStart) {
    const exitSpan = Math.max(0.001, motion.exitEnd - motion.exitStart);
    const exitProgress = ease((time - motion.exitStart) / exitSpan);
    state.alpha *= 1 - exitProgress;
    const distance = Math.max(70, Math.min(element.width, element.height) * 0.24);
    if (motion.exit === "slide-left") state.dx -= exitProgress * distance;
    if (motion.exit === "slide-right") state.dx += exitProgress * distance;
    if (motion.exit === "slide-up") state.dy -= exitProgress * distance;
    if (motion.exit === "slide-down") state.dy += exitProgress * distance;
  }

  if (motion.loop !== "none" && duration > 0) {
    const phase = (time / duration) * Math.PI * 4 + (seededNumber(element.id) % 100) / 20;
    const wave = Math.sin(phase);
    const strength = motion.intensity;
    if (motion.loop === "float") state.dy += wave * 14 * strength;
    if (motion.loop === "drift") state.dx += wave * 18 * strength;
    if (motion.loop === "pulse") state.scale *= 1 + wave * 0.025 * strength;
    if (motion.loop === "glow" || motion.loop === "shimmer") state.alpha *= 0.92 + (wave + 1) * 0.04;
  }
  return state;
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function roundedPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function drawCoverElement(context: CanvasRenderingContext2D, cover: HTMLImageElement, element: DesignElement) {
  const { width, height } = element;
  const presentation = element.presentation ?? "floating";
  const glow = element.glow ?? 0;
  const shadow = element.shadow ?? 0;
  const bezel = presentation === "kindle" ? Math.max(16, Math.min(width, height) * 0.045) : 0;
  const availableWidth = Math.max(1, width - bezel * 2);
  const availableHeight = Math.max(1, height - bezel * 2);
  const scale = Math.min(availableWidth / cover.naturalWidth, availableHeight / cover.naturalHeight);
  const coverWidth = cover.naturalWidth * scale;
  const coverHeight = cover.naturalHeight * scale;
  const outerWidth = coverWidth + bezel * 2;
  const outerHeight = coverHeight + bezel * 2;
  const outerX = (width - outerWidth) / 2;
  const outerY = (height - outerHeight) / 2;

  if (glow > 0) {
    context.save();
    context.shadowColor = element.glowColour ?? "#ffffff";
    context.shadowBlur = 55 * glow;
    context.fillStyle = element.glowColour ?? "#ffffff";
    context.globalAlpha *= 0.3 * glow;
    context.fillRect(outerX + outerWidth * 0.06, outerY + outerHeight * 0.06, outerWidth * 0.88, outerHeight * 0.88);
    context.restore();
  }

  context.save();
  context.shadowColor = `rgba(0,0,0,${0.35 + shadow * 0.45})`;
  context.shadowBlur = 18 + shadow * 46;
  context.shadowOffsetY = 12 + shadow * 24;

  if (presentation === "kindle") {
    roundedPath(context, outerX, outerY, outerWidth, outerHeight, Math.max(18, outerWidth * 0.045));
    const deviceGradient = context.createLinearGradient(0, 0, width, height);
    deviceGradient.addColorStop(0, "#30343b");
    deviceGradient.addColorStop(0.45, "#08090c");
    deviceGradient.addColorStop(1, "#252932");
    context.fillStyle = deviceGradient;
    context.fill();
    context.shadowColor = "transparent";
    roundedPath(context, outerX + bezel, outerY + bezel, coverWidth, coverHeight, Math.max(8, outerWidth * 0.016));
    context.clip();
    context.drawImage(cover, outerX + bezel, outerY + bezel, coverWidth, coverHeight);
  } else {
    const coverX = (width - coverWidth) / 2;
    const coverY = (height - coverHeight) / 2;
    roundedPath(context, coverX, coverY, coverWidth, coverHeight, presentation === "floating" ? Math.max(4, coverWidth * 0.012) : 0);
    context.clip();
    context.drawImage(cover, coverX, coverY, coverWidth, coverHeight);
  }
  context.restore();
}

function textLines(context: CanvasRenderingContext2D, text: string, maximumWidth: number): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maximumWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (!paragraph.trim() && paragraphIndex < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function fontFamily(font: DesignElement["font"]): string {
  if (font === "accent") return '"PosterAccent", cursive';
  if (font === "display") return '"PosterDisplay", "Arial Narrow", sans-serif';
  return '"PosterSans", Arial, sans-serif';
}

function drawTextElement(context: CanvasRenderingContext2D, element: DesignElement) {
  const rawText = element.uppercase ? (element.text ?? "").toUpperCase() : element.text ?? "";
  if (!rawText) return;
  const start = element.fontSize ?? 64;
  const minimum = Math.min(start, element.minimumFontSize ?? 24);
  const maximumLines = element.maxLines ?? 6;
  const lineHeightRatio = element.lineHeight ?? 1;
  const weight = element.font === "display" ? 400 : element.weight ?? 800;
  let size = start;
  let lines: string[] = [];

  while (size >= minimum) {
    context.font = `${weight} ${size}px ${fontFamily(element.font)}`;
    lines = textLines(context, rawText, element.width);
    const height = lines.length * size * lineHeightRatio;
    const wordsFit = lines.every((line) => !line || context.measureText(line).width <= element.width + 0.5);
    if (lines.length <= maximumLines && height <= element.height && wordsFit) break;
    size -= 2;
  }

  context.font = `${weight} ${size}px ${fontFamily(element.font)}`;
  lines = textLines(context, rawText, element.width);
  if (size < minimum || lines.length > maximumLines || lines.length * size * lineHeightRatio > element.height) {
    throw new Error(`The text “${rawText.slice(0, 70)}” cannot fit safely. Ask for less wording or a larger text area.`);
  }

  context.fillStyle = element.colour ?? "#ffffff";
  context.textBaseline = "top";
  context.textAlign = element.align ?? "left";
  const x = element.align === "center" ? element.width / 2 : element.align === "right" ? element.width : 0;
  lines.forEach((line, index) => context.fillText(line, x, index * size * lineHeightRatio));
}

function localPoint(value: number, extent: number): number {
  return value >= 0 && value <= 100 ? (value / 100) * extent : value;
}

function drawShapeElement(context: CanvasRenderingContext2D, element: DesignElement) {
  const shape = element.shape ?? "block";
  context.fillStyle = element.fill ?? "rgba(255,255,255,0)";
  context.strokeStyle = element.stroke ?? "rgba(255,255,255,0)";
  context.lineWidth = element.strokeWidth ?? 0;

  if (shape === "glow") {
    const gradient = context.createRadialGradient(element.width / 2, element.height / 2, 0, element.width / 2, element.height / 2, Math.max(element.width, element.height) / 2);
    gradient.addColorStop(0, element.fill ?? "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, element.width, element.height);
    return;
  }

  if (shape === "gradient-band") {
    const gradient = context.createLinearGradient(0, 0, element.width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.22, element.fill ?? "rgba(255,255,255,0.65)");
    gradient.addColorStop(0.78, element.fill ?? "rgba(255,255,255,0.65)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, element.width, element.height);
    return;
  }

  if (shape === "ellipse") {
    context.beginPath();
    context.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
  } else if (shape === "line") {
    context.beginPath();
    context.moveTo(0, element.height / 2);
    context.lineTo(element.width, element.height / 2);
  } else if (shape === "paint" && element.points && element.points.length >= 6) {
    context.beginPath();
    for (let index = 0; index + 1 < element.points.length; index += 2) {
      const x = localPoint(element.points[index], element.width);
      const y = localPoint(element.points[index + 1], element.height);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  } else {
    roundedPath(context, 0, 0, element.width, element.height, element.radius ?? 0);
  }
  if (shape !== "line") context.fill();
  if ((element.strokeWidth ?? 0) > 0 || shape === "line") context.stroke();
}

function drawVectorElement(context: CanvasRenderingContext2D, element: DesignElement) {
  (element.primitives ?? []).forEach((primitive) => {
    const x = localPoint(primitive.x, element.width);
    const y = localPoint(primitive.y, element.height);
    const width = localPoint(primitive.width, element.width);
    const height = localPoint(primitive.height, element.height);
    context.fillStyle = primitive.fill;
    context.strokeStyle = primitive.stroke;
    context.lineWidth = primitive.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    if (primitive.kind === "ellipse") {
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (primitive.kind === "rect") {
      context.roundRect(x, y, width, height, primitive.radius);
    } else if (primitive.kind === "polyline" && primitive.points.length >= 4) {
      primitive.points.forEach((point, index) => {
        if (index % 2 !== 0) return;
        const pointX = localPoint(point, element.width);
        const pointY = localPoint(primitive.points[index + 1], element.height);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      });
    } else {
      context.moveTo(x, y);
      context.lineTo(x + width, y + height);
    }
    if (primitive.fill !== "rgba(255,255,255,0)") context.fill();
    if (primitive.strokeWidth > 0) context.stroke();
  });
}

function drawParticlesElement(context: CanvasRenderingContext2D, element: DesignElement, time: number) {
  const count = element.count ?? 18;
  const seed = seededNumber(element.id);
  context.fillStyle = element.colour ?? "#ffffff";
  for (let index = 0; index < count; index += 1) {
    const first = randomUnit(seed + index * 3);
    const second = randomUnit(seed + index * 3 + 1);
    const third = randomUnit(seed + index * 3 + 2);
    const drift = element.motion.loop === "drift" ? time * (8 + third * 12) : 0;
    const x = (first * element.width + drift) % element.width;
    const y = second * element.height;
    const size = element.particleStyle === "bokeh" ? 8 + third * 28 : 2 + third * 7;
    context.globalAlpha *= 0.25 + third * 0.65;
    context.beginPath();
    if (element.particleStyle === "confetti") context.rect(x, y, size * 0.5, size * 1.8);
    else context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha /= 0.25 + third * 0.65;
  }
}

function drawBackground(context: CanvasRenderingContext2D, plan: DesignPlan) {
  const colours = plan.background.colours.length >= 2 ? plan.background.colours : ["#080910", "#171927"];
  const angle = (plan.background.angle * Math.PI) / 180;
  const radius = Math.abs(plan.width * Math.cos(angle)) + Math.abs(plan.height * Math.sin(angle));
  const centreX = plan.width / 2;
  const centreY = plan.height / 2;
  const gradient = context.createLinearGradient(
    centreX - (Math.cos(angle) * radius) / 2,
    centreY - (Math.sin(angle) * radius) / 2,
    centreX + (Math.cos(angle) * radius) / 2,
    centreY + (Math.sin(angle) * radius) / 2,
  );
  colours.forEach((colour, index) => gradient.addColorStop(index / (colours.length - 1), colour));
  context.fillStyle = gradient;
  context.fillRect(0, 0, plan.width, plan.height);

  if (plan.background.vignette > 0) {
    const vignette = context.createRadialGradient(centreX, centreY, Math.min(plan.width, plan.height) * 0.18, centreX, centreY, Math.max(plan.width, plan.height) * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${plan.background.vignette})`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, plan.width, plan.height);
  }
}

function assertPlan(plan: DesignPlan) {
  const expectedHeight = plan.width === 1080 && plan.height === 1920 ? 1920 : 1350;
  if (plan.width !== 1080 || plan.height !== expectedHeight) {
    throw new Error("The generated design returned the wrong canvas size.");
  }
  if (plan.elements.filter((element) => element.type === "cover").length !== 1) {
    throw new Error("The generated design must use the genuine cover exactly once.");
  }
  plan.elements.forEach((element) => {
    if (element.x < 0 || element.y < 0 || element.x + element.width > plan.width || element.y + element.height > plan.height) {
      throw new Error(`The generated ${element.id} layer escaped the canvas.`);
    }
  });
}

function drawScene(context: CanvasRenderingContext2D, plan: DesignPlan, cover: HTMLImageElement, time: number) {
  context.clearRect(0, 0, plan.width, plan.height);
  drawBackground(context, plan);
  const duration = plan.durationSeconds;

  plan.elements.forEach((element) => {
    const state = motionState(element, time, duration);
    if (state.alpha <= 0.001 || state.wipe <= 0.001) return;
    context.save();
    context.globalAlpha = clamp(state.alpha);
    context.translate(element.x + element.width / 2 + state.dx, element.y + element.height / 2 + state.dy);
    context.rotate((state.rotation * Math.PI) / 180);
    context.scale(state.scale, state.scale);
    context.translate(-element.width / 2, -element.height / 2);
    if (state.wipe < 1) {
      context.beginPath();
      context.rect(0, 0, element.width * state.wipe, element.height);
      context.clip();
    }
    if (element.type === "cover") drawCoverElement(context, cover, element);
    if (element.type === "text") drawTextElement(context, element);
    if (element.type === "shape") drawShapeElement(context, element);
    if (element.type === "vector") drawVectorElement(context, element);
    if (element.type === "particles") drawParticlesElement(context, element, time);
    context.restore();
  });
}

async function renderPoster(book: CatalogueBook, post: GeneratedPost): Promise<string> {
  await ensureFonts();
  assertPlan(post.designPlan);
  const cover = await loadImage(book.coverUrl);
  const canvas = document.createElement("canvas");
  canvas.width = post.designPlan.width;
  canvas.height = post.designPlan.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not create the poster canvas.");
  drawScene(context, post.designPlan, cover, 0);
  return canvas.toDataURL("image/jpeg", 0.95);
}

function videoRecorderMimeType(): string {
  const candidates = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

async function renderMotionVideo(book: CatalogueBook, post: GeneratedPost): Promise<{ blob: Blob; mimeType: string }> {
  await ensureFonts();
  assertPlan(post.designPlan);
  if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot create video files.");
  const mimeType = videoRecorderMimeType();
  if (!mimeType) throw new Error("This browser has no supported video recording format.");
  const cover = await loadImage(book.coverUrl);
  const canvas = document.createElement("canvas");
  canvas.width = post.designPlan.width;
  canvas.height = post.designPlan.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not create the video canvas.");
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const durationSeconds = clamp(post.designPlan.durationSeconds || 8, 5, 15);
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("The browser video recorder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start(250);
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const seconds = Math.min(durationSeconds, (now - startedAt) / 1000);
      drawScene(context!, post.designPlan, cover, seconds);
      if (seconds >= durationSeconds) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach((track) => track.stop());
  if (!blob.size) throw new Error("The browser returned an empty video file.");
  return { blob, mimeType };
}

export default function SocialStudioPage() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState("");
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["facebook", "instagram", "tiktok"]);
  const [instructions, setInstructions] = useState("");
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [images, setImages] = useState<GeneratedMedia[]>([]);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [edits, setEdits] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<SocialPlatform | null>(null);

  function clearResults() {
    setPosts([]);
    setImages([]);
    setVideos((current) => {
      current.forEach((video) => URL.revokeObjectURL(video.url));
      return [];
    });
    setEdits({});
    setError("");
    setMessage("");
  }

  function chooseBook(book: CatalogueBook) {
    setSelectedBook(book);
    setPlatforms(["facebook", "instagram", "tiktok"]);
    setInstructions("");
    clearResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePlatform(platform: SocialPlatform) {
    setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
    clearResults();
  }

  async function requestDesign(outputType: CreativeOutput, requestedPlatforms: SocialPlatform[], revision = "", previousPlans: DesignPlan[] = []) {
    if (!selectedBook) throw new Error("Choose a book first.");
    const response = await fetch("/api/social-studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book: selectedBook,
        campaignType: "custom",
        platforms: requestedPlatforms,
        instructions: instructions.trim(),
        outputType,
        revision,
        previousPlans,
      }),
    });
    const result = (await response.json()) as { posts?: GeneratedPost[]; error?: string };
    if (!response.ok || !result.posts) throw new Error(result.error || "The design could not be generated.");
    return result.posts;
  }

  async function createCampaign(outputType: CreativeOutput) {
    if (!selectedBook || !platforms.length) return;
    if (!instructions.trim()) {
      setError("Describe exactly what you want first.");
      return;
    }
    setBusy(outputType);
    setError("");
    setMessage("");
    clearResults();
    try {
      const nextPosts = await requestDesign(outputType, platforms);
      setPosts(nextPosts);
      if (outputType === "image") {
        const nextImages: GeneratedMedia[] = [];
        for (const post of nextPosts) {
          setBusy(`image-${post.platform}`);
          nextImages.push({ platform: post.platform, dataUrl: await renderPoster(selectedBook, post) });
        }
        setImages(nextImages);
      } else {
        const nextVideos: GeneratedVideo[] = [];
        for (const post of nextPosts) {
          setBusy(`video-${post.platform}`);
          const result = await renderMotionVideo(selectedBook, post);
          nextVideos.push({
            platform: post.platform,
            url: URL.createObjectURL(result.blob),
            mimeType: result.mimeType,
            extension: result.mimeType.includes("mp4") ? "mp4" : "webm",
          });
        }
        setVideos(nextVideos);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The campaign could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function revise(post: GeneratedPost, outputType: CreativeOutput) {
    if (!selectedBook) return;
    const revision = edits[post.platform]?.trim();
    if (!revision) {
      setError("Describe the change you want first.");
      return;
    }
    setBusy(`revise-${outputType}-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const [replacement] = await requestDesign(outputType, [post.platform], revision, [post.designPlan]);
      setPosts((current) => current.map((item) => item.platform === post.platform ? replacement : item));
      if (outputType === "image") {
        const dataUrl = await renderPoster(selectedBook, replacement);
        setImages((current) => [...current.filter((item) => item.platform !== post.platform), { platform: post.platform, dataUrl }]);
      } else {
        const result = await renderMotionVideo(selectedBook, replacement);
        setVideos((current) => {
          current.find((item) => item.platform === post.platform)?.url && URL.revokeObjectURL(current.find((item) => item.platform === post.platform)!.url);
          return [...current.filter((item) => item.platform !== post.platform), {
            platform: post.platform,
            url: URL.createObjectURL(result.blob),
            mimeType: result.mimeType,
            extension: result.mimeType.includes("mp4") ? "mp4" : "webm",
          }];
        });
      }
      setEdits((current) => ({ ...current, [post.platform]: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The requested change could not be made.");
    } finally {
      setBusy("");
    }
  }

  async function copyPost(post: GeneratedPost) {
    await navigator.clipboard.writeText([post.title, post.caption, post.hashtags.join(" ")].filter(Boolean).join("\n\n"));
    setCopied(post.platform);
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function publish(post: GeneratedPost, mediaType: CreativeOutput, source: string, extension: string, mimeType: string) {
    if (!selectedBook) return;
    if (mediaType === "video" && extension !== "mp4") {
      setError("This browser made a WebM video. Use current Chrome or Edge to create the MP4 required for publishing.");
      return;
    }
    setBusy(`publish-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (sessionError || !user) throw new Error("Your NovelForge session has expired. Sign in again.");
      const mediaResponse = await fetch(source);
      if (!mediaResponse.ok) throw new Error("The finished media could not be prepared.");
      const blob = await mediaResponse.blob();
      const prefix = `${post.platform}-${mediaType}-`;
      const { data: existing, error: listError } = await supabase.storage.from("social-media").list(user.id, { limit: 100, search: prefix });
      if (listError) throw new Error(listError.message);
      const oldPaths = (existing ?? []).filter((file) => file.name.startsWith(prefix)).map((file) => `${user.id}/${file.name}`);
      if (oldPaths.length) {
        const { error: removeError } = await supabase.storage.from("social-media").remove(oldPaths);
        if (removeError) throw new Error(removeError.message);
      }
      const objectPath = `${user.id}/${prefix}${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("social-media").upload(objectPath, blob, {
        cacheControl: "3600",
        contentType: mimeType || blob.type,
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: publicUrl } = supabase.storage.from("social-media").getPublicUrl(objectPath);
      const response = await fetch("/api/social-studio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: post.platform,
          bookTitle: selectedBook.title,
          bookSlug: selectedBook.slug,
          campaignTitle: post.title,
          caption: post.caption,
          hashtags: post.hashtags,
          mediaUrl: publicUrl.publicUrl,
          mediaType,
          amazonUrl: selectedBook.amazonUrl,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Make rejected the campaign.");
      setMessage(`${post.platform} ${mediaType} sent for publishing.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The media could not be published.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    let active = true;
    async function loadCatalogue() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/story-chat");
        return;
      }
      try {
        const response = await fetch(CATALOGUE_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`The website catalogue returned ${response.status}.`);
        const result = (await response.json()) as CatalogueResponse;
        if (!Array.isArray(result.books)) throw new Error("The website catalogue returned invalid book data.");
        if (active) setCatalogue(result);
      } catch (caught) {
        if (active) setCatalogueError(caught instanceof Error ? caught.message : "The website catalogue could not be loaded.");
      }
    }
    void loadCatalogue();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <a href="/story-chat" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl transition hover:bg-white/10" aria-label="Back to NovelForge">←</a>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">NovelForge</p>
            <h1 className="text-2xl font-semibold">Social Studio</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        {selectedBook && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-pink-500/30 bg-neutral-900 shadow-2xl">
            <div className="flex gap-5 border-b border-white/10 p-5">
              <img src={selectedBook.coverUrl} alt={`${selectedBook.title} book cover`} className="h-44 w-28 shrink-0 rounded-lg object-cover shadow-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Selected book</p>
                <h2 className="mt-2 text-2xl font-bold">{selectedBook.title}</h2>
                <p className="mt-1 text-sm text-neutral-400">{selectedBook.subgenre}</p>
              </div>
              <button type="button" onClick={() => setSelectedBook(null)} className="h-10 w-10 rounded-xl border border-white/10 bg-white/5" aria-label="Close campaign setup">✕</button>
            </div>

            <div className="p-5">
              <label htmlFor="creative-guidance" className="text-lg font-bold">Tell NovelForge exactly what to create</label>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">Nothing is added automatically. Name the words, colours, cover treatment, placement, icons, shapes, effects and movement you want.</p>
              <textarea
                id="creative-guidance"
                value={instructions}
                onChange={(event) => { setInstructions(event.target.value); clearResults(); }}
                rows={8}
                placeholder="Example: Make a bold asymmetrical poster. Put the genuine cover very large on the left without a Kindle. Use a clean black background with sharp red light. Put the exact heading PARANORMAL ROMANCE at the upper right. Add no icons, ribbons, particles, extra wording or Kindle Unlimited text."
                className="mt-4 w-full resize-y rounded-2xl border border-white/15 bg-neutral-950 px-5 py-4 text-base leading-7 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
              />

              <h3 className="mt-6 font-semibold">Platforms</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {PLATFORM_OPTIONS.map((platform) => (
                  <button key={platform.id} type="button" onClick={() => togglePlatform(platform.id)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${platforms.includes(platform.id) ? "border-pink-500 bg-pink-500 text-white" : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"}`}>
                    {platforms.includes(platform.id) ? "✓ " : ""}{platform.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void createCampaign("image")} disabled={Boolean(busy) || !platforms.length} className="rounded-xl bg-pink-500 px-4 py-4 font-bold transition hover:bg-pink-400 disabled:opacity-40">{busy ? "Working..." : "Create Posters"}</button>
                <button type="button" onClick={() => void createCampaign("video")} disabled={Boolean(busy) || !platforms.length} className="rounded-xl border border-violet-400/50 bg-violet-500/15 px-4 py-4 font-bold text-violet-100 transition hover:bg-violet-500/25 disabled:opacity-40">{busy ? "Working..." : "Create Videos"}</button>
              </div>

              {error && <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
              {message && <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</p>}

              {posts.length > 0 && (
                <div className="mt-8 space-y-5 border-t border-white/10 pt-6">
                  {posts.map((post) => {
                    const image = images.find((item) => item.platform === post.platform);
                    const video = videos.find((item) => item.platform === post.platform);
                    return (
                      <article key={post.platform} className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-lg font-bold capitalize">{post.platform}</h3>
                          <button type="button" onClick={() => void copyPost(post)} className="rounded-lg border border-pink-500/40 bg-pink-500/10 px-3 py-2 text-sm font-semibold text-pink-200">{copied === post.platform ? "Copied" : "Copy post"}</button>
                        </div>
                        {image && (
                          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
                            <img src={image.dataUrl} alt={`${post.platform} campaign for ${selectedBook.title}`} className="mx-auto max-h-[760px] w-auto rounded-xl object-contain" />
                            <a href={image.dataUrl} download={`${selectedBook.slug}-${post.platform}.jpg`} className="mt-3 flex w-full justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold">Download Finished Image</a>
                            <button type="button" onClick={() => void publish(post, "image", image.dataUrl, "jpg", "image/jpeg")} disabled={Boolean(busy)} className="mt-3 w-full rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 disabled:opacity-40">Publish Image to {post.platform}</button>
                          </div>
                        )}
                        {video && (
                          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
                            <video src={video.url} controls playsInline className="mx-auto max-h-[760px] w-auto rounded-xl" />
                            <a href={video.url} download={`${selectedBook.slug}-${post.platform}.${video.extension}`} className="mt-3 flex w-full justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold">Download Finished Video</a>
                            <button type="button" onClick={() => void publish(post, "video", video.url, video.extension, video.mimeType)} disabled={Boolean(busy)} className="mt-3 w-full rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 disabled:opacity-40">Publish Video to {post.platform}</button>
                          </div>
                        )}
                        <div className="mt-5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Caption</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">{post.caption}</p>
                          <p className="mt-3 text-sm text-pink-300">{post.hashtags.join(" ")}</p>
                        </div>
                        <div className="mt-5 rounded-2xl border border-pink-500/25 bg-pink-500/5 p-4">
                          <label htmlFor={`edit-${post.platform}`} className="font-semibold text-pink-100">Change this result</label>
                          <textarea id={`edit-${post.platform}`} value={edits[post.platform] ?? ""} onChange={(event) => setEdits((current) => ({ ...current, [post.platform]: event.target.value }))} rows={3} placeholder="Say exactly what to change. Everything else will be kept." className="mt-3 w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-pink-500" />
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <button type="button" onClick={() => void revise(post, "image")} disabled={Boolean(busy)} className="rounded-xl bg-white px-4 py-3 font-semibold text-neutral-950 disabled:opacity-40">Update Poster</button>
                            <button type="button" onClick={() => void revise(post, "video")} disabled={Boolean(busy)} className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-100 disabled:opacity-40">Update Video</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {!catalogue && !catalogueError && <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-neutral-400">Loading your books...</div>}
        {catalogueError && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">{catalogueError}</div>}
        {catalogue && (
          <>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Website catalogue</p>
              <h2 className="mt-2 text-2xl font-bold">Choose a book to promote</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue.books.map((book) => (
                <article key={book.slug} className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl">
                  <div className="aspect-[16/11] bg-neutral-800 p-4"><img src={book.coverUrl} alt={`${book.title} book cover`} className="h-full w-full object-contain drop-shadow-2xl" loading="lazy" /></div>
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-pink-400">{book.subgenre}</p>
                    <h3 className="mt-2 text-xl font-bold">{book.title}</h3>
                    <button type="button" onClick={() => chooseBook(book)} className="mt-5 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold transition hover:bg-pink-400">Use This Book</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
