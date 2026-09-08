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

type MotionRegionKind = "hook" | "hero" | "trope" | "cta" | "website" | "detail";
type MotionMovement = "slow-push" | "dramatic-push" | "lateral-pan" | "diagonal-drift" | "gentle-pulse";
type MotionEffect =
  | "light-sweep"
  | "mist"
  | "particles"
  | "embers"
  | "ice-shards"
  | "petals"
  | "paint-streaks"
  | "water-ripples"
  | "lens-flare"
  | "glitch";

type MotionRegion = {
  kind: MotionRegionKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type MotionMap = {
  available: boolean;
  summary: string;
  accentColor: string;
  movement: MotionMovement;
  effects: MotionEffect[];
  regions: MotionRegion[];
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
  motionMap?: MotionMap;
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

function seededParticles(width: number, height: number, seedSource: string) {
  let seed = [...seedSource].reduce((total, character) => total + character.charCodeAt(0), width + height);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: 52 }, () => ({
    x: random() * width,
    y: random() * height,
    size: 1.5 + random() * 6,
    speed: 12 + random() * 38,
    drift: -18 + random() * 36,
    alpha: 0.1 + random() * 0.34,
  }));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - clamp01(value), 3);
}

function easeInOutCubic(value: number) {
  const position = clamp01(value);
  return position < 0.5
    ? 4 * position * position * position
    : 1 - Math.pow(-2 * position + 2, 3) / 2;
}

function hexColour(value: string | undefined): [number, number, number] {
  const match = value?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return match
    ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)]
    : [236, 72, 153];
}

type CameraTarget = { x: number; y: number; scale: number };

function cameraTarget(region: MotionRegion | null): CameraTarget {
  if (!region) return { x: 0.5, y: 0.5, scale: 1 };
  const centreX = region.x + region.width / 2;
  const centreY = region.y + region.height / 2;
  const maximumScale = region.kind === "hero"
    ? 1.52
    : region.kind === "trope" || region.kind === "detail"
      ? 1.75
      : 1.48;
  const minimumScale = region.kind === "trope" || region.kind === "detail"
    ? 1.5
    : region.kind === "hero"
      ? 1.3
      : 1.26;
  const usefulScale = Math.min(
    maximumScale,
    Math.max(minimumScale, 0.82 / Math.max(region.width, 0.2), 0.5 / Math.max(region.height, 0.14)),
  );
  return { x: centreX, y: centreY, scale: usefulScale };
}

function interpolateCamera(from: CameraTarget, to: CameraTarget, amount: number): CameraTarget {
  const eased = easeInOutCubic(amount);
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    scale: from.scale + (to.scale - from.scale) * eased,
  };
}

function orderedMotionRegions(map: MotionMap | undefined): MotionRegion[] {
  if (!map?.available) return [];
  const first = (kind: MotionRegionKind) => map.regions.find((region) => region.kind === kind);
  const hook = first("hook");
  const hero = first("hero");
  const tropes = map.regions.filter((region) => region.kind === "trope").slice(0, 5);
  const detail = first("detail");
  const cta = first("cta") ?? first("website");
  return [hook, hero, ...tropes, detail, cta].filter((region): region is MotionRegion => Boolean(region));
}

function drawCameraFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  camera: CameraTarget,
) {
  const scaledWidth = width * camera.scale;
  const scaledHeight = height * camera.scale;
  const desiredX = width / 2 - camera.x * scaledWidth;
  const desiredY = height / 2 - camera.y * scaledHeight;
  const drawX = Math.min(0, Math.max(width - scaledWidth, desiredX));
  const drawY = Math.min(0, Math.max(height - scaledHeight, desiredY));
  context.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
}

function drawMotionEffects(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  progress: number,
  effects: MotionEffect[],
  particles: ReturnType<typeof seededParticles>,
  colour: [number, number, number],
) {
  const [red, green, blue] = colour;
  const accent = `rgb(${red},${green},${blue})`;

  if (effects.includes("light-sweep") || effects.includes("lens-flare")) {
    context.save();
    context.globalCompositeOperation = "screen";
    const sweepX = width * (-0.45 + progress * 1.9);
    const sweep = context.createLinearGradient(sweepX - width * 0.3, 0, sweepX + width * 0.3, height);
    sweep.addColorStop(0, "rgba(255,255,255,0)");
    sweep.addColorStop(0.47, `rgba(${red},${green},${blue},0.02)`);
    sweep.addColorStop(0.5, "rgba(255,255,255,0.16)");
    sweep.addColorStop(0.53, `rgba(${red},${green},${blue},0.06)`);
    sweep.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = sweep;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (effects.includes("mist")) {
    context.save();
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 3; index += 1) {
      const x = ((elapsed * (22 + index * 6) + index * width * 0.42) % (width * 1.5)) - width * 0.25;
      const y = height * (0.3 + index * 0.2 + Math.sin(elapsed * 0.5 + index) * 0.025);
      const mist = context.createRadialGradient(x, y, 0, x, y, width * 0.38);
      mist.addColorStop(0, `rgba(${red},${green},${blue},0.07)`);
      mist.addColorStop(1, `rgba(${red},${green},${blue},0)`);
      context.fillStyle = mist;
      context.fillRect(0, y - width * 0.4, width, width * 0.8);
    }
    context.restore();
  }

  const usesParticles = effects.some((effect) =>
    ["particles", "embers", "ice-shards", "petals", "paint-streaks"].includes(effect),
  );
  if (usesParticles) {
    context.save();
    context.globalCompositeOperation = "screen";
    for (const particle of particles) {
      const direction = effects.includes("embers") ? -1 : 1;
      const y = (particle.y + direction * elapsed * particle.speed + height) % height;
      const x = (particle.x + elapsed * particle.drift + width) % width;
      context.globalAlpha = particle.alpha * (0.7 + 0.3 * Math.sin(elapsed * 1.7 + particle.x));
      context.fillStyle = effects.includes("ice-shards") ? "#dff7ff" : effects.includes("petals") ? accent : accent;
      context.save();
      context.translate(x, y);
      context.rotate(elapsed * 0.9 + particle.x);
      if (effects.includes("petals")) {
        context.beginPath();
        context.ellipse(0, 0, particle.size * 0.75, particle.size * 1.7, 0, 0, Math.PI * 2);
        context.fill();
      } else if (effects.includes("ice-shards") || effects.includes("paint-streaks")) {
        context.fillRect(-particle.size * 0.45, -particle.size * 2.2, particle.size * 0.9, particle.size * 4.4);
      } else {
        context.beginPath();
        context.arc(0, 0, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
    context.restore();
  }

  if (effects.includes("water-ripples")) {
    context.save();
    context.strokeStyle = `rgba(${red},${green},${blue},0.18)`;
    context.lineWidth = 3;
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = ((elapsed * 70 + ring * 110) % (width * 0.55));
      context.globalAlpha = 1 - radius / (width * 0.55);
      context.beginPath();
      context.ellipse(width * 0.5, height * 0.78, radius, radius * 0.2, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }
}

async function createMotionVideo(
  source: string,
  platform: SocialPlatform,
  post: GeneratedPost,
) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot render campaign videos.");
  }

  const mimeType = recorderMimeType();
  if (!mimeType) throw new Error("This browser has no supported video encoder.");

  const image = await loadImage(source);
  const { width, height } = dimensions(platform);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not render the campaign video.");

  const frameRate = 30;
  const duration = 8;
  const totalFrames = frameRate * duration;
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (!videoTrack?.requestFrame) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("This browser cannot render reliable poster animation.");
  }
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

  const motionMap = post.motionMap;
  const regions = orderedMotionRegions(motionMap);
  const fullFrame = cameraTarget(null);
  const targets = regions.map(cameraTarget);
  const effects = motionMap?.effects?.length ? motionMap.effects : ["light-sweep" as const];
  const colour = hexColour(motionMap?.accentColor);
  const particles = seededParticles(width, height, `${post.platform}-${post.title}-${motionMap?.summary ?? "poster"}`);
  recorder.start(250);

  await new Promise((resolve) => window.setTimeout(resolve, 120));
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const elapsed = frameIndex / frameRate;
    const progress = elapsed / duration;
    const movement = motionMap?.movement ?? "slow-push";
    let camera = fullFrame;

    if (targets.length && elapsed >= 0.65 && elapsed < 6.65) {
      const sequenceDuration = 6 / targets.length;
      const sequenceTime = elapsed - 0.65;
      const index = Math.min(targets.length - 1, Math.floor(sequenceTime / sequenceDuration));
      const phase = (sequenceTime - index * sequenceDuration) / sequenceDuration;
      camera = interpolateCamera(
        index === 0 ? fullFrame : targets[index - 1],
        targets[index],
        Math.min(1, phase / 0.38),
      );
      camera.scale += Math.max(0, phase - 0.38) * 0.035;
    } else if (targets.length && elapsed >= 6.65) {
      camera = interpolateCamera(targets[targets.length - 1], fullFrame, (elapsed - 6.65) / 0.7);
    }

    const breathing = Math.sin(progress * Math.PI * 2) * 0.012;
    if (movement === "dramatic-push") camera.scale += progress * 0.055;
    if (movement === "gentle-pulse") camera.scale += breathing;
    if (movement === "lateral-pan") camera.x += Math.sin(progress * Math.PI * 2) * 0.025;
    if (movement === "diagonal-drift") {
      camera.x += Math.sin(progress * Math.PI) * 0.018;
      camera.y += Math.cos(progress * Math.PI) * 0.018;
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    drawCameraFrame(context, image, width, height, camera);
    drawMotionEffects(context, width, height, elapsed, progress, effects, particles, colour);

    const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.12, width / 2, height / 2, height * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.78, "rgba(0,0,0,0.02)");
    vignette.addColorStop(1, "rgba(0,0,0,0.22)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    if (effects.includes("glitch") && Math.floor(elapsed * 8) % 19 === 0) {
      context.save();
      context.globalAlpha = 0.16;
      const sliceY = height * (0.18 + ((frameIndex * 17) % 57) / 100);
      context.drawImage(canvas, 0, sliceY, width, height * 0.018, width * 0.014, sliceY, width, height * 0.018);
      context.restore();
    }

    const fade = Math.min(1, elapsed / 0.32, (duration - elapsed) / 0.38);
    if (fade < 1) {
      context.fillStyle = `rgba(0,0,0,${1 - Math.max(0, fade)})`;
      context.fillRect(0, 0, width, height);
    }

    videoTrack.requestFrame();
    await new Promise((resolve) => window.setTimeout(resolve, 1000 / frameRate));
  }

  await new Promise((resolve) => window.setTimeout(resolve, 180));

  recorder.stop();
  const blob = await finished;
  stream.getTracks().forEach((track) => track.stop());
  return { blob, mimeType };
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

  async function createCampaign() {
    if (!selectedBook) return;
    if (!instructions.trim()) {
      setError("Describe the poster or video you want in the guidance box.");
      return;
    }
    if (!platforms.length) {
      setError("Choose at least one platform.");
      return;
    }

    setBusy("image");
    setError("");
    setMessage("");
    try {
      const generated = await requestArtwork("image", platforms);
      const normalized = await Promise.all(
        generated.map(async (post) => ({
          platform: post.platform,
          dataUrl: await normalizePoster(post.imageDataUrl, post.platform),
        })),
      );
      setPosts(generated);
      setImages(normalized);
      videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
      setVideos([]);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "The campaign could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function revise(post: GeneratedPost) {
    const revision = edits[post.platform].trim();
    if (!revision) {
      setError("Describe the change you want first.");
      return;
    }
    setBusy(`image-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const [updated] = await requestArtwork("image", [post.platform], revision, [post]);
      const dataUrl = await normalizePoster(updated.imageDataUrl, updated.platform);
      setPosts((current) => current.map((item) => item.platform === post.platform ? updated : item));
      setImages((current) => [
        ...current.filter((item) => item.platform !== post.platform),
        { platform: post.platform, dataUrl },
      ]);
      setVideos((current) => {
        current.filter((item) => item.platform === post.platform)
          .forEach((item) => URL.revokeObjectURL(item.url));
        return current.filter((item) => item.platform !== post.platform);
      });
      setEdits((current) => ({ ...current, [post.platform]: "" }));
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "The artwork could not be updated.");
    } finally {
      setBusy("");
    }
  }

  async function animatePoster(post: GeneratedPost) {
    const image = images.find((item) => item.platform === post.platform);
    if (!image) {
      setError("The approved poster could not be found.");
      return;
    }
    setBusy(`animate-${post.platform}`);
    setError("");
    setMessage("");
    try {
      const result = await createMotionVideo(image.dataUrl, post.platform, post);
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
    } catch (animationError) {
      setError(animationError instanceof Error ? animationError.message : "The poster could not be animated.");
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

              <div className="mt-6">
                <button type="button" disabled={Boolean(busy)} onClick={() => void createCampaign()} className="w-full rounded-xl bg-pink-500 px-4 py-4 font-bold transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === "image" ? "Creating fresh posters..." : "Create Posters"}
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

                        <label htmlFor={`edit-${post.platform}`} className="mt-5 block font-semibold">Edit this poster</label>
                        <textarea id={`edit-${post.platform}`} value={edits[post.platform]} onChange={(event) => setEdits((current) => ({ ...current, [post.platform]: event.target.value }))} rows={3} placeholder="Describe only the changes you want..." className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500" />
                        <button type="button" disabled={Boolean(busy)} onClick={() => void revise(post)} className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-semibold hover:bg-white/15 disabled:opacity-40">
                          {busy === `image-${post.platform}` ? "Applying your changes..." : "Update Poster"}
                        </button>

                        <button type="button" disabled={Boolean(busy) || !image} onClick={() => void animatePoster(post)} className="mt-3 w-full rounded-xl bg-violet-500 px-4 py-3 font-bold hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40">
                          {busy === `animate-${post.platform}` ? "Animating this exact poster..." : isVideo ? "Rebuild Animation" : "Animate This Poster"}
                        </button>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {image && <a href={image.dataUrl} download={`${selectedBook.slug}-${post.platform}.jpg`} className="flex items-center justify-center rounded-xl bg-pink-500 px-4 py-3 font-semibold hover:bg-pink-400">Download Poster</a>}
                          {isVideo && <a href={video.url} download={`${selectedBook.slug}-${post.platform}.${video.extension}`} className="flex items-center justify-center rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400">Download Video</a>}
                          <button type="button" disabled={Boolean(busy) || post.platform === "tiktok" || !image} onClick={() => void publish(post, "image")} className="rounded-xl border border-pink-400/40 bg-pink-500/10 px-4 py-3 font-semibold text-pink-200 hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                            {busy === `publish-${post.platform}` ? "Publishing..." : post.platform === "tiktok" ? "Download for TikTok" : `Post Poster to ${post.platform === "facebook" ? "Facebook" : "Instagram"}`}
                          </button>
                          {isVideo && (
                            <button type="button" disabled={Boolean(busy) || post.platform === "tiktok"} onClick={() => void publish(post, "video")} className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                              {busy === `publish-${post.platform}` ? "Publishing..." : post.platform === "tiktok" ? "Download for TikTok" : `Post Video to ${post.platform === "facebook" ? "Facebook" : "Instagram"}`}
                            </button>
                          )}
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
