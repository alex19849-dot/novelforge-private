"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  addDays,
  londonDate,
  londonSchedule,
  londonTime,
} from "../../lib/social-calendar";
import type { CalendarPost, SocialPlatform } from "../../lib/social-calendar";
import type {
  StudioBook,
  CreativeRecipe,
} from "../../lib/social-creative-directions";
import { readyForApproval } from "../../lib/social-approval";
import { MUSIC_LICENSE, musicForPath } from "../../lib/social-music";
type Prompt = {
  id: string;
  prompt: string;
  hook: string;
  recipe: CreativeRecipe;
  previousPrompts: number;
  bookSlug: string;
};
type PosterPost = {
  id: string;
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  mediaPath: string;
  mediaType: "image" | "video";
  posterUrl: string;
  videoUrl: string | null;
  creativeBrief: string;
  includesCover: boolean;
};
type PosterResult = {
  campaignId: string;
  promptId: string;
  bookSlug: string;
  posts: PosterPost[];
};
type RecentCreation = {
  id: string;
  recipe: CreativeRecipe;
  prompt: string;
  hook: string;
  poster_state: string;
  poster_result: PosterResult | null;
  created_at: string;
};
type Editable = PosterPost & {
  hashtagText: string;
  date: string;
  time: string;
  saved?: CalendarPost;
  notice?: string;
};
const CHANNELS: [SocialPlatform, string][] = [
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube Shorts"],
  ["instagram", "Instagram (manual)"],
];
const channelName = (platform: SocialPlatform) =>
  ({
    facebook: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    instagram: "Instagram",
  })[platform];
const field =
  "mt-2 w-full rounded-xl border border-white/15 bg-neutral-950 px-3 py-3 text-sm leading-6 outline-none focus:border-rose-300";
const primary =
  "rounded-xl bg-rose-200 px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-rose-100 disabled:opacity-40";
const secondary =
  "rounded-xl border border-white/15 px-4 py-3 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-40";
async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("Sign in to Social Studio again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session.access_token}`,
  };
}
export default function StudioCreator({
  books,
  onSaved,
  onNavigate,
}: {
  books: StudioBook[];
  onSaved: () => void;
  onNavigate: (view: "scheduled" | "drafts" | "settings") => void;
}) {
  const [book, setBook] = useState<StudioBook | null>(null),
    [notes, setNotes] = useState(""),
    [platforms, setPlatforms] = useState<SocialPlatform[]>([
      "facebook",
      "tiktok",
      "youtube",
    ]);
  const [prompt, setPrompt] = useState<Prompt | null>(null),
    [brief, setBrief] = useState(""),
    [result, setResult] = useState<PosterResult | null>(null),
    [posts, setPosts] = useState<Editable[]>([]);
  const [recent, setRecent] = useState<RecentCreation[]>([]);
  const [busy, setBusy] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [activePlatform, setActivePlatform] = useState<SocialPlatform>("facebook");
  const bookRef = useRef(""),
    receiptRef = useRef(""),
    appliedReceiptRef = useRef("");
  const inFlight = useRef(false);
  useEffect(() => {
    bookRef.current = book?.slug ?? "";
  }, [book]);
  function acceptResult(data: PosterResult, existing: CalendarPost[] = []) {
    if (
      data.bookSlug !== bookRef.current ||
      appliedReceiptRef.current === data.campaignId
    )
      return;
    appliedReceiptRef.current = data.campaignId;
    setResult(data);
    setPosts(
      data.posts.map((p) => {
        const saved = existing.find((row) => row.id === p.id);
        const value = saved
          ? {
              ...p,
              title: saved.title,
              caption: saved.caption,
              hashtags: saved.hashtags,
            }
          : p;
        return {
          ...value,
          hashtagText: value.hashtags.join(" "),
          saved,
          date: saved?.scheduled_at
            ? londonDate(saved.scheduled_at)
            : addDays(londonDate(), 1),
          time: saved?.scheduled_at
            ? londonTime(saved.scheduled_at)
            : p.platform === "facebook"
              ? "19:00"
              : p.platform === "tiktok"
                ? "20:00"
                : "18:00",
          notice:
            saved?.status === "published"
              ? "This post is already published. Its record is kept in History."
              : saved
                ? "This post is already saved. Changes update that post rather than creating another."
                : undefined,
        };
      }),
    );
    setActivePlatform(data.posts[0].platform);
    setPending(false);
    setBusy("");
    setError("");
    setMessage(
      "Your posters and separate platform copy are ready. Review them before choosing posting times.",
    );
  }
  async function checkProgress() {
    if (!prompt) return;
    try {
      const response = await fetch(
        `/api/social-studio/poster?promptId=${prompt.id}`,
        { headers: await headers(), cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (data.status === "ready" && data.result) acceptResult(data.result);
      else if (data.status === "failed") {
        setPending(false);
        setBusy("");
        setError(
          data.error ||
            "The poster could not finish. Your saved prompt is kept.",
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Progress could not be checked.",
      );
    }
  }
  useEffect(() => {
    if (!pending || !prompt) return;
    const timer = window.setInterval(() => void checkProgress(), 6000);
    return () => window.clearInterval(timer);
  }, [pending, prompt?.id]);
  useEffect(() => {
    if (!book) {
      setRecent([]);
      return;
    }
    let active = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const rows = await supabase
        .from("social_creative_prompts")
        .select("id,recipe,prompt,hook,poster_state,poster_result,created_at")
        .eq("user_id", data.user.id)
        .eq("book_slug", book!.slug)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(6);
      if (active && !rows.error) setRecent(rows.data as RecentCreation[]);
    }
    void load();
    return () => {
      active = false;
    };
  }, [book?.slug, prompt?.id, result?.campaignId]);
  async function resume(row: RecentCreation) {
    setBusy("resume");
    setError("");
    try {
      setPrompt({
        id: row.id,
        prompt: row.prompt,
        hook: row.hook,
        recipe: row.recipe,
        bookSlug: book!.slug,
        previousPrompts: Math.max(0, recent.length - 1),
      });
      setBrief(row.poster_result?.posts[0]?.creativeBrief ?? row.prompt);
      if (row.poster_state === "ready" && row.poster_result) {
        const { data: account } = await supabase.auth.getUser();
        if (!account.user) throw Error("Sign in again.");
        const saved = await supabase
          .from("social_posts")
          .select("*")
          .eq("user_id", account.user.id)
          .in(
            "id",
            row.poster_result.posts.map((p) => p.id),
          );
        if (saved.error) throw Error("Saved posts could not be checked.");
        appliedReceiptRef.current = "";
        acceptResult(row.poster_result, saved.data as CalendarPost[]);
      } else {
        setResult(null);
        setPosts([]);
        setPending(row.poster_state === "generating");
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This creation could not be reopened.",
      );
    } finally {
      setBusy("");
    }
  }
  function choose(selected: StudioBook) {
    bookRef.current = selected.slug;
    setBook(selected);
    setNotes("");
    setPrompt(null);
    setBrief("");
    setResult(null);
    setPosts([]);
    setError("");
    setMessage("");
    receiptRef.current = "";
  }
  async function generatePrompt() {
    if (!book || inFlight.current) return;
    inFlight.current = true;
    setBusy("prompt");
    setError("");
    setMessage("");
    const slug = book.slug;
    try {
      const response = await fetch("/api/social-studio/prompts", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ bookSlug: slug, notes }),
        signal: AbortSignal.timeout(115000),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (bookRef.current !== slug) return;
      setPrompt(data);
      setBrief(data.prompt);
      setResult(null);
      setPosts([]);
      receiptRef.current = "";
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The prompt could not be created.",
      );
    } finally {
      setBusy("");
      inFlight.current = false;
    }
  }
  async function generatePoster() {
    if (!prompt || !platforms.length || inFlight.current) return;
    inFlight.current = true;
    setBusy("poster");
    setPending(true);
    setError("");
    setMessage("");
    receiptRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/social-studio/poster", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          promptId: prompt.id,
          prompt: brief,
          requestId: receiptRef.current,
          platforms,
        }),
        signal: AbortSignal.timeout(285000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status !== 409) setPending(false);
        throw Error(data.error);
      }
      acceptResult(data);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.name !== "TimeoutError"
          ? failure.message
          : "The request is still being checked. Use Check progress before generating again.",
      );
    } finally {
      setBusy("");
      inFlight.current = false;
    }
  }
  function edit(id: string, change: Partial<Editable>) {
    setPosts((current) =>
      current.map((p) =>
        p.id === id ? { ...p, ...change, notice: undefined } : p,
      ),
    );
  }
  async function save(post: Editable, approve: boolean) {
    if (!book || !result || inFlight.current) return;
    inFlight.current = true;
    setBusy(post.id);
    setError("");
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw Error("Sign in again before saving.");
      const scheduled = post.date ? londonSchedule(post.date, post.time) : null;
      if (approve && (!scheduled || Date.parse(scheduled) <= Date.now()))
        throw Error("Choose a future UK posting date and time.");
      const track = musicForPath(post.mediaPath);
      const values = {
        book_slug: book.slug,
        book_title: book.title,
        platform: post.platform,
        post_type: "book_promotion",
        title: post.title.trim(),
        caption: post.caption.trim(),
        hashtags: post.hashtags,
        media_path: post.mediaPath,
        media_type: post.mediaType,
        planned_media_type: post.mediaType,
        scheduled_at: scheduled,
        status: approve ? "approved" : "draft",
        creative_brief: post.creativeBrief,
        quality_notes: "",
        content_metadata: {
          version: 2,
          origin: "manual",
          family: "book_promotion",
          book_specific: true,
          includes_cover: true,
          prompt_id: result.promptId,
          visual_type: "genuine_cover_kindle",
          artwork_asset_policy: "genuine_cover_kindle_v1",
          ...(track ? { music: { ...track, license: MUSIC_LICENSE } } : {}),
        },
      };
      if (!values.caption) throw Error("Write a caption before saving.");
      if (approve && !readyForApproval({ ...values, status: "draft" }))
        throw Error(
          "Check the media, title and caption length before scheduling.",
        );
      if (approve && post.platform === "instagram")
        throw Error(
          "Instagram is managed manually. Save the draft and download its poster.",
        );
      const response = post.saved
        ? await supabase
            .from("social_posts")
            .update(values)
            .eq("id", post.id)
            .eq("user_id", data.user.id)
            .eq("version", post.saved.version)
            .in("status", ["draft", "approved"])
            .select()
            .single()
        : await supabase
            .from("social_posts")
            .insert({
              ...values,
              id: post.id,
              campaign_id: result.campaignId,
              user_id: data.user.id,
            })
            .select()
            .single();
      if (response.error)
        throw Error(
          response.error.code === "23505" || response.error.code === "PGRST116"
            ? "This post may already be saved or changed in another tab. Check Drafts or Scheduled before trying again."
            : response.error.message,
        );
      const saved = response.data as CalendarPost;
      edit(post.id, {
        saved,
        notice: approve
          ? "Approved for this platform’s selected time."
          : "Draft saved.",
      });
      onSaved();
      if (approve) {
        const h = await headers();
        const settingsResponse = await fetch("/api/social-studio/publishing", {
          headers: h,
          cache: "no-store",
        });
        const settings = await settingsResponse.json();
        if (!settingsResponse.ok)
          throw Error(
            "The approved post is saved, but publishing status could not be confirmed. Open Settings.",
          );
        if (!settings.settings?.enabled) {
          const enabled = await fetch("/api/social-studio/publishing", {
            method: "POST",
            headers: h,
            body: JSON.stringify({ action: "enable" }),
          });
          const enabledResult = await enabled.json();
          if (!enabled.ok) {
            edit(post.id, {
              saved,
              notice:
                "Approved and saved, but publishing is paused. Open Settings to resolve the connection.",
            });
            throw Error(
              enabledResult.error ||
                "Publishing could not be enabled. The post is saved.",
            );
          }
          edit(post.id, {
            saved,
            notice: "Scheduled. Automatic publishing is on for approved posts.",
          });
        } else {
          const wake = await fetch("/api/social-studio/publishing", {
            method: "POST",
            headers: h,
            body: JSON.stringify({ action: "wake" }),
          });
          if (!wake.ok)
            throw Error(
              "The post is approved, but the publisher could not be notified. Check Settings.",
            );
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This post could not be saved.",
      );
    } finally {
      setBusy("");
      inFlight.current = false;
    }
  }
  const active = posts.find((p) => p.platform === activePlatform) ?? posts[0];
  if (!book)
    return (
      <section aria-labelledby="choose-book">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[.2em] text-rose-200">
            1 · Choose your book
          </p>
          <h2 id="choose-book" className="mt-2 text-2xl font-semibold">
            Create something worth stopping for.
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Choose a book, generate a fresh prompt, then review the poster and
            schedule each channel.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((item) => (
            <button
              key={item.slug}
              onClick={() => choose(item)}
              type="button"
              className="group overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/70 text-left hover:border-rose-200/40"
            >
              <div className="flex h-52 items-center justify-center bg-black/30 p-4">
                <img
                  src={item.coverUrl}
                  alt={`${item.title} cover`}
                  loading="lazy"
                  className="h-full max-w-full object-contain shadow-xl"
                />
              </div>
              <div className="p-4">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-neutral-400">{item.subgenre}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  return (
    <section
      aria-label="Create and schedule a book poster"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-neutral-900/60 p-4">
        <img
          src={book.coverUrl}
          alt={`${book.title} original cover`}
          className="h-24 w-16 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-rose-200">
            Selected book
          </p>
          <h2 className="mt-1 text-xl font-semibold">{book.title}</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {book.kindleUnlimited
              ? "Kindle Unlimited verified"
              : "Kindle edition, KU not verified"}
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busy) || pending}
          onClick={() => {
            setBook(null);
            setError("");
            setMessage("");
          }}
          className={`${secondary} w-full sm:w-auto`}
        >
          Change book
        </button>
      </div>
      <fieldset
        disabled={Boolean(busy) || pending}
        className="mt-4 flex flex-wrap gap-2"
      >
        <legend className="mb-2 text-sm font-medium">Choose platforms</legend>
        {CHANNELS.map(([id, label]) => (
          <label
            key={id}
            className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-sm ${platforms.includes(id) ? "border-rose-200/50 bg-rose-200/10 text-rose-100" : "border-white/10 text-neutral-400"}`}
          >
            <input
              type="checkbox"
              checked={platforms.includes(id)}
              onChange={(e) =>
                setPlatforms((current) =>
                  e.target.checked
                    ? [...current, id]
                    : current.filter((p) => p !== id),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <details
        open={!result}
        className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5 sm:p-6"
      >
        <summary className="cursor-pointer text-xl font-semibold">
          2 · Generate your prompt
        </summary>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Each new direction avoids this book’s recent scenes, layouts, colours
          and hooks. Your original cover goes inside a Kindle, with verified
          tropes and availability.
        </p>
        <label className="mt-4 block text-sm">
          Extra direction (optional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={Boolean(busy) || pending}
            maxLength={2000}
            placeholder="For example, make this one tender, festive or more intense…"
            className={field}
          />
        </label>
        <button
          type="button"
          disabled={Boolean(busy) || pending}
          onClick={() => void generatePrompt()}
          className={`${primary} mt-4`}
        >
          {busy === "prompt"
            ? "Creating a fresh direction…"
            : prompt
              ? "Generate a different prompt"
              : "Generate prompt"}
        </button>
        {recent.length > 0 && (
          <details className="mt-4 border-t border-white/10 pt-4">
            <summary className="cursor-pointer text-sm text-neutral-400">
              Recent creations for this book
            </summary>
            <ul className="mt-3 space-y-2">
              {recent.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 p-3"
                >
                  <span className="text-sm">
                    {row.hook}
                    <span className="ml-2 text-xs text-neutral-500">
                      {new Date(row.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={Boolean(busy) || pending}
                    onClick={() => void resume(row)}
                    className={secondary}
                  >
                    {row.poster_state === "ready"
                      ? "Reopen poster"
                      : row.poster_state === "generating"
                        ? "Resume progress"
                        : "Use this prompt"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {prompt && (
          <div className="mt-5">
            <p className="mb-2 text-xs text-neutral-400">
              {prompt.previousPrompts} previous direction
              {prompt.previousPrompts === 1 ? "" : "s"} considered. Review and
              edit before generating artwork.
            </p>
            <label className="block text-sm font-medium">
              Your poster prompt
              <textarea
                value={brief}
                disabled={Boolean(busy) || pending}
                onChange={(e) => setBrief(e.target.value)}
                rows={9}
                maxLength={6000}
                className={field}
              />
            </label>
          </div>
        )}
      </details>
      {prompt && (
        <details
          open={!result}
          className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5 sm:p-6"
        >
          <summary className="cursor-pointer text-xl font-semibold">
            3 · Generate your poster
          </summary>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            The real cover is inserted intact. TikTok and YouTube receive a
            vertical MP4 with licensed backing music.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={
                Boolean(busy) || pending || !platforms.length || !brief.trim()
              }
              onClick={() => void generatePoster()}
              className={primary}
            >
              {busy === "poster" || pending
                ? "Creating and checking your poster…"
                : result
                  ? "Generate poster again"
                  : "Generate poster"}
            </button>
            {prompt && (
              <button
                type="button"
                onClick={() => void checkProgress()}
                className={secondary}
              >
                {pending ? "Check progress" : "Open saved result"}
              </button>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Uses your existing AI credits. Nothing is posted until you schedule
            a platform. Scheduling turns on automatic publishing for approved
            posts.
          </p>
        </details>
      )}
      <div aria-live="polite">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-4 text-sm text-emerald-100"
          >
            {message}
          </p>
        )}
      </div>
      {active && (
        <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5 sm:p-6">
          <h3 className="text-xl font-semibold">
            4 · Review and schedule each platform
          </h3>
          <div
            className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
            role="group"
            aria-label="Platform copy and posting times"
          >
            {posts.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={activePlatform === p.platform}
                onClick={() => setActivePlatform(p.platform)}
                className={`${secondary} capitalize ${activePlatform === p.platform ? "border-rose-200/50 bg-rose-200/10 text-rose-100" : ""}`}
              >
                {channelName(p.platform)}
                {p.saved ? " ✓" : ""}
              </button>
            ))}
          </div>
          <div className="mt-5 grid items-start gap-6 lg:grid-cols-2">
            <div>
              {active.videoUrl ? (
                <video
                  src={active.videoUrl}
                  poster={active.posterUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="mx-auto max-h-[650px] w-full rounded-xl bg-black object-contain"
                />
              ) : (
                <img
                  src={active.posterUrl}
                  alt={`${book.title} poster with the genuine cover inside a Kindle`}
                  className="mx-auto max-h-[650px] w-full rounded-xl object-contain"
                />
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-rose-200">
                <a
                  href={active.posterUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  Download poster
                </a>
                {active.videoUrl && (
                  <a
                    href={active.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download MP4
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        [active.caption, active.hashtags.join(" ")].join(
                          "\n\n",
                        ),
                      )
                      .then(() =>
                        setMessage(`${active.platform} caption copied.`),
                      )
                      .catch(() =>
                        setError(
                          "Copy failed. Select the caption text to copy it.",
                        ),
                      );
                  }}
                >
                  Copy caption
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-neutral-400">
                This caption and hashtag set was written specifically for{" "}
                <span className="capitalize text-white">
                  {channelName(active.platform)}
                </span>
                . Edit anything before saving.
              </p>
              <label className="block text-sm">
                {active.platform === "youtube" ? "YouTube title" : "Post title"}
                <input
                  value={active.title}
                  onChange={(e) => edit(active.id, { title: e.target.value })}
                  maxLength={active.platform === "youtube" ? 100 : 240}
                  disabled={Boolean(busy)}
                  className={field}
                />
              </label>
              <label className="block text-sm">
                {active.platform === "youtube" ? "Description" : "Caption"}
                <textarea
                  value={active.caption}
                  onChange={(e) => edit(active.id, { caption: e.target.value })}
                  rows={7}
                  disabled={Boolean(busy)}
                  className={field}
                />
              </label>
              <label className="block text-sm">
                Hashtags
                <input
                  value={active.hashtagText}
                  onChange={(e) =>
                    edit(active.id, {
                      hashtagText: e.target.value,
                      hashtags: [
                        ...new Set(
                          e.target.value
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((tag) =>
                              tag.startsWith("#") ? tag : "#" + tag,
                            ),
                        ),
                      ],
                    })
                  }
                  disabled={Boolean(busy)}
                  className={field}
                />
              </label>
              <fieldset
                disabled={Boolean(busy)}
                className="grid grid-cols-2 gap-3"
              >
                <legend className="mb-2 text-sm font-medium">
                  Posting time for{" "}
                  <span className="capitalize">
                    {channelName(active.platform)}
                  </span>
                </legend>
                <label className="min-w-0 text-sm">
                  Date
                  <input
                    type="date"
                    min={londonDate()}
                    value={active.date}
                    onChange={(e) => edit(active.id, { date: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="min-w-0 text-sm">
                  Time (UK)
                  <input
                    type="time"
                    value={active.time}
                    onChange={(e) => edit(active.id, { time: e.target.value })}
                    className={field}
                  />
                </label>
              </fieldset>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    Boolean(busy) ||
                    Boolean(
                      active.saved &&
                        !["draft", "approved"].includes(active.saved.status),
                    )
                  }
                  onClick={() => void save(active, false)}
                  className={secondary}
                >
                  Save draft
                </button>
                {active.platform !== "instagram" && (
                  <button
                    type="button"
                    disabled={
                      Boolean(busy) ||
                      Boolean(
                        active.saved &&
                          !["draft", "approved"].includes(active.saved.status),
                      )
                    }
                    onClick={() => void save(active, true)}
                    className={primary}
                  >
                    {busy === active.id ? "Saving…" : "Approve & schedule"}
                  </button>
                )}
              </div>
              {active.platform === "instagram" && (
                <p className="text-sm text-neutral-400">
                  Instagram stays manual. Save your draft, then download the
                  poster and copy its Instagram caption.
                </p>
              )}
              {active.notice && (
                <p
                  role="status"
                  className="rounded-xl bg-emerald-300/5 p-3 text-sm text-emerald-100"
                >
                  {active.notice}
                  {active.notice.includes("paused") && (
                    <button
                      type="button"
                      onClick={() => onNavigate("settings")}
                      className="ml-2 underline"
                    >
                      Publishing settings
                    </button>
                  )}
                </p>
              )}
              <div className="flex gap-4 text-sm text-neutral-400">
                <button
                  type="button"
                  onClick={() => onNavigate("scheduled")}
                  className="underline"
                >
                  View scheduled posts
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("drafts")}
                  className="underline"
                >
                  View drafts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
