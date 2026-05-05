"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "novelforge_saved_stories_v1";
const ACTIVE_STORY_KEY = "novelforge_active_story_v1";

const SUBGENRES = ["Contemporary","Small Town","Sports Romance","Dark Romance","Workplace","Celebrity","Paranormal","Billionaire","Second Chance"];
const POV_OPTIONS = ["First person, single POV","First person, dual POV","Third person, single POV","Third person, dual POV","Alternating POV"];
const LOCALE_OPTIONS = ["British English","American English","Canadian English","Australian English","Irish English","Neutral International"];

const REGION_OPTIONS: Record<string, string[]> = {
  "British English": ["Neutral British","Northern UK","Lancashire","Yorkshire","Midlands","London / South East","Scottish","Welsh"],
  "American English": ["Neutral American","Midwest US","East Coast US","Southern US","West Coast US","New York","California"],
  "Canadian English": ["Neutral Canadian","Urban Canadian","Small town Canadian","French Canadian influence"],
  "Australian English": ["Neutral Australian","Urban Australian","Rural Australian"],
  "Irish English": ["Neutral Irish","Dublin","Rural Irish"],
  "Neutral International": ["Neutral"],
};

const VOICE_STYLE_OPTIONS = ["Commercial romance","Raw / gritty","Warm / cosy","Sharp / witty","Dark / intense","Emotional / deep","Fast / punchy","Literary but restrained"];
const DIALOGUE_STYLE_OPTIONS = ["Natural / grounded","Bantery","Dry humour","Flirty","Tense / clipped","Emotionally loaded","Blunt and realistic"];
const PROSE_DENSITY_OPTIONS = ["Lean","Balanced","Rich but controlled"];
const BURN_OPTIONS = ["Instant attraction","Fast burn","Medium burn","Slow burn","Agonising slow burn"];
const CHAPTER_OPENER_OPTIONS = ["Quiet opener","Immediate chemistry","Tension heavy","Plot heavy","High conflict opener","Character-first opener"];
const AGE_BRACKET_OPTIONS = ["18 to 21","22 to 30","30 to 45","45+"];
const LENGTH_OPTIONS = ["Novella","Short Novel","Long Novel"];

const SPORT_OPTIONS = ["Ice hockey","Football","Rugby","Boxing","MMA","Wrestling","Basketball","Baseball","Motor racing","Swimming","Athletics","Dance","Custom"];
const TOWN_OPTIONS = ["Seaside town","Mountain town","Rural farming town","Tourist town","Historic town","Working class town","Close-knit village","Custom"];
const CELEBRITY_OPTIONS = ["Actor","Musician","Athlete","Influencer","Author","Reality star","Royal / aristocrat","Custom"];
const PARANORMAL_OPTIONS = ["Vampire","Werewolf","Witch","Demon","Fae","Shifter","Ghost","Mixed supernatural world","Custom"];

const TROPE_OPTIONS = ["Enemies to lovers","Friends to lovers","Forced proximity","Fake dating","Second chance","Grumpy / sunshine","Only one bed","Hurt / comfort","Forbidden attraction","Workplace romance","Small town romance","Sports romance","Celebrity romance","Secret relationship","Opposites attract","Slow burn","High angst","Protective lead","Found family","Jealousy"];

const BASE_JOB_OPTIONS = ["Business owner","Tradesperson","Doctor / Nurse","Teacher","Artist","Musician","Writer","Chef","Bar owner","Police / Firefighter","Military","Adult student","Unemployed / rebuilding life","Custom"];
const SPORTS_JOBS = ["Ice hockey player","Footballer","Rugby player","Coach","Team doctor","Physio","Sports journalist","Agent","Club owner"];
const SMALL_TOWN_JOBS = ["Cafe owner","Farmer","Vet","Builder","Local bartender","Shop owner","Mechanic","Teacher"];
const CELEBRITY_JOBS = ["Actor","Singer","Famous athlete","Celebrity assistant","Bodyguard","Manager","Journalist"];
const PARANORMAL_JOBS = ["Vampire","Werewolf","Witch","Hunter","Pack leader","Coven leader","Supernatural healer"];

const TRAIT_OPTIONS = ["Grumpy","Sunshine","Guarded","Confident","Shy","Funny","Sarcastic","Soft-hearted","Hot-headed","Protective","Ambitious","Chaotic","Quiet","Dominant","Nurturing","Flirty","Awkward","Loyal","Broken but trying"];
const SPEECH_QUIRK_OPTIONS = ["Swears naturally","Dry sarcasm","Blunt speaker","Shy speaker","Affectionate teasing","Emotionally guarded","Playful flirt","Quiet intensity","Uses humour to deflect","Short answers under stress"];
const FLAW_OPTIONS = ["Trust issues","Commitment issues","Jealous","Emotionally closed off","People pleaser","Impulsive","Workaholic","Self-sabotaging","Afraid of vulnerability","Bad temper","Overprotective","Runs from conflict"];
const DESIRE_OPTIONS = ["To be loved properly","To feel safe","To escape their past","To prove themselves","To build a family","To belong somewhere","To be chosen","To start over","To protect someone","To finally trust"];
const FEAR_OPTIONS = ["Being abandoned","Being rejected","Losing control","Getting hurt again","Being trapped","Being truly known","Letting someone down","Repeating the past","Being vulnerable","Failing the people they love"];
const SECRET_OPTIONS = ["No major secret","Hidden debt","Secret child","Criminal past","Family scandal","Fake identity","Secret illness","Secret inheritance","Hidden heartbreak","Secret engagement","Carrying guilt","Custom"];

const SETTING_OPTIONS = ["Small town","Big city","Coastal town","Countryside","Workplace office","Restaurant / bar","Hospital","University, adult students only","Sports team","Ice rink","Tour bus / celebrity world","Ranch / farm","Mountain lodge","Island getaway","Fantasy kingdom","Paranormal town","Historical","Mafia underworld","Luxury world","Working class / gritty","Custom"];
const CONFLICT_OPTIONS = ["Trust issues","Opposite lifestyles","Family disapproval","Career conflict","Long distance","Secret identity","One is leaving town","Rivalry","Class difference","Hidden past","Commitment fear","Forced separation","Danger / threat","Grief / healing","Custom"];
const KEEPS_APART_OPTIONS = ["Emotional walls","Fear of commitment","Wrong timing","Existing relationship","Family pressure","Professional conflict","Physical distance","Pride","Shame / secret","Social expectations","Trauma","Mistrust","They think feelings are not returned","Custom"];

const BASE_SCENES = ["First accidental touch","Jealousy moment","Forced close proximity","Rain kiss","Angry confession","Caretaking while sick / injured","Bed sharing","First intimate scene","Public declaration","Big breakup","Grovel scene","Reunion","Found family moment","Protective rescue","Holiday scene","Custom"];
const SPORTS_SCENES = ["Locker room tension","After-game celebration","Injury recovery","Championship final","Secret kiss at the rink"];
const SMALL_TOWN_SCENES = ["Town fair","Community event","Local gossip spreads","Snowstorm stuck together","Bonfire night"];
const CELEBRITY_SCENES = ["Paparazzi scandal","Secret hotel meeting","Award show","Tour life","Public reveal"];
const PARANORMAL_SCENES = ["First reveal of supernatural identity","Bite / bond moment","Pack or coven conflict","Dangerous full moon","Forbidden magic"];

const MUST_NOT_HAVE_OPTIONS = ["Cheating","Love triangle","Pregnancy plot","Insta-love","Billionaire trope","Miscommunication breakup","Dark themes","Death ending","Cliffhanger","Public humiliation","Third act breakup","Toxic alpha behaviour","Custom"];
const GROUNDING_OPTIONS = ["Mundane everyday detail","Work stress","Family baggage","Money worries","Domestic intimacy","Friendship dynamics","Class differences","Physical exhaustion","Realistic awkwardness","Messy emotions"];
const AVOID_STYLE_OPTIONS = ["Purple prose","Overused similes","Repeated Like openings","Repeated As if phrasing","Cheesy banter","Melodrama","Therapy-speak","Trauma dumping","Repetitive inner monologue","Over-description","Cliché romance beats","Long dashes","Poetic object descriptions"];

type StoryForm = Record<string, string>;

type SavedStory = {
  id: string;
  title: string;
  updatedAt: string;
  form: StoryForm;
  chapters: string[];
  activeChapterIndex: number;
  customRewrite: string;
};

const defaultForm: Record<string, string> = {
  title: "",
  relationship: "MM Romance",
  subgenre: "Sports Romance",
  subgenreDetail: "Ice hockey",
  subgenreDetailCustom: "",
  locale: "Canadian English",
  regionVoice: "Urban Canadian",
  voiceStyle: "Commercial romance",
  dialogueStyle: "Natural / grounded",
  proseDensity: "Lean",
  burnPacing: "Medium burn",
  chapterOpener: "Tension heavy",
  ageBracket: "22 to 30",
  avoidStyle: "Purple prose, Overused similes, Repeated Like openings, Repeated As if phrasing, Therapy-speak, Long dashes, Poetic object descriptions",
  grounding: "Mundane everyday detail, Physical exhaustion, Realistic awkwardness, Messy emotions",
  tropes: "",
  tone: "Emotional",
  heat: "Spicy",
  pov: "First person, dual POV",
  ending: "Happy ending",
  length: "Short Novel",

  c1Name: "",
  c1Age: "",
  c1Appearance: "",
  c1Job: "Ice hockey player",
  c1JobCustom: "",
  c1Personality: "",
  c1Speech: "",
  c1Flaws: "",
  c1Desire: "",
  c1Fear: "",
  c1Secret: "No major secret",
  c1SecretCustom: "",
  c1CustomNotes: "",

  c2Name: "",
  c2Age: "",
  c2Appearance: "",
  c2Job: "Ice hockey player",
  c2JobCustom: "",
  c2Personality: "",
  c2Speech: "",
  c2Flaws: "",
  c2Desire: "",
  c2Fear: "",
  c2Secret: "No major secret",
  c2SecretCustom: "",
  c2CustomNotes: "",

  setting: "Sports team, Ice rink",
  settingCustom: "",
  plot: "",
  conflict: "",
  conflictCustom: "",
  keepsApart: "",
  keepsApartCustom: "",
  mustHave: "",
  mustHaveCustom: "",
  mustNotHave: "",
  mustNotHaveCustom: "",
  intensity: "Dramatic",
};

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);

  const steps = [
    "Story Setup",
    "Voice Engine",
    "Character 1",
    "Character 2",
    "Plot Builder",
    "Review & Generate",
  ];

  const [form, setForm] = useState<Record<string, string>>(defaultForm);
  const [chapters, setChapters] = useState<string[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [customRewrite, setCustomRewrite] = useState("");

  const jobOptions = getJobOptions(form.subgenre);
  const sceneOptions = getSceneOptions(form.subgenre);
  const regionOptions = REGION_OPTIONS[form.locale] || ["Neutral"];
  const activeChapter = chapters[activeChapterIndex] || "";

  const preparedForm = {
    ...form,
    subgenreDetail: resolveCustom(form.subgenreDetail, form.subgenreDetailCustom),
    c1Job: resolveCustom(form.c1Job, form.c1JobCustom),
    c2Job: resolveCustom(form.c2Job, form.c2JobCustom),
    c1Secret: resolveCustom(form.c1Secret, form.c1SecretCustom),
    c2Secret: resolveCustom(form.c2Secret, form.c2SecretCustom),
    setting: resolveCustomList(form.setting, form.settingCustom),
    conflict: resolveCustomList(form.conflict, form.conflictCustom),
    keepsApart: resolveCustomList(form.keepsApart, form.keepsApartCustom),
    mustHave: resolveCustomList(form.mustHave, form.mustHaveCustom),
    mustNotHave: resolveCustomList(form.mustNotHave, form.mustNotHaveCustom),
  };

  useEffect(() => {
    try {
      const rawStories = localStorage.getItem(STORAGE_KEY);
      const rawActiveId = localStorage.getItem(ACTIVE_STORY_KEY);

      const stories: SavedStory[] = rawStories ? JSON.parse(rawStories) : [];
      setSavedStories(stories);

      if (rawActiveId) {
        const active = stories.find((story) => story.id === rawActiveId);

        if (active) {
          setActiveStoryId(active.id);
          setForm({ ...defaultForm, ...active.form });
          setChapters(active.chapters || []);
          setActiveChapterIndex(active.activeChapterIndex || 0);
          setCustomRewrite(active.customRewrite || "");
        }
      }
    } catch (error) {
      console.error("Failed to load saved stories", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedStories));

      if (activeStoryId) {
        localStorage.setItem(ACTIVE_STORY_KEY, activeStoryId);
      } else {
        localStorage.removeItem(ACTIVE_STORY_KEY);
      }
    } catch (error) {
      console.error("Failed to save stories", error);
    }
  }, [savedStories, activeStoryId, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeStoryId) return;

    setSavedStories((prev) =>
      prev.map((story) =>
        story.id === activeStoryId
          ? {
              ...story,
              title: getStoryTitle(form),
              updatedAt: new Date().toISOString(),
              form,
              chapters,
              activeChapterIndex,
              customRewrite,
            }
          : story
      )
    );
  }, [form, chapters, activeChapterIndex, customRewrite, activeStoryId, hydrated]);

  function updateField(field: string, value: string) {
    setForm((prev) => {
      const updated: Record<string, string> = { ...prev, [field]: value };

      if (field === "locale") {
        updated.regionVoice = (REGION_OPTIONS[value] || ["Neutral"])[0];
      }

      if (field === "subgenre") {
        if (value === "Sports Romance") {
          updated.subgenreDetail = "Ice hockey";
          updated.c1Job = "Ice hockey player";
          updated.c2Job = "Ice hockey player";
          updated.setting = "Sports team, Ice rink";
        } else if (value === "Small Town") {
          updated.subgenreDetail = "Seaside town";
          updated.c1Job = "Cafe owner";
          updated.c2Job = "Builder";
          updated.setting = "Small town";
        } else if (value === "Celebrity") {
          updated.subgenreDetail = "Actor";
          updated.c1Job = "Actor";
          updated.c2Job = "Celebrity assistant";
          updated.setting = "Tour bus / celebrity world";
        } else if (value === "Paranormal") {
          updated.subgenreDetail = "Werewolf";
          updated.c1Job = "Werewolf";
          updated.c2Job = "Witch";
          updated.setting = "Paranormal town";
        } else {
          updated.subgenreDetail = "";
          updated.c1Job = "Business owner";
          updated.c2Job = "Business owner";
          updated.setting = "";
        }
      }

      return updated;
    });
  }

  function generateNames() {
    const mmNames = [
      ["Theo Mercer", "Lucas Hale"],
      ["Elliot Vale", "Ronan Hayes"],
      ["Callum Reed", "Jude Bennett"],
      ["Finn Archer", "Miles Hart"],
      ["Nate Calder", "Rowan Blake"],
    ];

    const mfNames = [
      ["Sophie Bennett", "Ethan Cole"],
      ["Maya Hart", "Logan Reed"],
      ["Clara Vale", "Noah Mercer"],
      ["Ivy Brooks", "Daniel Hayes"],
      ["Lena Brooks", "Cole Maddox"],
    ];

    const list = form.relationship === "MF Romance" ? mfNames : mmNames;
    const pair = list[Math.floor(Math.random() * list.length)];

    updateField("c1Name", pair[0]);
    updateField("c2Name", pair[1]);
  }

  function createNewStory() {
    const id = crypto.randomUUID();
    const newForm = { ...defaultForm };

    const newStory: SavedStory = {
      id,
      title: "Untitled Story",
      updatedAt: new Date().toISOString(),
      form: newForm,
      chapters: [],
      activeChapterIndex: 0,
      customRewrite: "",
    };

    setSavedStories((prev) => [newStory, ...prev]);
    setActiveStoryId(id);
    setForm(newForm);
    setChapters([]);
    setActiveChapterIndex(0);
    setCustomRewrite("");
    setStep(1);
  }

  function saveCurrentStory() {
    const id = activeStoryId || crypto.randomUUID();

    const savedStory: SavedStory = {
      id,
      title: getStoryTitle(form),
      updatedAt: new Date().toISOString(),
      form,
      chapters,
      activeChapterIndex,
      customRewrite,
    };

    setSavedStories((prev) => {
      const exists = prev.some((story) => story.id === id);

      if (exists) {
        return prev.map((story) => (story.id === id ? savedStory : story));
      }

      return [savedStory, ...prev];
    });

    setActiveStoryId(id);
  }

  function loadStory(story: SavedStory) {
    setActiveStoryId(story.id);
    setForm({ ...defaultForm, ...story.form });
    setChapters(story.chapters || []);
    setActiveChapterIndex(story.activeChapterIndex || 0);
    setCustomRewrite(story.customRewrite || "");
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteStory(id: string) {
    const confirmed = window.confirm("Delete this saved story? This cannot be undone.");

    if (!confirmed) return;

    setSavedStories((prev) => prev.filter((story) => story.id !== id));

    if (activeStoryId === id) {
      setActiveStoryId(null);
      setForm({ ...defaultForm });
      setChapters([]);
      setActiveChapterIndex(0);
      setCustomRewrite("");
      setStep(1);
    }
  }

  async function generateStory() {
    saveCurrentStory();

    setLoading(true);
    setChapters([]);
    setActiveChapterIndex(0);

    const res = await fetch("/api/generate-bible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preparedForm),
    });

    const data = await res.json();
    const chapter = data.result || "Something went wrong.";

    setChapters([chapter]);
    setActiveChapterIndex(0);
    setLoading(false);
  }

  async function rewriteChapter() {
    if (!activeChapter || !customRewrite.trim()) return;

    setRewriteLoading(true);

    const res = await fetch("/api/rewrite-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter: activeChapter,
        instruction: customRewrite,
      }),
    });

    const data = await res.json();
    const rewritten = data.result || "Rewrite failed.";

    setChapters((prev) => {
      const next = [...prev];
      next[activeChapterIndex] = rewritten;
      return next;
    });

    setRewriteLoading(false);
  }

  async function continueStory() {
    if (!activeChapter) return;

    setContinueLoading(true);

    const previousChapters = chapters
      .map((chapter, index) => `Chapter ${index + 1}\n${chapter}`)
      .join("\n\n");

    const res = await fetch("/api/continue-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form: preparedForm,
        previousChapter: previousChapters,
        nextChapterNumber: chapters.length + 1,
      }),
    });

    const data = await res.json();
    const nextChapter = data.result || "Continue failed.";

    setChapters((prev) => [...prev, nextChapter]);
    setActiveChapterIndex(chapters.length);
    setContinueLoading(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-stone-950 to-rose-950 text-white px-6 py-12">
      <section className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <p className="text-rose-300 text-sm tracking-[0.3em] uppercase mb-4">
            Private Romance Story Builder
          </p>

          <h1 className="text-6xl font-black tracking-tight mb-6">
            NovelForge
          </h1>

          <p className="text-zinc-300 text-lg max-w-2xl mx-auto">
            Build romance stories from characters, tropes, voice, pacing,
            setting and emotional arcs.
          </p>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-8 items-start">
          <aside className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-2xl font-bold">My Stories</h2>
              <button
                type="button"
                onClick={createNewStory}
                className="bg-rose-500 hover:bg-rose-400 rounded-xl px-4 py-2 text-sm font-bold"
              >
                New
              </button>
            </div>

            <button
              type="button"
              onClick={saveCurrentStory}
              className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-2xl py-3 font-semibold border border-white/10 mb-5"
            >
              Save Current Story
            </button>

            <div className="grid gap-3">
              {savedStories.length === 0 && (
                <p className="text-sm text-zinc-400">
                  No saved stories yet. Tragic, but fixable.
                </p>
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
                  <h3 className="font-bold text-rose-100 mb-1">
                    {story.title}
                  </h3>

                  <p className="text-xs text-zinc-400 mb-3">
                    {story.chapters.length} chapter{story.chapters.length === 1 ? "" : "s"} · Updated {formatDate(story.updatedAt)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadStory(story)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 rounded-xl px-3 py-2 text-sm font-semibold"
                    >
                      Load
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteStory(story.id)}
                      className="bg-black/30 hover:bg-red-500/30 border border-white/10 rounded-xl px-3 py-2 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-bold">Create New Story</h2>
                <p className="text-sm text-zinc-400 mt-2">
                  Active save: {activeStoryId ? getStoryTitle(form) : "Unsaved draft"}
                </p>
              </div>

              <button
                type="button"
                onClick={saveCurrentStory}
                className="bg-zinc-800 hover:bg-zinc-700 rounded-2xl px-5 py-3 font-semibold border border-white/10"
              >
                Save
              </button>
            </div>

            <div className="mb-8">
              <div className="flex justify-between text-sm text-zinc-300 mb-3">
                <span>Step {step} of {steps.length}</span>
                <span>{steps[step - 1]}</span>
              </div>

              <div className="h-3 rounded-full bg-zinc-900 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${(step / steps.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid gap-8">
              {step === 1 && (
                <Section title="Story Setup">
                  <Input label="Story Title" field="title" form={form} updateField={updateField} />

                  <div className="grid md:grid-cols-2 gap-4">
                    <Select label="Relationship Type" field="relationship" value={form.relationship} updateField={updateField} options={["MM Romance", "MF Romance"]} />
                    <Select label="Subgenre" field="subgenre" value={form.subgenre} updateField={updateField} options={SUBGENRES} />

                    {form.subgenre === "Sports Romance" && (
                      <>
                        <Select label="Sport Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={SPORT_OPTIONS} />
                        {form.subgenreDetail === "Custom" && <Input label="Custom Sport Type" field="subgenreDetailCustom" form={form} updateField={updateField} />}
                      </>
                    )}

                    {form.subgenre === "Small Town" && (
                      <>
                        <Select label="Town Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={TOWN_OPTIONS} />
                        {form.subgenreDetail === "Custom" && <Input label="Custom Town Type" field="subgenreDetailCustom" form={form} updateField={updateField} />}
                      </>
                    )}

                    {form.subgenre === "Celebrity" && (
                      <>
                        <Select label="Celebrity Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={CELEBRITY_OPTIONS} />
                        {form.subgenreDetail === "Custom" && <Input label="Custom Celebrity Type" field="subgenreDetailCustom" form={form} updateField={updateField} />}
                      </>
                    )}

                    {form.subgenre === "Paranormal" && (
                      <>
                        <Select label="Paranormal World" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={PARANORMAL_OPTIONS} />
                        {form.subgenreDetail === "Custom" && <Input label="Custom Paranormal World" field="subgenreDetailCustom" form={form} updateField={updateField} />}
                      </>
                    )}

                    <Select label="Locale / Language Flavour" field="locale" value={form.locale} updateField={updateField} options={LOCALE_OPTIONS} />
                    <Select label="Regional Voice" field="regionVoice" value={form.regionVoice} updateField={updateField} options={regionOptions} />
                    <Select label="POV" field="pov" value={form.pov} updateField={updateField} options={POV_OPTIONS} />
                    <Select label="Age Bracket" field="ageBracket" value={form.ageBracket} updateField={updateField} options={AGE_BRACKET_OPTIONS} />
                    <Select label="Heat Level" field="heat" value={form.heat} updateField={updateField} options={["Fade to black", "Mild", "Spicy", "Explicit adult"]} />
                    <Select label="Ending" field="ending" value={form.ending} updateField={updateField} options={["Happy ending", "Happy for now", "Bittersweet", "Cliffhanger"]} />
                    <Select label="Length" field="length" value={form.length} updateField={updateField} options={LENGTH_OPTIONS} />
                    <Select label="Plot Intensity" field="intensity" value={form.intensity} updateField={updateField} options={["Cozy", "Balanced", "Dramatic", "Heavy angst", "Chaotic soap opera"]} />
                  </div>

                  <CheckboxGroup label="Tropes" field="tropes" selected={form.tropes} options={TROPE_OPTIONS} updateField={updateField} />
                </Section>
              )}

              {step === 2 && (
                <Section title="Voice Engine">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Select label="Writing Style" field="voiceStyle" value={form.voiceStyle} updateField={updateField} options={VOICE_STYLE_OPTIONS} />
                    <Select label="Dialogue Style" field="dialogueStyle" value={form.dialogueStyle} updateField={updateField} options={DIALOGUE_STYLE_OPTIONS} />
                    <Select label="Prose Density" field="proseDensity" value={form.proseDensity} updateField={updateField} options={PROSE_DENSITY_OPTIONS} />
                    <Select label="Burn Pacing" field="burnPacing" value={form.burnPacing} updateField={updateField} options={BURN_OPTIONS} />
                    <Select label="Chapter Opener" field="chapterOpener" value={form.chapterOpener} updateField={updateField} options={CHAPTER_OPENER_OPTIONS} />
                  </div>

                  <CheckboxGroup label="Real-World Grounding" field="grounding" selected={form.grounding} options={GROUNDING_OPTIONS} updateField={updateField} />
                  <CheckboxGroup label="Avoid AI Waffle" field="avoidStyle" selected={form.avoidStyle} options={AVOID_STYLE_OPTIONS} updateField={updateField} />
                </Section>
              )}

              {step === 3 && (
                <>
                  <button type="button" onClick={generateNames} className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-2xl py-3 font-semibold border border-white/10">
                    Generate Character Names
                  </button>

                  <CharacterSection title="Character 1" prefix="c1" form={form} updateField={updateField} jobOptions={jobOptions} />
                </>
              )}

              {step === 4 && (
                <CharacterSection title="Character 2" prefix="c2" form={form} updateField={updateField} jobOptions={jobOptions} />
              )}

              {step === 5 && (
                <Section title="Plot Builder">
                  <CheckboxGroup label="Setting" field="setting" selected={form.setting} options={SETTING_OPTIONS} updateField={updateField} />
                  {hasCustom(form.setting) && <Input label="Custom Setting" field="settingCustom" form={form} updateField={updateField} />}

                  <CheckboxGroup label="Main Conflict" field="conflict" selected={form.conflict} options={CONFLICT_OPTIONS} updateField={updateField} />
                  {hasCustom(form.conflict) && <Input label="Custom Main Conflict" field="conflictCustom" form={form} updateField={updateField} />}

                  <CheckboxGroup label="What Keeps Them Apart?" field="keepsApart" selected={form.keepsApart} options={KEEPS_APART_OPTIONS} updateField={updateField} />
                  {hasCustom(form.keepsApart) && <Input label="Custom Reason Keeping Them Apart" field="keepsApartCustom" form={form} updateField={updateField} />}

                  <CheckboxGroup label="Must-Have Scenes" field="mustHave" selected={form.mustHave} options={sceneOptions} updateField={updateField} />
                  {hasCustom(form.mustHave) && <Input label="Custom Must-Have Scene" field="mustHaveCustom" form={form} updateField={updateField} />}

                  <CheckboxGroup label="Must-Not-Have" field="mustNotHave" selected={form.mustNotHave} options={MUST_NOT_HAVE_OPTIONS} updateField={updateField} />
                  {hasCustom(form.mustNotHave) && <Input label="Custom Must-Not-Have" field="mustNotHaveCustom" form={form} updateField={updateField} />}

                  <TextArea label="Optional Plot Notes" field="plot" form={form} updateField={updateField} placeholder="Add anything specific, if needed..." />
                </Section>
              )}

              {step === 6 && (
                <Section title="Review & Generate">
                  <div className="grid gap-3 text-zinc-200">
                    <p><strong>Title:</strong> {preparedForm.title || "Untitled"}</p>
                    <p><strong>Relationship:</strong> {preparedForm.relationship}</p>
                    <p><strong>Subgenre:</strong> {preparedForm.subgenre} {preparedForm.subgenreDetail && `, ${preparedForm.subgenreDetail}`}</p>
                    <p><strong>Locale:</strong> {preparedForm.locale}, {preparedForm.regionVoice}</p>
                    <p><strong>Voice:</strong> {preparedForm.voiceStyle}, {preparedForm.dialogueStyle}, {preparedForm.proseDensity}</p>
                    <p><strong>Burn:</strong> {preparedForm.burnPacing}</p>
                    <p><strong>Heat:</strong> {preparedForm.heat}</p>
                    <p><strong>POV:</strong> {preparedForm.pov}</p>
                    <p><strong>Characters:</strong> {preparedForm.c1Name || "Character 1"} + {preparedForm.c2Name || "Character 2"}</p>
                    <p><strong>Jobs:</strong> {preparedForm.c1Job} + {preparedForm.c2Job}</p>
                    <p><strong>Tropes:</strong> {preparedForm.tropes || "None selected"}</p>
                    <p><strong>Setting:</strong> {preparedForm.setting || "Not selected"}</p>
                    <p><strong>Conflict:</strong> {preparedForm.conflict || "Not selected"}</p>
                    <p><strong>Must have:</strong> {preparedForm.mustHave || "None selected"}</p>
                    <p><strong>Must not have:</strong> {preparedForm.mustNotHave || "None selected"}</p>
                  </div>

                  <button onClick={generateStory} className="w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-4 font-bold text-lg mt-6">
                    {loading ? "Generating your story..." : "Generate Story"}
                  </button>
                </Section>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                  disabled={step === 1}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-2xl py-3 font-semibold border border-white/10 disabled:opacity-40"
                >
                  Back
                </button>

                {step < steps.length && (
                  <button
                    type="button"
                    onClick={() => setStep((prev) => Math.min(steps.length, prev + 1))}
                    className="w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-3 font-bold"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {chapters.length > 0 && (
          <div className="max-w-4xl mx-auto mt-10 bg-black/30 rounded-3xl p-8 border border-white/10 whitespace-pre-wrap leading-8 text-zinc-200">
            <div className="flex flex-wrap gap-2 mb-8">
              {chapters.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveChapterIndex(index)}
                  className={`rounded-full px-4 py-2 text-sm border transition ${
                    activeChapterIndex === index
                      ? "bg-rose-500 border-rose-400 text-white"
                      : "bg-zinc-950/70 border-white/10 text-zinc-300 hover:border-rose-400"
                  }`}
                >
                  Chapter {index + 1}
                </button>
              ))}
            </div>

            <h2 className="text-3xl font-bold text-rose-200 mb-6">
              Chapter {activeChapterIndex + 1}
            </h2>

            <div>{activeChapter}</div>

            <div className="mt-10 border-t border-white/10 pt-8">
              <h3 className="text-2xl font-bold text-rose-200 mb-4">Rewrite Chapter</h3>

              <textarea
                value={customRewrite}
                onChange={(e) => setCustomRewrite(e.target.value)}
                placeholder="Tell it what to change, e.g. make the dialogue less stiff, add more tension, make it less poetic..."
                className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none min-h-[100px]"
              />

              <button
                type="button"
                onClick={rewriteChapter}
                disabled={rewriteLoading || !customRewrite.trim()}
                className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 rounded-2xl py-3 font-semibold border border-white/10 disabled:opacity-50"
              >
                {rewriteLoading ? "Rewriting..." : "Rewrite This Chapter"}
              </button>

              <button
                type="button"
                onClick={continueStory}
                disabled={continueLoading}
                className="mt-4 w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-4 font-bold text-lg disabled:opacity-50"
              >
                {continueLoading ? "Continuing story..." : `Continue to Chapter ${chapters.length + 1}`}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function getStoryTitle(form: Record<string, string>) {
  return form.title?.trim() || "Untitled Story";
}

function formatDate(value: string) {
  if (!value) return "unknown";

  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "unknown";
  }
}

function resolveCustom(value: string, customValue: string) {
  if (value === "Custom" && customValue.trim()) return customValue.trim();
  return value;
}

function hasCustom(value: string) {
  return value
    .split(", ")
    .filter(Boolean)
    .includes("Custom");
}

function resolveCustomList(value: string, customValue: string) {
  if (!value) return customValue.trim();

  const parts = value.split(", ").filter(Boolean);
  const cleaned = parts.map((part) => {
    if (part === "Custom" && customValue.trim()) return customValue.trim();
    return part;
  });

  return cleaned.join(", ");
}

function getJobOptions(subgenre: string) {
  if (subgenre === "Sports Romance") return [...SPORTS_JOBS, ...BASE_JOB_OPTIONS];
  if (subgenre === "Small Town") return [...SMALL_TOWN_JOBS, ...BASE_JOB_OPTIONS];
  if (subgenre === "Celebrity") return [...CELEBRITY_JOBS, ...BASE_JOB_OPTIONS];
  if (subgenre === "Paranormal") return [...PARANORMAL_JOBS, ...BASE_JOB_OPTIONS];
  return BASE_JOB_OPTIONS;
}

function getSceneOptions(subgenre: string) {
  if (subgenre === "Sports Romance") return [...SPORTS_SCENES, ...BASE_SCENES];
  if (subgenre === "Small Town") return [...SMALL_TOWN_SCENES, ...BASE_SCENES];
  if (subgenre === "Celebrity") return [...CELEBRITY_SCENES, ...BASE_SCENES];
  if (subgenre === "Paranormal") return [...PARANORMAL_SCENES, ...BASE_SCENES];
  return BASE_SCENES;
}

function CharacterSection({ title, prefix, form, updateField, jobOptions }: any) {
  const jobField = `${prefix}Job`;
  const customJobField = `${prefix}JobCustom`;
  const secretField = `${prefix}Secret`;
  const customSecretField = `${prefix}SecretCustom`;

  return (
    <Section title={title}>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Name" field={`${prefix}Name`} form={form} updateField={updateField} />
        <Input label="Age" field={`${prefix}Age`} form={form} updateField={updateField} />
      </div>

      <TextArea label="Appearance" field={`${prefix}Appearance`} form={form} updateField={updateField} />

      <Select label="Job / Role" field={jobField} value={form[jobField]} updateField={updateField} options={jobOptions} />
      {form[jobField] === "Custom" && <Input label="Custom Job / Role" field={customJobField} form={form} updateField={updateField} />}

      <CheckboxGroup label="Personality" field={`${prefix}Personality`} selected={form[`${prefix}Personality`]} options={TRAIT_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Speech Quirks" field={`${prefix}Speech`} selected={form[`${prefix}Speech`]} options={SPEECH_QUIRK_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Flaws" field={`${prefix}Flaws`} selected={form[`${prefix}Flaws`]} options={FLAW_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Biggest Desire" field={`${prefix}Desire`} selected={form[`${prefix}Desire`]} options={DESIRE_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Biggest Fear" field={`${prefix}Fear`} selected={form[`${prefix}Fear`]} options={FEAR_OPTIONS} updateField={updateField} />

      <Select label="Secret" field={secretField} value={form[secretField]} updateField={updateField} options={SECRET_OPTIONS} />
      {form[secretField] === "Custom" && <Input label="Custom Secret" field={customSecretField} form={form} updateField={updateField} />}

      <TextArea label="Extra Character Notes" field={`${prefix}CustomNotes`} form={form} updateField={updateField} placeholder="Anything specific you want included..." />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/10 rounded-3xl p-6 bg-black/20">
      <h3 className="text-2xl font-bold mb-5 text-rose-200">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Input({ label, field, form, updateField }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input value={form[field]} onChange={(e) => updateField(field, e.target.value)} className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none" />
    </label>
  );
}

function TextArea({ label, field, form, updateField, placeholder = "" }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea value={form[field]} onChange={(e) => updateField(field, e.target.value)} placeholder={placeholder} className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none min-h-[100px]" />
    </label>
  );
}

function Select({ label, field, value, updateField, options }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <select value={value} onChange={(e) => updateField(field, e.target.value)} className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none">
        {options.map((option: string) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CheckboxGroup({ label, field, selected, options, updateField }: any) {
  function toggleOption(option: string) {
    const current = selected ? selected.split(", ").filter(Boolean) : [];

    const updated = current.includes(option)
      ? current.filter((item: string) => item !== option)
      : [...current, option];

    updateField(field, updated.join(", "));
  }

  const selectedArray = selected ? selected.split(", ").filter(Boolean) : [];

  return (
    <div className="grid gap-3">
      <span className="text-sm text-zinc-300">{label}</span>

      <div className="flex flex-wrap gap-2">
        {options.map((option: string) => {
          const active = selectedArray.includes(option);

          return (
            <button
              type="button"
              key={option}
              onClick={() => toggleOption(option)}
              className={`rounded-full px-4 py-2 text-sm border transition ${
                active
                  ? "bg-rose-500 border-rose-400 text-white"
                  : "bg-zinc-950/70 border-white/10 text-zinc-300 hover:border-rose-400"
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
