"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { StudioBook } from "../../lib/social-creative-directions";
import type { SocialPlatform } from "../../lib/social-calendar";
import type { ScenePlan, SceneDelivery } from "../../lib/social-scene-slides";
import { SCENE_CHANNELS, sceneSeconds } from "../../lib/social-scene-slides";
import { SOCIAL_TRACKS, SCENE_MOODS, type SceneMusicMood } from "../../lib/social-music";
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
    [delivery, setDelivery] = useState<SceneDelivery>("automatic"),
    [trackId, setTrackId] = useState(""),
    [busy, setBusy] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<any[]>([]);
  const [musicMood, setMusicMood] = useState<SceneMusicMood | "auto">("auto");
  const [musicManual, setMusicManual] = useState(false);
  const [musicExcluded, setMusicExcluded] = useState<string[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState("");
  const sceneMusicKey = JSON.stringify(plan && [plan.hook, plan.slides]);
  useEffect(() => {
    if (!plan || pending || delivery !== "automatic" || musicManual) return;
    let live = true;
    const controller = new AbortController();
    setMusicLoading(true);
    setMusicError("");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch("/api/social-studio/slides", {
            method: "POST", headers: await headers(), signal: controller.signal,
            body: JSON.stringify({action:"music", promptId, plan, mood:musicMood, exclude:musicExcluded}),
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error || "Music could not be matched.");
          if (live) setTrackId(d.trackId);
        } catch (e) {
          if (live) { setTrackId(""); setMusicError(e instanceof Error ? e.message : "Music could not be matched."); }
        } finally { if (live) setMusicLoading(false); }
      })();
    }, 350);
    return () => {live=false; clearTimeout(timer); controller.abort();};
  }, [sceneMusicKey, promptId, musicMood, musicExcluded, delivery, musicManual, pending]);
  const selectedTrack = SOCIAL_TRACKS.find(t => t.id === trackId);
  const musicChanged = !!result && (result.delivery !== delivery || (delivery === "automatic" && (musicLoading || !!musicError || (result.trackId ?? "none") !== trackId)));
  const [progress, setProgress] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
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
      setPhotos(d.previewUrls ?? []);
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
        if (pending || !result) {
          setDelivery(d.result.delivery ?? "automatic");
          setTrackId(d.result.trackId ?? "none");
          setMusicManual(true);
          setMusicLoading(false);
        }
        setResult(d.result);
        setPending(false);
        setBusy("");
        setError("");
      } else if (d.status === "idle" && pending) {
        setPending(false);
        setError("Your scene plan is saved. Select Create my slides to start its images without recreating the plan.");
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
  async function makePlan(andGenerate = false) {
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
      setMusicManual(andGenerate);
      setMusicMood("auto");
      setMusicExcluded([]);
      setTrackId(andGenerate ? "auto" : "");
      setPlan(d.plan);
      setPromptId(d.id);
      setPhotos([]);
      setResult(null);
      if (andGenerate) {
        setBusy("images");
        setMusicLoading(false);
        setPending(true);
        setProgress("Starting your scene task…");
        const queued = await fetch("/api/social-studio/slides", {
          method:"POST", headers:await headers(),
          body:JSON.stringify({action:"generate",promptId:d.id,requestId:crypto.randomUUID(),plan:d.plan,platforms,delivery:"automatic",trackId:"auto"}),
          signal:AbortSignal.timeout(60000),
        });
        const q=await queued.json();
        if(!queued.ok) {setPending(false); throw Error(q.error || "Your sequence could not start.");}
        setDelivery("automatic");
        setProgress("Creating your scenes in the background…");
        setPending(true);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The sequence could not be generated.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function generate() {
    if (lock.current || !plan || !promptId || (delivery === "automatic" && (musicLoading || !trackId))) return;
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
  function chooseBook(value:string) {
    setSlug(value); setPhotos([]); setPlan(null); setDelivery("automatic");
    setMusicManual(false); setMusicLoading(false); setMusicError(""); setMusicExcluded([]);
    setMusicMood("auto"); setTrackId(""); setPromptId(""); setResult(null);
    setError(""); setExcerpt(""); setCastNotes(""); setNotes("");
  }
  const selectedBook=books.find(b=>b.slug===slug);
  return (
    <section className="space-y-5" aria-label="Create romantic scene slides">
      <div>
        <h2 className="text-2xl font-semibold">
          Tell the story in three slides.
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Choose a book and Studio creates the story moments, distinct realistic
          adult characters, readable slides, cover reveal, music and platform captions.
          No scene hunting or character descriptions needed.
        </p>
      </div>
      {!selectedBook ? (
        <div aria-label="Choose your book by its cover" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map(item => (
            <button key={item.slug} type="button" disabled={!!busy || pending} onClick={() => chooseBook(item.slug)}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/70 text-left hover:border-rose-200/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-200 disabled:opacity-40">
              <div className="flex h-52 items-center justify-center bg-black/30 p-4">
                <img src={item.coverUrl} alt={`${item.title} cover`} loading="lazy" className="h-full max-w-full object-contain shadow-xl" />
              </div>
              <div className="p-4"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-neutral-400">{item.subgenre}</p></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-neutral-900/60 p-4">
          <img src={selectedBook.coverUrl} alt={`${selectedBook.title} selected cover`} className="h-24 w-16 object-contain" />
          <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-widest text-rose-200">Selected book</p><h3 className="mt-1 text-xl font-semibold">{selectedBook.title}</h3></div>
          <button type="button" className={secondary} disabled={!!busy || pending} onClick={() => chooseBook("")}>Change book</button>
        </div>
      )}
      {!!slug && (
        <>
          <div className="rounded-2xl border border-rose-200/20 bg-rose-200/5 p-4">
            <button className={button + " w-full"} disabled={!!busy || pending} onClick={() => void (plan && !result ? generate() : makePlan(true))}>
              {pending ? progress || "Creating your slides…" : busy === "plan" ? "Reading your book and finding a fresh hook…" : busy === "images" ? "Starting your scenes…" : result ? "Create another unique sequence" : "Create my slides"}
            </button>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              Studio uses your saved story and character details when available, chooses a new moment
              and varies the visual treatment against recent sequences. Review the finished video,
              then choose posting times. You can leave this page while the images render.
            </p>
          </div>
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
                        const prior = row.poster_result;
                        const priorDelivery = prior?.delivery ?? prior?.slidesRecovery?.delivery;
                        setDelivery(priorDelivery ?? "automatic");
                        const priorTrack = prior?.trackId ?? prior?.slidesRecovery?.trackId;
                        setTrackId(priorTrack ?? (priorDelivery ? "none" : ""));
                        setMusicManual(!!priorTrack || !!priorDelivery);
                        setMusicExcluded([]);
                        setMusicError("");
                        setMusicLoading(false);
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
            className="rounded-2xl border border-white/10 p-4"
          >
            <summary className="cursor-pointer text-lg font-semibold">
              Optional overrides
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
              Leave everything blank for automatic creation. Studio reads the saved
              book itself. Add a passage only if you want that exact wording used.
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
              className="rounded-2xl border border-white/10 p-4"
            >
              <summary className="cursor-pointer text-lg font-semibold">
                Adjust scenes, appearance or music (optional)
              </summary>
              <p className="mt-3 text-sm text-rose-200">
                {plan.sourceMode === "excerpt"
                  ? "Exact manuscript excerpts"
                  : "Original story-based teaser, not a manuscript quote"}
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
                <select className={field} value={delivery} disabled={!!busy || pending}
                  onChange={e => {setDelivery(e.target.value as SceneDelivery); setMusicLoading(false); if (e.target.value === "automatic") {setMusicManual(false); setTrackId("");}}}>
                  <option value="automatic">Automatic music and scheduling</option>
                  <option value="native">Add platform music yourself (manual posting)</option>
                </select>
              </label>
              {delivery === "native" ? (
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Optional clean export. Download the video and finish it in the platform app.
                  This version saves as a draft and does not publish automatically.
                </p>
              ) : (
                <div className="mt-3 rounded-xl border border-rose-200/20 bg-rose-200/5 p-4">
                  <label className="block text-sm">
                    Soundtrack mood
                    <select className={field} value={musicMood} disabled={!!busy || pending}
                      onChange={e => {setMusicMood(e.target.value as SceneMusicMood | "auto"); setMusicManual(false); setMusicExcluded([]);}}>
                      <option value="auto">Match the scene automatically</option>
                      {SCENE_MOODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                  <label className="mt-3 block text-sm">
                    Track
                    <select className={field} value={trackId} disabled={!!busy || pending || musicLoading}
                      onChange={e => {setTrackId(e.target.value); setMusicManual(true); setMusicError("");}}>
                      {!trackId && <option value="">{musicLoading ? "Matching music…" : "Choose a track"}</option>}
                      {trackId === "auto" && <option value="auto">Match music automatically</option>}
                      <option value="none">No music</option>
                      {SOCIAL_TRACKS.filter(t => !t.legacy || t.id === trackId).map(t => <option key={t.id} value={t.id}>{t.title} · {t.artist}</option>)}
                    </select>
                  </label>
                  {selectedTrack && !musicLoading && <>
                    <p className="mt-3 text-sm text-rose-100">{selectedTrack.description}</p>
                    <audio key={trackId} className="mt-3 w-full" controls preload="none" aria-label={`Preview ${selectedTrack.title}`}
                      src={selectedTrack.source + `#t=${selectedTrack.start ?? 8},${(selectedTrack.start ?? 8) + (selectedTrack.seconds ?? 40)}`} />
                  </>}
                  <button type="button" className={secondary + " mt-3"} disabled={!!busy || pending || musicLoading}
                    onClick={() => {setMusicManual(false); setMusicExcluded(prev => [...prev, trackId].filter(Boolean).slice(-30));}}>
                    {musicLoading ? "Matching music…" : "Change track"}
                  </button>
                  {musicError && <p role="alert" className="mt-3 text-sm text-red-200">{musicError}</p>}
                  <p className="mt-3 text-sm leading-6 text-neutral-300">
                    Music is included in the finished video. Recent tracks are rotated within the chosen mood.
                    Preview, then schedule TikTok and YouTube Shorts here. Instagram remains manual.
                  </p>
                  <p className="mt-2 text-xs text-neutral-400">Licensed backing music, not platform trending sounds. No extra subscription.</p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className={button}
                  disabled={!!busy || pending || !platforms.length || (delivery === "automatic" && (musicLoading || !trackId))}
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
      {!result && photos.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-neutral-400">
            Saved scene photographs
          </p>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`Saved scene photo ${i + 1}`}
                className="w-full rounded-xl"
              />
            ))}
          </div>
        </div>
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
          {musicChanged && <p role="status" className="my-4 rounded-xl border border-rose-200/30 p-4 text-sm text-rose-100">
            Your soundtrack choice has changed. Open the optional adjustments and select Render updated sequence before scheduling.
            Saved scene photographs are reused, with no new image requests.
          </p>}
          {!musicChanged && <StudioCreator
            key={result.campaignId}
            books={books}
            onSaved={onSaved}
            onNavigate={onNavigate}
            creation={result}
            reviewOnly
          />}
        </div>
      )}
    </section>
  );
}
