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

type GeneratedMedia = {
  platform: SocialPlatform;
  style: MediaStyle;
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
    description: "A strong general promotion using the cover, blurb and main hooks.",
  },
  {
    id: "trope-hook",
    title: "Trope Hook",
    description: "Lead with the tropes readers search for and build the post around them.",
  },
  {
    id: "quote-post",
    title: "Quote Post",
    description: "Create a visual and caption around a genuine quote you provide.",
  },
  {
    id: "kindle-unlimited",
    title: "Kindle Unlimited",
    description: "Promote the book as available to Kindle Unlimited readers.",
  },
  {
    id: "backlist-revival",
    title: "Backlist Revival",
    description: "Give an older title a fresh angle without pretending it is a new release.",
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

const CATALOGUE_URL = "https://www.marlowquinn.com/api/books";

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A campaign image asset could not be loaded."));
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
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,!?;:]$/, "")}…`;
  }

  return lines;
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
    context.filter = "blur(34px) brightness(0.42) saturate(1.35)";
    drawImageCover(context, background, -80, -80, width + 160, height + 160);
  } else {
    drawImageCover(context, background, 0, 0, width, height);
  }
  context.restore();

  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(5,5,8,0.76)");
  shade.addColorStop(0.42, "rgba(5,5,8,0.2)");
  shade.addColorStop(1, "rgba(5,5,8,0.9)");
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
    context.fillText(line, 72, 210 + index * hookLineHeight);
  });

  const coverWidth = isTikTok ? 470 : 390;
  const coverHeight = Math.round(coverWidth * (cover.naturalHeight / cover.naturalWidth));
  const maximumCoverHeight = isTikTok ? 800 : 610;
  const fittedCoverHeight = Math.min(coverHeight, maximumCoverHeight);
  const fittedCoverWidth = Math.round(
    fittedCoverHeight * (cover.naturalWidth / cover.naturalHeight),
  );
  const coverX = Math.round((width - fittedCoverWidth) / 2);
  const coverY = isTikTok ? 600 : 455;

  context.save();
  context.shadowColor = "rgba(236,72,153,0.55)";
  context.shadowBlur = 48;
  context.shadowOffsetY = 20;
  context.fillStyle = "#ffffff";
  context.fillRect(coverX - 8, coverY - 8, fittedCoverWidth + 16, fittedCoverHeight + 16);
  context.drawImage(cover, coverX, coverY, fittedCoverWidth, fittedCoverHeight);
  context.restore();

  const footerY = height - (isTikTok ? 270 : 230);
  const displayedTropes = input.book.tropes.slice(0, 3).join("   •   ");
  context.textAlign = "center";
  context.fillStyle = "#f9a8d4";
  context.font = `700 ${isTikTok ? 31 : 27}px Arial, sans-serif`;
  const tropeLines = wrappedLines(context, displayedTropes, width - 120, 2);

  tropeLines.forEach((line, index) => {
    context.fillText(line, width / 2, footerY + index * 42);
  });

  if (input.book.kindleUnlimited) {
    context.fillStyle = "#ffffff";
    context.font = `700 ${isTikTok ? 30 : 26}px Arial, sans-serif`;
    context.fillText(
      "AVAILABLE ON KINDLE UNLIMITED",
      width / 2,
      height - (isTikTok ? 120 : 92),
    );
  }

  return canvas.toDataURL("image/jpeg", 0.92);
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
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
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
    recorder.onerror = () => reject(new Error("The browser video recorder failed."));
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
        const coverWidth = coverHeight * (cover.naturalWidth / cover.naturalHeight);
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
    recorder.onerror = () => reject(new Error("The browser video recorder failed."));
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

        const hook = input.post.title || input.book.tropes.slice(0, 2).join(" • ");
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
        const coverWidth = coverHeight * (cover.naturalWidth / cover.naturalHeight);
        const coverX = 520 + (1 - scene) * 430;
        const coverY = 430;
        context.save();
        context.shadowColor = "rgba(236,72,153,0.65)";
        context.shadowBlur = 55;
        context.shadowOffsetY = 20;
        context.fillStyle = "#ffffff";
        context.fillRect(coverX - 8, coverY - 8, coverWidth + 16, coverHeight + 16);
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
        const coverWidth = coverHeight * (cover.naturalWidth / cover.naturalHeight);
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

export default function SocialStudioPage() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [campaignType, setCampaignType] = useState<CampaignType>(
    "book-spotlight",
  );
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
  const [mediaStyle, setMediaStyle] = useState<MediaStyle>("branded");
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia[]>([]);
  const [creatingImageFor, setCreatingImageFor] =
    useState<SocialPlatform | null>(null);
  const [imageError, setImageError] = useState("");
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [creatingVideoFor, setCreatingVideoFor] =
    useState<SocialPlatform | null>(null);
  const [videoError, setVideoError] = useState("");

  function chooseBook(book: CatalogueBook) {
    setSelectedBook(book);
    setCampaignType("book-spotlight");
    setPlatforms(["facebook", "instagram", "tiktok"]);
    setQuote("");
    setInstructions("");
    setGeneratedPosts([]);
    setGenerationError("");
    setMediaStyle("branded");
    setGeneratedMedia([]);
    setImageError("");
    setGeneratedVideos([]);
    setVideoError("");
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
    const text = [
      post.title,
      post.caption,
      post.hashtags.join(" "),
    ]
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
      let aiBackground: string | undefined;

      if (mediaStyle === "ai-scene") {
        const response = await fetch("/api/social-studio/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book: selectedBook,
            platform: post.platform,
            campaignType,
            visualDirection: post.visualDirection,
            instructions: instructions.trim(),
          }),
        });
        const result = (await response.json()) as {
          imageDataUrl?: string;
          error?: string;
        };

        if (!response.ok || !result.imageDataUrl) {
          throw new Error(result.error || "The AI scene could not be created.");
        }

        aiBackground = result.imageDataUrl;
      }

      const dataUrl = await createFinishedCampaignImage({
        book: selectedBook,
        post,
        mediaStyle,
        aiBackground,
      });

      setGeneratedMedia((current) => [
        ...current.filter((item) => item.platform !== post.platform),
        { platform: post.platform, style: mediaStyle, dataUrl },
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
      const result = await createBrandedCampaignVideo({
        book: selectedBook,
        post,
        posterDataUrl: media.dataUrl,
      });
      const url = URL.createObjectURL(result.blob);
      const extension = result.mimeType.includes("mp4") ? "mp4" : "webm";

      setGeneratedVideos((current) => {
        const previous = current.find((item) => item.platform === post.platform);
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
            This catalogue is read directly from marlowquinn.com. Book changes made
            on the website will appear here automatically.
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
                    <h2 className="mt-2 text-2xl font-bold">{selectedBook.title}</h2>
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

              <h3 className="mt-6 font-semibold">Image style</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setMediaStyle("branded");
                    setGeneratedMedia([]);
                    setImageError("");
                    setGeneratedVideos([]);
                    setVideoError("");
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    mediaStyle === "branded"
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="block font-semibold">Branded Cover Graphic</span>
                  <span className="mt-1 block text-sm leading-5 text-neutral-400">
                    Uses the exact cover with designed typography and campaign hooks.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMediaStyle("ai-scene");
                    setGeneratedMedia([]);
                    setImageError("");
                    setGeneratedVideos([]);
                    setVideoError("");
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    mediaStyle === "ai-scene"
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="block font-semibold">AI Story Scene</span>
                  <span className="mt-1 block text-sm leading-5 text-neutral-400">
                    Generates new campaign artwork, then adds the real cover and text.
                  </span>
                </button>
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
                  Anything specific? <span className="text-neutral-500">Optional</span>
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
                          {copiedPlatform === post.platform ? "Copied" : "Copy post"}
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
                          ? mediaStyle === "ai-scene"
                            ? "Creating AI scene and finished image..."
                            : "Creating finished image..."
                          : media
                            ? "Create Another Image"
                            : mediaStyle === "ai-scene"
                              ? "Create AI Scene Image"
                              : "Create Branded Image"}
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
                              <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
                                Add platform music or trending audio when you upload it.
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
