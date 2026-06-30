"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type StoryForm = Record<string, string>;

type SavedStory = {
  id: string;
  title: string;
  updated_at: string;
  form: StoryForm;
  chapters: string[];
  active_chapter_index: number;
  custom_rewrite?: string;
  story_state?: any;
  chapter_guidance?: string;
};

const defaultForm: StoryForm = {
  title: "",
  plot: "",
  characterNotes: "",
  mustNotHave: "",

  relationship: "MM Romance",
  storyLocation: "London, UK",
  subgenre: "Workplace",
  subgenreDetail: "Office romance",
  heat: "Explicit adult",
  burnPacing: "Fast burn",
  pov: "First person, dual POV",
  ending: "Happy ending",
  tropes: "Gay for you, workplace romance, forced proximity, boss x assistant",
  mustHave: "",

  locale: "British English",
  regionVoice: "London / South East",
  setting: "London",
  authorFlavour: "Spicy commercial romance",
  voiceStyle: "Commercial romance",
  dialogueStyle: "Natural / grounded",
  proseDensity: "Lean",
  chapterOpener: "Character-driven",
  avoidStyle: "Purple prose, therapy-speak, long dashes, over-described rooms",
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [form, setForm] = useState<StoryForm>({ ...defaultForm });
  const [storyState, setStoryState] = useState<any>({});
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);

  const [chapters, setChapters] = useState<string[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [chapterGuidance, setChapterGuidance] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showReaderMenu, setShowReaderMenu] = useState(false);
  const [showStoryBible, setShowStoryBible] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [readerLineHeight, setReaderLineHeight] = useState(1.7);
  const [readerTheme, setReaderTheme] = useState<"light" | "sepia" | "dark">("sepia");
  const [copyMessage, setCopyMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const readerRef = useRef<HTMLDivElement | null>(null);
  const activeChapter = chapters[activeChapterIndex] || "";
  const readerThemeClasses =
  readerTheme === "dark"
    ? "bg-[#111111] text-[#f4ecd8]"
    : readerTheme === "light"
    ? "bg-[#fffaf0] text-[#111111]"
    : "bg-[#f4ecd8] text-[#111111]";
  const preparedForm = useMemo(() => {
    return {
      ...defaultForm,
      ...form,
      locale: "British English",
      regionVoice: "London / South East",
      setting: "London",
    };
  }, [form]);

  useEffect(() => {
    async function initAuth() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user || null);
      setLoadingAuth(false);
    }

    initAuth();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadStories();
    } else {
      setSavedStories([]);
      setActiveStoryId(null);
    }
  }, [user]);

  useEffect(() => {
    setPageIndex(0);
  }, [activeChapterIndex]);

 useEffect(() => {
  const reader = readerRef.current;
  if (!reader) return;

  const maxPage = Math.max(totalPages - 1, 0);
  const safePageIndex = Math.min(pageIndex, maxPage);

  if (safePageIndex !== pageIndex) {
    setPageIndex(safePageIndex);
    return;
  }

  reader.scrollTo({
    left: safePageIndex * reader.clientWidth,
    behavior: "smooth",
  });
}, [pageIndex, totalPages]);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;

    const updatePages = () => {
      const total = Math.ceil(reader.scrollWidth / reader.clientWidth);
      setTotalPages(total || 1);
    };

    setTimeout(updatePages, 80);
    window.addEventListener("resize", updatePages);

    return () => {
      window.removeEventListener("resize", updatePages);
    };
  }, [activeChapter]);

  function updateField(field: string, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function getStoryTitle(formData: StoryForm) {
    const directTitle = formData.title?.trim();
    if (directTitle) return directTitle;

    const firstLine = formData.plot?.split("\n")[0]?.trim();
    if (firstLine) return firstLine.slice(0, 80);

    return "Untitled Story";
  }

  function createNewStory() {
    setActiveStoryId(null);
    setForm({ ...defaultForm });
    setStoryState({});
    setChapters([]);
    setActiveChapterIndex(0);
    setPageIndex(0);
    setChapterGuidance("");
    setCopyMessage("");
    setShowLibrary(false);
  }

  async function signIn() {
    if (!email.trim()) {
      setAuthMessage("Enter your email first.");
      return;
    }

    setAuthMessage("Sending login link...");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    setAuthMessage(error ? error.message : "Check your email for the login link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    createNewStory();
  }

  async function loadStories() {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setSavedStories((data || []) as SavedStory[]);
  }

  async function saveCurrentStory(
    override?: {
      form?: StoryForm;
      chapters?: string[];
      activeChapterIndex?: number;
      chapterGuidance?: string;
      storyState?: any;
    }
  ) {
    if (!user) {
      setAuthMessage("Log in first so it can save to the cloud.");
      return null;
    }

    setSaving(true);

    const formToSave = override?.form || preparedForm;
    const chaptersToSave = override?.chapters || chapters;
    const activeIndexToSave = override?.activeChapterIndex ?? activeChapterIndex;
    const guidanceToSave = override?.chapterGuidance ?? chapterGuidance;
    const storyStateToSave = override?.storyState ?? storyState;

    const payload = {
      user_id: user.id,
      title: getStoryTitle(formToSave),
      form: formToSave,
      chapters: chaptersToSave,
      active_chapter_index: activeIndexToSave,
      custom_rewrite: guidanceToSave,
      story_state: storyStateToSave || {},
      updated_at: new Date().toISOString(),
    };

    if (activeStoryId) {
      const { error } = await supabase
        .from("stories")
        .update(payload)
        .eq("id", activeStoryId);

      setSaving(false);

      if (error) {
        console.error(error);
        return null;
      }

      await loadStories();
      return activeStoryId;
    }

    const { data, error } = await supabase
      .from("stories")
      .insert(payload)
      .select()
      .single();

    setSaving(false);

    if (error) {
      console.error(error);
      return null;
    }

    setActiveStoryId(data.id);
    await loadStories();
    return data.id;
  }

  function loadStory(story: SavedStory) {
    setActiveStoryId(story.id);
    setForm({ ...defaultForm, ...story.form });
    setChapters(story.chapters || []);
    setActiveChapterIndex(story.active_chapter_index || 0);
    setStoryState(story.story_state || {});
    setChapterGuidance(story.chapter_guidance || story.custom_rewrite || "");
    setShowLibrary(false);
    setCopyMessage("");
    setPageIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteStory(id: string) {
    if (!window.confirm("Delete this saved story?")) return;

    await supabase.from("stories").delete().eq("id", id);

    if (activeStoryId === id) createNewStory();
    await loadStories();
  }

  async function generateStory() {
    if (!user) {
      setAuthMessage("Log in first so the story can save across devices.");
      return;
    }

    setLoading(true);
    setCopyMessage("");
    setChapters([]);
    setActiveChapterIndex(0);
    setPageIndex(0);

    try {
      const response = await fetch("/api/generate-bible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preparedForm),
      });

      if (!response.ok) {
        throw new Error(`Generate failed: ${response.status}`);
      }

      const data = await response.json();
      const chapter = data.result || "Something went wrong.";
      const newStoryState = data.storyState || {};
      const newChapters = [chapter];

      setStoryState(newStoryState);
      setChapters(newChapters);
      setActiveChapterIndex(0);

      await saveCurrentStory({
        form: preparedForm,
        chapters: newChapters,
        activeChapterIndex: 0,
        chapterGuidance,
        storyState: newStoryState,
      });
    } catch (error) {
      console.error("Generate story error:", error);
      setCopyMessage(error instanceof Error ? error.message : "Generate failed.");
    } finally {
      setLoading(false);
    }
  }

  async function continueStory() {
    if (!activeChapter) return;

    setContinueLoading(true);
    setCopyMessage("");

    try {
      const previousChapter = chapters.slice(-1).join("\n\n");

      const response = await fetch("/api/continue-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: preparedForm,
          previousChapter,
          nextChapterNumber: chapters.length + 1,
          storyState,
          chapterGuidance,
        }),
      });

      if (!response.ok) {
        throw new Error(`Continue failed: ${response.status}`);
      }

   const data = await response.json();

if (data.incomplete) {
  throw new Error(data.result || "Chapter generation was incomplete.");
}

if (!data.result) {
  throw new Error("No chapter returned.");
}

const nextChapter = data.result;
      const newStoryState = data.storyState || storyState;
      const newChapters = [...chapters, nextChapter];
      const newIndex = newChapters.length - 1;

      setChapters(newChapters);
      setActiveChapterIndex(newIndex);
      setStoryState(newStoryState);
      setPageIndex(0);

      await saveCurrentStory({
        form: preparedForm,
        chapters: newChapters,
        activeChapterIndex: newIndex,
        chapterGuidance,
        storyState: newStoryState,
      });
    } catch (error) {
      console.error("Continue story error:", error);
      setCopyMessage(error instanceof Error ? error.message : "Continue failed.");
    } finally {
      setContinueLoading(false);
    }
  }

  async function rewriteChapter() {
    if (!activeChapter || !chapterGuidance.trim()) return;

    setRewriteLoading(true);
    setCopyMessage("");

    try {
      const response = await fetch("/api/rewrite-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter: activeChapter,
          instruction: chapterGuidance,
          form: preparedForm,
          storyState,
        }),
      });

      if (!response.ok) {
        throw new Error(`Rewrite failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.result) {
        throw new Error("No rewritten chapter returned.");
      }

      const rewritten = data.result;
      const newStoryState = data.storyState || storyState;
      const newChapters = [...chapters];

      newChapters[activeChapterIndex] = rewritten;

      setChapters(newChapters);
      setStoryState(newStoryState);

      await saveCurrentStory({
        form: preparedForm,
        chapters: newChapters,
        activeChapterIndex,
        chapterGuidance,
        storyState: newStoryState,
      });
    } catch (error) {
      console.error("Rewrite chapter error:", error);
      setCopyMessage(error instanceof Error ? error.message : "Rewrite failed.");
    } finally {
      setRewriteLoading(false);
    }
  }

  async function copyChapter() {
    if (!activeChapter) return;

    try {
      await navigator.clipboard.writeText(activeChapter);
      setCopyMessage(`Chapter ${activeChapterIndex + 1} copied.`);
      setTimeout(() => setCopyMessage(""), 2500);
    } catch (error) {
      console.error(error);
      setCopyMessage("Could not copy chapter.");
      setTimeout(() => setCopyMessage(""), 2500);
    }
  }

function previousPage() {
  if (pageIndex > 0) {
    setPageIndex(pageIndex - 1);
    return;
  }

  if (activeChapterIndex > 0) {
    setActiveChapterIndex(activeChapterIndex - 1);
    setPageIndex(9999);
  }
}

  function nextPage() {
    if (pageIndex < totalPages - 1) {
      setPageIndex(pageIndex + 1);
      return;
    }

    if (activeChapterIndex < chapters.length - 1) {
      setActiveChapterIndex(activeChapterIndex + 1);
      setPageIndex(0);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  }

  function handleTouchMove(e: React.TouchEvent) {
    setTouchEndX(e.targetTouches[0].clientX);
  }

  function handleTouchEnd() {
    if (touchStartX === null || touchEndX === null) return;

    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) nextPage();
    if (distance < -minSwipeDistance) previousPage();
  }

  if (loadingAuth) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4ecd8] text-[#111111]">
        <p>Loading NovelForge...</p>
      </main>
    );
  }

  return (
    <main className={`min-h-screen ${readerThemeClasses}`}>
      <header className={`${chapters.length > 0 ? "hidden" : "sticky"} top-0 z-50 border-b border-[#d6c5a3] bg-[#efe3c8]/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-2xl font-black tracking-tight">NovelForge</h1>

          <nav className="flex flex-wrap items-center gap-2">
            {user ? (
              <>
                <button onClick={createNewStory} className="top-button">
                  New Story
                </button>
                <button onClick={() => setShowLibrary((prev) => !prev)} className="top-button">
                  Story Library
                </button>
                <button onClick={() => saveCurrentStory()} className="top-button">
                  {saving ? "Saving..." : "Save Story"}
                </button>
                <button onClick={signOut} className="top-button">
                  Log Out
                </button>
              </>
            ) : (
              <span className="text-sm font-semibold">Log in to save stories</span>
            )}
          </nav>
        </div>
      </header>

      {!user && (
        <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-xl place-items-center px-4">
          <div className="w-full rounded-3xl border border-[#d6c5a3] bg-[#efe3c8] p-6 shadow-xl">
            <h2 className="mb-2 text-3xl font-black">Log in</h2>
            <p className="mb-5 text-sm text-black/70">
              Enter your email and NovelForge will send a login link.
            </p>

            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="mb-4 w-full rounded-2xl border border-[#d6c5a3] bg-[#f9f2df] px-4 py-3 outline-none"
            />

            <button onClick={signIn} className="primary-button w-full">
              Send Login Link
            </button>

            {authMessage && <p className="mt-4 text-sm font-semibold">{authMessage}</p>}
          </div>
        </section>
      )}

      {user && showLibrary && (
        <section className="mx-auto max-w-4xl px-4 py-6">
          <div className="rounded-3xl border border-[#d6c5a3] bg-[#efe3c8] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black">Story Library</h2>
              <button onClick={() => setShowLibrary(false)} className="secondary-button">
                Close
              </button>
            </div>

            <div className="grid gap-3">
              {savedStories.length === 0 && (
                <p className="text-sm text-black/60">No saved stories yet.</p>
              )}

              {savedStories.map((story) => (
                <div
                  key={story.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d6c5a3] bg-[#f9f2df] p-4"
                >
                  <div>
                    <p className="font-bold">{story.title}</p>
                    <p className="text-xs text-black/60">
                      {(story.chapters || []).length} chapter
                      {(story.chapters || []).length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => loadStory(story)} className="secondary-button">
                      Load
                    </button>
                    <button onClick={() => deleteStory(story.id)} className="secondary-button">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {user && (chapters.length === 0 || showStoryBible) && (
        <section className="mx-auto max-w-4xl px-4 py-8">
          <div className="rounded-3xl border border-[#d6c5a3] bg-[#efe3c8] p-5 shadow-xl">
            <div className="mb-6">
              {chapters.length > 0 && (
  <button
    onClick={() => setShowStoryBible(false)}
    className="mb-4 reader-button"
  >
    ← Back to Reader
  </button>
)}
              <h2 className="text-3xl font-black">
  {chapters.length > 0 ? "Story Bible" : "New Story"}
</h2>
              <p className="mt-2 text-sm text-black/70">
                Three boxes. No cockpit full of buttons. Humanity learns.
              </p>
            </div>

            <div className="grid gap-4">
              <TextArea
                label="Story Idea"
                field="plot"
                form={form}
                updateField={updateField}
                placeholder="Paste the full story idea here."
                tall
              />

              <TextArea
                label="Characters"
                field="characterNotes"
                form={form}
                updateField={updateField}
                placeholder="Paste character details, side characters, family, appearances, ages, dynamics, secrets and anything important."
                tall
              />

              <TextArea
                label="Must Avoid"
                field="mustNotHave"
                form={form}
                updateField={updateField}
                placeholder="Paste anything the story must avoid."
              />

              <button onClick={generateStory} disabled={loading} className="primary-button">
                {loading ? "Generating..." : "Generate Story"}
              </button>
            </div>
          </div>
        </section>
      )}

      {user && chapters.length > 0 && (
        <section className={`min-h-screen ${readerThemeClasses}`}>
          <div className="sticky top-0 z-40 border-b border-[#d6c5a3] bg-[#efe3c8]/95 px-3 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
              <select
                value={activeChapterIndex}
                onChange={(event) => {
                  setActiveChapterIndex(Number(event.target.value));
                  setPageIndex(0);
                }}
                className="min-w-[160px] flex-1 rounded-xl border border-[#d6c5a3] bg-[#f9f2df] px-3 py-2 text-sm font-semibold outline-none"
              >
                {chapters.map((_, index) => (
                  <option key={index} value={index}>
                    Chapter {index + 1}
                  </option>
                ))}
              </select>

           <button
  onClick={() => setShowReaderMenu((prev) => !prev)}
  className="reader-button"
>
  ☰ Menu
</button>
            {showReaderMenu && (
  <div className="absolute right-3 top-14 z-50 grid min-w-[180px] gap-2 rounded-2xl border border-[#d6c5a3] bg-[#f9f2df] p-3 shadow-xl">
    <button onClick={createNewStory} className="reader-button">
      New Story
    </button>

    <button onClick={() => setShowLibrary((prev) => !prev)} className="reader-button">
      Story Library
    </button>

    <button
      onClick={() => {
        setShowStoryBible(true);
        setShowReaderMenu(false);
      }}
      className="reader-button"
    >
      Story Bible
    </button>

    <hr className="border-[#d6c5a3]" />

    <label className="text-sm font-semibold">Font Size</label>

    <input
      type="range"
      min="14"
      max="28"
      value={readerFontSize}
      onChange={(e) => setReaderFontSize(Number(e.target.value))}
    />

    <label className="text-sm font-semibold">Line Spacing</label>

    <input
      type="range"
      min="1.3"
      max="2.2"
      step="0.1"
      value={readerLineHeight}
      onChange={(e) => setReaderLineHeight(Number(e.target.value))}
    />

    <hr className="border-[#d6c5a3]" />

    <button onClick={() => saveCurrentStory()} className="reader-button">
      Save Story
    </button>

    <button onClick={copyChapter} className="reader-button">
      Copy Chapter
    </button>
  </div>
)}
            </div>
          </div>

          {copyMessage && (
            <p className="mx-auto max-w-4xl px-4 pt-3 text-sm font-semibold text-[#7a5c3e]">
              {copyMessage}
            </p>
          )}

          <div
  id="chapter-reader"
  className={`relative h-[calc(100vh-70px)] overflow-hidden ${
    readerTheme === "dark"
      ? "bg-[#111111]"
      : readerTheme === "light"
      ? "bg-[#fffaf0]"
      : "bg-[#f4ecd8]"
  }`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <button
              onClick={previousPage}
              className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-[#d6c5a3]/70 px-4 py-3 text-2xl font-black hover:bg-[#d6c5a3] md:block"
            >
              ←
            </button>

            <button
              onClick={nextPage}
              className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-[#d6c5a3]/70 px-4 py-3 text-2xl font-black hover:bg-[#d6c5a3] md:block"
            >
              →
            </button>

            <div className="flex h-full items-start justify-center px-5 py-7 md:px-24">
              <div className="flex h-full w-full max-w-[820px] flex-col overflow-hidden">
                <div ref={readerRef} className="h-[calc(100%-34px)] overflow-hidden">
                  <div
                  className={`h-full whitespace-pre-wrap text-left ${
  readerTheme === "dark" ? "text-[#f4ecd8]" : "text-[#111111]"
}`}
style={{
  fontSize: `${readerFontSize}px`,
  lineHeight: readerLineHeight,
  columnWidth: `${readerRef.current?.clientWidth || 820}px`,
  columnGap: "0px",
}}
                  >
                    {activeChapter}
                  </div>
                </div>

                <p className="mt-3 text-center text-xs text-black/50">
                  Page {pageIndex + 1} of {totalPages}
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-4xl px-4 py-6">
            <div className="rounded-3xl border border-[#d6c5a3] bg-[#efe3c8] p-5 shadow-xl">
              <label className="grid gap-2">
                <span className="text-sm font-bold">Chapter Guidance</span>
                <textarea
                  value={chapterGuidance}
                  onChange={(event) => setChapterGuidance(event.target.value)}
                  placeholder="Add guidance for the next chapter or instructions for rewriting the current chapter."
                  className="min-h-[130px] w-full rounded-2xl border border-[#d6c5a3] bg-[#f9f2df] px-4 py-3 text-black outline-none"
                />
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={rewriteChapter}
                  disabled={rewriteLoading || !chapterGuidance.trim()}
                  className="secondary-action-button"
                >
                  {rewriteLoading ? "Rewriting..." : "Rewrite Current Chapter"}
                </button>

                <button
                  onClick={continueStory}
                  disabled={continueLoading}
                  className="primary-button"
                >
                  {continueLoading
                    ? "Generating..."
                    : `Generate Chapter ${chapters.length + 1}`}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <style jsx>{`
        .top-button,
        .reader-button,
        .secondary-button {
          border: 1px solid #d6c5a3;
          background: #f9f2df;
          color: #111111;
          border-radius: 999px;
          padding: 0.55rem 0.9rem;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .top-button:hover,
        .reader-button:hover,
        .secondary-button:hover {
          background: #efe3c8;
        }

        .primary-button {
          border-radius: 1rem;
          background: #7a5c3e;
          color: white;
          padding: 0.9rem 1.1rem;
          font-weight: 900;
          text-align: center;
        }

        .primary-button:hover {
          background: #8d6e4a;
        }

        .primary-button:disabled {
          opacity: 0.55;
        }

        .secondary-action-button {
          border-radius: 1rem;
          border: 1px solid #d6c5a3;
          background: #f9f2df;
          color: #111111;
          padding: 0.9rem 1.1rem;
          font-weight: 900;
          text-align: center;
        }

        .secondary-action-button:hover {
          background: #f4ecd8;
        }

        .secondary-action-button:disabled {
          opacity: 0.55;
        }
      `}</style>
    </main>
  );
}

function TextArea({
  label,
  field,
  form,
  updateField,
  placeholder = "",
  tall = false,
}: {
  label: string;
  field: string;
  form: StoryForm;
  updateField: (field: string, value: string) => void;
  placeholder?: string;
  tall?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold">{label}</span>
      <textarea
        value={form[field] || ""}
        onChange={(event) => updateField(field, event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border border-[#d6c5a3] bg-[#f9f2df] px-4 py-3 text-black outline-none ${
          tall ? "min-h-[220px]" : "min-h-[120px]"
        }`}
      />
    </label>
  );
}
