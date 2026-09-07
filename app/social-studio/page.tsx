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
  drawImageCover(context, image, width, height);
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
  return Array.from({ length: 28 }, () => ({
    x: random() * width,
    y: random() * height,
    size: 1 + random() * 3.5,
    speed: 10 + random() * 24,
    alpha: 0.08 + random() * 0.18,
  }));
}

async function createMotionVideo(source: string, platform: SocialPlatform) {
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

  const duration = 8;
  const start = performance.now();
  const particles = seededParticles(width, height);
  recorder.start(250);

  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const elapsed = Math.min(duration, (now - start) / 1000);
      const progress = elapsed / duration;
      const fade = Math.min(1, elapsed / 0.55, (duration - elapsed) / 0.45);

      context.save();
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.max(0, fade);
      drawImageCover(context, image, width, height);

      context.globalCompositeOperation = "screen";
      const glowX = width * (-0.1 + progress * 1.2);
      const glow = context.createRadialGradient(
        glowX,
        height * 0.42,
        0,
        glowX,
        height * 0.42,
        width * 0.42,
      );
      glow.addColorStop(0, "rgba(255,255,255,0.12)");
      glow.addColorStop(0.35, "rgba(255,255,255,0.035)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        const y = (particle.y - elapsed * particle.speed + height) % height;
        context.globalAlpha = particle.alpha * fade * (0.55 + 0.45 * Math.sin(elapsed + particle.x));
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(particle.x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

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
            const result = await createMotionVideo(media.dataUrl, media.platform);
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
        const result = await createMotionVideo(dataUrl, post.platform);
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
                          <video src={video.url} controls playsInline loop className="mx-auto mt-5 max-h-[760px] w-auto max-w-full rounded-xl" />
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
