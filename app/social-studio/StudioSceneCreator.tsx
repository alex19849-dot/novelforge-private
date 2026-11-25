"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { StudioBook } from "../../lib/social-creative-directions";
import type { SocialPlatform } from "../../lib/social-calendar";
import type { ScenePlan, SceneDelivery } from "../../lib/social-scene-slides";
import { SCENE_CHANNELS, sceneSeconds } from "../../lib/social-scene-slides";
import { SOCIAL_TRACKS } from "../../lib/social-music";
import StudioCreator, { type PosterResult } from "./StudioCreator";
const field =
  "mt-2 w-full rounded-xl border border-white/15 bg-neutral-950 px-3 py-3 text-sm leading-6 outline-none focus:border-rose-300";
const button =
  "rounded-xl bg-rose-200 px-5 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-40";
const secondary =
  "rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40";
async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("Sign in to Social Studio first.");
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + data.session.access_token,
  };
}
export default function StudioSceneCreator({
  books,
  onSaved,
  onNavigate,
}: {
  books: StudioBook[];
  onSaved: () => void;
  onNavigate: (v: "scheduled" | "drafts" | "settings") => void;
}) {
  const [slug, setSlug] = useState(""),
    [excerpt, setExcerpt] = useState(""),
    [castNotes, setCastNotes] = useState(""),
    [notes, setNotes] = useState(""),
    [plan, setPlan] = useState<ScenePlan | null>(null),
    [promptId, setPromptId] = useState(""),
    [result, setResult] = useState<PosterResult | null>(null),
    [platforms, setPlatforms] = useState<SocialPlatform[]>([
      "tiktok",
      "instagram",
      "youtube",
    ]),
    [delivery, setDelivery] = useState<SceneDelivery>("native"),
    [trackId, setTrackId] = useState("none"),
    [busy, setBusy] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<any[]>([]);
  const [progress, setProgress] = useState("");
  const lock = useRef(false),
    current = useRef("");
  current.current = slug;
  useEffect(() => {
    let live = true;
    if (!slug) {
      setRecent([]);
      return;
    }
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const r = await supabase
        .from("social_creative_prompts")
        .select("id,hook,recipe,poster_state,poster_result")
        .eq("user_id", data.user.id)
        .eq("book_slug", slug)
        .eq("recipe->>format", "scene-slides")
        .order("created_at", { ascending: false })
        .limit(6);
      if (live && !r.error) setRecent(r.data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [slug, promptId, result?.campaignId]);
  async function check() {
    if (!promptId) return;
    try {
      const r = await fetch("/api/social-studio/slides?promptId=" + promptId, {
        headers: await headers(),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.result?.bookSlug !== current.current) return;
      if (d.status === "generating") {
        const r = d.result?.slidesRecovery;
        setProgress(
          !r
            ? "Queued for generation…"
            : r.images.length < 2
              ? `Creating photo ${r.images.length + 1} of 2…`
              : !r.checked
                ? "Checking cast continuity and image quality…"
                : !r.copies?.length
                  ? "Writing platform captions…"
                  : "Rendering your three-slide video…",
        );
      }
      if (d.status === "ready") {
        setResult(d.result);
        setPending(false);
        setBusy("");
        setError("");
      } else if (d.status === "failed") {
        setPending(false);
        setBusy("");
        setError(
          d.error || "This sequence needs review. Saved progress is kept.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Progress could not be read.");
    }
  }
  useEffect(() => {
    if (!pending || !promptId) return;
    const timer = setInterval(() => void check(), 7000);
    return () => clearInterval(timer);
  }, [pending, promptId, slug]);
  async function makePlan() {
    if (lock.current || !slug) return;
    lock.current = true;
    setBusy("plan");
    setError("");
    const selected = slug;
    try {
      const r = await fetch("/api/social-studio/slides", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          action: "plan",
          bookSlug: slug,
          excerpt,
          castNotes,
          notes,
        }),
        signal: AbortSignal.timeout(115000),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (current.current !== selected) return;
      setPlan(d.plan);
      setPromptId(d.id);
      setResult(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The plan could not be generated.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function generate() {
    if (lock.current || !plan || !promptId) return;
    lock.current = true;
    setBusy("images");
    setError("");
    try {
      const r = await fetch("/api/social-studio/slides", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          action: "generate",
          promptId,
          requestId: crypto.randomUUID(),
          plan,
          platforms,
          delivery,
          trackId,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.status === "ready" && d.result) setResult(d.result);
      else {
        setResult(null);
        setProgress("Queued for generation…");
        setPending(true);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The sequence could not start. Check progress before trying again.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  function updateSlide(i: number, key: "text" | "imagePrompt", value: string) {
    if (!plan) return;
    const slides = plan.slides.map((s, n) =>
      n === i
        ? {
            ...s,
            [key]: value,
            ...(key === "text" && plan.sourceMode === "excerpt"
              ? { sourceQuote: value }
              : {}),
          }
        : s,
    ) as ScenePlan["slides"];
    setPlan({ ...plan, slides });
  }
  return (
    <section className="space-y-5" aria-label="Create romantic scene slides">
      <div>
        <h2 className="text-2xl font-semibold">
          Tell the story in three slides.
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Two connected romantic moments, then your book cover. Realistic
          fictional adult men, readable story text and one vertical video for
          TikTok, Reels and Shorts.
        </p>
      </div>
      <label className="block text-sm">
        1 · Choose your book
        <select
          className={field}
          value={slug}
          disabled={!!busy || pending}
          onChange={(e) => {
            setSlug(e.target.value);
            setPlan(null);
            setPromptId("");
            setResult(null);
            setError("");
            setExcerpt("");
            setCastNotes("");
          }}
        >
          <option value="">Select a book</option>
          {books.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      {!!slug && (
        <>
          {recent.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-rose-200">
                Recent scene sequences
              </summary>
              <ul className="mt-3 space-y-2">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3"
                  >
                    <span>{row.hook}</span>
                    <button
                      className={secondary}
                      disabled={!!busy || pending}
                      onClick={() => {
                        setPromptId(row.id);
                        setPlan(row.recipe.scenePlan);
                        setExcerpt(row.recipe.excerpt ?? "");
                        setResult(
                          row.poster_state === "ready"
                            ? row.poster_result
                            : null,
                        );
                        setPending(row.poster_state === "generating");
                        setError("");
                      }}
                    >
                      Reopen
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details
            open={!plan && !result}
            className="rounded-2xl border border-white/10 p-4"
          >
            <summary className="cursor-pointer text-lg font-semibold">
              2 · Pick the story moment
            </summary>
            <label className="mt-4 block text-sm">
              Paste a scene from your manuscript (optional)
              <textarea
                className={field}
                rows={6}
                maxLength={18000}
                value={excerpt}
                disabled={!!busy || pending}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Paste the passage you want to tease. Exact excerpt mode keeps your wording."
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              With a passage, the two slides use exact manuscript extracts.
              Without one, they use original scene-style promotional copy
              grounded in the book description, clearly labelled as a premise
              adaptation.
            </p>
            <label className="mt-4 block text-sm">
              What do the two men look like? (optional)
              <textarea
                className={field}
                rows={3}
                maxLength={2000}
                value={castNotes}
                disabled={!!busy || pending}
                onChange={(e) => setCastNotes(e.target.value)}
                placeholder="Names, adult ages, hair, face, height/build and clothing. Make the two men distinct."
              />
            </label>
            <label className="mt-4 block text-sm">
              Direction for this sequence (optional)
              <input
                className={field}
                maxLength={1500}
                value={notes}
                disabled={!!busy || pending}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Charged banter, jealousy, humour, an almost-kiss…"
              />
            </label>
            <button
              className={button + " mt-4"}
              disabled={!!busy || pending}
              onClick={() => void makePlan()}
            >
              {busy === "plan"
                ? "Finding the hook…"
                : plan
                  ? "Make a new sequence plan"
                  : "Generate scene plan"}
            </button>
          </details>
          {plan && (
            <details
              open={!result}
              className="rounded-2xl border border-white/10 p-4"
            >
              <summary className="cursor-pointer text-lg font-semibold">
                3 · Review the two scenes and cover reveal
              </summary>
              <p className="mt-3 text-sm text-rose-200">
                {plan.sourceMode === "excerpt"
                  ? "Exact manuscript excerpts"
                  : "Premise adaptation, not a manuscript quote"}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {plan.cast.map((cast, i) => (
                  <label key={i} className="block text-sm">
                    Lead {i + 1}: appearance and wardrobe
                    <textarea
                      className={field}
                      rows={4}
                      maxLength={900}
                      disabled={!!busy || pending}
                      value={cast}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          cast: plan.cast.map((c, n) =>
                            n === i ? e.target.value : c,
                          ) as [string, string],
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              {plan.slides.map((s, i) => (
                <div key={i} className="mt-5 border-t border-white/10 pt-4">
                  <h3 className="font-semibold">
                    Slide {i + 1} · {i === 0 ? "Hook" : "Build the tension"}{" "}
                    <span className="text-sm font-normal text-neutral-400">
                      ({sceneSeconds(s.text)} seconds)
                    </span>
                  </h3>
                  <label className="mt-2 block text-sm">
                    On-screen story text
                    <textarea
                      className={field}
                      rows={3}
                      maxLength={280}
                      value={s.text}
                      disabled={!!busy || pending}
                      onChange={(e) => updateSlide(i, "text", e.target.value)}
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    Scene direction
                    <textarea
                      className={field}
                      rows={3}
                      maxLength={1800}
                      disabled={!!busy || pending}
                      value={s.imagePrompt}
                      onChange={(e) =>
                        updateSlide(i, "imagePrompt", e.target.value)
                      }
                    />
                  </label>
                </div>
              ))}
              <p className="mt-4 text-sm text-neutral-400">
                Slide 3: your genuine cover inside a Kindle, with the book title
                and reading link direction. The same two fictional men carry
                through both scene images. Review faces and hands before
                posting.
              </p>
              <fieldset
                disabled={!!busy || pending}
                className="mt-5 flex flex-wrap gap-3"
              >
                <legend className="mb-2 text-sm font-medium">Platforms</legend>
                {SCENE_CHANNELS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={platforms.includes(p)}
                      onChange={(e) =>
                        setPlatforms((prev) =>
                          e.target.checked
                            ? [...prev, p]
                            : prev.filter((x) => x !== p),
                        )
                      }
                    />
                    {p === "instagram"
                      ? "Instagram Reels (manual)"
                      : p === "youtube"
                        ? "YouTube Shorts"
                        : "TikTok"}
                  </label>
                ))}
              </fieldset>
              <label className="mt-5 block text-sm">
                Music and publishing
                <select
                  className={field}
                  value={delivery}
                  disabled={!!busy || pending}
                  onChange={(e) => setDelivery(e.target.value as SceneDelivery)}
                >
                  <option value="native">
                    Use platform music (finish in each app)
                  </option>
                  <option value="automatic">
                    Schedule TikTok / Shorts with selected audio
                  </option>
                </select>
              </label>
              {delivery === "native" ? (
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Exports a clean video without baked-in music. Download it,
                  open TikTok, Reels or Shorts, choose an available sound in
                  that platform’s music picker, and finish posting there. Studio
                  will save a draft and will not silently auto-post this
                  version.
                </p>
              ) : (
                <>
                  <label className="mt-3 block text-sm">
                    Backing audio
                    <select
                      className={field}
                      value={trackId}
                      disabled={!!busy || pending}
                      onChange={(e) => setTrackId(e.target.value)}
                    >
                      <option value="none">No music</option>
                      {SOCIAL_TRACKS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {t.artist}
                        </option>
                      ))}
                    </select>
                  </label>
                  {trackId !== "none" && (
                    <audio
                      className="mt-3 w-full"
                      controls
                      preload="none"
                      src={SOCIAL_TRACKS.find((t) => t.id === trackId)?.source}
                    />
                  )}
                  <p className="mt-2 text-xs text-neutral-400">
                    These are previewable backing tracks, not platform trending
                    sounds. Instagram remains manual.
                  </p>
                </>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className={button}
                  disabled={!!busy || pending || !platforms.length}
                  onClick={() => void generate()}
                >
                  {pending
                    ? progress || "Creating your scenes in the background…"
                    : busy === "images"
                      ? "Starting…"
                      : result
                        ? "Render updated sequence"
                        : "Generate the three-slide video"}
                </button>
                <button
                  className={secondary}
                  disabled={!promptId}
                  onClick={() => void check()}
                >
                  Check saved progress
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                Two image requests are used for a new visual plan. The second
                uses the first as its identity reference. Completed images are
                saved for deliberate retries. You can leave this tab while
                generation runs.
              </p>
            </details>
          )}
        </>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-400/10 p-4 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {result && (
        <div>
          {result.slideUrls && (
            <div className="grid grid-cols-3 gap-2">
              {result.slideUrls.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="w-full rounded-lg"
                  />
                  <span className="mt-1 block text-center text-xs text-rose-200">
                    Download slide {i + 1}
                  </span>
                </a>
              ))}
            </div>
          )}
          <p className="my-4 text-sm text-neutral-400">
            Use the three images for a TikTok photo carousel, or download the
            MP4 below for TikTok, Reels and Shorts.
          </p>
          <StudioCreator
            key={result.campaignId}
            books={books}
            onSaved={onSaved}
            onNavigate={onNavigate}
            creation={result}
            reviewOnly
          />
        </div>
      )}
    </section>
  );
}
