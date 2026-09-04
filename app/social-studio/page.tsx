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

type CampaignType =
  | "book-spotlight"
  | "trope-hook"
  | "quote-post"
  | "kindle-unlimited"
  | "backlist-revival";

type SocialPlatform = "facebook" | "instagram" | "tiktok";

type GeneratedPost = {
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  visualDirection: string;
};

type MediaStyle = "branded" | "ai-scene";

type PosterTemplate =
  | "auto"
  | "cinematic-quote"
  | "trope-showcase"
  | "kindle-hero"
  | "offer-promotion"
  | "modern-editorial";

type GeneratedMedia = {
  platform: SocialPlatform;
  style: MediaStyle;
  template: Exclude<PosterTemplate, "auto">;
  dataUrl: string;
};

type GeneratedVideo = {
  platform: SocialPlatform;
  url: string;
  mimeType: string;
  extension: "mp4" | "webm";
};

const CAMPAIGN_OPTIONS: Array<{
  id: CampaignType;
  title: string;
  description: string;
}> = [
  {
    id: "book-spotlight",
    title: "Book Spotlight",
    description:
      "A strong general promotion using the cover, blurb and main hooks.",
  },
  {
    id: "trope-hook",
    title: "Trope Hook",
    description:
      "Lead with the tropes readers search for and build the post around them.",
  },
  {
    id: "quote-post",
    title: "Quote Post",
    description:
      "Create a visual and caption around a genuine quote you provide.",
  },
  {
    id: "kindle-unlimited",
    title: "Kindle Unlimited",
    description: "Promote the book as available to Kindle Unlimited readers.",
  },
  {
    id: "backlist-revival",
    title: "Backlist Revival",
    description:
      "Give an older title a fresh angle without pretending it is a new release.",
  },
];

const PLATFORM_OPTIONS: Array<{
  id: SocialPlatform;
  label: string;
}> = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

const POSTER_OPTIONS: Array<{
  id: PosterTemplate;
  title: string;
  description: string;
}> = [
  {
    id: "auto",
    title: "Automatic",
    description: "Matches the poster design to the campaign type.",
  },
  {
    id: "cinematic-quote",
    title: "Cinematic Quote",
    description: "Large dramatic quote, atmospheric cover and Kindle hero.",
  },
  {
    id: "trope-showcase",
    title: "Trope Showcase",
    description:
      "Bold selling points, clean reading order and a dominant cover.",
  },
  {
    id: "kindle-hero",
    title: "Atmospheric Kindle Hero",
    description:
      "Cover-led artwork with lighting, depth, glow and reflections.",
  },
  {
    id: "offer-promotion",
    title: "Offer or Promotion",
    description: "Price or promotion first, with a large cover and clear CTA.",
  },
  {
    id: "modern-editorial",
    title: "Modern Editorial",
    description: "Asymmetrical display type, colour blocking and a cinematic cover.",
  },
];

const CATALOGUE_URL = "https://www.marlowquinn.com/api/books";

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("A campaign image asset could not be loaded."));
    image.src = source;
  });
}

function wrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  maximumLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (context.measureText(candidate).width <= maximumWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maximumLines - 1) break;
  }

  if (current && lines.length < maximumLines) lines.push(current);

  if (lines.join(" ").split(/\s+/).length < words.length && lines.length) {
    lines[lines.length - 1] =
      `${lines[lines.length - 1].replace(/[.,!?;:]$/, "")}…`;
  }

  return lines;
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maximumWidth: number,
  weight: number,
  startingSize: number,
  minimumSize: number,
) {
  let fontSize = startingSize;
  context.font = `${weight} ${fontSize}px Arial, sans-serif`;

  while (
    fontSize > minimumSize &&
    context.measureText(text).width > maximumWidth
  ) {
    fontSize -= 1;
    context.font = `${weight} ${fontSize}px Arial, sans-serif`;
  }

  context.fillText(text, x, y, maximumWidth);
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

async function createFinishedCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
  aiBackground?: string;
}): Promise<string> {
  const isTikTok = input.post.platform === "tiktok";
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const background = input.aiBackground
    ? await loadImage(input.aiBackground)
    : cover;

  context.save();
  if (input.mediaStyle === "branded") {
    const brandedBackground = context.createLinearGradient(0, 0, width, height);
    brandedBackground.addColorStop(0, "#050508");
    brandedBackground.addColorStop(0.58, "#120711");
    brandedBackground.addColorStop(1, "#4a082e");
    context.fillStyle = brandedBackground;
    context.fillRect(0, 0, width, height);
  } else {
    drawImageCover(context, background, 0, 0, width, height);
  }
  context.restore();

  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(5,5,8,0.82)");
  shade.addColorStop(0.42, "rgba(5,5,8,0.42)");
  shade.addColorStop(1, "rgba(5,5,8,0.94)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.2;
  context.fillStyle = "#ec4899";
  context.beginPath();
  context.moveTo(width * 0.68, 0);
  context.lineTo(width, 0);
  context.lineTo(width, height * 0.46);
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = "rgba(236,72,153,0.75)";
  context.lineWidth = 5;
  context.strokeRect(34, 34, width - 68, height - 68);

  context.fillStyle = "#ec4899";
  context.fillRect(72, 72, 104, 8);
  context.font = "700 28px Arial, sans-serif";
  context.fillText("MARLOW QUINN", 72, 125);

  context.font = "700 18px Arial, sans-serif";
  context.fillStyle = "#f9a8d4";
  context.fillText("BITE  •  HEAT  •  HEART", 72, 155);

  const hook = input.post.title || input.book.tropes.slice(0, 2).join(" • ");
  context.font = `800 ${isTikTok ? 72 : 62}px Arial, sans-serif`;
  context.fillStyle = "#ffffff";
  context.textBaseline = "top";
  const hookLines = wrappedLines(context, hook, width - 144, isTikTok ? 4 : 3);
  const hookLineHeight = isTikTok ? 82 : 72;

  hookLines.forEach((line, index) => {
    drawFittedText(
      context,
      line,
      72,
      210 + index * hookLineHeight,
      width - 144,
      800,
      isTikTok ? 72 : 62,
      isTikTok ? 44 : 38,
    );
  });

  const coverWidth = isTikTok ? 620 : 500;
  const coverHeight = Math.round(
    coverWidth * (cover.naturalHeight / cover.naturalWidth),
  );
  const maximumCoverHeight = isTikTok ? 930 : 720;
  const fittedCoverHeight = Math.min(coverHeight, maximumCoverHeight);
  const fittedCoverWidth = Math.round(
    fittedCoverHeight * (cover.naturalWidth / cover.naturalHeight),
  );
  const coverX = Math.round((width - fittedCoverWidth) / 2);
  const coverY = isTikTok ? 570 : 480;

  context.save();
  context.shadowColor = "rgba(236,72,153,0.55)";
  context.shadowBlur = 48;
  context.shadowOffsetY = 20;
  context.fillStyle = "#ffffff";
  context.fillRect(
    coverX - 8,
    coverY - 8,
    fittedCoverWidth + 16,
    fittedCoverHeight + 16,
  );
  context.drawImage(cover, coverX, coverY, fittedCoverWidth, fittedCoverHeight);
  context.restore();

  const footerY = height - (isTikTok ? 285 : 175);
  const displayedTropes = input.book.tropes.slice(0, 3).join("   •   ");
  context.textAlign = "center";
  context.fillStyle = "#f9a8d4";
  context.font = `700 ${isTikTok ? 31 : 27}px Arial, sans-serif`;
  const tropeLines = wrappedLines(context, displayedTropes, width - 120, 2);

  tropeLines.forEach((line, index) => {
    drawFittedText(
      context,
      line,
      width / 2,
      footerY + index * 42,
      width - 120,
      700,
      isTikTok ? 31 : 27,
      20,
    );
  });

  if (input.book.kindleUnlimited) {
    context.fillStyle = "#ffffff";
    context.font = `700 ${isTikTok ? 30 : 26}px Arial, sans-serif`;
    drawFittedText(
      context,
      "AVAILABLE ON KINDLE UNLIMITED",
      width / 2,
      height - (isTikTok ? 120 : 92),
      width - 140,
      700,
      isTikTok ? 30 : 26,
      20,
    );
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function createEditorialCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
  aiBackground?: string;
}): Promise<string> {
  const isTikTok = input.post.platform === "tiktok";
  const hasScene =
    input.mediaStyle === "ai-scene" && Boolean(input.aiBackground);
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const scene = input.aiBackground ? await loadImage(input.aiBackground) : null;

  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#050507");
  base.addColorStop(0.62, "#0d0710");
  base.addColorStop(1, "#3d0928");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  if (hasScene && scene) {
    drawImageCover(context, scene, 34, 255, width - 68, isTikTok ? 1260 : 765);

    const sceneShade = context.createLinearGradient(0, 0, width, 0);
    sceneShade.addColorStop(0, "rgba(5,5,7,0.18)");
    sceneShade.addColorStop(0.5, "rgba(5,5,7,0.28)");
    sceneShade.addColorStop(0.72, "rgba(5,5,7,0.82)");
    sceneShade.addColorStop(1, "rgba(5,5,7,0.98)");
    context.fillStyle = sceneShade;
    context.fillRect(34, 255, width - 68, isTikTok ? 1260 : 765);

    const verticalShade = context.createLinearGradient(
      0,
      255,
      0,
      isTikTok ? 1515 : 1020,
    );
    verticalShade.addColorStop(0, "rgba(5,5,7,0.08)");
    verticalShade.addColorStop(0.72, "rgba(5,5,7,0.1)");
    verticalShade.addColorStop(1, "rgba(5,5,7,0.92)");
    context.fillStyle = verticalShade;
    context.fillRect(34, 255, width - 68, isTikTok ? 1260 : 765);

    const cleanupFadeTop = isTikTok ? 1100 : 690;
    const cleanupFadeBottom = isTikTok ? 1515 : 1020;
    const cleanupFade = context.createLinearGradient(
      0,
      cleanupFadeTop,
      0,
      cleanupFadeBottom,
    );
    cleanupFade.addColorStop(0, "rgba(5,5,7,0)");
    cleanupFade.addColorStop(0.34, "rgba(5,5,7,0.52)");
    cleanupFade.addColorStop(0.68, "rgba(5,5,7,0.9)");
    cleanupFade.addColorStop(1, "rgba(5,5,7,1)");
    context.fillStyle = cleanupFade;
    context.fillRect(
      34,
      cleanupFadeTop,
      width - 68,
      cleanupFadeBottom - cleanupFadeTop,
    );
  }

  context.fillStyle = "rgba(5,5,7,0.97)";
  context.fillRect(34, 34, width - 68, isTikTok ? 330 : 245);

  const footerTop = isTikTok ? 1515 : 1020;
  context.fillStyle = "rgba(5,5,7,0.98)";
  context.fillRect(34, footerTop, width - 68, height - footerTop - 34);

  context.strokeStyle = "rgba(236,72,153,0.88)";
  context.lineWidth = 5;
  context.strokeRect(34, 34, width - 68, height - 68);

  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = "#ec4899";
  context.fillRect(64, 66, 104, 8);
  context.fillStyle = "#ffffff";
  context.font = "800 27px Arial, sans-serif";
  context.fillText("MARLOW QUINN", 64, 116);
  context.fillStyle = "#f9a8d4";
  context.font = "700 17px Arial, sans-serif";
  context.fillText("BITE  •  HEAT  •  HEART", 64, 146);

  const hook =
    input.book.tropes.slice(0, 2).join("  ×  ") ||
    input.book.subgenre ||
    input.post.title;
  context.fillStyle = "#ffffff";
  context.font = `800 ${isTikTok ? 54 : 45}px Arial, sans-serif`;
  const hookLines = wrappedLines(context, hook.toUpperCase(), width - 128, 2);
  const hookTop = isTikTok ? 220 : 190;
  const hookGap = isTikTok ? 68 : 57;

  hookLines.forEach((line, index) => {
    drawFittedText(
      context,
      line,
      64,
      hookTop + index * hookGap,
      width - 128,
      800,
      isTikTok ? 54 : 45,
      isTikTok ? 36 : 32,
    );
  });

  const maximumCoverHeight = isTikTok ? 900 : 630;
  const maximumCoverWidth = hasScene
    ? isTikTok
      ? 530
      : 420
    : isTikTok
      ? 610
      : 500;
  const naturalCoverHeight =
    maximumCoverWidth * (cover.naturalHeight / cover.naturalWidth);
  const coverHeight = Math.min(naturalCoverHeight, maximumCoverHeight);
  const coverWidth = coverHeight * (cover.naturalWidth / cover.naturalHeight);
  const coverX = hasScene ? width - 64 - coverWidth : (width - coverWidth) / 2;
  const coverY = isTikTok ? 500 : 330;

  context.save();
  context.shadowColor = "rgba(236,72,153,0.7)";
  context.shadowBlur = 55;
  context.shadowOffsetY = 20;
  context.fillStyle = "#ffffff";
  context.fillRect(coverX - 9, coverY - 9, coverWidth + 18, coverHeight + 18);
  context.drawImage(cover, coverX, coverY, coverWidth, coverHeight);
  context.restore();

  const tropes = input.book.tropes.slice(0, 3);

  if (isTikTok) {
    tropes.forEach((trope, index) => {
      const x = 64;
      const y = 1550 + index * 79;
      const cardWidth = width - 128;
      context.fillStyle =
        index % 2 === 0 ? "rgba(236,72,153,0.2)" : "rgba(255,255,255,0.08)";
      context.fillRect(x, y, cardWidth, 62);
      context.fillStyle = "#ec4899";
      context.fillRect(x, y, 8, 62);
      context.fillStyle = "#ffffff";
      context.textAlign = "left";
      drawFittedText(
        context,
        trope.toUpperCase(),
        x + 28,
        y + 41,
        cardWidth - 56,
        800,
        30,
        21,
      );
    });
  } else {
    const gap = 16;
    const cardWidth = (width - 128 - gap * 2) / 3;

    tropes.forEach((trope, index) => {
      const x = 64 + index * (cardWidth + gap);
      const y = 1060;
      context.fillStyle =
        index % 2 === 0 ? "rgba(236,72,153,0.2)" : "rgba(255,255,255,0.08)";
      context.fillRect(x, y, cardWidth, 88);
      context.fillStyle = "#ec4899";
      context.fillRect(x, y, 7, 88);
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.font = "800 25px Arial, sans-serif";
      const lines = wrappedLines(
        context,
        trope.toUpperCase(),
        cardWidth - 30,
        2,
      );
      lines.forEach((line, lineIndex) => {
        drawFittedText(
          context,
          line,
          x + cardWidth / 2,
          y + 39 + lineIndex * 29,
          cardWidth - 30,
          800,
          25,
          18,
        );
      });
    });
  }

  if (input.book.kindleUnlimited) {
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    drawFittedText(
      context,
      "AVAILABLE ON KINDLE UNLIMITED",
      width / 2,
      isTikTok ? 1850 : 1268,
      width - 160,
      800,
      isTikTok ? 27 : 24,
      19,
    );
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function createCleanCoverCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
}): Promise<string> {
  const isTikTok = input.post.platform === "tiktok";
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#050507");
  base.addColorStop(0.58, "#120812");
  base.addColorStop(1, "#48082f");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  if (input.mediaStyle === "ai-scene") {
    context.save();
    context.filter = "blur(52px) saturate(1.25)";
    context.globalAlpha = 0.34;
    drawImageCover(context, cover, -110, 180, width + 220, height - 250);
    context.restore();

    const textureShade = context.createLinearGradient(0, 150, 0, height);
    textureShade.addColorStop(0, "rgba(5,5,7,0.5)");
    textureShade.addColorStop(0.55, "rgba(5,5,7,0.7)");
    textureShade.addColorStop(1, "rgba(5,5,7,0.96)");
    context.fillStyle = textureShade;
    context.fillRect(0, 0, width, height);
  }

  context.fillStyle = "rgba(236,72,153,0.1)";
  context.beginPath();
  context.moveTo(width * 0.72, 0);
  context.lineTo(width, 0);
  context.lineTo(width, height * 0.58);
  context.lineTo(width * 0.88, height * 0.7);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(5,5,7,0.97)";
  context.fillRect(34, 34, width - 68, isTikTok ? 300 : 235);

  const footerTop = isTikTok ? 1430 : 1020;
  context.fillStyle = "rgba(5,5,7,0.98)";
  context.fillRect(34, footerTop, width - 68, height - footerTop - 34);

  context.strokeStyle = "rgba(236,72,153,0.9)";
  context.lineWidth = 5;
  context.strokeRect(34, 34, width - 68, height - 68);

  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = "#ec4899";
  context.fillRect(64, 66, 104, 8);
  context.fillStyle = "#ffffff";
  context.font = "800 27px Arial, sans-serif";
  context.fillText("MARLOW QUINN", 64, 116);
  context.fillStyle = "#f9a8d4";
  context.font = "700 17px Arial, sans-serif";
  context.fillText("BITE  •  HEAT  •  HEART", 64, 146);

  let categoryHook = input.post.title
    .replace(input.book.title, "")
    .replace(/book spotlight/gi, "")
    .replace(/^[\s|:/-]+|[\s|:/-]+$/g, "")
    .trim();

  if (categoryHook.length < 5 || categoryHook.length > 90) {
    categoryHook = input.book.subgenre || "M/M ROMANCE";
  }

  context.fillStyle = "#ffffff";
  context.font = `800 ${isTikTok ? 54 : 45}px Arial, sans-serif`;
  const categoryLines = wrappedLines(
    context,
    categoryHook.toUpperCase(),
    width - 128,
    2,
  );
  const categoryTop = isTikTok ? 215 : 190;
  const categoryGap = isTikTok ? 59 : 50;

  categoryLines.forEach((line, index) => {
    drawFittedText(
      context,
      line,
      64,
      categoryTop + index * categoryGap,
      width - 128,
      800,
      isTikTok ? 54 : 45,
      isTikTok ? 34 : 30,
    );
  });

  const maximumCoverHeight = isTikTok ? 980 : 680;
  const maximumCoverWidth = isTikTok ? 620 : 500;
  const naturalCoverHeight =
    maximumCoverWidth * (cover.naturalHeight / cover.naturalWidth);
  const coverHeight = Math.min(naturalCoverHeight, maximumCoverHeight);
  const coverWidth = coverHeight * (cover.naturalWidth / cover.naturalHeight);
  const coverX = (width - coverWidth) / 2;
  const coverY = isTikTok ? 390 : 300;

  context.save();
  context.shadowColor = "rgba(236,72,153,0.72)";
  context.shadowBlur = 62;
  context.shadowOffsetY = 22;
  context.fillStyle = "#ffffff";
  context.fillRect(coverX - 10, coverY - 10, coverWidth + 20, coverHeight + 20);
  context.drawImage(cover, coverX, coverY, coverWidth, coverHeight);
  context.restore();

  const tropeText = input.book.tropes.slice(0, 3).join("   •   ");
  context.textAlign = "center";
  context.fillStyle = "#f9a8d4";
  context.font = `700 ${isTikTok ? 34 : 29}px Arial, sans-serif`;
  const tropeLines = wrappedLines(
    context,
    tropeText.toUpperCase(),
    width - 150,
    isTikTok ? 3 : 2,
  );
  const tropeTop = isTikTok ? 1530 : 1120;
  const tropeGap = isTikTok ? 49 : 42;

  tropeLines.forEach((line, index) => {
    drawFittedText(
      context,
      line,
      width / 2,
      tropeTop + index * tropeGap,
      width - 150,
      700,
      isTikTok ? 34 : 29,
      isTikTok ? 24 : 21,
    );
  });

  context.fillStyle = "#ec4899";
  context.fillRect(
    width / 2 - (isTikTok ? 170 : 135),
    isTikTok ? 1685 : 1195,
    isTikTok ? 340 : 270,
    6,
  );

  if (input.book.kindleUnlimited) {
    context.textAlign = "center";
    const badgeX = isTikTok ? 170 : 220;
    const badgeY = isTikTok ? 1740 : 1230;
    const badgeWidth = width - badgeX * 2;
    const badgeHeight = isTikTok ? 86 : 72;
    context.fillStyle = "#ec4899";
    context.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    context.fillStyle = "#ffffff";
    drawFittedText(
      context,
      "AVAILABLE ON KINDLE UNLIMITED",
      width / 2,
      badgeY + (isTikTok ? 56 : 47),
      badgeWidth - 50,
      800,
      isTikTok ? 27 : 24,
      19,
    );
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

function roundedRectanglePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

type CampaignColour = { red: number; green: number; blue: number };

type CampaignPalette = {
  primary: CampaignColour;
  secondary: CampaignColour;
};

function colourCss(colour: CampaignColour, alpha = 1): string {
  return `rgba(${colour.red},${colour.green},${colour.blue},${alpha})`;
}

function colourDistance(left: CampaignColour, right: CampaignColour): number {
  return Math.sqrt(
    Math.pow(left.red - right.red, 2) +
      Math.pow(left.green - right.green, 2) +
      Math.pow(left.blue - right.blue, 2),
  );
}

function vividCampaignColour(
  colour: CampaignColour,
  fallback: CampaignColour,
): CampaignColour {
  const maximum = Math.max(colour.red, colour.green, colour.blue);
  const minimum = Math.min(colour.red, colour.green, colour.blue);

  if (maximum < 45 || maximum - minimum < 36) return fallback;

  const range = Math.max(1, maximum - minimum);
  const channel = (value: number) =>
    Math.max(
      18,
      Math.min(250, Math.round(22 + ((value - minimum) / range) * 228)),
    );

  return {
    red: channel(colour.red),
    green: channel(colour.green),
    blue: channel(colour.blue),
  };
}

function fallbackPalette(seed: string): CampaignPalette {
  const palettes: CampaignPalette[] = [
    {
      primary: { red: 236, green: 72, blue: 153 },
      secondary: { red: 59, green: 130, blue: 246 },
    },
    {
      primary: { red: 245, green: 158, blue: 11 },
      secondary: { red: 14, green: 165, blue: 233 },
    },
    {
      primary: { red: 20, green: 184, blue: 166 },
      secondary: { red: 217, green: 70, blue: 239 },
    },
    {
      primary: { red: 239, green: 68, blue: 68 },
      secondary: { red: 99, green: 102, blue: 241 },
    },
  ];
  const number = [...seed].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return palettes[number % palettes.length];
}

function extractCampaignPalette(
  cover: HTMLImageElement,
  seed: string,
): CampaignPalette {
  const sample = document.createElement("canvas");
  sample.width = 44;
  sample.height = 66;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });

  if (!sampleContext) return fallbackPalette(seed);

  sampleContext.drawImage(cover, 0, 0, sample.width, sample.height);
  const pixels = sampleContext.getImageData(
    0,
    0,
    sample.width,
    sample.height,
  ).data;
  const buckets = new Map<
    string,
    { colour: CampaignColour; count: number; score: number }
  >();
  let sampledPixels = 0;
  let chromaticPixels = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 180) continue;
    sampledPixels += 1;

    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const brightness = (maximum + minimum) / 2;
    const saturation = maximum === minimum ? 0 : (maximum - minimum) / 255;

    if (brightness < 34 || brightness > 232 || saturation < 0.16) continue;
    chromaticPixels += 1;

    const colour = {
      red: Math.round(red / 32) * 32,
      green: Math.round(green / 32) * 32,
      blue: Math.round(blue / 32) * 32,
    };
    const key = `${colour.red}-${colour.green}-${colour.blue}`;
    const existing = buckets.get(key);
    const balance = 1 - Math.abs(brightness - 132) / 132;
    const score = 0.4 + saturation * 1.5 + Math.max(0, balance) * 0.5;

    buckets.set(key, {
      colour,
      count: (existing?.count ?? 0) + 1,
      score: (existing?.score ?? 0) + score,
    });
  }

  const ranked = [...buckets.values()].sort(
    (left, right) => right.score * right.count - left.score * left.count,
  );
  const fallback = fallbackPalette(seed);
  const sampledPrimary = ranked[0]?.colour ?? fallback.primary;
  const sampledSecondary =
    ranked.find(
      (candidate) => colourDistance(candidate.colour, sampledPrimary) > 125,
    )?.colour ?? fallback.secondary;

  let primary = vividCampaignColour(sampledPrimary, fallback.primary);
  let secondary = vividCampaignColour(sampledSecondary, fallback.secondary);

  const sparseColourOnNeutralCover =
    sampledPixels > 0 && chromaticPixels / sampledPixels < 0.14;
  const primaryIsWarm = primary.red > primary.blue * 1.25;
  const secondaryIsCool = secondary.blue > secondary.red * 1.2;
  if (sparseColourOnNeutralCover && primaryIsWarm && secondaryIsCool) {
    [primary, secondary] = [secondary, primary];
  }

  return { primary, secondary };
}

function seededNumber(seed: string): number {
  let value = 2166136261;

  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }

  return Math.abs(value >>> 0);
}

function drawAtmosphericBackground(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  palette: CampaignPalette,
  width: number,
  height: number,
  seed: string,
  movement = 0,
  scene?: HTMLImageElement | null,
) {
  context.fillStyle = "#030305";
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = scene ? 0.82 : 0.4;
  context.filter = scene
    ? "saturate(1.22) contrast(1.14)"
    : "blur(54px) saturate(1.9) contrast(1.18)";
  const driftX = Math.sin(movement * Math.PI * 2) * 34;
  drawImageCover(
    context,
    scene ?? cover,
    scene ? driftX - 20 : -170 + driftX,
    scene ? -20 : -150,
    scene ? width + 40 : width + 340,
    scene ? height + 40 : height + 300,
  );
  context.restore();

  const darkLayer = context.createLinearGradient(0, 0, width, height);
  darkLayer.addColorStop(0, "rgba(2,2,4,0.48)");
  darkLayer.addColorStop(0.48, "rgba(3,3,6,0.66)");
  darkLayer.addColorStop(1, "rgba(1,1,3,0.84)");
  context.fillStyle = darkLayer;
  context.fillRect(0, 0, width, height);

  const leftGlow = context.createRadialGradient(
    width * 0.12,
    height * 0.55,
    20,
    width * 0.12,
    height * 0.55,
    width * 0.82,
  );
  leftGlow.addColorStop(0, colourCss(palette.primary, 0.52));
  leftGlow.addColorStop(1, colourCss(palette.primary, 0));
  context.fillStyle = leftGlow;
  context.fillRect(0, 0, width, height);

  const rightGlow = context.createRadialGradient(
    width * 0.92,
    height * 0.3,
    20,
    width * 0.92,
    height * 0.3,
    width * 0.7,
  );
  rightGlow.addColorStop(0, colourCss(palette.secondary, 0.46));
  rightGlow.addColorStop(1, colourCss(palette.secondary, 0));
  context.fillStyle = rightGlow;
  context.fillRect(0, 0, width, height);

  const randomSeed = seededNumber(seed);
  for (let index = 0; index < 58; index += 1) {
    const x = (randomSeed * (index + 17) * 37) % width;
    const baseY = (randomSeed * (index + 31) * 53) % height;
    const y = (baseY - movement * 190 + height) % height;
    const radius = 1 + ((randomSeed + index * 19) % 5);
    context.fillStyle = colourCss(
      index % 3 === 0 ? palette.secondary : palette.primary,
      0.08 + ((index * 7) % 18) / 100,
    );
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.22,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.68)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawCampaignBrand(
  context: CanvasRenderingContext2D,
  palette: CampaignPalette,
  width: number,
  compact = false,
) {
  const left = compact ? 54 : 68;
  const top = compact ? 52 : 66;
  context.textAlign = "left";
  context.fillStyle = colourCss(palette.primary);
  context.fillRect(left, top, compact ? 72 : 96, 7);
  context.fillStyle = "#ffffff";
  context.font = `700 ${compact ? 23 : 28}px "PosterSans", sans-serif`;
  context.fillText("MARLOW QUINN", left, top + 48);
  context.fillStyle = colourCss(palette.primary, 0.92);
  context.font = `400 ${compact ? 18 : 21}px "PosterDisplay", sans-serif`;
  context.fillText("BITE  •  HEAT  •  HEART", left, top + 78);
  context.strokeStyle = "rgba(255,255,255,0.15)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(left, top + 106);
  context.lineTo(width - left, top + 106);
  context.stroke();
}

function drawKindleMockup(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  palette: CampaignPalette,
  centreX: number,
  top: number,
  deviceWidth: number,
  rotation = 0,
  opacity = 1,
): number {
  const frame = Math.max(22, deviceWidth * 0.055);
  const innerWidth = deviceWidth - frame * 2;
  const innerHeight = innerWidth * (cover.naturalHeight / cover.naturalWidth);
  const bottomFrame = Math.max(58, deviceWidth * 0.13);
  const deviceHeight = innerHeight + frame + bottomFrame;

  context.save();
  context.globalAlpha = opacity;
  context.translate(centreX, top + deviceHeight / 2);
  context.rotate(rotation);
  context.translate(-deviceWidth / 2, -deviceHeight / 2);
  context.shadowColor = colourCss(palette.primary, 0.66);
  context.shadowBlur = Math.max(40, deviceWidth * 0.1);
  context.shadowOffsetY = Math.max(16, deviceWidth * 0.035);
  roundedRectanglePath(
    context,
    0,
    0,
    deviceWidth,
    deviceHeight,
    deviceWidth * 0.055,
  );
  const frameGradient = context.createLinearGradient(
    0,
    0,
    deviceWidth,
    deviceHeight,
  );
  frameGradient.addColorStop(0, "#27272b");
  frameGradient.addColorStop(0.45, "#09090b");
  frameGradient.addColorStop(1, "#17171a");
  context.fillStyle = frameGradient;
  context.fill();
  context.shadowColor = "transparent";
  roundedRectanglePath(
    context,
    7,
    7,
    deviceWidth - 14,
    deviceHeight - 14,
    deviceWidth * 0.045,
  );
  context.strokeStyle = "rgba(255,255,255,0.24)";
  context.lineWidth = 2;
  context.stroke();
  context.drawImage(cover, frame, frame, innerWidth, innerHeight);

  const glass = context.createLinearGradient(
    frame,
    frame,
    deviceWidth - frame,
    innerHeight,
  );
  glass.addColorStop(0, "rgba(255,255,255,0.16)");
  glass.addColorStop(0.28, "rgba(255,255,255,0)");
  glass.addColorStop(1, "rgba(255,255,255,0.03)");
  context.fillStyle = glass;
  context.fillRect(frame, frame, innerWidth, innerHeight);

  context.textAlign = "center";
  context.fillStyle = "rgba(255,255,255,0.36)";
  context.font = `400 ${Math.max(20, deviceWidth * 0.052)}px "PosterSans", sans-serif`;
  context.fillText(
    "kindle",
    deviceWidth / 2,
    deviceHeight - bottomFrame * 0.32,
  );
  context.restore();

  return deviceHeight;
}

function wrapEveryLine(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string[] {
  const paragraphs = text.trim().split(/\n+/).filter(Boolean);
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
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
  });

  return lines;
}

function fittedMultiline(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  maximumLines: number,
  startingSize: number,
  minimumSize: number,
  weight = 800,
): { lines: string[]; fontSize: number; lineHeight: number } {
  let fontSize = startingSize;
  let lines: string[] = [];
  const hardMinimum = Math.min(minimumSize, 18);

  while (fontSize >= hardMinimum) {
    context.font = `${weight} ${fontSize}px "PosterDisplay", "Arial Narrow", sans-serif`;
    lines = wrapEveryLine(context, text, maximumWidth);
    if (lines.length <= maximumLines) break;
    fontSize -= 2;
  }

  if (lines.length > maximumLines) {
    throw new Error("The supplied poster wording is too long for a readable layout. Shorten the hook or trope rather than publishing truncated text.");
  }

  return { lines, fontSize, lineHeight: Math.round(fontSize * 1.08) };
}

function resolvePosterTemplate(
  selected: PosterTemplate,
  campaignType: CampaignType,
  seed: number,
): Exclude<PosterTemplate, "auto"> {
  if (selected !== "auto") return selected;
  if (campaignType === "quote-post") return "cinematic-quote";
  if (campaignType === "trope-hook") return "trope-showcase";
  if (campaignType === "kindle-unlimited") {
    return seed % 2 === 0 ? "kindle-hero" : "modern-editorial";
  }
  if (campaignType === "backlist-revival") return "modern-editorial";
  return ["kindle-hero", "modern-editorial", "trope-showcase"][seed % 3] as
    | "kindle-hero"
    | "modern-editorial"
    | "trope-showcase";
}

const POSTER_FONT_URLS = [
  ["PosterDisplay", "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.1.1/files/bebas-neue-latin-400-normal.woff2"],
  ["PosterSans", "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.1.1/files/montserrat-latin-800-normal.woff2"],
  ["PosterAccent", "https://cdn.jsdelivr.net/npm/@fontsource/caveat@5.1.1/files/caveat-latin-700-normal.woff2"],
] as const;

let posterFontsReady: Promise<void> | null = null;

function ensurePosterFonts(): Promise<void> {
  if (posterFontsReady) return posterFontsReady;
  posterFontsReady = Promise.all(
    POSTER_FONT_URLS.map(async ([family, url]) => {
      const face = new FontFace(family, `url(${url})`, {
        weight: family === "PosterDisplay" ? "400" : "700",
        style: "normal",
      });
      document.fonts.add(await face.load());
      await document.fonts.load(`32px "${family}"`);
      if (!document.fonts.check(`32px "${family}"`)) {
        throw new Error(`The ${family} poster font did not finish loading.`);
      }
    }),
  ).then(() => undefined);
  return posterFontsReady;
}

type PosterRect = { x: number; y: number; width: number; height: number };

function rectanglesOverlap(left: PosterRect, right: PosterRect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function verifyPosterGeometry(width: number, height: number, cover: PosterRect, textAreas: PosterRect[], cta: PosterRect) {
  const inside = (area: PosterRect) => area.x >= 0 && area.y >= 0 && area.x + area.width <= width && area.y + area.height <= height;
  if (![cover, cta, ...textAreas].every(inside)) throw new Error("Poster layout failed its canvas safe-zone check.");
  if (textAreas.some((area) => rectanglesOverlap(area, cover))) throw new Error("Poster layout failed its text and cover collision check.");
  if (rectanglesOverlap(cta, cover) || textAreas.some((area) => rectanglesOverlap(area, cta))) throw new Error("Poster layout failed its CTA collision check.");
}

function drawDisplayLines(context: CanvasRenderingContext2D, text: string, area: PosterRect, options: { colour: string; accent?: string; align?: "left" | "center"; maximumLines: number; startingSize: number; minimumSize: number; highlightLast?: boolean }) {
  context.textAlign = options.align ?? "left";
  const block = fittedMultiline(context, text, area.width, options.maximumLines, options.startingSize, options.minimumSize);
  block.lines.forEach((line, index) => {
    context.font = `400 ${block.fontSize}px "PosterDisplay", "Arial Narrow", sans-serif`;
    context.fillStyle = options.highlightLast && index === block.lines.length - 1 ? options.accent ?? options.colour : options.colour;
    context.shadowColor = "rgba(0,0,0,0.82)";
    context.shadowBlur = 14;
    context.fillText(line, options.align === "center" ? area.x + area.width / 2 : area.x, area.y + block.fontSize + index * block.lineHeight, area.width);
  });
  context.shadowColor = "transparent";
  return block;
}

function drawBrushStroke(context: CanvasRenderingContext2D, x: number, y: number, width: number, colour: string) {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 9;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y);
  context.bezierCurveTo(x + width * 0.25, y - 8, x + width * 0.72, y + 7, x + width, y - 2);
  context.stroke();
  context.globalAlpha = 0.45;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x + 18, y + 13);
  context.lineTo(x + width * 0.82, y + 9);
  context.stroke();
  context.restore();
}

function drawTropeIcon(
  context: CanvasRenderingContext2D,
  trope: string,
  x: number,
  y: number,
  size: number,
  colour: string,
) {
  const key = trope.toLowerCase();
  const cx = x + size / 2;
  const cy = y + size / 2;
  context.save();
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineWidth = Math.max(3, size * 0.055);
  context.lineCap = "round";
  context.lineJoin = "round";

  const heart = () => {
    context.beginPath();
    context.moveTo(cx, y + size * 0.82);
    context.bezierCurveTo(x + size * 0.1, y + size * 0.55, x + size * 0.12, y + size * 0.2, cx, y + size * 0.34);
    context.bezierCurveTo(x + size * 0.88, y + size * 0.2, x + size * 0.9, y + size * 0.55, cx, y + size * 0.82);
    context.stroke();
  };

  if (/hockey|puck|ice/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.18, y + size * 0.12);
    context.lineTo(x + size * 0.38, y + size * 0.75);
    context.quadraticCurveTo(x + size * 0.44, y + size * 0.9, x + size * 0.62, y + size * 0.83);
    context.stroke();
    context.beginPath();
    context.ellipse(x + size * 0.77, y + size * 0.78, size * 0.13, size * 0.07, 0, 0, Math.PI * 2);
    context.fill();
  } else if (/football|quarterback|touchdown/.test(key)) {
    context.beginPath();
    context.ellipse(cx, cy, size * 0.38, size * 0.23, -0.45, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - size * 0.11, cy - size * 0.08);
    context.lineTo(cx + size * 0.11, cy + size * 0.08);
    context.stroke();
    [-0.08, 0, 0.08].forEach((offset) => {
      context.beginPath();
      context.moveTo(cx + size * (offset - 0.035), cy + size * (offset + 0.035));
      context.lineTo(cx + size * (offset + 0.035), cy + size * (offset - 0.035));
      context.stroke();
    });
  } else if (/forbidden|secret|off.?limits|locked/.test(key)) {
    context.strokeRect(x + size * 0.22, y + size * 0.43, size * 0.56, size * 0.43);
    context.beginPath();
    context.arc(cx, y + size * 0.43, size * 0.22, Math.PI, 0);
    context.stroke();
    context.beginPath();
    context.arc(cx, y + size * 0.63, size * 0.045, 0, Math.PI * 2);
    context.fill();
  } else if (/forced proximity|roommate|neighbou?r|close quarters/.test(key)) {
    context.strokeRect(x + size * 0.2, y + size * 0.12, size * 0.58, size * 0.76);
    context.beginPath();
    context.moveTo(x + size * 0.62, y + size * 0.2);
    context.lineTo(x + size * 0.62, y + size * 0.8);
    context.stroke();
    context.beginPath();
    context.arc(x + size * 0.54, cy, size * 0.025, 0, Math.PI * 2);
    context.fill();
  } else if (/stepbrother|family|home/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.12, y + size * 0.45);
    context.lineTo(cx, y + size * 0.1);
    context.lineTo(x + size * 0.88, y + size * 0.45);
    context.lineTo(x + size * 0.78, y + size * 0.45);
    context.lineTo(x + size * 0.78, y + size * 0.86);
    context.lineTo(x + size * 0.22, y + size * 0.86);
    context.lineTo(x + size * 0.22, y + size * 0.45);
    context.stroke();
    heart();
  } else if (/slow burn|heat|passion/.test(key)) {
    context.beginPath();
    context.moveTo(cx, y + size * 0.9);
    context.bezierCurveTo(x + size * 0.18, y + size * 0.68, x + size * 0.45, y + size * 0.42, cx, y + size * 0.12);
    context.bezierCurveTo(x + size * 0.82, y + size * 0.43, x + size * 0.9, y + size * 0.68, cx, y + size * 0.9);
    context.stroke();
  } else if (/workplace|office|boss|executive/.test(key)) {
    context.strokeRect(x + size * 0.14, y + size * 0.32, size * 0.72, size * 0.5);
    context.beginPath();
    context.moveTo(x + size * 0.36, y + size * 0.32);
    context.lineTo(x + size * 0.4, y + size * 0.18);
    context.lineTo(x + size * 0.6, y + size * 0.18);
    context.lineTo(x + size * 0.64, y + size * 0.32);
    context.moveTo(x + size * 0.14, y + size * 0.48);
    context.quadraticCurveTo(cx, y + size * 0.7, x + size * 0.86, y + size * 0.48);
    context.stroke();
  } else if (/adhd|neuro|opposites/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.58, y + size * 0.08);
    context.lineTo(x + size * 0.25, y + size * 0.55);
    context.lineTo(x + size * 0.5, y + size * 0.55);
    context.lineTo(x + size * 0.4, y + size * 0.92);
    context.lineTo(x + size * 0.78, y + size * 0.42);
    context.lineTo(x + size * 0.53, y + size * 0.42);
    context.closePath();
    context.stroke();
  } else {
    heart();
  }
  context.restore();
}

function drawFloatingCover(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  rotation: number,
  glowColour: string,
) {
  const height = width * (cover.naturalHeight / cover.naturalWidth);
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(rotation);
  context.shadowColor = "rgba(0,0,0,0.9)";
  context.shadowBlur = 44;
  context.shadowOffsetY = 24;
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.fillRect(-width / 2 - 5, -height / 2 - 5, width + 10, height + 10);
  context.drawImage(cover, -width / 2, -height / 2, width, height);
  context.shadowColor = glowColour;
  context.shadowBlur = 28;
  context.strokeStyle = glowColour;
  context.lineWidth = 3;
  context.strokeRect(-width / 2, -height / 2, width, height);
  context.restore();
}

function cleanCampaignHook(book: CatalogueBook, post: GeneratedPost): string {
  const cleaned = post.title
    .replace(book.title, "")
    .replace(/book spotlight/gi, "")
    .replace(/spotlight/gi, "")
    .replace(/^[\s|:/-]+|[\s|:/-]+$/g, "")
    .trim();

  return cleaned.length >= 5 && cleaned.length <= 100
    ? cleaned
    : book.subgenre || "M/M ROMANCE";
}

function drawCallToAction(
  context: CanvasRenderingContext2D,
  book: CatalogueBook,
  palette: CampaignPalette,
  width: number,
  y: number,
  compact = false,
) {
  const boxWidth = compact ? width - 128 : width - 150;
  const centreX = width / 2;
  context.fillStyle = colourCss(palette.primary);
  context.fillRect((width - boxWidth) / 2, y, boxWidth, 4);
  context.textAlign = "center";
  context.font = `400 ${compact ? 24 : 29}px "PosterDisplay", sans-serif`;
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.fillText("AVAILABLE ON", centreX, y + (compact ? 35 : 42));
  context.fillStyle = "#ffffff";
  drawFittedText(
    context,
    book.kindleUnlimited ? "KINDLE UNLIMITED" : "AMAZON",
    centreX,
    y + (compact ? 83 : 101),
    boxWidth - 40,
    900,
    compact ? 48 : 60,
    compact ? 34 : 42,
  );
  context.fillStyle = colourCss(palette.primary);
  context.fillRect(
    (width - boxWidth * 0.62) / 2,
    y + (compact ? 105 : 128),
    boxWidth * 0.62,
    4,
  );
}

type StaticPosterPalette = {
  base: CampaignColour;
  primary: CampaignColour;
  secondary: CampaignColour;
  warm: CampaignColour;
  cream: string;
};

type StaticPosterAudit = {
  width: number;
  height: number;
  rectangles: Array<{ name: string; rect: PosterRect }>;
};

type StaticTextOptions = {
  family: "PosterDisplay" | "PosterSans" | "PosterAccent";
  weight: number;
  startingSize: number;
  minimumSize: number;
  maximumLines: number;
  colour: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  shadow?: boolean;
  uppercase?: boolean;
};

function clampPosterChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hueDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function rgbToHsv(colour: CampaignColour): {
  hue: number;
  saturation: number;
  value: number;
} {
  const red = colour.red / 255;
  const green = colour.green / 255;
  const blue = colour.blue / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const range = maximum - minimum;
  let hue = 0;

  if (range > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / range) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / range + 2);
    else hue = 60 * ((red - green) / range + 4);
  }

  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: maximum === 0 ? 0 : range / maximum,
    value: maximum,
  };
}

function hsvToRgb(hue: number, saturation: number, value: number): CampaignColour {
  const chroma = value * saturation;
  const section = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (section < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, secondary];
  else if (section < 4) [red, green, blue] = [0, secondary, chroma];
  else if (section < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];

  return {
    red: clampPosterChannel((red + offset) * 255),
    green: clampPosterChannel((green + offset) * 255),
    blue: clampPosterChannel((blue + offset) * 255),
  };
}

function posterFallbackPalette(seed: string): StaticPosterPalette {
  const options: StaticPosterPalette[] = [
    {
      base: { red: 4, green: 7, blue: 13 },
      primary: { red: 0, green: 196, blue: 255 },
      secondary: { red: 142, green: 74, blue: 255 },
      warm: { red: 255, green: 113, blue: 31 },
      cream: "#fffaf0",
    },
    {
      base: { red: 8, green: 5, blue: 10 },
      primary: { red: 255, green: 35, blue: 133 },
      secondary: { red: 78, green: 142, blue: 255 },
      warm: { red: 255, green: 170, blue: 29 },
      cream: "#fff8ef",
    },
    {
      base: { red: 3, green: 10, blue: 10 },
      primary: { red: 0, green: 214, blue: 184 },
      secondary: { red: 210, green: 64, blue: 255 },
      warm: { red: 255, green: 127, blue: 32 },
      cream: "#fff9ec",
    },
  ];
  return options[seededNumber(seed) % options.length];
}

function extractStaticPosterPalette(
  cover: HTMLImageElement,
  seed: string,
): StaticPosterPalette {
  const sample = document.createElement("canvas");
  sample.width = 96;
  sample.height = 144;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  const fallback = posterFallbackPalette(seed);
  if (!sampleContext) return fallback;

  sampleContext.drawImage(cover, 0, 0, sample.width, sample.height);
  const data = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
  const buckets = new Map<
    number,
    {
      hue: number;
      red: number;
      green: number;
      blue: number;
      weight: number;
      count: number;
      peakSaturation: number;
      peakValue: number;
    }
  >();

  for (let index = 0; index < data.length; index += 8) {
    if (data[index + 3] < 190) continue;
    const colour = {
      red: data[index],
      green: data[index + 1],
      blue: data[index + 2],
    };
    const hsv = rgbToHsv(colour);
    if (hsv.saturation < 0.3 || hsv.value < 0.28 || hsv.value > 0.98) continue;

    const bucketKey = Math.round(hsv.hue / 15) % 24;
    const vividness = Math.pow(hsv.saturation, 2.35) * (0.4 + hsv.value * 0.6);
    const existing = buckets.get(bucketKey) ?? {
      hue: 0,
      red: 0,
      green: 0,
      blue: 0,
      weight: 0,
      count: 0,
      peakSaturation: 0,
      peakValue: 0,
    };
    existing.hue += hsv.hue * vividness;
    existing.red += colour.red * vividness;
    existing.green += colour.green * vividness;
    existing.blue += colour.blue * vividness;
    existing.weight += vividness;
    existing.count += 1;
    existing.peakSaturation = Math.max(existing.peakSaturation, hsv.saturation);
    existing.peakValue = Math.max(existing.peakValue, hsv.value);
    buckets.set(bucketKey, existing);
  }

  const candidates = [...buckets.values()]
    .filter((bucket) => bucket.weight > 0)
    .map((bucket) => {
      const average = {
        red: bucket.red / bucket.weight,
        green: bucket.green / bucket.weight,
        blue: bucket.blue / bucket.weight,
      };
      const hsv = rgbToHsv(average);
      const hue = bucket.hue / bucket.weight;
      const score =
        (0.55 + bucket.peakSaturation * 0.45) *
        (0.62 + bucket.peakValue * 0.38) *
        (1 + Math.log1p(bucket.count) * 0.16);
      return {
        hue,
        score,
        colour: hsvToRgb(
          hue,
          Math.max(0.76, Math.min(0.94, hsv.saturation * 1.12)),
          Math.max(0.78, Math.min(0.98, hsv.value * 1.08)),
        ),
      };
    })
    .sort((left, right) => right.score - left.score);

  if (!candidates.length) return fallback;

  let primary = candidates[0];
  const coolCandidate = candidates.find(
    (candidate) => candidate.hue >= 168 && candidate.hue <= 235,
  );
  const primaryIsWarm = primary.hue <= 72 || primary.hue >= 332;
  if (primaryIsWarm && coolCandidate && coolCandidate.score >= primary.score * 0.66) {
    primary = coolCandidate;
  }
  const violetCompanion =
    primary.hue >= 168 && primary.hue <= 235
      ? candidates.find(
          (candidate) =>
            candidate.hue >= 250 &&
            candidate.hue <= 325 &&
            candidate.score >= primary.score * 0.42,
        )
      : undefined;
  const secondary =
    violetCompanion ??
    candidates.find((candidate) => hueDistance(candidate.hue, primary.hue) >= 52) ??
    { colour: fallback.secondary, hue: rgbToHsv(fallback.secondary).hue, score: 0 };
  const warm =
    candidates.find(
      (candidate) =>
        (candidate.hue <= 68 || candidate.hue >= 335) &&
        hueDistance(candidate.hue, primary.hue) >= 34 &&
        hueDistance(candidate.hue, secondary.hue) >= 28,
    ) ?? { colour: fallback.warm, hue: rgbToHsv(fallback.warm).hue, score: 0 };

  return {
    base: fallback.base,
    primary: primary.colour,
    secondary: secondary.colour,
    warm: warm.colour,
    cream: fallback.cream,
  };
}

function recordStaticRect(
  audit: StaticPosterAudit,
  name: string,
  rect: PosterRect,
  inset = 34,
) {
  const tolerance = 0.5;
  if (
    rect.x < inset - tolerance ||
    rect.y < inset - tolerance ||
    rect.x + rect.width > audit.width - inset + tolerance ||
    rect.y + rect.height > audit.height - inset + tolerance
  ) {
    throw new Error(`${name} escaped the poster safe zone.`);
  }
  audit.rectangles.push({ name, rect });
}

function staticFont(options: StaticTextOptions, size: number): string {
  return `${options.weight} ${size}px "${options.family}", ${
    options.family === "PosterDisplay" ? '"Arial Narrow"' : "Arial"
  }, sans-serif`;
}

function wrapStaticText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string[] {
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const result: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maximumWidth) {
        line = candidate;
      } else {
        result.push(line);
        line = word;
      }
    });
    if (line) result.push(line);
  });

  return result;
}

function drawStaticText(
  context: CanvasRenderingContext2D,
  text: string,
  area: PosterRect,
  options: StaticTextOptions,
  audit: StaticPosterAudit,
  name: string,
): PosterRect {
  const value = (options.uppercase ? text.toUpperCase() : text).trim();
  if (!value) return { x: area.x, y: area.y, width: 0, height: 0 };

  let size = options.startingSize;
  let lines: string[] = [];
  let lineHeight = size * (options.lineHeight ?? 1.02);

  while (size >= options.minimumSize) {
    context.font = staticFont(options, size);
    lines = wrapStaticText(context, value, area.width);
    lineHeight = size * (options.lineHeight ?? 1.02);
    if (lines.length <= options.maximumLines && lines.length * lineHeight <= area.height) break;
    size -= 2;
  }

  if (
    size < options.minimumSize ||
    lines.length > options.maximumLines ||
    lines.length * lineHeight > area.height
  ) {
    throw new Error(`${name} is too long for a readable poster layout.`);
  }

  const measuredWidth = Math.min(
    area.width,
    Math.max(...lines.map((line) => context.measureText(line).width)),
  );
  const rect: PosterRect = {
    x:
      options.align === "center"
        ? area.x + (area.width - measuredWidth) / 2
        : options.align === "right"
          ? area.x + area.width - measuredWidth
          : area.x,
    y: area.y,
    width: measuredWidth,
    height: lines.length * lineHeight,
  };
  recordStaticRect(audit, name, rect);

  context.save();
  context.font = staticFont(options, size);
  context.textAlign = options.align ?? "left";
  context.textBaseline = "top";
  context.fillStyle = options.colour;
  if (options.shadow !== false) {
    context.shadowColor = "rgba(0,0,0,0.92)";
    context.shadowBlur = Math.max(10, size * 0.18);
    context.shadowOffsetY = Math.max(2, size * 0.04);
  }
  const x =
    options.align === "center"
      ? area.x + area.width / 2
      : options.align === "right"
        ? area.x + area.width
        : area.x;
  lines.forEach((line, index) => {
    context.fillText(line, x, area.y + index * lineHeight);
  });
  context.restore();
  return rect;
}

function drawStaticPaint(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: string,
  direction = 1,
) {
  context.save();
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(x, y + height * 0.22);
  context.bezierCurveTo(
    x + width * 0.24,
    y - height * 0.12 * direction,
    x + width * 0.69,
    y + height * 0.26 * direction,
    x + width,
    y + height * 0.06,
  );
  context.lineTo(x + width * 0.96, y + height * 0.78);
  context.bezierCurveTo(
    x + width * 0.64,
    y + height * 1.08,
    x + width * 0.25,
    y + height * 0.72,
    x + width * 0.03,
    y + height,
  );
  context.closePath();
  context.fill();
  context.globalAlpha = 0.45;
  context.fillRect(x + width * 0.08, y + height * 1.08, width * 0.72, Math.max(2, height * 0.08));
  context.restore();
}

function drawStaticGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: CampaignColour,
  alpha: number,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, colourCss(colour, alpha));
  gradient.addColorStop(0.45, colourCss(colour, alpha * 0.42));
  gradient.addColorStop(1, colourCss(colour, 0));
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawStaticPosterBackground(
  context: CanvasRenderingContext2D,
  palette: StaticPosterPalette,
  width: number,
  height: number,
  template: Exclude<PosterTemplate, "auto">,
  seed: number,
) {
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, colourCss(palette.base));
  base.addColorStop(0.46, "rgb(5, 6, 12)");
  base.addColorStop(1, "rgb(1, 2, 5)");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  drawStaticGlow(context, width * 0.03, height * 0.2, width * 0.72, palette.primary, 0.34);
  drawStaticGlow(context, width * 0.98, height * 0.56, width * 0.76, palette.secondary, 0.3);
  if (template === "offer-promotion") {
    drawStaticGlow(context, width * 0.14, height * 0.42, width * 0.52, palette.warm, 0.38);
  }
  context.restore();

  drawStaticPaint(
    context,
    -width * 0.16,
    height * 0.31,
    width * 0.84,
    Math.max(120, height * 0.13),
    colourCss(palette.primary, 0.24),
  );
  drawStaticPaint(
    context,
    width * 0.47,
    height * 0.48,
    width * 0.68,
    Math.max(150, height * 0.15),
    colourCss(palette.secondary, 0.24),
    -1,
  );
  drawStaticPaint(
    context,
    width * 0.03,
    height * 0.79,
    width * 0.7,
    Math.max(38, height * 0.04),
    colourCss(palette.primary, 0.16),
  );

  const upperShade = context.createLinearGradient(0, 0, 0, height * 0.42);
  upperShade.addColorStop(0, "rgba(1,2,5,0.3)");
  upperShade.addColorStop(0.56, "rgba(1,2,5,0.08)");
  upperShade.addColorStop(1, "rgba(1,2,5,0)");
  context.fillStyle = upperShade;
  context.fillRect(0, 0, width, height * 0.42);

  const floor = context.createLinearGradient(0, height * 0.68, 0, height);
  floor.addColorStop(0, "rgba(1,2,5,0)");
  floor.addColorStop(0.66, "rgba(1,2,5,0.42)");
  floor.addColorStop(1, "rgba(1,2,5,0.88)");
  context.fillStyle = floor;
  context.fillRect(0, height * 0.68, width, height * 0.32);

  const particleSeed = seed || 1;
  for (let index = 0; index < 62; index += 1) {
    const x = (particleSeed * (index + 13) * 71) % width;
    const y = (particleSeed * (index + 29) * 43) % height;
    const radius = 1 + ((particleSeed + index * 17) % 5);
    context.fillStyle = colourCss(
      index % 5 === 0 ? palette.warm : index % 2 === 0 ? palette.secondary : palette.primary,
      0.08 + ((index * 11) % 16) / 100,
    );
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 48; index += 1) {
    const side = index % 2 === 0 ? 0.12 : 0.88;
    const x = width * side + (((particleSeed + index * 79) % 220) - 110);
    const y = height * (0.2 + ((particleSeed + index * 47) % 650) / 1000);
    const radius = 2 + ((particleSeed + index * 23) % 13);
    context.fillStyle = colourCss(index % 3 === 0 ? palette.secondary : palette.primary, 0.12);
    context.save();
    context.translate(x, y);
    context.rotate(((particleSeed + index * 31) % 628) / 100);
    context.beginPath();
    context.moveTo(-radius * 0.35, -radius * 1.4);
    context.lineTo(radius * 0.7, -radius * 0.2);
    context.lineTo(radius * 0.25, radius * 1.2);
    context.lineTo(-radius * 0.65, radius * 0.35);
    context.closePath();
    context.fill();
    context.restore();
  }
  context.restore();
}

function drawContainedStaticCover(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / cover.naturalWidth, height / cover.naturalHeight);
  const drawWidth = cover.naturalWidth * scale;
  const drawHeight = cover.naturalHeight * scale;
  context.drawImage(
    cover,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function staticKindleRect(
  centreX: number,
  top: number,
  deviceWidth: number,
  rotation: number,
): PosterRect {
  const frame = Math.max(24, deviceWidth * 0.055);
  const innerWidth = deviceWidth - frame * 2;
  const deviceHeight = frame + innerWidth * 1.5 + Math.max(66, deviceWidth * 0.13);
  const rotatedWidth =
    Math.abs(deviceWidth * Math.cos(rotation)) +
    Math.abs(deviceHeight * Math.sin(rotation));
  const rotatedHeight =
    Math.abs(deviceWidth * Math.sin(rotation)) +
    Math.abs(deviceHeight * Math.cos(rotation));
  return {
    x: centreX - rotatedWidth / 2 - 12,
    y: top + deviceHeight / 2 - rotatedHeight / 2 - 12,
    width: rotatedWidth + 24,
    height: rotatedHeight + 38,
  };
}

function drawStaticKindle(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  palette: StaticPosterPalette,
  centreX: number,
  top: number,
  deviceWidth: number,
  rotation: number,
  audit: StaticPosterAudit,
  name: string,
): PosterRect {
  const frame = Math.max(24, deviceWidth * 0.055);
  const innerWidth = deviceWidth - frame * 2;
  const screenHeight = innerWidth * 1.5;
  const bottomFrame = Math.max(66, deviceWidth * 0.13);
  const deviceHeight = frame + screenHeight + bottomFrame;
  const rect = staticKindleRect(centreX, top, deviceWidth, rotation);
  recordStaticRect(audit, name, rect, 20);

  context.save();
  context.translate(centreX, top + deviceHeight + 18);
  context.rotate(rotation * 0.35);
  context.scale(1, 0.18);
  const reflection = context.createRadialGradient(0, 0, 12, 0, 0, deviceWidth * 0.65);
  reflection.addColorStop(0, colourCss(palette.primary, 0.32));
  reflection.addColorStop(0.55, "rgba(255,255,255,0.07)");
  reflection.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = reflection;
  context.beginPath();
  context.ellipse(0, 0, deviceWidth * 0.7, deviceWidth * 0.42, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.translate(centreX, top + deviceHeight / 2);
  context.rotate(rotation);
  context.translate(-deviceWidth / 2, -deviceHeight / 2);
  context.shadowColor = "rgba(0,0,0,0.96)";
  context.shadowBlur = Math.max(36, deviceWidth * 0.085);
  context.shadowOffsetY = Math.max(18, deviceWidth * 0.045);

  roundedRectanglePath(context, 0, 0, deviceWidth, deviceHeight, deviceWidth * 0.052);
  const shell = context.createLinearGradient(0, 0, deviceWidth, deviceHeight);
  shell.addColorStop(0, "#3b3d43");
  shell.addColorStop(0.12, "#111217");
  shell.addColorStop(0.68, "#050608");
  shell.addColorStop(1, "#262831");
  context.fillStyle = shell;
  context.fill();
  context.shadowColor = "transparent";

  roundedRectanglePath(context, 6, 6, deviceWidth - 12, deviceHeight - 12, deviceWidth * 0.044);
  context.strokeStyle = "rgba(255,255,255,0.34)";
  context.lineWidth = 2;
  context.stroke();

  const screenX = frame;
  const screenY = frame;
  context.save();
  roundedRectanglePath(context, screenX, screenY, innerWidth, screenHeight, Math.max(5, frame * 0.14));
  context.clip();
  context.fillStyle = colourCss(palette.base);
  context.fillRect(screenX, screenY, innerWidth, screenHeight);
  context.save();
  context.filter = "blur(20px) saturate(1.25)";
  context.globalAlpha = 0.48;
  drawImageCover(context, cover, screenX - 20, screenY - 20, innerWidth + 40, screenHeight + 40);
  context.restore();
  drawContainedStaticCover(context, cover, screenX, screenY, innerWidth, screenHeight);

  const glass = context.createLinearGradient(screenX, screenY, screenX + innerWidth, screenY + screenHeight);
  glass.addColorStop(0, "rgba(255,255,255,0.2)");
  glass.addColorStop(0.16, "rgba(255,255,255,0.035)");
  glass.addColorStop(0.55, "rgba(255,255,255,0)");
  glass.addColorStop(1, "rgba(255,255,255,0.07)");
  context.fillStyle = glass;
  context.fillRect(screenX, screenY, innerWidth, screenHeight);
  context.restore();

  context.strokeStyle = "rgba(0,0,0,0.9)";
  context.lineWidth = 5;
  context.strokeRect(screenX - 1, screenY - 1, innerWidth + 2, screenHeight + 2);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(255,255,255,0.4)";
  context.font = `700 ${Math.max(21, deviceWidth * 0.046)}px "PosterSans", Arial, sans-serif`;
  context.fillText("kindle", deviceWidth / 2, deviceHeight - bottomFrame * 0.39);

  context.save();
  context.globalCompositeOperation = "screen";
  const edgeGlow = context.createLinearGradient(0, 0, deviceWidth, 0);
  edgeGlow.addColorStop(0, colourCss(palette.primary, 0.5));
  edgeGlow.addColorStop(0.5, "rgba(255,255,255,0.08)");
  edgeGlow.addColorStop(1, colourCss(palette.secondary, 0.5));
  context.strokeStyle = edgeGlow;
  context.lineWidth = 3;
  roundedRectanglePath(context, 2, 2, deviceWidth - 4, deviceHeight - 4, deviceWidth * 0.05);
  context.stroke();
  context.restore();
  context.restore();
  return rect;
}

function drawStaticCoverHero(
  context: CanvasRenderingContext2D,
  cover: HTMLImageElement,
  palette: StaticPosterPalette,
  bounds: PosterRect,
  rotation: number,
  audit: StaticPosterAudit,
): PosterRect {
  const scale = Math.min(bounds.width / cover.naturalWidth, bounds.height / cover.naturalHeight);
  const width = cover.naturalWidth * scale;
  const height = cover.naturalHeight * scale;
  const x = bounds.x + (bounds.width - width) / 2;
  const y = bounds.y + (bounds.height - height) / 2;
  const rotatedWidth =
    Math.abs(width * Math.cos(rotation)) + Math.abs(height * Math.sin(rotation));
  const rotatedHeight =
    Math.abs(width * Math.sin(rotation)) + Math.abs(height * Math.cos(rotation));
  const rect = {
    x: x + width / 2 - rotatedWidth / 2 - 12,
    y: y + height / 2 - rotatedHeight / 2 - 12,
    width: rotatedWidth + 24,
    height: rotatedHeight + 34,
  };
  recordStaticRect(audit, "editorial cover", rect, 20);

  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(rotation);
  context.shadowColor = "rgba(0,0,0,0.95)";
  context.shadowBlur = 46;
  context.shadowOffsetY = 26;
  context.fillStyle = colourCss(palette.secondary, 0.62);
  context.beginPath();
  context.moveTo(-width / 2 + 8, -height / 2 + 12);
  context.lineTo(width / 2 + 15, -height / 2 + 24);
  context.lineTo(width / 2 + 15, height / 2 + 18);
  context.lineTo(-width / 2 + 8, height / 2 + 2);
  context.closePath();
  context.fill();
  context.shadowColor = "transparent";
  context.drawImage(cover, -width / 2, -height / 2, width, height);
  const shine = context.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  shine.addColorStop(0, "rgba(255,255,255,0.2)");
  shine.addColorStop(0.22, "rgba(255,255,255,0)");
  shine.addColorStop(1, "rgba(255,255,255,0.04)");
  context.fillStyle = shine;
  context.fillRect(-width / 2, -height / 2, width, height);
  context.restore();
  return rect;
}

function drawStaticTropeIcon(
  context: CanvasRenderingContext2D,
  trope: string,
  x: number,
  y: number,
  size: number,
  colour: string,
) {
  const key = trope.toLowerCase();
  const cx = x + size / 2;
  const cy = y + size / 2;
  context.save();
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineWidth = Math.max(7, size * 0.078);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = colour;
  context.shadowBlur = size * 0.1;

  const heart = () => {
    context.beginPath();
    context.moveTo(cx, y + size * 0.86);
    context.bezierCurveTo(x + size * 0.08, y + size * 0.58, x + size * 0.13, y + size * 0.18, cx, y + size * 0.35);
    context.bezierCurveTo(x + size * 0.87, y + size * 0.18, x + size * 0.92, y + size * 0.58, cx, y + size * 0.86);
    context.stroke();
  };

  if (/adhd|neurodiv|neuro/.test(key)) {
    context.beginPath();
    context.moveTo(cx, y + size * 0.17);
    context.bezierCurveTo(x + size * 0.27, y + size * 0.05, x + size * 0.12, y + size * 0.24, x + size * 0.2, y + size * 0.4);
    context.bezierCurveTo(x + size * 0.04, y + size * 0.54, x + size * 0.2, y + size * 0.78, x + size * 0.39, y + size * 0.72);
    context.bezierCurveTo(x + size * 0.43, y + size * 0.94, x + size * 0.68, y + size * 0.88, x + size * 0.65, y + size * 0.71);
    context.bezierCurveTo(x + size * 0.9, y + size * 0.78, x + size * 0.96, y + size * 0.47, x + size * 0.79, y + size * 0.4);
    context.bezierCurveTo(x + size * 0.9, y + size * 0.2, x + size * 0.68, y + size * 0.06, cx, y + size * 0.17);
    context.stroke();
    context.beginPath();
    context.moveTo(cx, y + size * 0.18);
    context.lineTo(cx, y + size * 0.72);
    context.moveTo(x + size * 0.28, y + size * 0.35);
    context.quadraticCurveTo(x + size * 0.48, y + size * 0.43, x + size * 0.34, y + size * 0.62);
    context.moveTo(x + size * 0.72, y + size * 0.32);
    context.quadraticCurveTo(x + size * 0.52, y + size * 0.45, x + size * 0.69, y + size * 0.61);
    context.stroke();
  } else if (/hockey|puck|ice/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.2, y + size * 0.08);
    context.lineTo(x + size * 0.39, y + size * 0.74);
    context.quadraticCurveTo(x + size * 0.43, y + size * 0.91, x + size * 0.65, y + size * 0.82);
    context.stroke();
    context.beginPath();
    context.ellipse(x + size * 0.77, y + size * 0.8, size * 0.14, size * 0.075, 0, 0, Math.PI * 2);
    context.fill();
  } else if (/football|quarterback|touchdown/.test(key)) {
    context.beginPath();
    context.ellipse(cx, cy, size * 0.4, size * 0.25, -0.46, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - size * 0.12, cy - size * 0.09);
    context.lineTo(cx + size * 0.12, cy + size * 0.09);
    context.stroke();
    [-0.07, 0, 0.07].forEach((offset) => {
      context.beginPath();
      context.moveTo(cx + size * (offset - 0.045), cy + size * (offset + 0.04));
      context.lineTo(cx + size * (offset + 0.045), cy + size * (offset - 0.04));
      context.stroke();
    });
  } else if (/forbidden|secret|off.?limits|locked/.test(key)) {
    roundedRectanglePath(context, x + size * 0.19, y + size * 0.42, size * 0.62, size * 0.46, size * 0.08);
    context.stroke();
    context.beginPath();
    context.arc(cx, y + size * 0.42, size * 0.24, Math.PI, 0);
    context.stroke();
    context.beginPath();
    context.arc(cx, y + size * 0.64, size * 0.045, 0, Math.PI * 2);
    context.fill();
  } else if (/forced proximity|roommate|neighbou?r|close quarters/.test(key)) {
    context.strokeRect(x + size * 0.17, y + size * 0.1, size * 0.66, size * 0.8);
    context.beginPath();
    context.moveTo(x + size * 0.64, y + size * 0.18);
    context.lineTo(x + size * 0.64, y + size * 0.82);
    context.stroke();
    context.beginPath();
    context.arc(x + size * 0.55, cy, size * 0.028, 0, Math.PI * 2);
    context.fill();
  } else if (/found family|family|stepbrother|teammate/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.13, y + size * 0.47);
    context.lineTo(cx, y + size * 0.14);
    context.lineTo(x + size * 0.87, y + size * 0.47);
    context.lineTo(x + size * 0.8, y + size * 0.47);
    context.lineTo(x + size * 0.8, y + size * 0.87);
    context.lineTo(x + size * 0.2, y + size * 0.87);
    context.lineTo(x + size * 0.2, y + size * 0.47);
    context.stroke();
    context.beginPath();
    context.moveTo(cx, y + size * 0.78);
    context.bezierCurveTo(x + size * 0.3, y + size * 0.66, x + size * 0.35, y + size * 0.49, cx, y + size * 0.58);
    context.bezierCurveTo(x + size * 0.65, y + size * 0.49, x + size * 0.7, y + size * 0.66, cx, y + size * 0.78);
    context.stroke();
  } else if (/slow burn|heat|passion|high heat/.test(key)) {
    context.beginPath();
    context.moveTo(cx, y + size * 0.92);
    context.bezierCurveTo(x + size * 0.15, y + size * 0.67, x + size * 0.43, y + size * 0.4, cx, y + size * 0.08);
    context.bezierCurveTo(x + size * 0.84, y + size * 0.42, x + size * 0.92, y + size * 0.7, cx, y + size * 0.92);
    context.stroke();
    context.beginPath();
    context.moveTo(cx, y + size * 0.78);
    context.quadraticCurveTo(x + size * 0.39, y + size * 0.62, cx, y + size * 0.44);
    context.quadraticCurveTo(x + size * 0.66, y + size * 0.63, cx, y + size * 0.78);
    context.stroke();
  } else if (/workplace|office|boss|executive/.test(key)) {
    roundedRectanglePath(context, x + size * 0.12, y + size * 0.31, size * 0.76, size * 0.55, size * 0.06);
    context.stroke();
    context.beginPath();
    context.moveTo(x + size * 0.34, y + size * 0.31);
    context.lineTo(x + size * 0.39, y + size * 0.16);
    context.lineTo(x + size * 0.61, y + size * 0.16);
    context.lineTo(x + size * 0.66, y + size * 0.31);
    context.moveTo(x + size * 0.12, y + size * 0.5);
    context.quadraticCurveTo(cx, y + size * 0.7, x + size * 0.88, y + size * 0.5);
    context.stroke();
  } else if (/coach|player/.test(key)) {
    context.beginPath();
    context.moveTo(x + size * 0.18, y + size * 0.28);
    context.quadraticCurveTo(cx, y + size * 0.02, x + size * 0.82, y + size * 0.28);
    context.lineTo(x + size * 0.68, y + size * 0.62);
    context.quadraticCurveTo(cx, y + size * 0.78, x + size * 0.32, y + size * 0.62);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(x + size * 0.66, y + size * 0.62);
    context.lineTo(x + size * 0.84, y + size * 0.88);
    context.stroke();
  } else {
    heart();
  }
  context.restore();
}

function drawStaticTropeLabel(
  context: CanvasRenderingContext2D,
  trope: string,
  area: PosterRect,
  colour: string,
  audit: StaticPosterAudit,
  index: number,
) {
  const words = trope.trim().split(/\s+/).filter(Boolean);
  const splitAt = words.length > 1 ? Math.ceil(words.length / 2) : words.length;
  const balancedLabel =
    words.length > 1
      ? `${words.slice(0, splitAt).join(" ")}\n${words.slice(splitAt).join(" ")}`
      : trope;
  const iconSize = Math.min(area.height * 0.54, area.width * 0.42, 118);
  const iconX = area.x + (area.width - iconSize) / 2;
  drawStaticTropeIcon(context, trope, iconX, area.y, iconSize, colour);
  drawStaticText(
    context,
    balancedLabel,
    {
      x: area.x,
      y: area.y + iconSize + 9,
      width: area.width,
      height: area.height - iconSize - 9,
    },
    {
      family: "PosterDisplay",
      weight: 400,
      startingSize: Math.min(42, Math.max(28, area.width * 0.13)),
      minimumSize: Math.min(24, Math.max(19, area.width * 0.09)),
      maximumLines: area.width < 230 ? 4 : 2,
      colour: "#ffffff",
      align: "center",
      lineHeight: 0.94,
      uppercase: true,
    },
    audit,
    `trope ${index + 1}`,
  );
}

function selectQuoteParts(value: string): { lead: string; accent: string; tail: string } {
  const clean = value.trim().replace(/^[“\"]+|[”\"]+$/g, "");
  const preferred = clean.match(/keep touching you|risk everything|my coach|worth everything|totally off limits/i);
  if (preferred && preferred.index !== undefined) {
    return {
      lead: clean.slice(0, preferred.index).trim(),
      accent: preferred[0].trim(),
      tail: clean.slice(preferred.index + preferred[0].length).trim(),
    };
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return { lead: "", accent: clean, tail: "" };
  const accentLength = Math.min(4, Math.max(2, Math.round(words.length * 0.28)));
  const accentStart = Math.max(1, Math.floor((words.length - accentLength) * 0.48));
  return {
    lead: words.slice(0, accentStart).join(" "),
    accent: words.slice(accentStart, accentStart + accentLength).join(" "),
    tail: words.slice(accentStart + accentLength).join(" "),
  };
}

function drawStaticCta(
  context: CanvasRenderingContext2D,
  book: CatalogueBook,
  palette: StaticPosterPalette,
  area: PosterRect,
  audit: StaticPosterAudit,
  align: "left" | "center" = "center",
) {
  const eyebrow = book.kindleUnlimited ? "AVAILABLE ON" : "AVAILABLE ON";
  const main = book.kindleUnlimited ? "KINDLE UNLIMITED" : "AMAZON";
  const eyebrowRect = drawStaticText(
    context,
    eyebrow,
    { x: area.x, y: area.y, width: area.width, height: 38 },
    {
      family: "PosterSans",
      weight: 700,
      startingSize: area.width < 430 ? 20 : 25,
      minimumSize: 17,
      maximumLines: 1,
      colour: "rgba(255,255,255,0.9)",
      align,
      uppercase: true,
      shadow: true,
    },
    audit,
    "CTA eyebrow",
  );
  const mainTop = area.y + eyebrowRect.height + 12;
  const mainRect = drawStaticText(
    context,
    main,
    { x: area.x, y: mainTop, width: area.width, height: area.height - eyebrowRect.height - 12 },
    {
      family: "PosterDisplay",
      weight: 400,
      startingSize: area.width < 430 ? 46 : 66,
      minimumSize: area.width < 430 ? 34 : 44,
      maximumLines: 1,
      colour: colourCss(palette.primary),
      align,
      uppercase: true,
      shadow: true,
    },
    audit,
    "CTA",
  );
  const underlineWidth = Math.min(area.width * 0.76, mainRect.width);
  drawStaticPaint(
    context,
    align === "center" ? area.x + (area.width - underlineWidth) / 2 : area.x,
    mainTop + mainRect.height + 6,
    underlineWidth,
    11,
    colourCss(palette.secondary, 0.9),
  );
}

function drawStaticSignature(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: StaticPosterPalette,
  audit: StaticPosterAudit,
) {
  drawStaticText(
    context,
    "MARLOW QUINN",
    { x: 50, y: height - 52, width: width - 100, height: 28 },
    {
      family: "PosterSans",
      weight: 700,
      startingSize: 18,
      minimumSize: 16,
      maximumLines: 1,
      colour: colourCss(palette.primary, 0.8),
      align: "right",
      uppercase: true,
      shadow: true,
    },
    audit,
    "author signature",
  );
}

type StaticOffer = { eyebrow: string; value: string };

function extractStaticOffer(text: string): StaticOffer | null {
  const price = text.match(/(?:£|\$)\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:p|¢)/iu)?.[0];
  if (price) return { eyebrow: "LIMITED TIME", value: price.replace(/\s+/g, "") };
  if (/\bfree\b/i.test(text)) return { eyebrow: "LIMITED TIME", value: "FREE" };
  if (/\bnew release\b/i.test(text)) return { eyebrow: "", value: "NEW RELEASE" };
  if (/\bon sale\b|\bsale price\b/i.test(text)) return { eyebrow: "SPECIAL OFFER", value: "SALE" };
  return null;
}

function resolveStaticPosterTemplate(
  selected: PosterTemplate,
  campaignType: CampaignType,
  seed: number,
  suppliedText: string,
): Exclude<PosterTemplate, "auto"> {
  if (selected !== "auto") return selected;
  if (extractStaticOffer(suppliedText)) return "offer-promotion";
  if (campaignType === "quote-post") return "cinematic-quote";
  if (campaignType === "trope-hook") return "trope-showcase";
  if (campaignType === "kindle-unlimited") return seed % 2 === 0 ? "kindle-hero" : "modern-editorial";
  if (campaignType === "backlist-revival") return "modern-editorial";
  return ["kindle-hero", "modern-editorial", "trope-showcase"][seed % 3] as
    | "kindle-hero"
    | "modern-editorial"
    | "trope-showcase";
}

async function createProfessionalCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
  campaignType: CampaignType;
  quote: string;
  template: PosterTemplate;
  aiBackground?: string;
}): Promise<{ dataUrl: string; template: Exclude<PosterTemplate, "auto"> }> {
  await ensurePosterFonts();
  const isTikTok = input.post.platform === "tiktok";
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const suppliedText = `${input.post.title} ${input.post.caption} ${input.quote}`;
  const seed = seededNumber(
    `${input.book.slug}-${input.post.platform}-${input.template}-${suppliedText}`,
  );
  let template = resolveStaticPosterTemplate(
    input.template,
    input.campaignType,
    seed,
    suppliedText,
  );

  if (template === "cinematic-quote" && !input.quote.trim()) {
    template = "modern-editorial";
  }
  const offer = extractStaticOffer(suppliedText);
  if (template === "offer-promotion" && !offer) {
    template = "modern-editorial";
  }

  const palette = extractStaticPosterPalette(cover, input.book.slug);
  const audit: StaticPosterAudit = { width, height, rectangles: [] };
  const primary = colourCss(palette.primary);
  const secondary = colourCss(palette.secondary);
  const warm = colourCss(palette.warm);
  const subgenre = (input.book.subgenre || "ROMANCE").trim();
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const uniqueTropes = input.book.tropes
    .filter(
      (trope, index, all) =>
        all.findIndex((item) => normalise(item) === normalise(trope)) === index,
    )
    .filter((trope) => normalise(trope) !== normalise(subgenre))
    .slice(0, 5);

  drawStaticPosterBackground(
    context,
    palette,
    width,
    height,
    template,
    seed,
  );

  if (template === "cinematic-quote") {
    const quote = input.quote.trim().replace(/^[“\"]+|[”\"]+$/g, "");
    const parts = selectQuoteParts(quote);
    const textX = 55;
    const textWidth = width - 110;
    let textY = isTikTok ? 82 : 55;

    if (parts.lead) {
      const lead = drawStaticText(
        context,
        `“${parts.lead}`,
        {
          x: textX,
          y: textY,
          width: textWidth,
          height: isTikTok ? 170 : 105,
        },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: isTikTok ? 86 : 68,
          minimumSize: isTikTok ? 46 : 36,
          maximumLines: 2,
          colour: "#ffffff",
          uppercase: true,
          lineHeight: 0.94,
        },
        audit,
        "quote lead",
      );
      textY += lead.height + 5;
    }

    drawStaticPaint(
      context,
      textX - 8,
      textY + (isTikTok ? 18 : 10),
      Math.min(textWidth * 0.82, isTikTok ? 760 : 650),
      isTikTok ? 92 : 68,
      colourCss(palette.primary, 0.82),
      -1,
    );
    const accentQuote = drawStaticText(
      context,
      `${parts.lead ? "" : "“"}${parts.accent}${parts.tail ? "" : "”"}`,
      {
        x: textX + (isTikTok ? 20 : 12),
        y: textY,
        width: textWidth - 24,
        height: isTikTok ? 210 : 145,
      },
      {
        family: "PosterAccent",
        weight: 700,
        startingSize: isTikTok ? 112 : 86,
        minimumSize: isTikTok ? 56 : 44,
        maximumLines: 2,
        colour: palette.cream,
        lineHeight: 0.88,
      },
      audit,
      "quote accent",
    );
    textY += accentQuote.height + (isTikTok ? 34 : 28);

    if (parts.tail) {
      drawStaticText(
        context,
        `${parts.tail}”`,
        {
          x: textX,
          y: textY,
          width: textWidth,
          height: isTikTok ? 180 : 110,
        },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: isTikTok ? 78 : 58,
          minimumSize: isTikTok ? 42 : 32,
          maximumLines: 3,
          colour: "#ffffff",
          uppercase: true,
          lineHeight: 0.94,
        },
        audit,
        "quote tail",
      );
    }

    context.save();
    context.globalCompositeOperation = "screen";
    drawStaticGlow(
      context,
      isTikTok ? 735 : 770,
      isTikTok ? 1170 : 800,
      isTikTok ? 470 : 390,
      palette.secondary,
      0.34,
    );
    context.restore();
    drawStaticKindle(
      context,
      cover,
      palette,
      isTikTok ? 700 : 760,
      isTikTok ? 720 : 390,
      isTikTok ? 620 : 535,
      isTikTok ? -0.035 : 0.035,
      audit,
      "quote Kindle",
    );
    drawStaticCta(
      context,
      input.book,
      palette,
      isTikTok
        ? { x: 55, y: 548, width: 485, height: 135 }
        : { x: 55, y: 1122, width: 405, height: 135 },
      audit,
      "left",
    );
  } else if (template === "trope-showcase") {
    const genreWords = subgenre.split(/\s+/).filter(Boolean);
    const genreAccent = genreWords.pop() || "ROMANCE";
    const genreLead = genreWords.join(" ");
    if (genreLead) {
      drawStaticText(
        context,
        genreLead,
        { x: 55, y: isTikTok ? 46 : 38, width: 970, height: isTikTok ? 105 : 76 },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: isTikTok ? 94 : 76,
          minimumSize: isTikTok ? 48 : 38,
          maximumLines: 2,
          colour: "#ffffff",
          align: "center",
          lineHeight: 0.88,
          uppercase: true,
        },
        audit,
        "trope heading lead",
      );
    }
    drawStaticPaint(
      context,
      230,
      isTikTok ? 137 : 91,
      620,
      isTikTok ? 72 : 58,
      colourCss(palette.primary, 0.82),
    );
    drawStaticText(
      context,
      genreAccent,
      { x: 55, y: isTikTok ? 105 : 66, width: 970, height: isTikTok ? 120 : 96 },
      {
        family: "PosterAccent",
        weight: 700,
        startingSize: isTikTok ? 122 : 102,
        minimumSize: isTikTok ? 64 : 52,
        maximumLines: 1,
        colour: palette.cream,
        align: "center",
        lineHeight: 0.84,
      },
      audit,
      "trope heading accent",
    );

    context.save();
    context.globalCompositeOperation = "screen";
    drawStaticGlow(
      context,
      540,
      isTikTok ? 800 : 605,
      isTikTok ? 570 : 470,
      palette.primary,
      0.3,
    );
    context.restore();
    drawStaticKindle(
      context,
      cover,
      palette,
      540,
      isTikTok ? 245 : 185,
      isTikTok ? 680 : 560,
      -0.018,
      audit,
      "trope Kindle",
    );

    const tropeCount = Math.max(1, uniqueTropes.length);
    const tropeGap = tropeCount >= 5 ? 10 : tropeCount === 4 ? 14 : 24;
    const tropeWidth = (970 - tropeGap * (tropeCount - 1)) / tropeCount;
    const tropeY = isTikTok ? 1350 : 965;
    const mosaic = uniqueTropes.map((_, index) => ({
      x: 55 + index * (tropeWidth + tropeGap),
      y: tropeY,
      width: tropeWidth,
      height: isTikTok ? 235 : 195,
    }));
    uniqueTropes.forEach((trope, index) => {
      const area = mosaic[index];
      if (!area) return;
      recordStaticRect(audit, `trope composition ${index + 1}`, area, 32);
      drawStaticTropeLabel(
        context,
        trope,
        area,
        index % 2 === 0 ? primary : secondary,
        audit,
        index,
      );
    });
    drawStaticCta(
      context,
      input.book,
      palette,
      isTikTok
        ? { x: 105, y: 1700, width: 870, height: 140 }
        : { x: 105, y: 1195, width: 870, height: 120 },
      audit,
      "center",
    );
  } else if (template === "kindle-hero") {
    drawStaticText(
      context,
      subgenre,
      {
        x: 55,
        y: isTikTok ? 76 : 48,
        width: 970,
        height: isTikTok ? 150 : 105,
      },
      {
        family: "PosterDisplay",
        weight: 400,
        startingSize: isTikTok ? 94 : 72,
        minimumSize: isTikTok ? 48 : 38,
        maximumLines: 2,
        colour: "#ffffff",
        align: "center",
        lineHeight: 0.92,
        uppercase: true,
      },
      audit,
      "hero heading",
    );
    drawStaticPaint(
      context,
      270,
      isTikTok ? 210 : 150,
      540,
      22,
      colourCss(palette.secondary, 0.85),
    );
    context.save();
    context.globalCompositeOperation = "screen";
    drawStaticGlow(
      context,
      540,
      isTikTok ? 930 : 675,
      isTikTok ? 570 : 475,
      palette.primary,
      0.36,
    );
    drawStaticGlow(
      context,
      isTikTok ? 805 : 815,
      isTikTok ? 780 : 590,
      isTikTok ? 370 : 310,
      palette.secondary,
      0.24,
    );
    context.restore();
    drawStaticKindle(
      context,
      cover,
      palette,
      540,
      isTikTok ? 270 : 190,
      isTikTok ? 740 : 620,
      -0.018,
      audit,
      "hero Kindle",
    );

    if (isTikTok && uniqueTropes.length) {
      drawStaticText(
        context,
        uniqueTropes.slice(0, 3).join("  •  "),
        { x: 90, y: 1485, width: 900, height: 80 },
        {
          family: "PosterSans",
          weight: 700,
          startingSize: 30,
          minimumSize: 23,
          maximumLines: 2,
          colour: palette.cream,
          align: "center",
          lineHeight: 1.05,
          uppercase: true,
        },
        audit,
        "hero support",
      );
    }
    drawStaticCta(
      context,
      input.book,
      palette,
      isTikTok
        ? { x: 105, y: 1650, width: 870, height: 150 }
        : { x: 105, y: 1182, width: 870, height: 125 },
      audit,
      "center",
    );
  } else if (template === "offer-promotion" && offer) {
    if (isTikTok) {
      drawStaticPaint(context, 48, 145, 930, 360, colourCss(palette.warm, 0.72), -1);
      if (offer.eyebrow) {
        drawStaticText(
          context,
          offer.eyebrow,
          { x: 55, y: 118, width: 970, height: 60 },
          {
            family: "PosterSans",
            weight: 700,
            startingSize: 34,
            minimumSize: 26,
            maximumLines: 1,
            colour: "#ffffff",
            align: "center",
            uppercase: true,
          },
          audit,
          "offer eyebrow",
        );
      }
      drawStaticText(
        context,
        offer.value,
        { x: 55, y: 190, width: 970, height: 330 },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: offer.value.length > 8 ? 205 : 315,
          minimumSize: 112,
          maximumLines: 2,
          colour: palette.cream,
          align: "center",
          lineHeight: 0.82,
          uppercase: true,
        },
        audit,
        "offer value",
      );
      drawStaticText(
        context,
        input.book.title,
        { x: 55, y: 520, width: 970, height: 150 },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: 75,
          minimumSize: 40,
          maximumLines: 2,
          colour: "#ffffff",
          align: "center",
          lineHeight: 0.9,
          uppercase: true,
        },
        audit,
        "offer title",
      );
    } else {
      drawStaticPaint(context, 38, 175, 480, 330, colourCss(palette.warm, 0.74), -1);
      if (offer.eyebrow) {
        drawStaticText(
          context,
          offer.eyebrow,
          { x: 55, y: 118, width: 445, height: 55 },
          {
            family: "PosterSans",
            weight: 700,
            startingSize: 28,
            minimumSize: 22,
            maximumLines: 1,
            colour: "#ffffff",
            align: "center",
            uppercase: true,
          },
          audit,
          "offer eyebrow",
        );
      }
      drawStaticText(
        context,
        offer.value,
        { x: 55, y: 185, width: 445, height: 295 },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: offer.value.length > 8 ? 126 : 210,
          minimumSize: 82,
          maximumLines: 2,
          colour: palette.cream,
          align: "center",
          lineHeight: 0.84,
          uppercase: true,
        },
        audit,
        "offer value",
      );
      drawStaticText(
        context,
        input.book.title,
        { x: 55, y: 535, width: 430, height: 230 },
        {
          family: "PosterDisplay",
          weight: 400,
          startingSize: 66,
          minimumSize: 38,
          maximumLines: 3,
          colour: "#ffffff",
          lineHeight: 0.92,
          uppercase: true,
        },
        audit,
        "offer title",
      );
    }

    context.save();
    context.globalCompositeOperation = "screen";
    drawStaticGlow(
      context,
      isTikTok ? 745 : 795,
      isTikTok ? 1130 : 760,
      isTikTok ? 500 : 390,
      palette.primary,
      0.34,
    );
    context.restore();
    drawStaticKindle(
      context,
      cover,
      palette,
      isTikTok ? 700 : 745,
      isTikTok ? 700 : 315,
      isTikTok ? 600 : 505,
      isTikTok ? 0.035 : 0.045,
      audit,
      "offer Kindle",
    );
    drawStaticCta(
      context,
      input.book,
      palette,
      isTikTok
        ? { x: 100, y: 1685, width: 880, height: 140 }
        : { x: 55, y: 1100, width: 430, height: 135 },
      audit,
      isTikTok ? "center" : "left",
    );
  } else {
    template = "modern-editorial";
    const editorialWide = cover.naturalWidth / cover.naturalHeight > 1.25;
    context.save();
    context.globalCompositeOperation = "screen";
    context.fillStyle = colourCss(palette.primary, 0.27);
    context.beginPath();
    if (isTikTok) {
      context.moveTo(0, 520);
      context.lineTo(width, 265);
      context.lineTo(width, 720);
      context.lineTo(0, 920);
    } else {
      context.moveTo(0, 270);
      context.lineTo(width, 70);
      context.lineTo(width, 435);
      context.lineTo(0, 620);
    }
    context.closePath();
    context.fill();
    context.restore();

    drawStaticText(
      context,
      subgenre,
      {
        x: 55,
        y: isTikTok ? 88 : 65,
        width: 970,
        height: isTikTok ? 330 : 235,
      },
      {
        family: "PosterDisplay",
        weight: 400,
        startingSize: isTikTok ? 150 : 112,
        minimumSize: isTikTok ? 70 : 54,
        maximumLines: 3,
        colour: "#ffffff",
        align: isTikTok ? "left" : "right",
        lineHeight: 0.84,
        uppercase: true,
      },
      audit,
      "editorial heading",
    );
    drawStaticPaint(
      context,
      isTikTok ? 55 : 590,
      isTikTok ? 420 : 302,
      isTikTok ? 640 : 420,
      26,
      colourCss(palette.secondary, 0.9),
      -1,
    );

    const editorialBounds: PosterRect = isTikTok
      ? editorialWide
        ? { x: 55, y: 760, width: 970, height: 540 }
        : { x: 70, y: 650, width: 580, height: 1010 }
      : editorialWide
        ? { x: 55, y: 510, width: 970, height: 500 }
        : { x: 65, y: 345, width: 515, height: 865 };
    drawStaticCoverHero(
      context,
      cover,
      palette,
      editorialBounds,
      isTikTok ? -0.032 : -0.045,
      audit,
    );

    drawStaticText(
      context,
      input.book.title,
      isTikTok
        ? editorialWide
          ? { x: 55, y: 500, width: 970, height: 190 }
          : { x: 650, y: 610, width: 375, height: 360 }
        : editorialWide
          ? { x: 55, y: 355, width: 970, height: 145 }
          : { x: 610, y: 395, width: 415, height: 325 },
      {
        family: "PosterDisplay",
        weight: 400,
        startingSize: isTikTok ? 72 : 68,
        minimumSize: isTikTok ? 38 : 35,
        maximumLines: editorialWide ? 3 : 5,
        colour: palette.cream,
        align: editorialWide ? "center" : "left",
        lineHeight: 0.9,
        uppercase: true,
      },
      audit,
      "editorial title",
    );

    uniqueTropes.slice(0, 2).forEach((trope, index) => {
      drawStaticText(
        context,
        trope,
        isTikTok
          ? editorialWide
            ? { x: 55 + index * 500, y: 1350, width: 470, height: 120 }
            : { x: 665, y: 1035 + index * 135, width: 345, height: 120 }
          : editorialWide
            ? { x: 55 + index * 500, y: 1020, width: 470, height: 100 }
            : { x: 625, y: 785 + index * 105, width: 380, height: 95 },
        {
          family: "PosterSans",
          weight: 700,
          startingSize: isTikTok ? 29 : 26,
          minimumSize: 19,
          maximumLines: 3,
          colour: index === 0 ? primary : secondary,
          lineHeight: 1.05,
          uppercase: true,
        },
        audit,
        `editorial detail ${index + 1}`,
      );
    });
    drawStaticCta(
      context,
      input.book,
      palette,
      isTikTok
        ? editorialWide
          ? { x: 105, y: 1690, width: 870, height: 145 }
          : { x: 650, y: 1530, width: 375, height: 150 }
        : editorialWide
          ? { x: 105, y: 1180, width: 870, height: 125 }
          : { x: 610, y: 1052, width: 415, height: 135 },
      audit,
      editorialWide ? "center" : "left",
    );
  }

  drawStaticSignature(context, width, height, palette, audit);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.95),
    template,
  };
}

async function createLegacyProfessionalCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
  campaignType: CampaignType;
  quote: string;
  template: PosterTemplate;
  aiBackground?: string;
}): Promise<{ dataUrl: string; template: Exclude<PosterTemplate, "auto"> }> {
  await ensurePosterFonts();
  const isTikTok = input.post.platform === "tiktok";
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const scene = input.aiBackground ? await loadImage(input.aiBackground) : null;
  const palette = extractCampaignPalette(cover, input.book.slug);
  const generationSeed = seededNumber(`${input.book.slug}-${input.post.platform}-${Date.now()}`);
  let template = resolvePosterTemplate(input.template, input.campaignType, generationSeed);
  if (
    input.template === "auto" &&
    /(?:£|\$)\s*\d|\b\d+(?:[.,]\d{1,2})?\s*(?:p|¢)|\bfree\b|\bsale\b|\bnew release\b/i.test(
      `${input.post.title} ${input.post.caption} ${input.quote}`,
    )
  ) {
    template = "offer-promotion";
  }
  const hook = cleanCampaignHook(input.book, input.post);

  drawAtmosphericBackground(
    context,
    cover,
    palette,
    width,
    height,
    `${input.book.slug}-${template}`,
    0,
    scene,
  );
  const accent = colourCss(palette.primary);
  const secondary = colourCss(palette.secondary);
  const platformInset = input.post.platform === "facebook" ? 72 : 60;
  const ctaY = isTikTok ? 1735 : 1160;
  const ctaRect: PosterRect = { x: 55, y: ctaY, width: 970, height: isTikTok ? 155 : 145 };
  const deviceRect = (centreX: number, top: number, deviceWidth: number): PosterRect => {
    const frame = Math.max(22, deviceWidth * 0.055);
    const innerWidth = deviceWidth - frame * 2;
    const deviceHeight = innerWidth * (cover.naturalHeight / cover.naturalWidth) + frame + Math.max(58, deviceWidth * 0.13);
    return { x: centreX - deviceWidth / 2 - 14, y: top - 14, width: deviceWidth + 28, height: deviceHeight + 28 };
  };
  const shade = (x: number, y: number, w: number, h: number, direction: "left" | "right" | "down" = "right") => {
    const gradient = direction === "down"
      ? context.createLinearGradient(0, y, 0, y + h)
      : context.createLinearGradient(x, 0, x + w, 0);
    if (direction === "left") {
      gradient.addColorStop(0, "rgba(2,3,7,0)");
      gradient.addColorStop(1, "rgba(2,3,7,0.94)");
    } else {
      gradient.addColorStop(0, "rgba(2,3,7,0.94)");
      gradient.addColorStop(1, "rgba(2,3,7,0)");
    }
    context.fillStyle = gradient;
    context.fillRect(x, y, w, h);
  };
  const glow = (x: number, y: number, radius: number, colour: string) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  const drawCta = (y = ctaRect.y, align: "center" | "left" = "center") => {
    const x = align === "center" ? width / 2 : platformInset;
    context.textAlign = align;
    context.shadowColor = "rgba(0,0,0,0.9)";
    context.shadowBlur = 18;
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.font = `400 ${isTikTok ? 31 : 27}px "PosterDisplay", sans-serif`;
    context.fillText("AVAILABLE ON", x, y + 34);
    context.fillStyle = accent;
    context.font = `400 ${isTikTok ? 68 : 58}px "PosterDisplay", sans-serif`;
    context.fillText(input.book.kindleUnlimited ? "KINDLE UNLIMITED" : "AMAZON", x, y + (isTikTok ? 105 : 94), align === "center" ? width - 120 : 560);
    context.shadowColor = "transparent";
    drawBrushStroke(context, align === "center" ? 170 : platformInset, y + (isTikTok ? 126 : 112), align === "center" ? width - 340 : 480, accent);
  };
  const brand = () => {
    context.textAlign = "right";
    context.fillStyle = "rgba(255,255,255,0.62)";
    context.font = `700 ${isTikTok ? 18 : 16}px "PosterSans", sans-serif`;
    context.fillText("MARLOW QUINN", width - platformInset, height - 30);
  };

  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const headingKey = normalise(input.book.subgenre || hook);
  const uniqueTropes = input.book.tropes
    .filter((trope, index, all) => all.findIndex((item) => normalise(item) === normalise(trope)) === index)
    .filter((trope) => normalise(trope) !== headingKey)
    .slice(0, 5);

  if (template === "cinematic-quote") {
    const kindle = isTikTok ? deviceRect(650, 720, 540) : deviceRect(820, 360, 430);
    const quoteArea: PosterRect = isTikTok
      ? { x: 58, y: 95, width: 950, height: 590 }
      : { x: platformInset, y: 95, width: 410, height: 930 };
    verifyPosterGeometry(width, height, kindle, [quoteArea], ctaRect);
    shade(0, 0, isTikTok ? width : 610, isTikTok ? 760 : height, "right");
    const exactQuote = `“${(input.quote.trim() || input.post.caption.split(/\n+/)[0] || hook).replace(/^[“"]|[”"]$/g, "")}”`;
    const quoteBlock = drawDisplayLines(context, exactQuote.toUpperCase(), quoteArea, { colour: "#ffffff", accent, maximumLines: isTikTok ? 6 : 9, startingSize: isTikTok ? 105 : 76, minimumSize: isTikTok ? 52 : 38, highlightLast: true });
    drawBrushStroke(context, quoteArea.x, quoteArea.y + Math.min(quoteArea.height - 30, quoteBlock.lines.length * quoteBlock.lineHeight + quoteBlock.fontSize + 18), Math.min(quoteArea.width * 0.78, 570), accent);
    glow(isTikTok ? 760 : 845, isTikTok ? 1180 : 700, 430, colourCss(palette.primary, 0.28));
    drawKindleMockup(context, cover, palette, isTikTok ? 650 : 820, isTikTok ? 720 : 360, isTikTok ? 540 : 430, isTikTok ? -0.035 : 0.045);
    drawCta();
  } else if (template === "trope-showcase") {
    const kindle = isTikTok ? deviceRect(780, 355, 560) : deviceRect(820, 220, 480);
    const heading: PosterRect = { x: platformInset, y: isTikTok ? 95 : 70, width: isTikTok ? 930 : 470, height: isTikTok ? 220 : 190 };
    const tropeArea: PosterRect = isTikTok
      ? { x: platformInset, y: 390, width: 390, height: 1080 }
      : { x: platformInset, y: 330, width: 430, height: 680 };
    verifyPosterGeometry(width, height, kindle, [heading, tropeArea], ctaRect);
    shade(0, 0, 535, height, "right");
    const headingWords = (input.book.subgenre || hook).toUpperCase().split(/\s+/).filter(Boolean);
    const headingAccent = headingWords.pop() || "ROMANCE";
    const headingLead = headingWords.join(" ");
    context.textAlign = "left";
    context.shadowColor = "rgba(0,0,0,0.9)";
    context.shadowBlur = 16;
    if (headingLead) {
      context.fillStyle = "#ffffff";
      context.font = `400 ${isTikTok ? 56 : 46}px "PosterDisplay", sans-serif`;
      context.fillText(headingLead, heading.x, heading.y + (isTikTok ? 56 : 46), heading.width);
    }
    context.fillStyle = accent;
    context.font = `400 ${isTikTok ? 112 : 90}px "PosterDisplay", sans-serif`;
    context.fillText(headingAccent, heading.x, heading.y + (isTikTok ? 160 : 132), heading.width);
    context.shadowColor = "transparent";
    drawBrushStroke(context, heading.x, heading.y + heading.height - 12, Math.min(heading.width * 0.76, 460), secondary);
    context.textAlign = "left";
    const tropeGap = isTikTok
      ? Math.min(205, 1030 / Math.max(1, uniqueTropes.length))
      : Math.min(170, 650 / Math.max(1, uniqueTropes.length));
    uniqueTropes.forEach((trope, index) => {
      const y = tropeArea.y + index * tropeGap;
      const iconSize = isTikTok ? 72 : 66;
      drawTropeIcon(
        context,
        trope,
        tropeArea.x,
        y + 3,
        iconSize,
        index % 2 === 0 ? accent : secondary,
      );
      context.fillStyle = "#ffffff";
      const textX = tropeArea.x + iconSize + 24;
      const block = fittedMultiline(context, trope.toUpperCase(), tropeArea.width - iconSize - 24, 2, isTikTok ? 49 : 38, isTikTok ? 31 : 27);
      block.lines.forEach((line, lineIndex) => {
        context.font = `400 ${block.fontSize}px "PosterDisplay", sans-serif`;
        context.fillText(line, textX, y + block.fontSize + lineIndex * block.lineHeight, tropeArea.width - iconSize - 24);
      });
    });
    glow(isTikTok ? 790 : 850, isTikTok ? 1000 : 650, 440, colourCss(palette.secondary, 0.25));
    drawKindleMockup(context, cover, palette, isTikTok ? 780 : 820, isTikTok ? 355 : 220, isTikTok ? 560 : 480, 0.045);
    drawCta();
  } else if (template === "offer-promotion") {
    const kindle = isTikTok ? deviceRect(750, 420, 580) : deviceRect(820, 300, 450);
    const offerArea: PosterRect = isTikTok
      ? { x: 55, y: 125, width: 390, height: 980 }
      : { x: 55, y: 90, width: 380, height: 850 };
    verifyPosterGeometry(width, height, kindle, [offerArea], ctaRect);
    shade(0, 0, 560, height, "right");
    const supplied = `${input.post.title} ${input.post.caption} ${input.quote}`;
    const price = supplied.match(/(?:£|\$)?\s*\d+(?:[.,]\d{1,2})?\s*(?:p|¢|c)?|\bfree\b/iu)?.[0]?.trim();
    const release = /\bnew release\b/i.test(supplied) ? "NEW RELEASE" : (input.book.subgenre || hook).toUpperCase();
    context.textAlign = "left";
    context.fillStyle = "#ffffff";
    context.font = `400 ${isTikTok ? 59 : 48}px "PosterDisplay", sans-serif`;
    context.fillText(release, offerArea.x, offerArea.y + 70, offerArea.width);
    glow(offerArea.x + 170, offerArea.y + 330, 235, colourCss(palette.primary, 0.38));
    context.fillStyle = accent;
    context.font = `400 ${price ? (isTikTok ? 245 : 205) : (isTikTok ? 88 : 72)}px "PosterDisplay", sans-serif`;
    context.fillText((price || hook).toUpperCase(), offerArea.x, offerArea.y + (price ? 300 : 205), offerArea.width);
    drawBrushStroke(context, offerArea.x, offerArea.y + (price ? 350 : 250), offerArea.width * 0.78, secondary);
    drawDisplayLines(context, input.book.title.toUpperCase(), { x: offerArea.x, y: offerArea.y + 440, width: offerArea.width, height: 300 }, { colour: "#ffffff", accent, maximumLines: 3, startingSize: isTikTok ? 66 : 54, minimumSize: 36, highlightLast: true });
    drawKindleMockup(context, cover, palette, isTikTok ? 750 : 820, isTikTok ? 420 : 300, isTikTok ? 580 : 450, 0.035);
    drawCta();
  } else if (template === "modern-editorial") {
    const editorialCover: PosterRect = isTikTok
      ? { x: 500, y: 610, width: 500, height: 810 }
      : { x: 570, y: 380, width: 445, height: 725 };
    const titleArea: PosterRect = { x: platformInset, y: isTikTok ? 90 : 65, width: width - platformInset * 2, height: isTikTok ? 420 : 290 };
    const detailArea: PosterRect = isTikTok
      ? { x: platformInset, y: 650, width: 350, height: 700 }
      : { x: platformInset, y: 450, width: 420, height: 500 };
    verifyPosterGeometry(width, height, editorialCover, [titleArea, detailArea], ctaRect);
    context.save();
    context.globalAlpha = 0.22;
    context.fillStyle = accent;
    context.beginPath();
    context.moveTo(width * 0.58, 0);
    context.lineTo(width, 0);
    context.lineTo(width, height * 0.72);
    context.lineTo(width * 0.82, height * 0.82);
    context.closePath();
    context.fill();
    context.restore();
    shade(0, 0, 540, height, "right");
    drawDisplayLines(context, (hook || input.book.subgenre).toUpperCase(), titleArea, { colour: "#ffffff", accent, maximumLines: 3, startingSize: isTikTok ? 130 : 96, minimumSize: 58, highlightLast: true });
    drawBrushStroke(context, titleArea.x, titleArea.y + titleArea.height - 20, Math.min(580, titleArea.width * 0.65), accent);
    context.textAlign = "left";
    uniqueTropes.slice(0, 3).forEach((trope, index) => {
      context.fillStyle = index === 1 ? accent : "rgba(255,255,255,0.88)";
      context.font = `400 ${isTikTok ? 43 : 35}px "PosterDisplay", sans-serif`;
      context.fillText(trope.toUpperCase(), detailArea.x, detailArea.y + 60 + index * (isTikTok ? 145 : 110), detailArea.width);
    });
    glow(isTikTok ? 790 : 820, isTikTok ? 1030 : 710, 460, colourCss(palette.primary, 0.32));
    drawFloatingCover(
      context,
      cover,
      editorialCover.x,
      editorialCover.y,
      editorialCover.width,
      -0.045,
      accent,
    );
    drawCta();
  } else {
    const kindle = isTikTok ? deviceRect(540, 290, 760) : deviceRect(540, 195, 500);
    const heading: PosterRect = { x: platformInset, y: isTikTok ? 70 : 45, width: width - platformInset * 2, height: isTikTok ? 165 : 120 };
    const support: PosterRect = { x: 140, y: 1470, width: 800, height: 150 };
    verifyPosterGeometry(width, height, kindle, isTikTok ? [heading, support] : [heading], ctaRect);
    shade(0, 0, width, isTikTok ? 260 : 200, "down");
    const heroHeading = input.campaignType === "kindle-unlimited" ? "AVAILABLE ON" : (hook || input.book.subgenre).toUpperCase();
    drawDisplayLines(context, heroHeading, heading, { colour: "#ffffff", accent, align: "center", maximumLines: 2, startingSize: isTikTok ? 86 : 66, minimumSize: 44, highlightLast: true });
    glow(width / 2, isTikTok ? 920 : 650, 520, colourCss(palette.primary, 0.3));
    drawKindleMockup(context, cover, palette, 540, isTikTok ? 290 : 195, isTikTok ? 760 : 500, -0.018);
    if (isTikTok) {
      context.textAlign = "center";
      context.fillStyle = "#ffffff";
      context.font = `400 34px "PosterDisplay", sans-serif`;
      context.fillText((uniqueTropes.slice(0, 3).join("  •  ") || input.book.subgenre).toUpperCase(), width / 2, support.y + 55, support.width);
    }
    drawCta();
  }

  brand();

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.95),
    template,
  };
}

function videoRecorderMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;

  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

async function createCampaignVideo(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  posterDataUrl: string;
}): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot create downloadable video files.");
  }

  const mimeType = videoRecorderMimeType();

  if (!mimeType) {
    throw new Error("This browser has no supported video recording format.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the video.");

  const [poster, cover] = await Promise.all([
    loadImage(input.posterDataUrl),
    loadImage(input.book.coverUrl),
  ]);
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const durationMs = 9000;

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () =>
      reject(new Error("The browser video recorder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    function drawFrame(now: number) {
      const elapsed = Math.min(durationMs, now - startedAt);
      const progress = elapsed / durationMs;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.filter = "blur(28px) brightness(0.35) saturate(1.25)";
      drawImageCover(context, poster, -60, -60, 1200, 2040);
      context.restore();

      const posterScale = 0.88 + progress * 0.05;
      const posterWidth = 1000 * posterScale;
      const posterHeight = 1780 * posterScale;
      const posterX = (canvas.width - posterWidth) / 2;
      const posterY = (canvas.height - posterHeight) / 2 - 10;

      context.save();
      context.shadowColor = "rgba(0,0,0,0.7)";
      context.shadowBlur = 45;
      context.shadowOffsetY = 18;
      drawContainedImage(
        context,
        poster,
        posterX,
        posterY,
        posterWidth,
        posterHeight,
      );
      context.restore();

      const pulse = 0.35 + Math.sin(progress * Math.PI * 4) * 0.08;
      const glow = context.createRadialGradient(850, 280, 20, 850, 280, 420);
      glow.addColorStop(0, `rgba(236,72,153,${pulse})`);
      glow.addColorStop(1, "rgba(236,72,153,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);

      if (progress > 0.72) {
        const endProgress = Math.min(1, (progress - 0.72) / 0.18);
        context.fillStyle = `rgba(5,5,8,${0.88 * endProgress})`;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.globalAlpha = endProgress;
        const coverHeight = 760;
        const coverWidth =
          coverHeight * (cover.naturalWidth / cover.naturalHeight);
        context.save();
        context.shadowColor = "rgba(0,0,0,0.8)";
        context.shadowBlur = 42;
        context.drawImage(
          cover,
          (canvas.width - coverWidth) / 2,
          260,
          coverWidth,
          coverHeight,
        );
        context.restore();

        context.textAlign = "center";
        context.fillStyle = "#ffffff";
        context.font = "800 62px Arial, sans-serif";
        context.fillText(input.book.title, canvas.width / 2, 1130);
        context.fillStyle = "#f9a8d4";
        context.font = "700 34px Arial, sans-serif";
        const finalTropes = input.book.tropes.slice(0, 3).join("  •  ");
        const tropeLines = wrappedLines(context, finalTropes, 920, 2);
        tropeLines.forEach((line, index) => {
          context.fillText(line, canvas.width / 2, 1230 + index * 48);
        });

        if (input.book.kindleUnlimited) {
          context.fillStyle = "#ffffff";
          context.font = "700 36px Arial, sans-serif";
          context.fillText(
            "AVAILABLE ON KINDLE UNLIMITED",
            canvas.width / 2,
            1510,
          );
        }

        context.fillStyle = "#ec4899";
        context.font = "700 30px Arial, sans-serif";
        context.fillText("MARLOW QUINN", canvas.width / 2, 1610);
        context.globalAlpha = 1;
      }

      if (elapsed >= durationMs) {
        resolve();
        return;
      }

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach((track) => track.stop());

  if (blob.size === 0) {
    throw new Error("The browser returned an empty video file.");
  }

  return { blob, mimeType };
}

function eased(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - clamped, 3);
}

async function createBrandedCampaignVideo(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  posterDataUrl: string;
}): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot create downloadable video files.");
  }

  const mimeType = videoRecorderMimeType();

  if (!mimeType) {
    throw new Error("This browser has no supported video recording format.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the video.");

  const [poster, cover] = await Promise.all([
    loadImage(input.posterDataUrl),
    loadImage(input.book.coverUrl),
  ]);
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const durationMs = 11000;

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () =>
      reject(new Error("The browser video recorder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  function brandFrame() {
    context.strokeStyle = "rgba(236,72,153,0.8)";
    context.lineWidth = 5;
    context.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
    context.textAlign = "left";
    context.fillStyle = "#ec4899";
    context.fillRect(64, 64, 96, 8);
    context.fillStyle = "#ffffff";
    context.font = "700 25px Arial, sans-serif";
    context.fillText("MARLOW QUINN", 64, 112);
    context.fillStyle = "#f9a8d4";
    context.font = "700 17px Arial, sans-serif";
    context.fillText("BITE  •  HEAT  •  HEART", 64, 142);
  }

  function motionBackground(progress: number, darkness: number) {
    const zoom = 1.03 + progress * 0.08;
    const backgroundWidth = canvas.width * zoom;
    const backgroundHeight = canvas.height * zoom;
    drawImageCover(
      context,
      poster,
      (canvas.width - backgroundWidth) / 2,
      (canvas.height - backgroundHeight) / 2,
      backgroundWidth,
      backgroundHeight,
    );
    context.fillStyle = `rgba(5,5,8,${darkness})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  recorder.start(250);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    function drawFrame(now: number) {
      const elapsed = Math.min(durationMs, now - startedAt);
      const progress = elapsed / durationMs;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#050508";
      context.fillRect(0, 0, canvas.width, canvas.height);

      if (progress < 0.22) {
        const scene = eased(progress / 0.22);
        motionBackground(scene, 0.76);

        context.save();
        context.globalAlpha = scene;
        context.fillStyle = "#ec4899";
        context.fillRect(64, 330, 270, 54);
        context.fillStyle = "#ffffff";
        context.font = "800 27px Arial, sans-serif";
        context.textAlign = "center";
        context.fillText("MM ROMANCE", 199, 367);

        const hook =
          input.post.title || input.book.tropes.slice(0, 2).join(" • ");
        context.font = "800 78px Arial, sans-serif";
        context.textAlign = "left";
        const hookLines = wrappedLines(context, hook, 920, 5);
        const startX = 64 - (1 - scene) * 150;
        hookLines.forEach((line, index) => {
          context.fillText(line, startX, 470 + index * 94);
        });
        context.fillStyle = "#f9a8d4";
        context.font = "700 31px Arial, sans-serif";
        context.fillText(input.book.subgenre.toUpperCase(), startX, 1030);
        context.restore();
        brandFrame();
      } else if (progress < 0.52) {
        const scene = (progress - 0.22) / 0.3;
        motionBackground(scene, 0.83);
        brandFrame();

        context.textAlign = "left";
        context.fillStyle = "#ffffff";
        context.font = "800 64px Arial, sans-serif";
        context.fillText("WHAT TO EXPECT", 64, 330);
        context.fillStyle = "#ec4899";
        context.fillRect(64, 365, 320, 8);

        input.book.tropes.slice(0, 4).forEach((trope, index) => {
          const itemProgress = eased((scene - index * 0.15) / 0.35);
          if (itemProgress <= 0) return;

          const y = 510 + index * 220;
          const x = 64 + (1 - itemProgress) * 180;
          context.globalAlpha = itemProgress;
          context.fillStyle = index % 2 === 0 ? "#ec4899" : "#ffffff";
          context.fillRect(x, y, 88, 88);
          context.fillStyle = index % 2 === 0 ? "#ffffff" : "#050508";
          context.font = "800 35px Arial, sans-serif";
          context.textAlign = "center";
          context.fillText(String(index + 1).padStart(2, "0"), x + 44, y + 58);
          context.textAlign = "left";
          context.fillStyle = "#ffffff";
          context.font = "800 49px Arial, sans-serif";
          const lines = wrappedLines(context, trope.toUpperCase(), 780, 2);
          lines.forEach((line, lineIndex) => {
            context.fillText(line, x + 125, y + 5 + lineIndex * 58);
          });
          context.globalAlpha = 1;
        });
      } else if (progress < 0.78) {
        const scene = eased((progress - 0.52) / 0.26);
        context.fillStyle = "#050508";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = "rgba(236,72,153,0.18)";
        context.beginPath();
        context.moveTo(600, 0);
        context.lineTo(1080, 0);
        context.lineTo(1080, 1920);
        context.lineTo(830, 1920);
        context.closePath();
        context.fill();
        brandFrame();

        const coverHeight = 850;
        const coverWidth =
          coverHeight * (cover.naturalWidth / cover.naturalHeight);
        const coverX = 520 + (1 - scene) * 430;
        const coverY = 430;
        context.save();
        context.shadowColor = "rgba(236,72,153,0.65)";
        context.shadowBlur = 55;
        context.shadowOffsetY = 20;
        context.fillStyle = "#ffffff";
        context.fillRect(
          coverX - 8,
          coverY - 8,
          coverWidth + 16,
          coverHeight + 16,
        );
        context.drawImage(cover, coverX, coverY, coverWidth, coverHeight);
        context.restore();

        context.globalAlpha = scene;
        context.textAlign = "left";
        context.fillStyle = "#ec4899";
        context.font = "800 29px Arial, sans-serif";
        context.fillText("YOUR NEXT OBSESSION", 64, 510);
        context.fillStyle = "#ffffff";
        context.font = "800 66px Arial, sans-serif";
        const titleLines = wrappedLines(context, input.book.title, 470, 4);
        titleLines.forEach((line, index) => {
          context.fillText(line, 64, 590 + index * 78);
        });
        context.fillStyle = "#f9a8d4";
        context.font = "700 32px Arial, sans-serif";
        context.fillText(input.book.heat, 64, 990);
        context.globalAlpha = 1;
      } else {
        const scene = eased((progress - 0.78) / 0.16);
        context.fillStyle = "#ec4899";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#050508";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(1080, 0);
        context.lineTo(1080, 420);
        context.lineTo(0, 720);
        context.closePath();
        context.fill();

        context.globalAlpha = scene;
        const coverHeight = 750;
        const coverWidth =
          coverHeight * (cover.naturalWidth / cover.naturalHeight);
        context.save();
        context.shadowColor = "rgba(0,0,0,0.75)";
        context.shadowBlur = 50;
        context.drawImage(
          cover,
          (canvas.width - coverWidth) / 2,
          300 - (1 - scene) * 100,
          coverWidth,
          coverHeight,
        );
        context.restore();

        context.textAlign = "center";
        context.fillStyle = "#050508";
        context.font = "800 61px Arial, sans-serif";
        context.fillText(input.book.title, canvas.width / 2, 1190);
        context.font = "800 38px Arial, sans-serif";
        context.fillText("MARLOW QUINN", canvas.width / 2, 1270);

        if (input.book.kindleUnlimited) {
          context.fillStyle = "#ffffff";
          context.fillRect(130, 1390, 820, 112);
          context.fillStyle = "#050508";
          context.font = "800 34px Arial, sans-serif";
          context.fillText(
            "AVAILABLE ON KINDLE UNLIMITED",
            canvas.width / 2,
            1460,
          );
        }

        context.fillStyle = "#050508";
        context.font = "700 25px Arial, sans-serif";
        context.fillText("BITE  •  HEAT  •  HEART", canvas.width / 2, 1605);
        context.globalAlpha = 1;
      }

      if (elapsed >= durationMs) {
        resolve();
        return;
      }

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach((track) => track.stop());

  if (blob.size === 0) {
    throw new Error("The browser returned an empty video file.");
  }

  return { blob, mimeType };
}

async function createCoverFirstCampaignVideo(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  campaignType: CampaignType;
  quote: string;
  template: Exclude<PosterTemplate, "auto">;
}): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot create downloadable video files.");
  }

  const mimeType = videoRecorderMimeType();

  if (!mimeType) {
    throw new Error("This browser has no supported video recording format.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the video.");

  const cover = await loadImage(input.book.coverUrl);
  const palette = extractCampaignPalette(cover, input.book.slug);
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const durationMs = 11000;

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () =>
      reject(new Error("The browser video recorder failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  function windowOpacity(
    progress: number,
    start: number,
    fullyVisible: number,
    fadeAt: number,
    end: number,
  ): number {
    if (progress <= start || progress >= end) return 0;
    if (progress < fullyVisible) {
      return eased((progress - start) / (fullyVisible - start));
    }
    if (progress <= fadeAt) return 1;
    return 1 - eased((progress - fadeAt) / (end - fadeAt));
  }

  function drawVideoHeading(
    text: string,
    y: number,
    maximumWidth: number,
    maximumLines: number,
    startingSize: number,
    minimumSize: number,
    accentLastLines = 1,
    opacity = 1,
    lineReveal = 1,
  ) {
    const block = fittedMultiline(
      context,
      text,
      maximumWidth,
      maximumLines,
      startingSize,
      minimumSize,
    );
    context.textAlign = "center";

    block.lines.forEach((line, index) => {
      const reveal = eased((lineReveal - index * 0.1) / 0.35);
      if (reveal <= 0) return;
      context.globalAlpha = opacity * reveal;
      context.fillStyle =
        index >= block.lines.length - accentLastLines
          ? colourCss(palette.primary)
          : "#ffffff";
      context.font = `800 ${block.fontSize}px Impact, "Arial Narrow", Arial, sans-serif`;
      context.fillText(
        line,
        canvas.width / 2,
        y + index * block.lineHeight,
        maximumWidth,
      );
    });
    context.globalAlpha = 1;
  }

  recorder.start(250);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    function drawFrame(now: number) {
      const elapsed = Math.min(durationMs, now - startedAt);
      const progress = elapsed / durationMs;

      context.clearRect(0, 0, canvas.width, canvas.height);
      drawAtmosphericBackground(
        context,
        cover,
        palette,
        canvas.width,
        canvas.height,
        `${input.book.slug}-video`,
        progress,
      );
      drawCampaignBrand(context, palette, canvas.width);

      const hookOpacity = windowOpacity(progress, 0, 0.055, 0.22, 0.3);
      if (hookOpacity > 0) {
        context.globalAlpha = hookOpacity;
        context.textAlign = "center";
        context.fillStyle = colourCss(palette.primary);
        context.font = "800 25px Arial, sans-serif";
        const eyebrow =
          input.template === "cinematic-quote"
            ? "FROM THE PAGES OF"
            : input.campaignType === "kindle-unlimited"
              ? "AVAILABLE ON KINDLE UNLIMITED"
              : "YOUR NEXT M/M ROMANCE";
        context.fillText(eyebrow, canvas.width / 2, 300);
        context.fillStyle = colourCss(palette.primary);
        context.fillRect(370, 330, 340, 8);
        context.globalAlpha = 1;

        const hook =
          input.template === "cinematic-quote" && input.quote.trim()
            ? `“${input.quote.trim().replace(/^[“"]|[”"]$/g, "")}”`
            : input.template === "trope-showcase"
              ? input.book.tropes.slice(0, 2).join(" × ")
              : cleanCampaignHook(input.book, input.post);
        drawVideoHeading(
          hook.toUpperCase(),
          455,
          900,
          input.template === "cinematic-quote" ? 8 : 5,
          input.template === "cinematic-quote" ? 76 : 92,
          input.template === "cinematic-quote" ? 43 : 54,
          input.template === "cinematic-quote" ? 2 : 1,
          hookOpacity,
          eased(progress / 0.2),
        );
      }

      const coverOpacity = windowOpacity(progress, 0.23, 0.31, 0.48, 0.58);
      if (coverOpacity > 0) {
        const scene = eased((progress - 0.23) / 0.23);
        const top = 380 + (1 - scene) * 170;
        const scale = 620 + scene * 55;
        drawKindleMockup(
          context,
          cover,
          palette,
          canvas.width / 2,
          top,
          scale,
          -0.07 + scene * 0.045,
          coverOpacity,
        );
        context.globalAlpha = coverOpacity;
        context.textAlign = "center";
        context.fillStyle = "#ffffff";
        context.font = "700 29px Arial, sans-serif";
        context.fillText(
          input.book.subgenre.toUpperCase(),
          canvas.width / 2,
          1640,
        );
        context.fillStyle = colourCss(palette.primary);
        context.fillRect(390, 1680, 300, 7);
        context.globalAlpha = 1;
      }

      const tropeOpacity = windowOpacity(progress, 0.51, 0.59, 0.73, 0.82);
      if (tropeOpacity > 0) {
        const scene = eased((progress - 0.51) / 0.2);
        context.globalAlpha = tropeOpacity;
        context.textAlign = "left";
        context.fillStyle = "#ffffff";
        context.font = "800 54px Impact, Arial, sans-serif";
        context.fillText("WHAT TO EXPECT", 64, 310);
        context.fillStyle = colourCss(palette.primary);
        context.fillRect(64, 342, 310, 8);
        context.globalAlpha = 1;

        drawKindleMockup(
          context,
          cover,
          palette,
          300 - (1 - scene) * 160,
          430,
          455,
          -0.045,
          tropeOpacity,
        );

        input.book.tropes.slice(0, 4).forEach((trope, index) => {
          const itemProgress = eased((scene - index * 0.12) / 0.42);
          if (itemProgress <= 0) return;
          const x = 585 + (1 - itemProgress) * 150;
          const y = 500 + index * 245;
          context.globalAlpha = tropeOpacity * itemProgress;
          context.fillStyle = "rgba(0,0,0,0.58)";
          roundedRectanglePath(context, x, y, 430, 178, 18);
          context.fill();
          context.strokeStyle = colourCss(palette.primary, 0.8);
          context.lineWidth = 4;
          context.stroke();
          context.fillStyle = colourCss(palette.primary);
          context.font = "800 24px Arial, sans-serif";
          context.fillText(String(index + 1).padStart(2, "0"), x + 28, y + 48);
          context.fillStyle = "#ffffff";
          const block = fittedMultiline(
            context,
            trope.toUpperCase(),
            368,
            2,
            37,
            25,
          );
          block.lines.forEach((line, lineIndex) => {
            context.font = `800 ${block.fontSize}px Impact, "Arial Narrow", Arial, sans-serif`;
            context.fillText(
              line,
              x + 28,
              y + 98 + lineIndex * block.lineHeight,
            );
          });
          context.globalAlpha = 1;
        });
      }

      const finalOpacity = eased((progress - 0.76) / 0.14);
      if (finalOpacity > 0) {
        const rise = (1 - finalOpacity) * 110;
        drawKindleMockup(
          context,
          cover,
          palette,
          canvas.width / 2,
          260 + rise,
          570,
          -0.018 + (1 - finalOpacity) * 0.04,
          finalOpacity,
        );

        context.globalAlpha = finalOpacity;
        context.textAlign = "center";
        context.fillStyle = "#ffffff";
        const title = fittedMultiline(
          context,
          input.book.title.toUpperCase(),
          900,
          2,
          68,
          42,
        );
        title.lines.forEach((line, index) => {
          context.font = `800 ${title.fontSize}px Impact, "Arial Narrow", Arial, sans-serif`;
          context.fillText(
            line,
            canvas.width / 2,
            1350 + index * title.lineHeight,
          );
        });
        context.fillStyle = colourCss(palette.primary);
        context.font = "800 28px Arial, sans-serif";
        context.fillText("M/M ROMANCE BY MARLOW QUINN", canvas.width / 2, 1490);
        context.globalAlpha = finalOpacity;
        drawCallToAction(context, input.book, palette, canvas.width, 1560);
        context.fillStyle = "rgba(255,255,255,0.78)";
        context.font = "700 24px Arial, sans-serif";
        context.fillText("MARLOWQUINN.COM", canvas.width / 2, 1735);
        context.globalAlpha = 1;
      }

      if (elapsed >= durationMs) {
        resolve();
        return;
      }

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach((track) => track.stop());

  if (blob.size === 0) {
    throw new Error("The browser returned an empty video file.");
  }

  return { blob, mimeType };
}

export default function SocialStudioPage() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [campaignType, setCampaignType] =
    useState<CampaignType>("book-spotlight");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "facebook",
    "instagram",
    "tiktok",
  ]);
  const [quote, setQuote] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [copiedPlatform, setCopiedPlatform] = useState<SocialPlatform | null>(
    null,
  );
  const [mediaStyle] = useState<MediaStyle>("branded");
  const [posterTemplate, setPosterTemplate] = useState<PosterTemplate>("auto");
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia[]>([]);
  const [creatingImageFor, setCreatingImageFor] =
    useState<SocialPlatform | null>(null);
  const [imageError, setImageError] = useState("");
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [creatingVideoFor, setCreatingVideoFor] =
    useState<SocialPlatform | null>(null);
  const [videoError, setVideoError] = useState("");
  const [testingMakeFor, setTestingMakeFor] = useState<SocialPlatform | null>(
    null,
  );
  const [makeTestMessage, setMakeTestMessage] = useState("");
  const [makeTestError, setMakeTestError] = useState("");

  function chooseBook(book: CatalogueBook) {
    setSelectedBook(book);
    setCampaignType("book-spotlight");
    setPlatforms(["facebook", "instagram", "tiktok"]);
    setQuote("");
    setInstructions("");
    setGeneratedPosts([]);
    setGenerationError("");
    setPosterTemplate("auto");
    setGeneratedMedia([]);
    setImageError("");
    setGeneratedVideos([]);
    setVideoError("");
    setMakeTestMessage("");
    setMakeTestError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseCampaignType(value: CampaignType) {
    setCampaignType(value);
    setGeneratedPosts([]);
    setGenerationError("");
    setGeneratedMedia([]);
    setImageError("");
    setGeneratedVideos([]);
    setVideoError("");
  }

  function togglePlatform(platform: SocialPlatform) {
    setGeneratedPosts([]);
    setGenerationError("");
    setGeneratedMedia([]);
    setImageError("");
    setGeneratedVideos([]);
    setVideoError("");
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  async function generateContent() {
    if (!selectedBook || platforms.length === 0) return;

    if (campaignType === "quote-post" && !quote.trim()) {
      setGenerationError("Paste a genuine quote for the quote campaign.");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setGeneratedPosts([]);

    try {
      const response = await fetch("/api/social-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book: selectedBook,
          campaignType,
          platforms,
          quote: quote.trim(),
          instructions: instructions.trim(),
        }),
      });
      const result = (await response.json()) as {
        posts?: GeneratedPost[];
        error?: string;
      };

      if (!response.ok || !result.posts) {
        throw new Error(result.error || "The campaign could not be generated.");
      }

      setGeneratedPosts(result.posts);
      setGeneratedMedia([]);
      setImageError("");
      setGeneratedVideos([]);
      setVideoError("");
    } catch (contentError) {
      setGenerationError(
        contentError instanceof Error
          ? contentError.message
          : "The campaign could not be generated.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPost(post: GeneratedPost) {
    const text = [post.title, post.caption, post.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n");

    await navigator.clipboard.writeText(text);
    setCopiedPlatform(post.platform);
    window.setTimeout(() => setCopiedPlatform(null), 1800);
  }

  async function createImage(post: GeneratedPost) {
    if (!selectedBook) return;

    setCreatingImageFor(post.platform);
    setImageError("");

    try {
      const generationSeed = seededNumber(
        `${selectedBook.slug}-${post.platform}-${Date.now()}`,
      );
      const selectedTemplate = resolveStaticPosterTemplate(
        posterTemplate,
        campaignType,
        generationSeed,
        `${post.title} ${post.caption} ${quote}`,
      );

      const image = await createProfessionalCampaignImage({
        book: selectedBook,
        post,
        mediaStyle,
        campaignType,
        quote,
        template: selectedTemplate,
      });

      setGeneratedMedia((current) => [
        ...current.filter((item) => item.platform !== post.platform),
        {
          platform: post.platform,
          style: mediaStyle,
          template: image.template,
          dataUrl: image.dataUrl,
        },
      ]);
      setGeneratedVideos((current) =>
        current.filter((item) => item.platform !== post.platform),
      );
      setVideoError("");
    } catch (mediaError) {
      setImageError(
        mediaError instanceof Error
          ? mediaError.message
          : "The promotional image could not be created.",
      );
    } finally {
      setCreatingImageFor(null);
    }
  }

  async function createVideo(post: GeneratedPost, media: GeneratedMedia) {
    if (!selectedBook) return;

    setCreatingVideoFor(post.platform);
    setVideoError("");

    try {
      const result = await createCoverFirstCampaignVideo({
        book: selectedBook,
        post,
        campaignType,
        quote,
        template: media.template,
      });
      const url = URL.createObjectURL(result.blob);
      const extension = result.mimeType.includes("mp4") ? "mp4" : "webm";

      setGeneratedVideos((current) => {
        const previous = current.find(
          (item) => item.platform === post.platform,
        );
        if (previous) URL.revokeObjectURL(previous.url);

        return [
          ...current.filter((item) => item.platform !== post.platform),
          {
            platform: post.platform,
            url,
            mimeType: result.mimeType,
            extension,
          },
        ];
      });
    } catch (creationError) {
      setVideoError(
        creationError instanceof Error
          ? creationError.message
          : "The promotional video could not be created.",
      );
    } finally {
      setCreatingVideoFor(null);
    }
  }

  async function publishImageToMake(
    post: GeneratedPost,
    media: GeneratedMedia,
  ) {
    if (!selectedBook) return;

    setTestingMakeFor(post.platform);
    setMakeTestMessage("");
    setMakeTestError("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (sessionError || !user) {
        throw new Error("Your NovelForge session has expired. Sign in again.");
      }

      const mediaResponse = await fetch(media.dataUrl);

      if (!mediaResponse.ok) {
        throw new Error("The finished campaign image could not be prepared.");
      }

      const imageBlob = await mediaResponse.blob();
      const folder = user.id;
      const filePrefix = `${post.platform}-image-`;
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("social-media")
        .list(folder, { limit: 100, search: filePrefix });

      if (listError) throw new Error(listError.message);

      const oldPaths = (existingFiles ?? [])
        .filter((file) => file.name.startsWith(filePrefix))
        .map((file) => `${folder}/${file.name}`);

      if (oldPaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from("social-media")
          .remove(oldPaths);

        if (removeError) throw new Error(removeError.message);
      }

      const extension = imageBlob.type.includes("png") ? "png" : "jpg";
      const objectPath = `${folder}/${filePrefix}${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("social-media")
        .upload(objectPath, imageBlob, {
          cacheControl: "3600",
          contentType: imageBlob.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("social-media")
        .getPublicUrl(objectPath);

      const response = await fetch("/api/social-studio/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: post.platform,
          bookTitle: selectedBook.title,
          bookSlug: selectedBook.slug,
          campaignTitle: post.title,
          caption: post.caption,
          hashtags: post.hashtags,
          mediaUrl: publicUrlData.publicUrl,
          mediaType: "image",
          amazonUrl: selectedBook.amazonUrl,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Make rejected the campaign.");
      }

      setMakeTestMessage(`${post.platform} image sent to Make for publishing.`);
    } catch (publishError) {
      setMakeTestError(
        `${post.platform}: ${
          publishError instanceof Error
            ? publishError.message
            : "The image could not be sent to Make."
        }`,
      );
    } finally {
      setTestingMakeFor(null);
    }
  }

  async function publishVideoToMake(
    post: GeneratedPost,
    video: GeneratedVideo,
  ) {
    if (!selectedBook) return;

    setTestingMakeFor(post.platform);
    setMakeTestMessage("");
    setMakeTestError("");

    try {
      if (video.extension !== "mp4") {
        throw new Error(
          "This browser rendered a WebM video. Create it in the current version of Chrome or Edge so NovelForge produces the MP4 required by Facebook and Instagram.",
        );
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (sessionError || !user) {
        throw new Error("Your NovelForge session has expired. Sign in again.");
      }

      const mediaResponse = await fetch(video.url);

      if (!mediaResponse.ok) {
        throw new Error("The finished campaign video could not be prepared.");
      }

      const videoBlob = await mediaResponse.blob();
      const folder = user.id;
      const filePrefix = `${post.platform}-video-`;
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("social-media")
        .list(folder, { limit: 100, search: filePrefix });

      if (listError) throw new Error(listError.message);

      const oldPaths = (existingFiles ?? [])
        .filter((file) => file.name.startsWith(filePrefix))
        .map((file) => `${folder}/${file.name}`);

      if (oldPaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from("social-media")
          .remove(oldPaths);

        if (removeError) throw new Error(removeError.message);
      }

      const objectPath = `${folder}/${filePrefix}${Date.now()}.${video.extension}`;
      const { error: uploadError } = await supabase.storage
        .from("social-media")
        .upload(objectPath, videoBlob, {
          cacheControl: "3600",
          contentType: video.mimeType || videoBlob.type || "video/mp4",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("social-media")
        .getPublicUrl(objectPath);

      const response = await fetch("/api/social-studio/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: post.platform,
          bookTitle: selectedBook.title,
          bookSlug: selectedBook.slug,
          campaignTitle: post.title,
          caption: post.caption,
          hashtags: post.hashtags,
          mediaUrl: publicUrlData.publicUrl,
          mediaType: "video",
          amazonUrl: selectedBook.amazonUrl,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Make rejected the campaign video.");
      }

      setMakeTestMessage(`${post.platform} video sent to Make for publishing.`);
    } catch (publishError) {
      setMakeTestError(
        `${post.platform}: ${
          publishError instanceof Error
            ? publishError.message
            : "The video could not be sent to Make."
        }`,
      );
    } finally {
      setTestingMakeFor(null);
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
        const response = await fetch(CATALOGUE_URL, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`The website catalogue returned ${response.status}.`);
        }

        const result = (await response.json()) as CatalogueResponse;

        if (!Array.isArray(result.books)) {
          throw new Error("The website catalogue returned invalid book data.");
        }

        if (active) {
          setCatalogue(result);
        }
      } catch (catalogueError) {
        if (active) {
          setError(
            catalogueError instanceof Error
              ? catalogueError.message
              : "The website catalogue could not be loaded.",
          );
        }
      }
    }

    void loadCatalogue();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <a
            href="/story-chat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl transition hover:bg-white/10"
            aria-label="Back to NovelForge"
          >
            ←
          </a>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">
              NovelForge
            </p>
            <h1 className="truncate text-2xl font-semibold">Social Studio</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8 rounded-2xl border border-white/10 bg-neutral-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
            Website catalogue
          </p>
          <h2 className="mt-2 text-2xl font-bold">Choose a book to promote</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            This catalogue is read directly from marlowquinn.com. Book changes
            made on the website will appear here automatically.
          </p>
        </div>

        {selectedBook && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-pink-500/30 bg-neutral-900 shadow-2xl">
            <div className="flex flex-col gap-5 border-b border-white/10 p-5 sm:flex-row">
              <img
                src={selectedBook.coverUrl}
                alt={`${selectedBook.title} book cover`}
                className="h-44 w-28 shrink-0 self-center rounded-lg object-cover shadow-xl sm:self-start"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
                      Campaign setup
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">
                      {selectedBook.title}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedBook.subgenre}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedBook(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl text-neutral-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close campaign setup"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedBook.tropes.map((trope) => (
                    <span
                      key={trope}
                      className="rounded-full bg-pink-500/10 px-3 py-1 text-xs text-pink-200"
                    >
                      {trope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              <h3 className="font-semibold">What are we promoting?</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {CAMPAIGN_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseCampaignType(option.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      campaignType === option.id
                        ? "border-pink-500 bg-pink-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="block font-semibold text-white">
                      {option.title}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-neutral-400">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              <h3 className="mt-6 font-semibold">Poster design</h3>
              <p className="mt-2 text-sm leading-5 text-neutral-400">
                Every design uses the real cover, book-matched colours and
                cinematic effects. No generated people.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {POSTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setPosterTemplate(option.id);
                      setGeneratedMedia([]);
                      setImageError("");
                      setGeneratedVideos([]);
                      setVideoError("");
                    }}
                    className={`rounded-xl border p-4 text-left transition ${
                      posterTemplate === option.id
                        ? "border-pink-500 bg-pink-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="block font-semibold">{option.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-neutral-400">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              <h3 className="mt-6 font-semibold">Platforms</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {PLATFORM_OPTIONS.map((platform) => {
                  const selected = platforms.includes(platform.id);

                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
                          ? "border-pink-500 bg-pink-500 text-white"
                          : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
                      }`}
                    >
                      {selected ? "✓ " : ""}
                      {platform.label}
                    </button>
                  );
                })}
              </div>

              {campaignType === "quote-post" && (
                <div className="mt-6">
                  <label
                    htmlFor="campaign-quote"
                    className="block font-semibold"
                  >
                    Genuine book quote
                  </label>
                  <textarea
                    id="campaign-quote"
                    value={quote}
                    onChange={(event) => {
                      setQuote(event.target.value);
                      setGeneratedPosts([]);
                      setGenerationError("");
                    }}
                    rows={4}
                    placeholder="Paste the exact quote from the book..."
                    className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
                  />
                </div>
              )}

              <div className="mt-6">
                <label
                  htmlFor="campaign-instructions"
                  className="block font-semibold"
                >
                  Anything specific?{" "}
                  <span className="text-neutral-500">Optional</span>
                </label>
                <textarea
                  id="campaign-instructions"
                  value={instructions}
                  onChange={(event) => {
                    setInstructions(event.target.value);
                    setGeneratedPosts([]);
                    setGenerationError("");
                  }}
                  rows={3}
                  placeholder="For example: focus on the jealousy and forced proximity..."
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
                />
              </div>

              {generationError && (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {generationError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void generateContent()}
                disabled={isGenerating || platforms.length === 0}
                className="mt-6 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:bg-pink-500/30 disabled:text-pink-100/60"
              >
                {isGenerating
                  ? "Creating platform content..."
                  : platforms.length === 0
                    ? "Choose at least one platform"
                    : "Generate Content"}
              </button>

              {generatedPosts.length > 0 && (
                <div className="mt-8 space-y-5 border-t border-white/10 pt-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
                      Generated campaign
                    </p>
                    <h3 className="mt-2 text-xl font-bold">
                      Platform-specific content
                    </h3>
                  </div>

                  {generatedPosts.map((post) => {
                    const media = generatedMedia.find(
                      (item) => item.platform === post.platform,
                    );
                    const video = generatedVideos.find(
                      (item) => item.platform === post.platform,
                    );

                    return (
                      <article
                        key={post.platform}
                        className="rounded-2xl border border-white/10 bg-neutral-950 p-5"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-lg font-bold capitalize">
                            {post.platform}
                          </h4>
                          <button
                            type="button"
                            onClick={() => void copyPost(post)}
                            className="rounded-lg border border-pink-500/40 bg-pink-500/10 px-3 py-2 text-sm font-semibold text-pink-200 transition hover:bg-pink-500/20"
                          >
                            {copiedPlatform === post.platform
                              ? "Copied"
                              : "Copy post"}
                          </button>
                        </div>

                        {post.title && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                              Title or hook
                            </p>
                            <p className="mt-1 font-semibold text-white">
                              {post.title}
                            </p>
                          </div>
                        )}

                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Caption
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">
                            {post.caption}
                          </p>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-pink-300">
                          {post.hashtags.join(" ")}
                        </p>

                        <button
                          type="button"
                          onClick={() => void createImage(post)}
                          disabled={creatingImageFor !== null}
                          className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-neutral-500"
                        >
                          {creatingImageFor === post.platform
                            ? "Designing professional campaign poster..."
                            : media
                              ? "Create Another Poster"
                              : "Create Professional Poster"}
                        </button>

                        {media && (
                          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
                            <img
                              src={media.dataUrl}
                              alt={`${post.platform} campaign for ${selectedBook?.title ?? "book"}`}
                              className="mx-auto max-h-[720px] w-auto rounded-xl object-contain"
                            />
                            <a
                              href={media.dataUrl}
                              download={`${selectedBook?.slug ?? "book"}-${post.platform}-${media.style}.jpg`}
                              className="mt-3 flex w-full items-center justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400"
                            >
                              Download Finished Image
                            </a>

                            <button
                              type="button"
                              onClick={() =>
                                void publishImageToMake(post, media)
                              }
                              disabled={
                                testingMakeFor !== null ||
                                post.platform === "tiktok"
                              }
                              className="mt-3 w-full rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-600"
                            >
                              {testingMakeFor === post.platform
                                ? "Uploading and sending to Make..."
                                : post.platform === "tiktok"
                                  ? "TikTok Publishing Comes Next"
                                  : `Publish Image to ${
                                      post.platform === "facebook"
                                        ? "Facebook"
                                        : "Instagram"
                                    }`}
                            </button>

                            {makeTestMessage.startsWith(post.platform) && (
                              <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                {makeTestMessage}
                              </p>
                            )}

                            {makeTestError.startsWith(post.platform) && (
                              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                {makeTestError}
                              </p>
                            )}

                            <button
                              type="button"
                              onClick={() => void createVideo(post, media)}
                              disabled={creatingVideoFor !== null}
                              className="mt-3 w-full rounded-xl border border-pink-500/40 bg-pink-500/10 px-4 py-3 font-semibold text-pink-200 transition hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-600"
                            >
                              {creatingVideoFor === post.platform
                                ? "Rendering 11-second video..."
                                : video
                                  ? "Create Another Video"
                                  : "Create Vertical Video"}
                            </button>

                            {video && (
                              <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950 p-3">
                                <video
                                  src={video.url}
                                  controls
                                  playsInline
                                  className="mx-auto max-h-[720px] w-auto rounded-lg"
                                />
                                <a
                                  href={video.url}
                                  download={`${selectedBook?.slug ?? "book"}-${post.platform}-video.${video.extension}`}
                                  className="mt-3 flex w-full items-center justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400"
                                >
                                  Download Finished Video
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void publishVideoToMake(post, video)
                                  }
                                  disabled={
                                    testingMakeFor !== null ||
                                    post.platform === "tiktok"
                                  }
                                  className="mt-3 w-full rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-600"
                                >
                                  {testingMakeFor === post.platform
                                    ? "Uploading and sending video to Make..."
                                    : post.platform === "tiktok"
                                      ? "TikTok Publishing Comes Next"
                                      : post.platform === "facebook"
                                        ? "Publish Video to Facebook"
                                        : "Publish Reel to Instagram"}
                                </button>
                                <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
                                  Add platform music or trending audio when you
                                  upload it.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {imageError && (
                <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {imageError}
                </p>
              )}

              {videoError && (
                <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {videoError}
                </p>
              )}
            </div>
          </section>
        )}

        {!catalogue && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-neutral-400">
            Loading your books...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <p className="font-semibold text-red-200">Catalogue unavailable</p>
            <p className="mt-2 text-sm text-red-100/80">{error}</p>
          </div>
        )}

        {catalogue && (
          <>
            <p className="mb-4 text-sm text-neutral-500">
              {catalogue.count} {catalogue.count === 1 ? "book" : "books"} found
            </p>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue.books.map((book) => (
                <article
                  key={book.slug}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl"
                >
                  <div className="aspect-[16/11] bg-neutral-800 p-4">
                    <img
                      src={book.coverUrl}
                      alt={`${book.title} book cover`}
                      className="h-full w-full object-contain drop-shadow-2xl"
                      loading="lazy"
                    />
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-pink-400">
                      {book.subgenre}
                    </p>
                    <h2 className="mt-2 text-xl font-bold">{book.title}</h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {book.tropes.map((trope) => (
                        <span
                          key={trope}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300"
                        >
                          {trope}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
                      <span className="text-amber-300" aria-label="Heat level">
                        {book.heat}
                      </span>
                      {book.kindleUnlimited && (
                        <span className="font-semibold text-neutral-300">
                          Kindle Unlimited
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => chooseBook(book)}
                      className="mt-5 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400"
                    >
                      Create Campaign
                    </button>
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
