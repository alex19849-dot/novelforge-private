"use client";

import { useEffect, useRef, useState } from "react";

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

type QualityCheck = {
  decision: "pass" | "review";
  summary: string;
  promptAdherence: number;
  legibility: number;
  coverFidelity: number;
};

type GeneratedPost = {
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  visualDirection: string;
  imageDataUrl: string;
  sourceResponseId: string;
  qualityCheck: QualityCheck;
};

type GeneratedMedia = {
  platform: SocialPlatform;
  dataUrl: string;
};

type GeneratedVideo = {
  platform: SocialPlatform;
  url: string;
  mimeType: string;
  extension: "mp4" | "webm";
};

const CATALOGUE_URL = "https://www.marlowquinn.com/api/books";
const PLATFORM_OPTIONS: Array<{ id: SocialPlatform; label: string }> = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

function dimensions(platform: SocialPlatform) {
  return platform === "tiktok"
    ? { width: 1080, height: 1920 }
    : { width: 1080, height: 1350 };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The generated artwork could not be loaded."));
    image.src = source;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

async function normalizePoster(source: string, platform: SocialPlatform): Promise<string> {
  const image = await loadImage(source);
  const { width, height } = dimensions(platform);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the finished poster.");

  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const fittedWidth = image.naturalWidth * scale;
  const fittedHeight = image.naturalHeight * scale;
  const fittedX = (width - fittedWidth) / 2;
  const fittedY = (height - fittedHeight) / 2;

  context.save();
  context.filter = "blur(32px) brightness(0.42) saturate(0.85)";
  context.translate(width / 2, height / 2);
  context.scale(1.12, 1.12);
  context.translate(-width / 2, -height / 2);
  drawImageCover(context, image, width, height);
  context.restore();

  context.fillStyle = "rgba(0, 0, 0, 0.18)";
  context.fillRect(0, 0, width, height);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.5)";
  context.shadowBlur = 28;
  context.drawImage(image, fittedX, fittedY, fittedWidth, fittedHeight);
  context.restore();

  return canvas.toDataURL("image/jpeg", 0.96);
}

function recorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function seededParticles(width: number, height: number) {
  let seed = width + height;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: 44 }, () => ({
    x: random() * width,
    y: random() * height,
    size: 1 + random() * 5,
    speed: 18 + random() * 42,
    alpha: 0.12 + random() * 0.28,
  }));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - clamp01(value), 3);
}

function drawFittedVideoText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maximumWidth: number,
  startingSize: number,
  minimumSize: number,
) {
  let size = startingSize;
  context.font = `900 ${size}px Arial, sans-serif`;
  while (size > minimumSize && context.measureText(text).width > maximumWidth) {
    size -= 2;
    context.font = `900 ${size}px Arial, sans-serif`;
  }
  context.fillText(text, x, y, maximumWidth);
}

function posterAccent(image: HTMLImageElement): [number, number, number] {
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 32;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return [236, 72, 153];
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  let best: [number, number, number] = [236, 72, 153];
  let bestScore = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const colour = maximum - minimum;
    const brightness = (red + green + blue) / 3;
    const score = colour * (1 - Math.abs(brightness - 155) / 190);
    if (brightness > 45 && brightness < 235 && score > bestScore) {
      bestScore = score;
      best = [red, green, blue];
    }
  }
  return best;
}

async function createMotionVideo(
  source: string,
  platform: SocialPlatform,
  book: CatalogueBook,
  post: GeneratedPost,
  guidance: string,
) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot render campaign videos.");
  }

  const mimeType = recorderMimeType();
  if (!mimeType) throw new Error("This browser has no supported video encoder.");

  const image = await loadImage(source);
  const cover = await loadImage(book.coverUrl);
  const { width, height } = dimensions(platform);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not render the campaign video.");

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("The browser video encoder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const duration = 10.5;
  const start = performance.now();
  const particles = seededParticles(width, height);
  const [accentRed, accentGreen, accentBlue] = posterAccent(image);
  const accent = `rgb(${accentRed}, ${accentGreen}, ${accentBlue})`;
  const accentSoft = `rgba(${accentRed}, ${accentGreen}, ${accentBlue}, 0.28)`;
  const lowerGuidance = guidance.toLowerCase();
  const explicitTropes = guidance.match(
    /(?:include|show|use|add)?\s*(?:the\s+)?tropes?\s*:?[\s]+(.+?)(?:\s+(?:down|along|stacked|beside|around|on\s+the|at\s+the|with\s+(?:modern|icons))|[.\n]|$)/i,
  )?.[1]
    .split(/\s*(?:,|;|\||\/)\s*/)
    .map((value) => value.trim())
    .filter((value) => value.length > 1 && value.length < 70)
    .slice(0, 5) ?? [];
  const requestedCatalogueTropes = book.tropes.filter((trope) =>
    lowerGuidance.includes(trope.toLowerCase()),
  );
  const tropes = (
    explicitTropes.length
      ? explicitTropes
      : requestedCatalogueTropes.length
        ? requestedCatalogueTropes
        : book.tropes
  ).filter(Boolean).slice(0, 5);
  const requestsKindle = /\b(kindle|e-reader|ereader|device)\b/i.test(guidance);
  const requestsRight = /\b(?:cover|kindle|book)\b[^.\n]{0,35}\b(?:on\s+the\s+)?right\b/i.test(guidance);
  const requestsLeft = /\b(?:cover|kindle|book)\b[^.\n]{0,35}\b(?:on\s+the\s+)?left\b/i.test(guidance);
  const coverSide: "left" | "right" | "center" = requestsRight
    ? "right"
    : requestsLeft
      ? "left"
      : "center";
  const smoky = /gothic|vampire|dark|smoke|mist|paranormal|night/i.test(guidance);
  const fiery = /fire|flame|ember|hot|spicy|burn/i.test(guidance);
  const icy = /ice|hockey|winter|snow|cold/i.test(guidance);
  const floral = /flower|floral|rose|petal|spring|garden/i.test(guidance);
  const energetic = /sport|football|hockey|energy|fast|action|bold/i.test(guidance);
  recorder.start(250);

  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const elapsed = Math.min(duration, (now - start) / 1000);
      const progress = elapsed / duration;
      const fade = Math.min(1, elapsed / 0.45, (duration - elapsed) / 0.55);

      context.save();
      context.clearRect(0, 0, width, height);
      context.globalAlpha = fade;
      context.filter = `blur(${platform === "tiktok" ? 26 : 21}px) brightness(0.62) saturate(1.32)`;
      const backdropScale = 1.12 + 0.035 * Math.sin(progress * Math.PI);
      context.translate(
        width / 2 + Math.sin(progress * Math.PI * 2) * width * 0.022,
        height / 2 + Math.cos(progress * Math.PI * 1.5) * height * 0.018,
      );
      context.scale(backdropScale, backdropScale);
      context.drawImage(image, -width / 2, -height / 2, width, height);
      context.restore();

      context.save();
      context.globalAlpha = fade;
      const cinematicShade = context.createLinearGradient(0, 0, 0, height);
      cinematicShade.addColorStop(0, "rgba(0,0,0,0.42)");
      cinematicShade.addColorStop(0.28, "rgba(0,0,0,0.08)");
      cinematicShade.addColorStop(0.7, "rgba(0,0,0,0.15)");
      cinematicShade.addColorStop(1, "rgba(0,0,0,0.58)");
      context.fillStyle = cinematicShade;
      context.fillRect(0, 0, width, height);
      context.restore();

      context.save();
      context.globalCompositeOperation = "screen";
      const glowX = width * (-0.25 + progress * 1.5);
      const glow = context.createRadialGradient(
        glowX,
        height * (0.28 + 0.18 * Math.sin(progress * Math.PI)),
        0,
        glowX,
        height * 0.42,
        width * 0.62,
      );
      glow.addColorStop(0, `rgba(${accentRed}, ${accentGreen}, ${accentBlue}, 0.34)`);
      glow.addColorStop(0.32, `rgba(${accentRed}, ${accentGreen}, ${accentBlue}, 0.1)`);
      glow.addColorStop(1, `rgba(${accentRed}, ${accentGreen}, ${accentBlue}, 0)`);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        const y = (particle.y - elapsed * particle.speed + height) % height;
        const direction = icy ? -1 : 1;
        const x = (particle.x + direction * elapsed * (energetic ? 34 : 8) + width) % width;
        context.globalAlpha = particle.alpha * fade * (0.55 + 0.45 * Math.sin(elapsed + particle.x));
        context.fillStyle = particle.x % Math.max(1, width * 0.17) < width * 0.085 ? accent : "#ffffff";
        if (fiery || floral || icy) {
          context.save();
          context.translate(x, y);
          context.rotate(elapsed + particle.x);
          context.fillRect(-particle.size * 0.55, -particle.size * 1.7, particle.size * 1.1, particle.size * 3.4);
          context.restore();
          continue;
        }
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      if (smoky) {
        context.save();
        context.globalCompositeOperation = "screen";
        for (let cloud = 0; cloud < 4; cloud += 1) {
          const cloudX = ((elapsed * (18 + cloud * 5) + cloud * width * 0.29) % (width * 1.4)) - width * 0.2;
          const cloudY = height * (0.28 + cloud * 0.16 + 0.025 * Math.sin(elapsed + cloud));
          const mist = context.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, width * 0.32);
          mist.addColorStop(0, `rgba(${accentRed},${accentGreen},${accentBlue},0.08)`);
          mist.addColorStop(1, `rgba(${accentRed},${accentGreen},${accentBlue},0)`);
          context.fillStyle = mist;
          context.fillRect(0, cloudY - width * 0.34, width, width * 0.68);
        }
        context.restore();
      }

      const heroStart = 0.45;
      const heroEntrance = easeOutCubic((elapsed - heroStart) / 0.95);
      const heroAlpha = heroEntrance * fade;
      const coverRatio = cover.naturalWidth / cover.naturalHeight;
      let coverHeight = height * (coverSide === "center" ? 0.48 : 0.43);
      let coverWidth = coverHeight * coverRatio;
      const maximumCoverWidth = width * (coverSide === "center" ? 0.58 : 0.49);
      if (coverWidth > maximumCoverWidth) {
        coverWidth = maximumCoverWidth;
        coverHeight = coverWidth / coverRatio;
      }
      const framePaddingX = requestsKindle ? width * 0.025 : width * 0.009;
      const framePaddingTop = requestsKindle ? width * 0.025 : width * 0.009;
      const framePaddingBottom = requestsKindle ? width * 0.065 : width * 0.009;
      const frameWidth = coverWidth + framePaddingX * 2;
      const frameHeight = coverHeight + framePaddingTop + framePaddingBottom;
      const heroX = coverSide === "left" ? width * 0.31 : coverSide === "right" ? width * 0.69 : width * 0.5;
      const heroY = height * (coverSide === "center" ? 0.49 : 0.52);
      const entranceDirection = coverSide === "right" ? 1 : -1;
      const animatedHeroX = heroX + (1 - heroEntrance) * entranceDirection * width * 0.42;
      const heroScale = 0.82 + heroEntrance * 0.18 + 0.012 * Math.sin(elapsed * 1.15);
      const heroRotation = entranceDirection * (1 - heroEntrance) * 0.11 + Math.sin(elapsed * 0.7) * 0.008;

      context.save();
      context.globalAlpha = Math.max(0, heroAlpha);
      context.translate(animatedHeroX, heroY);
      context.rotate(heroRotation);
      context.scale(heroScale, heroScale);
      context.shadowColor = accentSoft;
      context.shadowBlur = 54;
      context.shadowOffsetY = 28;
      context.fillStyle = requestsKindle ? "#111318" : "rgba(255,255,255,0.9)";
      context.beginPath();
      context.roundRect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight, requestsKindle ? 28 : 8);
      context.fill();
      context.shadowColor = "transparent";
      context.drawImage(
        cover,
        -coverWidth / 2,
        -frameHeight / 2 + framePaddingTop,
        coverWidth,
        coverHeight,
      );
      if (requestsKindle) {
        context.fillStyle = "rgba(255,255,255,0.42)";
        context.font = `700 ${Math.max(16, framePaddingBottom * 0.34)}px Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("kindle", 0, frameHeight / 2 - framePaddingBottom * 0.46);
        const reflection = context.createLinearGradient(-coverWidth / 2, 0, coverWidth / 2, 0);
        reflection.addColorStop(0, "rgba(255,255,255,0)");
        reflection.addColorStop(0.62, "rgba(255,255,255,0.12)");
        reflection.addColorStop(0.8, "rgba(255,255,255,0)");
        context.fillStyle = reflection;
        context.fillRect(-coverWidth / 2, -frameHeight / 2 + framePaddingTop, coverWidth, coverHeight);
      }
      context.restore();

      const hookAlpha = clamp01((elapsed - 0.15) / 0.65) * clamp01((4.2 - elapsed) / 0.55) * fade;
      if (hookAlpha > 0) {
        context.save();
        context.globalAlpha = hookAlpha;
        context.translate(0, (1 - easeOutCubic((elapsed - 0.15) / 0.65)) * -height * 0.04);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "rgba(0,0,0,0.95)";
        context.shadowBlur = 34;
        context.fillStyle = "#ffffff";
        drawFittedVideoText(
          context,
          post.title.toUpperCase(),
          width / 2,
          height * 0.105,
          width * 0.86,
          platform === "tiktok" ? 76 : 64,
          34,
        );
        context.fillStyle = accent;
        context.fillRect(width * 0.33, height * 0.145, width * 0.34, 7);
        context.restore();
      }

      if (elapsed >= 2.35 && elapsed < 8.0 && tropes.length) {
        const local = elapsed - 2.35;
        const beatLength = 5.65 / tropes.length;
        const activeIndex = Math.min(tropes.length - 1, Math.floor(local / beatLength));
        const beat = (local - activeIndex * beatLength) / beatLength;
        const tropeAlpha = easeOutCubic(beat / 0.24) * clamp01((1 - beat) / 0.16);
        const textX = coverSide === "left" ? width * 0.76 : coverSide === "right" ? width * 0.24 : width * 0.5;
        const textY = coverSide === "center" ? height * 0.76 : height * 0.51;
        const textWidth = coverSide === "center" ? width * 0.82 : width * 0.4;
        context.save();
        context.globalAlpha = tropeAlpha * fade;
        context.translate(textX + (1 - easeOutCubic(beat / 0.24)) * width * 0.09, textY);
        context.fillStyle = "rgba(0,0,0,0.66)";
        context.beginPath();
        context.roundRect(-textWidth / 2, -height * 0.075, textWidth, height * 0.15, 24);
        context.fill();
        drawTropeIcon(context, tropes[activeIndex], 0, -height * 0.024, Math.min(58, width * 0.055), accent);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = accentSoft;
        context.shadowBlur = 32;
        context.fillStyle = "#ffffff";
        drawFittedVideoText(
          context,
          tropes[activeIndex].toUpperCase(),
          0,
          height * 0.038,
          textWidth * 0.86,
          platform === "tiktok" ? 53 : 45,
          24,
        );
        context.restore();
      }

      const ctaAlpha = clamp01((elapsed - 8.0) / 0.7) * clamp01((duration - elapsed) / 0.5) * fade;
      if (ctaAlpha > 0) {
        context.save();
        context.globalAlpha = ctaAlpha;
        const footer = context.createLinearGradient(0, height * 0.74, 0, height);
        footer.addColorStop(0, "rgba(0,0,0,0)");
        footer.addColorStop(0.34, "rgba(0,0,0,0.86)");
        footer.addColorStop(1, "rgba(0,0,0,0.98)");
        context.fillStyle = footer;
        context.fillRect(0, height * 0.72, width, height * 0.28);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "rgba(0,0,0,0.95)";
        context.shadowBlur = 26;
        context.fillStyle = "#ffffff";
        drawFittedVideoText(
          context,
          book.kindleUnlimited ? "AVAILABLE ON KINDLE UNLIMITED" : "DISCOVER IT ON AMAZON",
          width / 2,
          height * 0.875,
          width * 0.84,
          platform === "tiktok" ? 50 : 42,
          27,
        );
        context.fillStyle = accent;
        context.fillRect(width * 0.29, height * 0.91, width * 0.42, 8);
        context.fillStyle = "#ffffff";
        context.font = `700 ${platform === "tiktok" ? 30 : 25}px Arial, sans-serif`;
        context.fillText("www.marlowquinn.com", width / 2, height * 0.95);
        context.restore();
      }

      if (elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await finished;
  return { blob, mimeType };
}

function drawTropeIcon(
  context: CanvasRenderingContext2D,
  trope: string,
  x: number,
  y: number,
  size: number,
  colour: string,
) {
  const label = trope.toLowerCase();
  context.save();
  context.translate(x, y);
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineWidth = Math.max(3, size * 0.09);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = colour;
  context.shadowBlur = 18;

  if (/vampire|fang|blood/.test(label)) {
    context.beginPath();
    context.moveTo(-size * 0.42, -size * 0.25);
    context.quadraticCurveTo(-size * 0.2, size * 0.35, 0, -size * 0.02);
    context.quadraticCurveTo(size * 0.2, size * 0.35, size * 0.42, -size * 0.25);
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.24, -size * 0.05);
    context.lineTo(-size * 0.13, size * 0.32);
    context.lineTo(-size * 0.02, -size * 0.02);
    context.moveTo(size * 0.24, -size * 0.05);
    context.lineTo(size * 0.13, size * 0.32);
    context.lineTo(size * 0.02, -size * 0.02);
    context.stroke();
  } else if (/family|friends/.test(label)) {
    [-0.32, 0, 0.32].forEach((offset, index) => {
      context.beginPath();
      context.arc(offset * size, index === 1 ? -size * 0.19 : -size * 0.08, size * 0.13, 0, Math.PI * 2);
      context.stroke();
    });
    context.beginPath();
    context.arc(0, size * 0.34, size * 0.5, Math.PI * 1.12, Math.PI * 1.88);
    context.stroke();
  } else if (/hockey/.test(label)) {
    context.beginPath();
    context.ellipse(0, size * 0.23, size * 0.36, size * 0.13, 0, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.35, -size * 0.38);
    context.lineTo(size * 0.08, size * 0.14);
    context.lineTo(size * 0.42, size * 0.08);
    context.stroke();
  } else if (/football/.test(label)) {
    context.beginPath();
    context.ellipse(0, 0, size * 0.46, size * 0.27, -0.35, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.15, -size * 0.12);
    context.lineTo(size * 0.15, size * 0.12);
    context.moveTo(-size * 0.05, -size * 0.12);
    context.lineTo(-size * 0.12, size * 0.02);
    context.moveTo(size * 0.08, -size * 0.03);
    context.lineTo(0, size * 0.11);
    context.stroke();
  } else if (/forbidden|secret|locked|off.?limits/.test(label)) {
    context.strokeRect(-size * 0.34, -size * 0.02, size * 0.68, size * 0.48);
    context.beginPath();
    context.arc(0, -size * 0.02, size * 0.27, Math.PI, 0);
    context.stroke();
  } else if (/burn|fire|heat|spicy/.test(label)) {
    context.beginPath();
    context.moveTo(0, size * 0.46);
    context.bezierCurveTo(-size * 0.5, size * 0.18, -size * 0.18, -size * 0.24, size * 0.03, -size * 0.48);
    context.bezierCurveTo(size * 0.12, -size * 0.16, size * 0.48, 0, 0, size * 0.46);
    context.stroke();
  } else if (/office|workplace|boss|coworker/.test(label)) {
    context.strokeRect(-size * 0.43, -size * 0.2, size * 0.86, size * 0.58);
    context.strokeRect(-size * 0.16, -size * 0.36, size * 0.32, size * 0.16);
    context.beginPath();
    context.moveTo(-size * 0.43, 0);
    context.lineTo(size * 0.43, 0);
    context.stroke();
  } else if (/gay|awakening|bi|queer/.test(label)) {
    context.beginPath();
    context.arc(-size * 0.16, 0, size * 0.27, 0, Math.PI * 2);
    context.arc(size * 0.16, 0, size * 0.27, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(0, size * 0.4);
    context.bezierCurveTo(-size * 0.55, size * 0.05, -size * 0.43, -size * 0.38, 0, -size * 0.14);
    context.bezierCurveTo(size * 0.43, -size * 0.38, size * 0.55, size * 0.05, 0, size * 0.4);
    context.stroke();
  }
  context.restore();
}

function parseResponseText(text: string, status: number) {
  try {
    return JSON.parse(text) as { posts?: GeneratedPost[]; error?: string };
  } catch {
    const summary = text.trim().replace(/\s+/g, " ").slice(0, 240);
    throw new Error(
      summary
        ? `The server returned an invalid response (${status}): ${summary}`
        : `The server returned an empty response (${status}).`,
    );
  }
}

export default function SocialStudioPage() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState("");
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "facebook",
    "instagram",
    "tiktok",
  ]);
  const [instructions, setInstructions] = useState("");
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [images, setImages] = useState<GeneratedMedia[]>([]);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [edits, setEdits] = useState<Record<SocialPlatform, string>>({
    facebook: "",
    instagram: "",
    tiktok: "",
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<SocialPlatform | null>(null);
  const videosRef = useRef<GeneratedVideo[]>([]);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => () => {
    videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
  }, []);

  function clearResults() {
    videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
    setPosts([]);
    setImages([]);
    setVideos([]);
    setError("");
    setMessage("");
  }

  function chooseBook(book: CatalogueBook) {
    clearResults();
    setSelectedBook(book);
    setInstructions("");
    setPlatforms(["facebook", "instagram", "tiktok"]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePlatform(platform: SocialPlatform) {
    clearResults();
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  async function requestArtwork(
    outputType: CreativeOutput,
    requestedPlatforms: SocialPlatform[],
    revision = "",
    priorPosts: GeneratedPost[] = [],
  ) {
    if (!selectedBook) throw new Error("Choose a book first.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 285_000);

    try {
      const response = await fetch("/api/social-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          book: selectedBook,
          platforms: requestedPlatforms,
          instructions: instructions.trim(),
          outputType,
          revision,
          previousResponseIds: Object.fromEntries(
            priorPosts.map((post) => [post.platform, post.sourceResponseId]),
          ),
        }),
      });
      const text = await response.text();
      const result = parseResponseText(text, response.status);
      if (!response.ok || !result.posts?.length) {
        throw new Error(result.error || "No artwork was returned.");
      }
      return result.posts;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        throw new Error("Generation took longer than 4 minutes 45 seconds and was stopped.");
      }
      throw requestError;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function createCampaign(outputType: CreativeOutput) {
    if (!selectedBook) return;
    if (!instructions.trim()) {
      setError("Describe the poster or video you want in the guidance box.");
      return;
    }
    if (!platforms.length) {
      setError("Choose at least one platform.");
      return;
    }

    setBusy(outputType);
    setError("");
    setMessage("");
    try {
      const generated = await requestArtwork(outputType, platforms);
      const normalized = await Promise.all(
        generated.map(async (post) => ({
          platform: post.platform,
          dataUrl: await normalizePoster(post.imageDataUrl, post.platform),
        })),
      );
      setPosts(generated);
      setImages(normalized);

      if (outputType === "video") {
        const rendered = await Promise.all(
          normalized.map(async (media) => {
            const post = generated.find((item) => item.platform === media.platform);
            if (!post) throw new Error(`The ${media.platform} video copy was missing.`);
            const result = await createMotionVideo(
              media.dataUrl,
              media.platform,
              selectedBook,
              post,
              instructions,
            );
            return {
              platform: media.platform,
              url: URL.createObjectURL(result.blob),
              mimeType: result.mimeType,
              extension: result.mimeType.includes("mp4") ? "mp4" as const : "webm" as const,
            };
          }),
        );
        videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
        setVideos(rendered);
      } else {
        videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
        setVideos([]);
      }
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "The campaign could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function revise(post: GeneratedPost, outputType: CreativeOutput) {
    const revision = edits[post.platform].trim();
    if (!revision) {
      setError("Describe the change you want first.");
      return;
    }
    setBusy(`${outputType}-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const [updated] = await requestArtwork(outputType, [post.platform], revision, [post]);
      const dataUrl = await normalizePoster(updated.imageDataUrl, updated.platform);
      setPosts((current) => current.map((item) => item.platform === post.platform ? updated : item));
      setImages((current) => [
        ...current.filter((item) => item.platform !== post.platform),
        { platform: post.platform, dataUrl },
      ]);
      if (outputType === "video") {
        const result = await createMotionVideo(
          dataUrl,
          post.platform,
          selectedBook,
          updated,
          instructions,
        );
        const replacement: GeneratedVideo = {
          platform: post.platform,
          url: URL.createObjectURL(result.blob),
          mimeType: result.mimeType,
          extension: result.mimeType.includes("mp4") ? "mp4" : "webm",
        };
        setVideos((current) => {
          current.filter((item) => item.platform === post.platform)
            .forEach((item) => URL.revokeObjectURL(item.url));
          return [...current.filter((item) => item.platform !== post.platform), replacement];
        });
      }
      setEdits((current) => ({ ...current, [post.platform]: "" }));
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "The artwork could not be updated.");
    } finally {
      setBusy("");
    }
  }

  async function copyPost(post: GeneratedPost) {
    await navigator.clipboard.writeText(
      [post.title, post.caption, post.hashtags.join(" ")].filter(Boolean).join("\n\n"),
    );
    setCopied(post.platform);
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function publish(post: GeneratedPost, mediaType: CreativeOutput) {
    if (!selectedBook) return;
    const image = images.find((item) => item.platform === post.platform);
    const video = videos.find((item) => item.platform === post.platform);
    if (mediaType === "image" && !image) return;
    if (mediaType === "video" && !video) return;
    if (mediaType === "video" && video?.extension !== "mp4") {
      setError("This browser created WebM. Use current Chrome or Edge to create the MP4 required for publishing.");
      return;
    }

    setBusy(`publish-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (sessionError || !user) throw new Error("Your NovelForge session has expired. Sign in again.");

      const source = mediaType === "image" ? image!.dataUrl : video!.url;
      const mediaResponse = await fetch(source);
      if (!mediaResponse.ok) throw new Error("The finished media could not be prepared.");
      const blob = await mediaResponse.blob();
      const extension = mediaType === "image" ? "jpg" : video!.extension;
      const prefix = `${post.platform}-${mediaType}-`;
      const { data: existing, error: listError } = await supabase.storage
        .from("social-media")
        .list(user.id, { limit: 100, search: prefix });
      if (listError) throw new Error(listError.message);
      const oldPaths = (existing ?? [])
        .filter((file) => file.name.startsWith(prefix))
        .map((file) => `${user.id}/${file.name}`);
      if (oldPaths.length) {
        const { error: removeError } = await supabase.storage.from("social-media").remove(oldPaths);
        if (removeError) throw new Error(removeError.message);
      }

      const objectPath = `${user.id}/${prefix}${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("social-media").upload(objectPath, blob, {
        cacheControl: "3600",
        contentType: mediaType === "image" ? "image/jpeg" : (video!.mimeType || "video/mp4"),
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: publicUrlData } = supabase.storage.from("social-media").getPublicUrl(objectPath);
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
          mediaUrl: publicUrlData.publicUrl,
          mediaType,
          amazonUrl: selectedBook.amazonUrl,
        }),
      });
      const text = await response.text();
      let result: { error?: string; message?: string } = {};
      try { result = JSON.parse(text) as typeof result; } catch { /* handled below */ }
      if (!response.ok) throw new Error(result.error || text.slice(0, 240) || "Publishing was rejected.");
      setMessage(result.message || `${post.platform} ${mediaType} sent for publishing.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "The campaign could not be published.");
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
        const result = await response.json() as CatalogueResponse;
        if (!Array.isArray(result.books)) throw new Error("The website catalogue returned invalid book data.");
        if (active) setCatalogue(result);
      } catch (loadError) {
        if (active) setCatalogueError(loadError instanceof Error ? loadError.message : "The catalogue could not be loaded.");
      }
    }
    void loadCatalogue();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <a href="/story-chat" aria-label="Back to NovelForge" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl hover:bg-white/10">←</a>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">NovelForge</p>
            <h1 className="text-2xl font-semibold">Social Studio</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        {selectedBook ? (
          <section className="overflow-hidden rounded-3xl border border-pink-500/30 bg-neutral-900 shadow-2xl">
            <div className="flex gap-4 border-b border-white/10 p-5 sm:gap-6">
              <img src={selectedBook.coverUrl} alt={`${selectedBook.title} cover`} className="h-40 w-auto shrink-0 rounded-lg object-contain shadow-xl sm:h-52" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Create from your own brief</p>
                <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{selectedBook.title}</h2>
                <p className="mt-1 text-sm text-neutral-400">{selectedBook.subgenre}</p>
                <button type="button" onClick={() => { clearResults(); setSelectedBook(null); }} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">Choose another book</button>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <label htmlFor="creative-guidance" className="text-lg font-bold">What do you want to create?</label>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Describe the complete result in your own words. Every generation is created fresh from this brief and the genuine cover. Nothing is added because of a built-in poster template.
              </p>
              <textarea
                id="creative-guidance"
                value={instructions}
                onChange={(event) => { setInstructions(event.target.value); clearResults(); }}
                rows={8}
                placeholder="Describe the style, layout, wording, imagery, colours, effects, cover placement, tropes, icons and call to action you want..."
                className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-neutral-950 px-4 py-4 leading-6 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
              />

              <div className="mt-5">
                <p className="font-semibold">Platforms</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {PLATFORM_OPTIONS.map((platform) => {
                    const selected = platforms.includes(platform.id);
                    return (
                      <button key={platform.id} type="button" onClick={() => togglePlatform(platform.id)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selected ? "border-pink-500 bg-pink-500" : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"}`}>
                        {selected ? "✓ " : ""}{platform.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
              {message && <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</p>}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void createCampaign("image")} className="rounded-xl bg-pink-500 px-4 py-4 font-bold transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === "image" ? "Creating fresh posters..." : "Create Posters"}
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void createCampaign("video")} className="rounded-xl bg-violet-500 px-4 py-4 font-bold transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === "video" ? "Creating fresh videos..." : "Create Videos"}
                </button>
              </div>

              {posts.length > 0 && (
                <div className="mt-9 space-y-8 border-t border-white/10 pt-7">
                  {posts.map((post) => {
                    const image = images.find((item) => item.platform === post.platform);
                    const video = videos.find((item) => item.platform === post.platform);
                    const isVideo = Boolean(video);
                    return (
                      <article key={post.platform} className="rounded-2xl border border-white/10 bg-neutral-950 p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-xl font-bold capitalize">{post.platform}</h3>
                          <button type="button" onClick={() => void copyPost(post)} className="rounded-lg border border-pink-500/40 bg-pink-500/10 px-3 py-2 text-sm font-semibold text-pink-200 hover:bg-pink-500/20">{copied === post.platform ? "Copied" : "Copy caption"}</button>
                        </div>

                        {isVideo ? (
                          <video src={video.url} controls autoPlay muted playsInline loop className="mx-auto mt-5 max-h-[760px] w-auto max-w-full rounded-xl" />
                        ) : image ? (
                          <img src={image.dataUrl} alt={`${post.platform} poster for ${selectedBook.title}`} className="mx-auto mt-5 max-h-[760px] w-auto max-w-full rounded-xl object-contain" />
                        ) : null}

                        {post.qualityCheck.decision === "review" && (
                          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Automatic check: {post.qualityCheck.summary}</p>
                        )}

                        <div className="mt-5 rounded-xl bg-white/5 p-4">
                          <p className="font-semibold">{post.title}</p>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{post.caption}</p>
                          <p className="mt-3 text-sm leading-6 text-pink-300">{post.hashtags.join(" ")}</p>
                        </div>

                        <label htmlFor={`edit-${post.platform}`} className="mt-5 block font-semibold">Edit this {isVideo ? "video artwork" : "poster"}</label>
                        <textarea id={`edit-${post.platform}`} value={edits[post.platform]} onChange={(event) => setEdits((current) => ({ ...current, [post.platform]: event.target.value }))} rows={3} placeholder="Describe only the changes you want..." className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500" />
                        <button type="button" disabled={Boolean(busy)} onClick={() => void revise(post, isVideo ? "video" : "image")} className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-semibold hover:bg-white/15 disabled:opacity-40">
                          {busy === `${isVideo ? "video" : "image"}-${post.platform}` ? "Applying your changes..." : `Update ${isVideo ? "Video" : "Poster"}`}
                        </button>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {isVideo ? (
                            <a href={video.url} download={`${selectedBook.slug}-${post.platform}.${video.extension}`} className="flex items-center justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold hover:bg-pink-400">Download Video</a>
                          ) : image ? (
                            <a href={image.dataUrl} download={`${selectedBook.slug}-${post.platform}.jpg`} className="flex items-center justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold hover:bg-pink-400">Download Poster</a>
                          ) : null}
                          <button type="button" disabled={Boolean(busy) || post.platform === "tiktok"} onClick={() => void publish(post, isVideo ? "video" : "image")} className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                            {busy === `publish-${post.platform}` ? "Publishing..." : post.platform === "tiktok" ? "TikTok publishing unavailable" : `Post to ${post.platform === "facebook" ? "Facebook" : "Instagram"}`}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="mb-7 rounded-2xl border border-white/10 bg-neutral-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Your catalogue</p>
              <h2 className="mt-2 text-2xl font-bold">Choose a book</h2>
              <p className="mt-2 text-sm text-neutral-400">Then describe the exact poster or video you want.</p>
            </div>
            {catalogueError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{catalogueError}</p>}
            {!catalogue && !catalogueError && <p className="text-neutral-400">Loading books...</p>}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue?.books.map((book) => (
                <button key={book.slug} type="button" onClick={() => chooseBook(book)} className="group overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 text-left transition hover:-translate-y-1 hover:border-pink-500/50">
                  <div className="aspect-[16/9] overflow-hidden bg-neutral-950 p-4">
                    <img src={book.coverUrl} alt={`${book.title} cover`} className="mx-auto h-full w-auto rounded object-contain shadow-xl transition group-hover:scale-[1.03]" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold">{book.title}</h3>
                    <p className="mt-1 text-sm text-neutral-400">{book.subgenre}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
