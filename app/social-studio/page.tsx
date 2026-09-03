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
  "auto" | "cinematic-quote" | "trope-showcase" | "kindle-hero";

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

  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 180) continue;

    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const brightness = (maximum + minimum) / 2;
    const saturation = maximum === minimum ? 0 : (maximum - minimum) / 255;

    if (brightness < 34 || brightness > 232 || saturation < 0.16) continue;

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

  const primary = vividCampaignColour(sampledPrimary, fallback.primary);
  const secondary = vividCampaignColour(sampledSecondary, fallback.secondary);

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
) {
  context.fillStyle = "#030305";
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.4;
  context.filter = "blur(54px) saturate(1.9) contrast(1.18)";
  const driftX = Math.sin(movement * Math.PI * 2) * 34;
  drawImageCover(
    context,
    cover,
    -170 + driftX,
    -150,
    width + 340,
    height + 300,
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
  context.font = `800 ${compact ? 23 : 28}px Arial, sans-serif`;
  context.fillText("MARLOW QUINN", left, top + 48);
  context.fillStyle = colourCss(palette.primary, 0.92);
  context.font = `700 ${compact ? 14 : 17}px Arial, sans-serif`;
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
  context.font = `500 ${Math.max(20, deviceWidth * 0.052)}px Arial, sans-serif`;
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

  while (fontSize >= minimumSize) {
    context.font = `${weight} ${fontSize}px "Arial Black", Arial, sans-serif`;
    lines = wrapEveryLine(context, text, maximumWidth);
    if (lines.length <= maximumLines) break;
    fontSize -= 2;
  }

  if (lines.length > maximumLines) {
    lines = lines.slice(0, maximumLines);
    lines[maximumLines - 1] =
      `${lines[maximumLines - 1].replace(/[.,!?;:]$/, "")}…`;
  }

  return { lines, fontSize, lineHeight: Math.round(fontSize * 1.08) };
}

function resolvePosterTemplate(
  selected: PosterTemplate,
  campaignType: CampaignType,
): Exclude<PosterTemplate, "auto"> {
  if (selected !== "auto") return selected;
  if (campaignType === "quote-post") return "cinematic-quote";
  if (campaignType === "trope-hook") return "trope-showcase";
  return "kindle-hero";
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
  context.font = `700 ${compact ? 19 : 23}px Arial, sans-serif`;
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

async function createProfessionalCampaignImage(input: {
  book: CatalogueBook;
  post: GeneratedPost;
  mediaStyle: MediaStyle;
  campaignType: CampaignType;
  quote: string;
  template: PosterTemplate;
}): Promise<{ dataUrl: string; template: Exclude<PosterTemplate, "auto"> }> {
  const isTikTok = input.post.platform === "tiktok";
  const width = 1080;
  const height = isTikTok ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser could not create the image.");

  const cover = await loadImage(input.book.coverUrl);
  const palette = extractCampaignPalette(cover, input.book.slug);
  const template = resolvePosterTemplate(input.template, input.campaignType);
  const hook = cleanCampaignHook(input.book, input.post);

  drawAtmosphericBackground(
    context,
    cover,
    palette,
    width,
    height,
    `${input.book.slug}-${template}`,
  );
  drawCampaignBrand(context, palette, width, !isTikTok);

  if (template === "cinematic-quote") {
    const quote =
      input.quote.trim() || input.post.caption.split(/\n+/)[0] || hook;
    const textWidth = isTikTok ? 930 : 950;
    const quoteBlock = fittedMultiline(
      context,
      `“${quote.replace(/^[“"]|[”"]$/g, "")}”`,
      textWidth,
      isTikTok ? 6 : 5,
      isTikTok ? 106 : 82,
      isTikTok ? 66 : 52,
    );
    const quoteX = isTikTok ? 74 : 64;
    const quoteY = isTikTok ? 285 : 260;
    context.textAlign = "left";
    quoteBlock.lines.forEach((line, index) => {
      context.fillStyle =
        index >= quoteBlock.lines.length - 2
          ? colourCss(palette.primary)
          : "#ffffff";
      context.font = `900 ${quoteBlock.fontSize}px "Arial Black", Arial, sans-serif`;
      context.shadowColor = "rgba(0,0,0,0.76)";
      context.shadowBlur = 16;
      context.fillText(
        line,
        quoteX,
        quoteY + index * quoteBlock.lineHeight,
        textWidth,
      );
    });

    context.fillStyle = colourCss(palette.primary);
    context.fillRect(
      quoteX,
      quoteY + quoteBlock.lines.length * quoteBlock.lineHeight + 24,
      Math.min(textWidth * 0.62, 540),
      11,
    );
    context.shadowColor = "transparent";

    if (isTikTok) {
      drawKindleMockup(context, cover, palette, 650, 870, 515, -0.035);
      context.textAlign = "left";
      input.book.tropes.slice(0, 3).forEach((trope, index) => {
        const y = 1110 + index * 150;
        context.strokeStyle = colourCss(palette.primary, 0.92);
        context.lineWidth = 4;
        context.beginPath();
        context.arc(88, y - 10, 24, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = "#ffffff";
        context.font = "800 21px Arial, sans-serif";
        context.fillText(String(index + 1).padStart(2, "0"), 73, y - 2);
        drawFittedText(context, trope.toUpperCase(), 130, y, 350, 900, 33, 23);
        context.strokeStyle = colourCss(palette.primary, 0.36);
        context.beginPath();
        context.moveTo(64, y + 35);
        context.lineTo(420, y + 35);
        context.stroke();
      });
      drawCallToAction(context, input.book, palette, width, 1730);
    } else {
      drawKindleMockup(context, cover, palette, 790, 635, 360, -0.035);
      context.textAlign = "left";
      input.book.tropes.slice(0, 3).forEach((trope, index) => {
        const y = 815 + index * 105;
        context.fillStyle =
          index === 1 ? colourCss(palette.primary) : "#ffffff";
        drawFittedText(context, trope.toUpperCase(), 64, y, 430, 900, 34, 24);
        context.fillStyle = colourCss(palette.primary, 0.8);
        context.fillRect(64, y + 19, 330, 3);
      });
      drawCallToAction(context, input.book, palette, width, 1198, true);
    }
  } else if (template === "trope-showcase") {
    const accent = { red: 236, green: 72, blue: 153 };

    context.save();
    const colourWash = context.createLinearGradient(0, 0, width, height);
    colourWash.addColorStop(0, colourCss(palette.secondary, 0.22));
    colourWash.addColorStop(0.48, "rgba(0,0,0,0)");
    colourWash.addColorStop(1, colourCss(accent, 0.22));
    context.fillStyle = colourWash;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.9;
    context.fillStyle = colourCss(accent, 0.72);
    context.beginPath();
    context.moveTo(width * 0.72, 0);
    context.lineTo(width, 0);
    context.lineTo(width, height * 0.34);
    context.lineTo(width * 0.9, height * 0.26);
    context.closePath();
    context.fill();
    context.restore();

    context.textAlign = "left";
    context.fillStyle = "#ffffff";
    const headline = fittedMultiline(
      context,
      input.campaignType === "backlist-revival"
        ? "YOUR NEXT BACKLIST OBSESSION"
        : hook.toUpperCase(),
      isTikTok ? width - 130 : 690,
      isTikTok ? 3 : 2,
      isTikTok ? 112 : 86,
      isTikTok ? 68 : 54,
    );
    headline.lines.forEach((line, index) => {
      context.font = `900 ${headline.fontSize}px "Arial Black", Arial, sans-serif`;
      context.fillText(
        line,
        62,
        (isTikTok ? 265 : 238) + index * headline.lineHeight,
      );
    });
    context.fillStyle = colourCss(accent);
    context.fillRect(62, isTikTok ? 555 : 398, isTikTok ? 430 : 330, 12);

    const deviceCentreX = isTikTok ? 715 : 770;
    const deviceTop = isTikTok ? 585 : 335;
    const deviceWidth = isTikTok ? 625 : 565;
    drawKindleMockup(
      context,
      cover,
      { primary: accent, secondary: palette.secondary },
      deviceCentreX,
      deviceTop,
      deviceWidth,
      0.025,
    );

    const tropes = input.book.tropes.slice(0, 4);
    const startY = isTikTok ? 760 : 540;
    const step = isTikTok ? 190 : 166;
    const textWidth = isTikTok ? 330 : 390;
    tropes.forEach((trope, index) => {
      const y = startY + index * step;
      context.strokeStyle = colourCss(accent, 0.78);
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(62, y + (isTikTok ? 104 : 92));
      context.lineTo(62 + textWidth, y + (isTikTok ? 104 : 92));
      context.stroke();
      context.fillStyle = colourCss(accent);
      context.beginPath();
      context.arc(78, y + 28, isTikTok ? 20 : 17, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#07070a";
      context.textAlign = "center";
      context.font = `900 ${isTikTok ? 21 : 18}px Arial, sans-serif`;
      context.fillText(String(index + 1), 78, y + (isTikTok ? 35 : 34));
      context.textAlign = "left";
      context.fillStyle = "#ffffff";
      const tropeBlock = fittedMultiline(
        context,
        trope.toUpperCase(),
        textWidth - 58,
        2,
        isTikTok ? 45 : 38,
        isTikTok ? 31 : 27,
      );
      tropeBlock.lines.forEach((line, lineIndex) => {
        context.font = `900 ${tropeBlock.fontSize}px "Arial Black", Arial, sans-serif`;
        context.fillText(
          line,
          112,
          y + (isTikTok ? 39 : 38) + lineIndex * tropeBlock.lineHeight,
        );
      });
    });

    if (isTikTok) {
      drawCallToAction(
        context,
        input.book,
        { primary: accent, secondary: palette.secondary },
        width,
        1710,
      );
    } else {
      drawCallToAction(
        context,
        input.book,
        { primary: accent, secondary: palette.secondary },
        width,
        1195,
        true,
      );
    }
  } else {
    context.save();
    const heroWash = context.createLinearGradient(0, 0, width, 0);
    heroWash.addColorStop(0, colourCss(palette.primary, 0.34));
    heroWash.addColorStop(0.48, "rgba(0,0,0,0)");
    heroWash.addColorStop(1, colourCss(palette.secondary, 0.34));
    context.fillStyle = heroWash;
    context.fillRect(0, 0, width, height);
    context.restore();
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = `700 ${isTikTok ? 33 : 25}px Arial, sans-serif`;
    context.fillText(
      input.campaignType === "kindle-unlimited"
        ? "AVAILABLE ON"
        : "FOR READERS WHO WANT",
      width / 2,
      isTikTok ? 270 : 235,
    );
    const heroHeading =
      input.campaignType === "kindle-unlimited"
        ? "KINDLE UNLIMITED"
        : hook.toUpperCase();
    const hero = fittedMultiline(
      context,
      heroHeading,
      width - 140,
      2,
      isTikTok ? 108 : 82,
      isTikTok ? 68 : 54,
    );
    hero.lines.forEach((line, index) => {
      context.fillStyle =
        index === hero.lines.length - 1
          ? colourCss(palette.primary)
          : "#ffffff";
      context.font = `900 ${hero.fontSize}px "Arial Black", Arial, sans-serif`;
      context.fillText(
        line,
        width / 2,
        (isTikTok ? 370 : 325) + index * hero.lineHeight,
      );
    });
    context.fillStyle = colourCss(palette.primary);
    context.fillRect(width / 2 - 210, isTikTok ? 480 : 420, 420, 9);

    drawKindleMockup(
      context,
      cover,
      palette,
      width / 2,
      isTikTok ? 520 : 410,
      isTikTok ? 560 : 465,
      -0.028,
    );

    if (isTikTok) {
      const chipY = 1505;
      const chipGap = 300;
      const chipStart = width / 2 - chipGap;
      context.textAlign = "center";
      input.book.tropes.slice(0, 3).forEach((trope, index) => {
        const x = chipStart + index * chipGap;
        context.strokeStyle = colourCss(palette.primary, 0.85);
        context.lineWidth = 4;
        context.beginPath();
        context.arc(x, chipY, 35, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = colourCss(palette.primary);
        context.font = "800 28px Arial, sans-serif";
        context.fillText("✓", x, chipY + 10);
        context.fillStyle = "#ffffff";
        const block = fittedMultiline(
          context,
          trope.toUpperCase(),
          250,
          2,
          25,
          18,
        );
        block.lines.forEach((line, lineIndex) => {
          context.font = `800 ${block.fontSize}px Arial, sans-serif`;
          context.fillText(line, x, chipY + 75 + lineIndex * block.lineHeight);
        });
      });
    }
    drawCallToAction(
      context,
      input.book,
      palette,
      width,
      isTikTok ? 1740 : 1210,
      !isTikTok,
    );
  }

  context.textAlign = "center";
  context.fillStyle = "rgba(255,255,255,0.74)";
  context.font = `700 ${isTikTok ? 22 : 17}px Arial, sans-serif`;
  context.fillText("MARLOWQUINN.COM", width / 2, height - (isTikTok ? 42 : 24));

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
  const [mediaStyle] = useState<MediaStyle>("ai-scene");
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
      const image = await createProfessionalCampaignImage({
        book: selectedBook,
        post,
        mediaStyle,
        campaignType,
        quote,
        template: posterTemplate,
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
