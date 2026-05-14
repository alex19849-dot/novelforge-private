"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type StoryForm = Record<string, string>;

type SavedStory = {
  id: string;
  title: string;
  updated_at: string;
  form: StoryForm;
  chapters: string[];
  active_chapter_index: number;
  custom_rewrite: string;
  story_state?: any;
};

const defaultForm: StoryForm = {
  title: "",
  relationship: "MM Romance",
  storyLocation: "New York, USA",
  subgenre: "Sports Romance",
  subgenreDetail: "Ice hockey",
  length: "Novella",
  heat: "Explicit adult",
  burnPacing: "Fast burn",
  pov: "First person, dual POV",
  ending: "Happy ending",
  
  tropes: "Enemies to lovers",
  plot: "",
  mustHave: "",
  mustNotHave: "Random object descriptions, Over-described rooms, Cheating",
  characterNotes: "",

  romanceDynamic: "Rival x rival",
  attractionStyle: "Hate attraction",
  attractionFocus: "Mouth, Voice, Body, Competence",
  sexualStyle: "Teasing, Jealous heat, Rough edge",
  spiceTiming: "Middle",

  mmNuance: "Masc x masc, One more emotionally closed, No homophobia plot",
  mfNuance: "Strong heroine, Modern gender roles, Hero falls first",
  ffNuance: "Emotionally layered, strong agency, no stereotypes",

  c1Name: "",
  c1Age: "",
  c1Appearance: "",
  c1Job: "",
  c1Personality: "",
  c1Speech: "",
  c1Flaws: "",
  c1Desire: "",
  c1Fear: "",
  c1Secret: "",
  c1Wound: "",
  c1LoveLanguage: "",
  c1Attachment: "Guarded but loyal",
  c1Jealousy: "Pretends not to care",
  c1Flirting: "Dry teasing",
  c1CustomNotes: "",

  c2Name: "",
  c2Age: "",
  c2Appearance: "",
  c2Job: "",
  c2Personality: "",
  c2Speech: "",
  c2Flaws: "",
  c2Desire: "",
  c2Fear: "",
  c2Secret: "",
  c2Wound: "",
  c2LoveLanguage: "",
  c2Attachment: "Detached until attached",
  c2Jealousy: "Possessive tension",
  c2Flirting: "Cocky banter",
  c2CustomNotes: "",

  setting: "",
  externalConflict: "Career pressure",
  internalConflict: "Trust issues",
  romanticConflict: "Rivals",
  locale: "British English",
  regionVoice: "Neutral British",
  authorFlavour: "Spicy commercial romance",
  voiceStyle: "Commercial romance",
  dialogueStyle: "Natural / grounded",
  proseDensity: "Lean",
  chapterOpener: "Tension heavy",
  endingGlow: "Quiet domestic happiness",
  grounding: "Mundane everyday detail, Physical exhaustion, Realistic awkwardness, Messy emotions",
  avoidStyle: "Purple prose, Therapy-speak, Long dashes, Random setting description",
  intensity: "Dramatic",
  ageBracket: "22 to 30",
};

const relationshipOptions = ["MF Romance", "MM Romance", "FF Romance"];
const lengthOptions = ["Novella", "Short Novel", "Long Novel"];
const subgenreOptions = [
  "Contemporary",
  "Sports Romance",
  "Small Town",
  "Workplace",
  "Dark Romance",
  "Celebrity",
  "Paranormal",
  "Fantasy Romance",
  "Historical",
  "Second Chance",
];
const heatOptions = ["Fade to black", "Mild", "Spicy", "Explicit adult"];
const burnOptions = ["Instant attraction", "Fast burn", "Medium burn", "Slow burn", "Agonising slow burn"];
const tropeOptions = [
  "Enemies to lovers",
  "Friends to lovers",
  "Forced proximity",
  "Fake dating",
  "Second chance",
  "Grumpy / sunshine",
  "Only one bed",
  "Secret child",
  "Forbidden attraction",
  "Celebrity romance",
  "Workplace romance",
  "Small town romance",
  "High angst",
  "Found family",
];
const storyLocationOptions = [
  "New York, USA",
  "California, USA",
  "Southern USA",
  "Midwest USA",
  "London, UK",
  "Northern England, UK",
  "Scotland, UK",
  "Canada",
  "Australia",
  "Neutral International",
];
export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [storyState, setStoryState] = useState<any>({});

  const [form, setForm] = useState<StoryForm>({ ...defaultForm });
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);

  const [chapters, setChapters] = useState<string[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
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

  if (distance > minSwipeDistance) {
    if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
    } else if (activeChapterIndex < chapters.length - 1) {
      setActiveChapterIndex(activeChapterIndex + 1);
      setPageIndex(0);
    }
  }

  if (distance < -minSwipeDistance) {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    } else if (activeChapterIndex > 0) {
      setActiveChapterIndex(activeChapterIndex - 1);
      setPageIndex(0);
    }
  }
}
  const [customRewrite, setCustomRewrite] = useState("");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const activeChapter = chapters[activeChapterIndex] || "";
function splitIntoPages(text: string) {
  const words = text.split(" ");
  const wordsPerPage = 180;

  const pages = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(" "));
  }

  return pages;
}

const pages = splitIntoPages(activeChapter);
  
  const preparedForm = useMemo(() => {
    const next = { ...defaultForm, ...form };
if (next.storyLocation === "New York, USA") {
  next.locale = "American English";
  next.regionVoice = "New York";
  next.setting = "New York";
}

if (next.storyLocation === "California, USA") {
  next.locale = "American English";
  next.regionVoice = "California";
  next.setting = "California";
}

if (next.storyLocation === "Southern USA") {
  next.locale = "American English";
  next.regionVoice = "Southern USA";
  next.setting = "Southern USA";
}

if (next.storyLocation === "Midwest USA") {
  next.locale = "American English";
  next.regionVoice = "Midwest USA";
  next.setting = "Midwest USA";
}

if (next.storyLocation === "London, UK") {
  next.locale = "British English";
  next.regionVoice = "London / South East";
  next.setting = "London";
}

if (next.storyLocation === "Northern England, UK") {
  next.locale = "British English";
  next.regionVoice = "Northern UK";
  next.setting = "Northern England";
}

if (next.storyLocation === "Scotland, UK") {
  next.locale = "British English";
  next.regionVoice = "Scotland";
  next.setting = "Scotland";
}

if (next.storyLocation === "Canada") {
  next.locale = "Canadian English";
  next.regionVoice = "Neutral Canadian";
  next.setting = "Canada";
}

if (next.storyLocation === "Australia") {
  next.locale = "Australian English";
  next.regionVoice = "Australian";
  next.setting = "Australia";
}

if (next.storyLocation === "Neutral International") {
  next.locale = "Neutral International";
  next.regionVoice = "Neutral";
}
    const characterNotes = form.characterNotes || "";
    next.c1CustomNotes = `${next.c1CustomNotes || ""}\n\nGeneral character notes:\n${characterNotes}`.trim();
    next.c2CustomNotes = `${next.c2CustomNotes || ""}\n\nGeneral character notes:\n${characterNotes}`.trim();

    if (next.relationship === "FF Romance") {
      next.mmNuance = "";
      next.mfNuance = "";
    }

    if (next.subgenre === "Sports Romance" && !next.subgenreDetail) {
      next.subgenreDetail = "Ice hockey";
    }

    return next;
  }, [form]);

  const preview = `${preparedForm.relationship} • ${preparedForm.subgenre} • ${preparedForm.length} • ${preparedForm.burnPacing} • ${preparedForm.heat}`;

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

  function updateField(field: string, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function getStoryTitle(formData: StoryForm) {
    return formData.title?.trim() || "Untitled Story";
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

  function createNewStory() {
    setActiveStoryId(null);
    setForm({ ...defaultForm });
    setChapters([]);
    setActiveChapterIndex(0);
    setCustomRewrite("");
    setCopyMessage("");
  }

  async function saveCurrentStory(
    override?: {
  form?: StoryForm;
  chapters?: string[];
  activeChapterIndex?: number;
  customRewrite?: string;
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
    const rewriteToSave = override?.customRewrite ?? customRewrite;
    const storyStateToSave = override?.storyState ?? storyState;

  const payload = {
  user_id: user.id,
  title: getStoryTitle(formToSave),
  form: formToSave,
  chapters: chaptersToSave,
  active_chapter_index: activeIndexToSave,
  custom_rewrite: rewriteToSave,
 story_state: storyStateToSave || {},
  updated_at: new Date().toISOString(),
};

    if (activeStoryId) {
      const { error } = await supabase.from("stories").update(payload).eq("id", activeStoryId);
      setSaving(false);

      if (error) {
        console.error(error);
        return null;
      }

      await loadStories();
      return activeStoryId;
    }

    const { data, error } = await supabase.from("stories").insert(payload).select().single();
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
    setCustomRewrite(story.custom_rewrite || "");
    setStoryState(story.story_state || {});
    setStoryState(story.story_state || {});
    setShowLibrary(false);
    setCopyMessage("");
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
    setChapters([]);
    setActiveChapterIndex(0);

    const response = await fetch("/api/generate-bible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preparedForm),
    });

  const data = await response.json();
const chapter = data.result || "Something went wrong.";
const newStoryState = data.storyState || {};
const newChapters = [chapter];

setStoryState(newStoryState);
    setChapters(newChapters);
    setActiveChapterIndex(0);
    setLoading(false);

    await saveCurrentStory({
  form: preparedForm,
  chapters: newChapters,
  activeChapterIndex,
  customRewrite,
  storyState,
});
  }

  async function continueStory() {
    if (!activeChapter) return;

    setContinueLoading(true);

    const previousChapter = chapters
      .map((chapter, index) => `Chapter ${index + 1}\n${chapter}`)
      .join("\n\n");

    const response = await fetch("/api/continue-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
  form: preparedForm,
  previousChapter,
  nextChapterNumber: chapters.length + 1,
  storyState,
}),
    });

    const data = await response.json();
    const nextChapter = data.result || "Continue failed.";
    const newChapters = [...chapters, nextChapter];
    const newIndex = newChapters.length - 1;

    setChapters(newChapters);
    setActiveChapterIndex(newIndex);
    setContinueLoading(false);

    await saveCurrentStory({
      form: preparedForm,
      chapters: newChapters,
      activeChapterIndex: newIndex,
      customRewrite,
    });
  }

  async function rewriteChapter() {
    if (!activeChapter || !customRewrite.trim()) return;

    setRewriteLoading(true);

    const response = await fetch("/api/rewrite-chapter", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chapter: activeChapter,
    instruction: customRewrite,
    form: preparedForm,
    storyState,
  }),
});
    const data = await response.json();
    const rewritten = data.result || "Rewrite failed.";
    const newChapters = [...chapters];

    newChapters[activeChapterIndex] = rewritten;

    setChapters(newChapters);
    setRewriteLoading(false);

   const newStoryState = data.storyState || storyState;

setStoryState(newStoryState);

await saveCurrentStory({
  form: preparedForm,
  chapters: newChapters,
  activeChapterIndex: 0,
  customRewrite,
  storyState: newStoryState,
});
  }

 async function copyChapter(chapter: string, index: number) {
  try {
    await navigator.clipboard.writeText(chapter);
    setCopyMessage(`Chapter ${index + 1} copied as plain text.`);
    setTimeout(() => setCopyMessage(""), 2500);
  } catch (error) {
    console.error(error);
    setCopyMessage("Could not copy chapter.");
    setTimeout(() => setCopyMessage(""), 2500);
  }
}

  if (loadingAuth) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white grid place-items-center">
        <p className="text-zinc-300">Loading NovelForge...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-stone-950 to-rose-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">NovelForge</h1>
            <p className="text-xs text-rose-300 uppercase tracking-[0.25em]">
              Award-focused romance builder
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {user && (
              <>
                <button onClick={createNewStory} className="nav-button">New Story</button>
                <button onClick={() => setShowLibrary((prev) => !prev)} className="nav-button">
                  Story Library
                </button>
                <button onClick={() => saveCurrentStory()} className="nav-button">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={signOut} className="nav-button">Log Out</button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8">
        {!user && (
          <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <h2 className="text-3xl font-bold mb-3">Log in</h2>
            <p className="text-zinc-300 mb-6">Save stories and continue them across devices.</p>

            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="mb-4 w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
            />

            <button onClick={signIn} className="w-full rounded-2xl bg-rose-500 py-4 font-bold hover:bg-rose-400">
              Send Login Link
            </button>

            {authMessage && <p className="mt-4 text-sm text-rose-200">{authMessage}</p>}
          </div>
        )}

        {user && (
        <div className="w-full max-w-4xl mx-auto">
            <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-4xl font-black">{getStoryTitle(form)}</h2>
                <p className="mt-2 text-zinc-300">
                  Choose the essentials. NovelForge handles the pacing, depth, continuity and messy little human feelings in the background.
                </p>
              </div>

              {showLibrary && (
                <div className="mb-6 rounded-3xl border border-white/10 bg-black/25 p-5">
                  <h3 className="mb-4 text-xl font-bold text-rose-200">Story Library</h3>

                  <div className="grid gap-3">
                    {savedStories.length === 0 && <p className="text-sm text-zinc-400">No saved stories yet.</p>}

                    {savedStories.map((story) => (
                      <div key={story.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
                        <div>
                          <p className="font-bold text-rose-100">{story.title}</p>
                          <p className="text-xs text-zinc-400">{(story.chapters || []).length} chapter{(story.chapters || []).length === 1 ? "" : "s"}</p>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => loadStory(story)} className="small-button">Load</button>
                          <button onClick={() => deleteStory(story.id)} className="small-button">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-5">
                <Card title="Create Story">
                  <Input label="Story Title" field="title" form={form} updateField={updateField} />
<Select
  label="Story Location / Dialect"
  field="storyLocation"
  value={form.storyLocation}
  options={storyLocationOptions}
  updateField={updateField}
/>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select label="Romance Type" field="relationship" value={form.relationship} options={relationshipOptions} updateField={updateField} />
                    <Select label="Story Length" field="length" value={form.length} options={lengthOptions} updateField={updateField} />
                    <Select label="Subgenre" field="subgenre" value={form.subgenre} options={subgenreOptions} updateField={updateField} />
                    <Input label="Subgenre Detail (optional)" field="subgenreDetail" form={form} updateField={updateField} />
                    <Select label="Heat Level" field="heat" value={form.heat} options={heatOptions} updateField={updateField} />
                    <Select label="Burn Pacing" field="burnPacing" value={form.burnPacing} options={burnOptions} updateField={updateField} />
                    <Select label="Main Trope" field="tropes" value={form.tropes} options={tropeOptions} updateField={updateField} />
                  </div>

                  <TextArea label="Story Idea" field="plot" form={form} updateField={updateField} placeholder="Example: rival hockey players forced onto the same line, one has a secret child and a manipulative ex..." />
                  <TextArea label="Character Notes (optional)" field="characterNotes" form={form} updateField={updateField} placeholder="Names, ages, appearance, personalities, secrets, dynamics, anything you already know..." />
                  <TextArea label="Must Avoid" field="mustNotHave" form={form} updateField={updateField} placeholder="Anything you do not want included..." />
                </Card>

                <button onClick={generateStory} className="rounded-2xl bg-rose-500 py-4 text-lg font-bold shadow-2xl hover:bg-rose-400">
                  {loading ? "Generating Chapter 1..." : "Generate Chapter 1"}
                </button>
              </div>
            </section>

           
          </div>
        )}

       {user && chapters.length > 0 && (
  <section className="mx-auto mt-8 max-w-5xl rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={activeChapterIndex}
          onChange={(e) => {
            setActiveChapterIndex(Number(e.target.value));
            setPageIndex(0);
          }}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          {chapters.map((_, index) => (
            <option key={index} value={index}>
              Chapter {index + 1}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            document.getElementById("chapter-reader")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
          className="small-button"
        >
          Chapter Start
        </button>

        <button
          onClick={() =>
            document.getElementById("chapter-end")?.scrollIntoView({
              behavior: "smooth",
              block: "end",
            })
          }
          className="small-button"
        >
          Chapter End
        </button>

        <button
          onClick={() => copyChapter(activeChapter, activeChapterIndex)}
          className="small-button"
        >
          Copy Chapter
        </button>
      </div>
    </div>

    {copyMessage && (
      <p className="mb-4 text-sm text-rose-200">{copyMessage}</p>
    )}

   <div
  id="chapter-reader"
 className="relative rounded-3xl border border-white/10 bg-zinc-950/70"
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
>
     <div className="absolute inset-y-0 left-0 flex items-center">
  <button
    onClick={() => {
      if (pageIndex > 0) {
        setPageIndex(pageIndex - 1);
      } else if (activeChapterIndex > 0) {
        setActiveChapterIndex(activeChapterIndex - 1);
        setPageIndex(0);
      }
    }}
    className="ml-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
  >
    ←
  </button>
</div>

<div className="absolute inset-y-0 right-0 flex items-center">
  <button
    onClick={() => {
      if (pageIndex < pages.length - 1) {
        setPageIndex(pageIndex + 1);
      } else if (activeChapterIndex < chapters.length - 1) {
        setActiveChapterIndex(activeChapterIndex + 1);
        setPageIndex(0);
      }
    }}
    className="mr-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
  >
    →
  </button>
</div>
  <div className="min-h-[72vh] md:min-h-[78vh] px-5 py-8 sm:px-8 md:px-12">
    <div className="mx-auto w-full max-w-[720px]">
      <div className="whitespace-pre-wrap break-words text-left text-[16px] leading-[1.75] text-zinc-100 sm:text-[17px] md:text-[18px]">
        {pages[pageIndex] || ""}
      </div>

      <p className="mt-8 text-center text-xs text-zinc-500">
        Page {pageIndex + 1} of {pages.length}
      </p>

      <div id="chapter-end" />
    </div>
  </div>
</div>

    <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-4 text-2xl font-bold text-rose-200">
        Rewrite Chapter
      </h3>

      <textarea
        value={customRewrite}
        onChange={(event) => setCustomRewrite(event.target.value)}
        placeholder="Example: tighten this, fix flow, make the ex drama more grounded, add more heat, make the dialogue more natural..."
        className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          onClick={rewriteChapter}
          disabled={rewriteLoading || !customRewrite.trim()}
          className="rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700 disabled:opacity-50"
        >
          {rewriteLoading ? "Rewriting..." : "Rewrite This Chapter"}
        </button>

        <button
          onClick={continueStory}
          disabled={continueLoading}
          className="rounded-2xl bg-rose-500 py-3 font-bold hover:bg-rose-400 disabled:opacity-50"
        >
          {continueLoading
            ? "Continuing..."
            : storyState?.shouldWriteEpilogue
            ? "Write Epilogue"
            : `Continue to Chapter ${chapters.length + 1}`}
        </button>
      </div>
    </div>
  </section>
)}
      </section>

      <style jsx>{`
        .nav-button {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          border-radius: 999px;
          padding: 0.6rem 1rem;
          font-size: 0.875rem;
          color: white;
        }

        .nav-button:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .small-button {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(39, 39, 42, 0.9);
          border-radius: 999px;
          padding: 0.55rem 0.95rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: white;
        }

        .small-button:hover {
          background: rgba(63, 63, 70, 1);
        }
      `}</style>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <h3 className="mb-5 text-2xl font-bold text-rose-200">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Input({
  label,
  field,
  form,
  updateField,
}: {
  label: string;
  field: string;
  form: StoryForm;
  updateField: (field: string, value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        value={form[field] || ""}
        onChange={(event) => updateField(field, event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
      />
    </label>
  );
}

function TextArea({
  label,
  field,
  form,
  updateField,
  placeholder = "",
}: {
  label: string;
  field: string;
  form: StoryForm;
  updateField: (field: string, value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea
        value={form[field] || ""}
        onChange={(event) => updateField(field, event.target.value)}
        placeholder={placeholder}
        className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
      />
    </label>
  );
}

function Select({
  label,
  field,
  value,
  options,
  updateField,
}: {
  label: string;
  field: string;
  value: string;
  options: string[];
  updateField: (field: string, value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <select
        value={value || ""}
        onChange={(event) => updateField(field, event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-rose-300">{label}</p>
      <p className="mt-2 text-zinc-100">{value || "Not set"}</p>
    </div>
  );
}
