"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
};

type TabName = "story" | "characters" | "spark";

const relationshipTypes = ["MM Romance", "MF Romance"];

const subgenreOptions = [
  "Contemporary",
  "Small Town",
  "Sports Romance",
  "Dark Romance",
  "Workplace",
  "Celebrity",
  "Paranormal",
  "Billionaire",
  "Second Chance",
  "Fantasy Romance",
  "Historical",
  "Custom",
];

const sportOptions = [
  "Ice hockey",
  "Football",
  "Rugby",
  "Boxing",
  "MMA",
  "Wrestling",
  "Basketball",
  "Baseball",
  "Motor racing",
  "Swimming",
  "Athletics",
  "Dance",
  "Custom",
];

const lengthOptions = ["Novella", "Short Novel", "Long Novel"];

const heatOptions = ["Fade to black", "Mild", "Spicy", "Explicit adult"];

const burnOptions = [
  "Instant attraction",
  "Fast burn",
  "Medium burn",
  "Slow burn",
  "Agonising slow burn",
];

const povOptions = [
  "First person, single POV",
  "First person, dual POV",
  "Third person, single POV",
  "Third person, dual POV",
  "Alternating POV",
];

const endingOptions = ["Happy ending", "Happy for now", "Bittersweet", "Cliffhanger"];

const tropeOptions = [
  "Enemies to lovers",
  "Friends to lovers",
  "Forced proximity",
  "Fake dating",
  "Second chance",
  "Grumpy / sunshine",
  "Only one bed",
  "Hurt / comfort",
  "Forbidden attraction",
  "Secret child",
  "Secret relationship",
  "Opposites attract",
  "Slow burn",
  "High angst",
  "Protective lead",
  "Found family",
  "Jealousy",
];

const romanceDynamicOptions = [
  "Equals / balanced",
  "Protective x guarded",
  "Golden retriever x black cat",
  "Ice king x chaos",
  "Sunshine x cynic",
  "Rival x rival",
  "Forbidden pull",
  "Caregiver x independent",
  "Dom energy x brat energy",
  "Quiet intensity x loud confidence",
  "Rich x working class",
  "Celebrity x normal person",
  "Boss x employee",
  "Teammates",
  "Best friend's sibling",
  "Exes",
  "Enemy captains",
  "Fake relationship pairing",
  "Forced roommates",
  "Custom",
];

const attractionStyleOptions = [
  "Instant punch",
  "Reluctant noticing",
  "Slow awareness",
  "Denial",
  "Hate attraction",
  "Admiration first",
  "Friendship first",
  "Lust first",
  "Emotional first",
  "Custom",
];

const attractionFocusOptions = [
  "Face",
  "Smile",
  "Mouth",
  "Voice",
  "Scent",
  "Hands",
  "Body",
  "Intelligence",
  "Confidence",
  "Kindness",
  "Competence",
  "Vulnerability",
  "Humour",
  "Mystery",
];

const sexualStyleOptions = [
  "Teasing",
  "Filthy talk",
  "Dominant",
  "Playful",
  "Intense emotional",
  "Rough edge",
  "Worshipful",
  "Desperate",
  "Tender",
  "Possessive",
  "Experimental",
  "Jealous heat",
  "Forbidden heat",
  "Slow simmer heat",
  "Custom",
];

const spiceTimingOptions = ["Early", "Middle", "Late", "Very late payoff"];

const mmNuanceOptions = [
  "Masc x masc",
  "Masc x softer",
  "Switch dynamic",
  "One more emotionally closed",
  "Queer identity themes",
  "Coming out not central",
  "Coming out subplot",
  "Found queer community",
  "No homophobia plot",
];

const mfNuanceOptions = [
  "Strong heroine",
  "Soft but not weak heroine",
  "Protective hero",
  "Morally grey hero",
  "Modern gender roles",
  "Traditional tension",
  "Heroine saves herself",
  "Hero falls first",
  "Heroine falls first",
];

const jobOptions = [
  "Ice hockey player",
  "Footballer",
  "Rugby player",
  "Coach",
  "Team doctor",
  "Physio",
  "Sports journalist",
  "Agent",
  "Club owner",
  "Business owner",
  "Tradesperson",
  "Doctor / Nurse",
  "Teacher",
  "Artist",
  "Musician",
  "Writer",
  "Chef",
  "Bar owner",
  "Police / Firefighter",
  "Military",
  "Adult student",
  "Unemployed / rebuilding life",
  "Custom",
];

const personalityOptions = [
  "Grumpy",
  "Sunshine",
  "Guarded",
  "Confident",
  "Shy",
  "Funny",
  "Sarcastic",
  "Soft-hearted",
  "Hot-headed",
  "Protective",
  "Ambitious",
  "Chaotic",
  "Quiet",
  "Dominant",
  "Nurturing",
  "Flirty",
  "Awkward",
  "Loyal",
  "Broken but trying",
];

const speechOptions = [
  "Swears naturally",
  "Dry sarcasm",
  "Blunt speaker",
  "Shy speaker",
  "Affectionate teasing",
  "Emotionally guarded",
  "Playful flirt",
  "Quiet intensity",
  "Uses humour to deflect",
  "Short answers under stress",
];

const flawOptions = [
  "Trust issues",
  "Commitment issues",
  "Jealous",
  "Emotionally closed off",
  "People pleaser",
  "Impulsive",
  "Workaholic",
  "Self-sabotaging",
  "Afraid of vulnerability",
  "Bad temper",
  "Overprotective",
  "Runs from conflict",
];

const desireOptions = [
  "To be loved properly",
  "To feel safe",
  "To escape their past",
  "To prove themselves",
  "To build a family",
  "To belong somewhere",
  "To be chosen",
  "To start over",
  "To protect someone",
  "To finally trust",
];

const fearOptions = [
  "Being abandoned",
  "Being rejected",
  "Losing control",
  "Getting hurt again",
  "Being trapped",
  "Being truly known",
  "Letting someone down",
  "Repeating the past",
  "Being vulnerable",
  "Failing the people they love",
];

const secretOptions = [
  "No major secret",
  "Secret child",
  "Hidden debt",
  "Criminal past",
  "Family scandal",
  "Fake identity",
  "Secret illness",
  "Secret inheritance",
  "Hidden heartbreak",
  "Secret engagement",
  "Carrying guilt",
  "Custom",
];

const woundOptions = [
  "Abandonment",
  "Betrayal",
  "Public humiliation",
  "Family rejection",
  "Past relationship damage",
  "Career failure",
  "Financial hardship",
  "Grief",
  "Body insecurity",
  "Emotional neglect",
  "Custom",
];

const loveLanguageOptions = [
  "Acts of service",
  "Physical touch",
  "Words of affirmation",
  "Quality time",
  "Gifts",
  "Quiet loyalty",
  "Protective behaviour",
];

const attachmentOptions = [
  "Secure",
  "Avoidant",
  "Anxious",
  "Fearful avoidant",
  "Guarded but loyal",
  "Detached until attached",
];

const jealousyOptions = [
  "Quiet withdrawal",
  "Sharp comments",
  "Possessive tension",
  "Pretends not to care",
  "Gets competitive",
  "Becomes protective",
  "Acts colder",
];

const flirtingOptions = [
  "Dry teasing",
  "Blunt honesty",
  "Cocky banter",
  "Awkward sincerity",
  "Subtle looks",
  "Dirty jokes",
  "Protective gestures",
  "Acts annoyed but helps",
];

const settingOptions = [
  "Small town",
  "Big city",
  "Coastal town",
  "Countryside",
  "Workplace office",
  "Restaurant / bar",
  "Hospital",
  "University, adult students only",
  "Sports team",
  "Ice rink",
  "Tour bus / celebrity world",
  "Ranch / farm",
  "Mountain lodge",
  "Island getaway",
  "Fantasy kingdom",
  "Paranormal town",
  "Historical",
  "Mafia underworld",
  "Luxury world",
  "Working class / gritty",
  "Custom",
];

const externalConflictOptions = [
  "Career pressure",
  "Money problems",
  "Fame / public image",
  "Child custody",
  "Injury",
  "Family pressure",
  "Distance",
  "Scandal",
  "Grief",
  "Danger",
  "Team rivalry",
  "Workplace rules",
  "Custom",
];

const internalConflictOptions = [
  "Trust issues",
  "Shame",
  "Fear of love",
  "Anger",
  "Low self-worth",
  "Commitment fear",
  "Guilt",
  "Past trauma",
  "Fear of vulnerability",
  "Control issues",
  "Custom",
];

const romanticConflictOptions = [
  "Rivals",
  "Secret",
  "Wrong timing",
  "Forbidden attraction",
  "Misunderstanding",
  "Jealousy",
  "Loyalty conflict",
  "Fear of being seen",
  "Opposite lifestyles",
  "Power imbalance, adult and consensual",
  "Custom",
];

const mustHaveOptions = [
  "First accidental touch",
  "Jealousy moment",
  "Forced close proximity",
  "Rain kiss",
  "Angry confession",
  "Caretaking while sick / injured",
  "Bed sharing",
  "First intimate scene",
  "Public declaration",
  "Big breakup",
  "Grovel scene",
  "Reunion",
  "Found family moment",
  "Protective rescue",
  "Locker room tension",
  "After-game celebration",
  "Injury recovery",
  "Championship final",
  "Secret kiss at the rink",
  "Custom",
];

const mustNotHaveOptions = [
  "Cheating",
  "Love triangle",
  "Pregnancy plot",
  "Insta-love",
  "Billionaire trope",
  "Miscommunication breakup",
  "Dark themes",
  "Death ending",
  "Cliffhanger",
  "Public humiliation",
  "Third act breakup",
  "Toxic alpha behaviour",
  "Random object descriptions",
  "Over-described rooms",
  "Custom",
];

const localeOptions = [
  "British English",
  "American English",
  "Canadian English",
  "Australian English",
  "Irish English",
  "Neutral International",
];

const regionOptions = [
  "Neutral",
  "Northern UK",
  "Lancashire",
  "Yorkshire",
  "London / South East",
  "Neutral American",
  "New York",
  "California",
  "Neutral Canadian",
  "Urban Canadian",
  "Small town Canadian",
];

const authorFlavourOptions = [
  "Gritty hockey romance",
  "Witty romcom",
  "Queer heartfelt romance",
  "Dark obsessive romance",
  "Warm cosy romance",
  "Spicy commercial romance",
  "Lean emotional romance",
  "Sharp modern romance",
];

const voiceStyleOptions = [
  "Commercial romance",
  "Raw / gritty",
  "Warm / cosy",
  "Sharp / witty",
  "Dark / intense",
  "Emotional / deep",
  "Fast / punchy",
  "Literary but restrained",
];

const dialogueStyleOptions = [
  "Natural / grounded",
  "Bantery",
  "Dry humour",
  "Flirty",
  "Tense / clipped",
  "Emotionally loaded",
  "Blunt and realistic",
];

const proseDensityOptions = ["Lean", "Balanced", "Rich but controlled"];

const chapterOpenerOptions = [
  "Quiet opener",
  "Immediate chemistry",
  "Tension heavy",
  "Plot heavy",
  "High conflict opener",
  "Character-first opener",
];

const endingGlowOptions = [
  "Quiet domestic happiness",
  "Moving in",
  "Career win together",
  "Public declaration",
  "Found family ending",
  "Spicy epilogue",
  "Wedding hint",
  "Baby / family hint",
  "Sequel bait",
];

const groundingOptions = [
  "Mundane everyday detail",
  "Work stress",
  "Family baggage",
  "Money worries",
  "Domestic intimacy",
  "Friendship dynamics",
  "Class differences",
  "Physical exhaustion",
  "Realistic awkwardness",
  "Messy emotions",
];

const avoidStyleOptions = [
  "Purple prose",
  "Overused similes",
  "Repeated Like openings",
  "Repeated As if phrasing",
  "Cheesy banter",
  "Melodrama",
  "Therapy-speak",
  "Trauma dumping",
  "Repetitive inner monologue",
  "Over-description",
  "Cliché romance beats",
  "Long dashes",
  "Poetic object descriptions",
  "Random setting description",
];

const defaultForm: StoryForm = {
  title: "",
  relationship: "MM Romance",
  subgenre: "Sports Romance",
  subgenreDetail: "Ice hockey",
  length: "Novella",
  heat: "Explicit adult",
  burnPacing: "Fast burn",
  pov: "First person, dual POV",
  ending: "Happy ending",

  tropes: "Enemies to lovers, Forced proximity, Secret child, Jealousy",
  romanceDynamic: "Rival x rival",
  attractionStyle: "Hate attraction",
  attractionFocus: "Mouth, Voice, Body, Competence",
  sexualStyle: "Teasing, Jealous heat, Rough edge",
  spiceTiming: "Middle",

  mmNuance: "Masc x masc, One more emotionally closed, No homophobia plot",
  mfNuance: "Strong heroine, Modern gender roles, Hero falls first",

  c1Name: "",
  c1Age: "",
  c1Appearance: "",
  c1Job: "Ice hockey player",
  c1Personality: "",
  c1Speech: "",
  c1Flaws: "",
  c1Desire: "",
  c1Fear: "",
  c1Secret: "Secret child",
  c1Wound: "",
  c1LoveLanguage: "",
  c1Attachment: "Guarded but loyal",
  c1Jealousy: "Pretends not to care",
  c1Flirting: "Dry teasing",
  c1CustomNotes: "",

  c2Name: "",
  c2Age: "",
  c2Appearance: "",
  c2Job: "Ice hockey player",
  c2Personality: "",
  c2Speech: "",
  c2Flaws: "",
  c2Desire: "",
  c2Fear: "",
  c2Secret: "No major secret",
  c2Wound: "",
  c2LoveLanguage: "",
  c2Attachment: "Detached until attached",
  c2Jealousy: "Possessive tension",
  c2Flirting: "Cocky banter",
  c2CustomNotes: "",

  setting: "Sports team, Ice rink",
  externalConflict: "Career pressure, Child custody",
  internalConflict: "Trust issues, Fear of vulnerability",
  romanticConflict: "Rivals, Jealousy",
  mustHave: "",
  mustNotHave: "Random object descriptions, Over-described rooms",
  plot: "",

  locale: "Canadian English",
  regionVoice: "Urban Canadian",
  authorFlavour: "Gritty hockey romance",
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

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabName>("story");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [form, setForm] = useState<StoryForm>({ ...defaultForm });
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);

  const [chapters, setChapters] = useState<string[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [customRewrite, setCustomRewrite] = useState("");

  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeChapter = chapters[activeChapterIndex] || "";

  const preview = useMemo(() => {
    return `${form.relationship} • ${form.subgenre} • ${form.length} • ${form.burnPacing} • ${form.heat}`;
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

  function updateField(field: string, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
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
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Check your email for the login link.");
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
    setActiveTab("story");
  }

  async function saveCurrentStory(
    override?: {
      form?: StoryForm;
      chapters?: string[];
      activeChapterIndex?: number;
      customRewrite?: string;
    }
  ) {
    if (!user) {
      setAuthMessage("Log in first so it can save to the cloud.");
      return null;
    }

    setSaving(true);

    const formToSave = override?.form || form;
    const chaptersToSave = override?.chapters || chapters;
    const activeIndexToSave = override?.activeChapterIndex ?? activeChapterIndex;
    const rewriteToSave = override?.customRewrite ?? customRewrite;

    const payload = {
      user_id: user.id,
      title: getStoryTitle(formToSave),
      form: formToSave,
      chapters: chaptersToSave,
      active_chapter_index: activeIndexToSave,
      custom_rewrite: rewriteToSave,
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
    setCustomRewrite(story.custom_rewrite || "");
    setActiveTab("story");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteStory(id: string) {
    if (!window.confirm("Delete this saved story?")) return;

    await supabase.from("stories").delete().eq("id", id);

    if (activeStoryId === id) {
      createNewStory();
    }

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await response.json();
    const chapter = data.result || "Something went wrong.";
    const newChapters = [chapter];

    setChapters(newChapters);
    setActiveChapterIndex(0);
    setLoading(false);

    await saveCurrentStory({
      form,
      chapters: newChapters,
      activeChapterIndex: 0,
      customRewrite,
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        form,
        previousChapter,
        nextChapterNumber: chapters.length + 1,
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
      form,
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chapter: activeChapter,
        instruction: customRewrite,
      }),
    });

    const data = await response.json();
    const rewritten = data.result || "Rewrite failed.";
    const newChapters = [...chapters];

    newChapters[activeChapterIndex] = rewritten;

    setChapters(newChapters);
    setRewriteLoading(false);

    await saveCurrentStory({
      form,
      chapters: newChapters,
      activeChapterIndex,
      customRewrite,
    });
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">NovelForge</h1>
            <p className="text-xs text-rose-300 uppercase tracking-[0.25em]">
              Private Romance Engine
            </p>
          </div>

          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden md:block text-sm text-zinc-300">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8">
        {!user && (
          <div className="max-w-xl mx-auto mt-16 rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <h2 className="text-3xl font-bold mb-3">Log in</h2>
            <p className="text-zinc-300 mb-6">
              Enter your email to save stories across devices.
            </p>

            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="mb-4 w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
            />

            <button
              type="button"
              onClick={signIn}
              className="w-full rounded-2xl bg-rose-500 py-4 font-bold hover:bg-rose-400"
            >
              Send Login Link
            </button>

            {authMessage && (
              <p className="mt-4 text-sm text-rose-200">{authMessage}</p>
            )}
          </div>
        )}

        {user && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr_320px]">
            <aside className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-24">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold">My Stories</h2>
                <button
                  type="button"
                  onClick={createNewStory}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold hover:bg-rose-400"
                >
                  New
                </button>
              </div>

              <button
                type="button"
                onClick={() => saveCurrentStory()}
                className="mb-5 w-full rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700"
              >
                {saving ? "Saving..." : "Save Story"}
              </button>

              <div className="grid gap-3">
                {savedStories.length === 0 && (
                  <p className="text-sm text-zinc-400">No saved stories yet.</p>
                )}

                {savedStories.map((story) => (
                  <div
                    key={story.id}
                    className={`rounded-2xl border p-4 ${
                      activeStoryId === story.id
                        ? "border-rose-400 bg-rose-500/15"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <h3 className="mb-1 font-bold text-rose-100">
                      {story.title}
                    </h3>
                    <p className="mb-3 text-xs text-zinc-400">
                      {(story.chapters || []).length} chapter
                      {(story.chapters || []).length === 1 ? "" : "s"}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadStory(story)}
                        className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-700"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStory(story.id)}
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-red-500/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold">{getStoryTitle(form)}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Build the core, cast and spark without turning it into a tax form.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => saveCurrentStory()}
                  className="rounded-2xl border border-white/10 bg-zinc-800 px-5 py-3 font-semibold hover:bg-zinc-700"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>

              <div className="mb-6 grid gap-2 sm:grid-cols-3">
                <TabButton
                  active={activeTab === "story"}
                  onClick={() => setActiveTab("story")}
                  label="1. Story Core"
                />
                <TabButton
                  active={activeTab === "characters"}
                  onClick={() => setActiveTab("characters")}
                  label="2. Characters"
                />
                <TabButton
                  active={activeTab === "spark"}
                  onClick={() => setActiveTab("spark")}
                  label="3. Story Spark"
                />
              </div>

              <div className="grid gap-6">
                {activeTab === "story" && (
                  <Card title="Story Core">
                    <Input label="Story Title" field="title" form={form} updateField={updateField} />

                    <div className="grid gap-4 md:grid-cols-2">
                      <Select label="Relationship Type" field="relationship" value={form.relationship} options={relationshipTypes} updateField={updateField} />
                      <Select label="Subgenre" field="subgenre" value={form.subgenre} options={subgenreOptions} updateField={updateField} />
                      <Select label="Subgenre Detail" field="subgenreDetail" value={form.subgenreDetail} options={sportOptions} updateField={updateField} />
                      <Select label="Book Length" field="length" value={form.length} options={lengthOptions} updateField={updateField} />
                      <Select label="Heat Level" field="heat" value={form.heat} options={heatOptions} updateField={updateField} />
                      <Select label="Burn Pacing" field="burnPacing" value={form.burnPacing} options={burnOptions} updateField={updateField} />
                      <Select label="Ending" field="ending" value={form.ending} options={endingOptions} updateField={updateField} />
                    </div>

                    <ChipGroup label="Tropes" field="tropes" selected={form.tropes} options={tropeOptions} updateField={updateField} />
                    <Select label="Romance Dynamic" field="romanceDynamic" value={form.romanceDynamic} options={romanceDynamicOptions} updateField={updateField} />
                    <Select label="Attraction Style" field="attractionStyle" value={form.attractionStyle} options={attractionStyleOptions} updateField={updateField} />
                    <ChipGroup label="Attraction Focus" field="attractionFocus" selected={form.attractionFocus} options={attractionFocusOptions} updateField={updateField} />
                    <ChipGroup label="Sexual Style" field="sexualStyle" selected={form.sexualStyle} options={sexualStyleOptions} updateField={updateField} />
                    <Select label="Spice Timing" field="spiceTiming" value={form.spiceTiming} options={spiceTimingOptions} updateField={updateField} />

                    {form.relationship === "MM Romance" && (
                      <ChipGroup label="MM Nuance" field="mmNuance" selected={form.mmNuance} options={mmNuanceOptions} updateField={updateField} />
                    )}

                    {form.relationship === "MF Romance" && (
                      <ChipGroup label="MF Nuance" field="mfNuance" selected={form.mfNuance} options={mfNuanceOptions} updateField={updateField} />
                    )}
                  </Card>
                )}

                {activeTab === "characters" && (
                  <>
                    <CharacterSection title="Character 1" prefix="c1" form={form} updateField={updateField} />
                    <CharacterSection title="Character 2" prefix="c2" form={form} updateField={updateField} />
                  </>
                )}

                {activeTab === "spark" && (
                  <Card title="Story Spark">
                    <ChipGroup label="Setting" field="setting" selected={form.setting} options={settingOptions} updateField={updateField} />
                    <ChipGroup label="External Conflict" field="externalConflict" selected={form.externalConflict} options={externalConflictOptions} updateField={updateField} />
                    <ChipGroup label="Internal Conflict" field="internalConflict" selected={form.internalConflict} options={internalConflictOptions} updateField={updateField} />
                    <ChipGroup label="Romantic Conflict" field="romanticConflict" selected={form.romanticConflict} options={romanticConflictOptions} updateField={updateField} />
                    <ChipGroup label="Must-Have Scenes" field="mustHave" selected={form.mustHave} options={mustHaveOptions} updateField={updateField} />
                    <ChipGroup label="Must-Not-Have" field="mustNotHave" selected={form.mustNotHave} options={mustNotHaveOptions} updateField={updateField} />
                    <TextArea label="Plot Notes" field="plot" form={form} updateField={updateField} />
                  </Card>
                )}

                <button
                  type="button"
                  onClick={() => setShowAdvanced((previous) => !previous)}
                  className="rounded-2xl border border-white/10 bg-zinc-900/70 px-5 py-3 text-left font-semibold text-zinc-200 hover:bg-zinc-800"
                >
                  {showAdvanced ? "Hide Advanced Controls" : "Show Advanced Controls"}
                </button>

                {showAdvanced && (
                  <Card title="Advanced Controls">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select label="POV" field="pov" value={form.pov} options={povOptions} updateField={updateField} />
                      <Select label="Locale" field="locale" value={form.locale} options={localeOptions} updateField={updateField} />
                      <Select label="Regional Voice" field="regionVoice" value={form.regionVoice} options={regionOptions} updateField={updateField} />
                      <Select label="Author Flavour" field="authorFlavour" value={form.authorFlavour} options={authorFlavourOptions} updateField={updateField} />
                      <Select label="Writing Style" field="voiceStyle" value={form.voiceStyle} options={voiceStyleOptions} updateField={updateField} />
                      <Select label="Dialogue Style" field="dialogueStyle" value={form.dialogueStyle} options={dialogueStyleOptions} updateField={updateField} />
                      <Select label="Prose Density" field="proseDensity" value={form.proseDensity} options={proseDensityOptions} updateField={updateField} />
                      <Select label="Chapter Opener" field="chapterOpener" value={form.chapterOpener} options={chapterOpenerOptions} updateField={updateField} />
                      <Select label="Ending Glow" field="endingGlow" value={form.endingGlow} options={endingGlowOptions} updateField={updateField} />
                    </div>

                    <ChipGroup label="Grounding" field="grounding" selected={form.grounding} options={groundingOptions} updateField={updateField} />
                    <ChipGroup label="Avoid Style" field="avoidStyle" selected={form.avoidStyle} options={avoidStyleOptions} updateField={updateField} />
                  </Card>
                )}

                <button
                  type="button"
                  onClick={generateStory}
                  className="sticky bottom-4 z-30 w-full rounded-2xl bg-rose-500 py-4 text-lg font-bold shadow-2xl hover:bg-rose-400"
                >
                  {loading ? "Generating Chapter 1..." : "Generate Chapter 1"}
                </button>
              </div>
            </section>

            <aside className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-24">
              <h2 className="mb-4 text-xl font-bold">Live Preview</h2>

              <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4 text-sm text-zinc-200">
                {preview}
              </div>

              <div className="mt-6 grid gap-3 text-sm text-zinc-300">
                <PreviewRow label="Tropes" value={form.tropes} />
                <PreviewRow label="Dynamic" value={form.romanceDynamic} />
                <PreviewRow
                  label="Conflicts"
                  value={`${form.externalConflict}, ${form.internalConflict}, ${form.romanticConflict}`}
                />
                <PreviewRow label="Chapters" value={`${chapters.length}`} />
              </div>
            </aside>
          </div>
        )}

        {user && chapters.length > 0 && (
          <section className="mx-auto mt-8 max-w-5xl rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl">
            <div className="mb-6 flex flex-wrap gap-2">
              {chapters.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => setActiveChapterIndex(index)}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    activeChapterIndex === index
                      ? "border-rose-400 bg-rose-500 text-white"
                      : "border-white/10 bg-zinc-950/70 text-zinc-300 hover:border-rose-400"
                  }`}
                >
                  Chapter {index + 1}
                </button>
              ))}
            </div>

            <article className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 leading-8 text-zinc-200 whitespace-pre-wrap">
              <h2 className="mb-6 text-3xl font-bold text-rose-200">
                Chapter {activeChapterIndex + 1}
              </h2>
              {activeChapter}
            </article>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-2xl font-bold text-rose-200">Rewrite Chapter</h3>

              <textarea
                value={customRewrite}
                onChange={(event) => setCustomRewrite(event.target.value)}
                placeholder="Example: tighten this, fix flow, make the ex drama more grounded, improve Mason's behaviour continuity..."
                className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
              />

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={rewriteChapter}
                  disabled={rewriteLoading || !customRewrite.trim()}
                  className="rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700 disabled:opacity-50"
                >
                  {rewriteLoading ? "Rewriting..." : "Rewrite This Chapter"}
                </button>

                <button
                  type="button"
                  onClick={continueStory}
                  disabled={continueLoading}
                  className="rounded-2xl bg-rose-500 py-3 font-bold hover:bg-rose-400 disabled:opacity-50"
                >
                  {continueLoading ? "Continuing..." : `Continue to Chapter ${chapters.length + 1}`}
                </button>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
        active
          ? "border-rose-400 bg-rose-500 text-white"
          : "border-white/10 bg-zinc-950/60 text-zinc-300 hover:border-rose-400"
      }`}
    >
      {label}
    </button>
  );
}

function CharacterSection({
  title,
  prefix,
  form,
  updateField,
}: {
  title: string;
  prefix: string;
  form: StoryForm;
  updateField: (field: string, value: string) => void;
}) {
  return (
    <Card title={title}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Name" field={`${prefix}Name`} form={form} updateField={updateField} />
        <Input label="Age" field={`${prefix}Age`} form={form} updateField={updateField} />
        <Select label="Job / Role" field={`${prefix}Job`} value={form[`${prefix}Job`]} options={jobOptions} updateField={updateField} />
        <Select label="Secret" field={`${prefix}Secret`} value={form[`${prefix}Secret`]} options={secretOptions} updateField={updateField} />
        <Select label="Attachment Style" field={`${prefix}Attachment`} value={form[`${prefix}Attachment`]} options={attachmentOptions} updateField={updateField} />
        <Select label="Jealousy Style" field={`${prefix}Jealousy`} value={form[`${prefix}Jealousy`]} options={jealousyOptions} updateField={updateField} />
        <Select label="Flirting Style" field={`${prefix}Flirting`} value={form[`${prefix}Flirting`]} options={flirtingOptions} updateField={updateField} />
      </div>

      <TextArea label="Appearance" field={`${prefix}Appearance`} form={form} updateField={updateField} />
      <ChipGroup label="Personality" field={`${prefix}Personality`} selected={form[`${prefix}Personality`]} options={personalityOptions} updateField={updateField} />
      <ChipGroup label="Speech Quirks" field={`${prefix}Speech`} selected={form[`${prefix}Speech`]} options={speechOptions} updateField={updateField} />
      <ChipGroup label="Flaws" field={`${prefix}Flaws`} selected={form[`${prefix}Flaws`]} options={flawOptions} updateField={updateField} />
      <ChipGroup label="Biggest Desire" field={`${prefix}Desire`} selected={form[`${prefix}Desire`]} options={desireOptions} updateField={updateField} />
      <ChipGroup label="Biggest Fear" field={`${prefix}Fear`} selected={form[`${prefix}Fear`]} options={fearOptions} updateField={updateField} />
      <ChipGroup label="Character Wound" field={`${prefix}Wound`} selected={form[`${prefix}Wound`]} options={woundOptions} updateField={updateField} />
      <ChipGroup label="Love Language" field={`${prefix}LoveLanguage`} selected={form[`${prefix}LoveLanguage`]} options={loveLanguageOptions} updateField={updateField} />
      <TextArea label="Extra Character Notes" field={`${prefix}CustomNotes`} form={form} updateField={updateField} />
    </Card>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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
}: {
  label: string;
  field: string;
  form: StoryForm;
  updateField: (field: string, value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea
        value={form[field] || ""}
        onChange={(event) => updateField(field, event.target.value)}
        className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
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

function ChipGroup({
  label,
  field,
  selected,
  options,
  updateField,
}: {
  label: string;
  field: string;
  selected: string;
  options: string[];
  updateField: (field: string, value: string) => void;
}) {
  const selectedArray = selected ? selected.split(", ").filter(Boolean) : [];

  function toggleOption(option: string) {
    const updated = selectedArray.includes(option)
      ? selectedArray.filter((item) => item !== option)
      : [...selectedArray, option];

    updateField(field, updated.join(", "));
  }

  return (
    <div className="grid gap-3">
      <span className="text-sm text-zinc-300">{label}</span>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selectedArray.includes(option);

          return (
            <button
              type="button"
              key={option}
              onClick={() => toggleOption(option)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                active
                  ? "border-rose-400 bg-rose-500 text-white"
                  : "border-white/10 bg-zinc-950/70 text-zinc-300 hover:border-rose-400"
              }`}
            >
              {active ? "✓ " : ""}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-rose-300">{label}</p>
      <p className="mt-2 text-zinc-100">{value || "Not set"}</p>
    </div>
  );
  }
