"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SUBGENRES = [
  "Contemporary",
  "Small Town",
  "Sports Romance",
  "Dark Romance",
  "Workplace",
  "Celebrity",
  "Paranormal",
  "Billionaire",
  "Second Chance",
];

const RELATIONSHIP_TYPES = ["MM Romance", "MF Romance"];

const ROMANCE_DYNAMICS = [
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

const ATTRACTION_STYLE = [
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

const ATTRACTION_FOCUS = [
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

const SEXUAL_STYLE = [
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

const SPICE_TIMING = ["Early", "Middle", "Late", "Very late payoff"];

const EXTERNAL_CONFLICT = [
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

const INTERNAL_CONFLICT = [
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

const ROMANTIC_CONFLICT = [
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

const CHARACTER_WOUNDS = [
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

const LOVE_LANGUAGES = [
  "Acts of service",
  "Physical touch",
  "Words of affirmation",
  "Quality time",
  "Gifts",
  "Quiet loyalty",
  "Protective behaviour",
];

const ATTACHMENT_STYLES = [
  "Secure",
  "Avoidant",
  "Anxious",
  "Fearful avoidant",
  "Guarded but loyal",
  "Detached until attached",
];

const JEALOUSY_STYLES = [
  "Quiet withdrawal",
  "Sharp comments",
  "Possessive tension",
  "Pretends not to care",
  "Gets competitive",
  "Becomes protective",
  "Acts colder",
];

const FLIRTING_STYLES = [
  "Dry teasing",
  "Blunt honesty",
  "Cocky banter",
  "Awkward sincerity",
  "Subtle looks",
  "Dirty jokes",
  "Protective gestures",
  "Acts annoyed but helps",
];

const AUTHOR_FLAVOUR = [
  "Gritty hockey romance",
  "Witty romcom",
  "Queer heartfelt romance",
  "Dark obsessive romance",
  "Warm cosy romance",
  "Spicy commercial romance",
  "Lean emotional romance",
  "Sharp modern romance",
];

const ENDING_GLOW = [
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

const MM_NUANCE = [
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

const MF_NUANCE = [
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

const POV_OPTIONS = [
  "First person, single POV",
  "First person, dual POV",
  "Third person, single POV",
  "Third person, dual POV",
  "Alternating POV",
];

const LOCALE_OPTIONS = [
  "British English",
  "American English",
  "Canadian English",
  "Australian English",
  "Irish English",
  "Neutral International",
];

const REGION_OPTIONS: Record<string, string[]> = {
  "British English": ["Neutral British", "Northern UK", "Lancashire", "Yorkshire", "Midlands", "London / South East", "Scottish", "Welsh"],
  "American English": ["Neutral American", "Midwest US", "East Coast US", "Southern US", "West Coast US", "New York", "California"],
  "Canadian English": ["Neutral Canadian", "Urban Canadian", "Small town Canadian", "French Canadian influence"],
  "Australian English": ["Neutral Australian", "Urban Australian", "Rural Australian"],
  "Irish English": ["Neutral Irish", "Dublin", "Rural Irish"],
  "Neutral International": ["Neutral"],
};

const VOICE_STYLE_OPTIONS = [
  "Commercial romance",
  "Raw / gritty",
  "Warm / cosy",
  "Sharp / witty",
  "Dark / intense",
  "Emotional / deep",
  "Fast / punchy",
  "Literary but restrained",
];

const DIALOGUE_STYLE_OPTIONS = [
  "Natural / grounded",
  "Bantery",
  "Dry humour",
  "Flirty",
  "Tense / clipped",
  "Emotionally loaded",
  "Blunt and realistic",
];

const PROSE_DENSITY_OPTIONS = ["Lean", "Balanced", "Rich but controlled"];
const BURN_OPTIONS = ["Instant attraction", "Fast burn", "Medium burn", "Slow burn", "Agonising slow burn"];
const CHAPTER_OPENER_OPTIONS = ["Quiet opener", "Immediate chemistry", "Tension heavy", "Plot heavy", "High conflict opener", "Character-first opener"];
const AGE_BRACKET_OPTIONS = ["18 to 21", "22 to 30", "30 to 45", "45+"];
const LENGTH_OPTIONS = ["Novella", "Short Novel", "Long Novel"];

const SPORT_OPTIONS = ["Ice hockey", "Football", "Rugby", "Boxing", "MMA", "Wrestling", "Basketball", "Baseball", "Motor racing", "Swimming", "Athletics", "Dance", "Custom"];
const TOWN_OPTIONS = ["Seaside town", "Mountain town", "Rural farming town", "Tourist town", "Historic town", "Working class town", "Close-knit village", "Custom"];
const CELEBRITY_OPTIONS = ["Actor", "Musician", "Athlete", "Influencer", "Author", "Reality star", "Royal / aristocrat", "Custom"];
const PARANORMAL_OPTIONS = ["Vampire", "Werewolf", "Witch", "Demon", "Fae", "Shifter", "Ghost", "Mixed supernatural world", "Custom"];

const TROPE_OPTIONS = [
  "Enemies to lovers",
  "Friends to lovers",
  "Forced proximity",
  "Fake dating",
  "Second chance",
  "Grumpy / sunshine",
  "Only one bed",
  "Hurt / comfort",
  "Forbidden attraction",
  "Workplace romance",
  "Small town romance",
  "Sports romance",
  "Celebrity romance",
  "Secret relationship",
  "Opposites attract",
  "Slow burn",
  "High angst",
  "Protective lead",
  "Found family",
  "Jealousy",
];

const BASE_JOB_OPTIONS = ["Business owner", "Tradesperson", "Doctor / Nurse", "Teacher", "Artist", "Musician", "Writer", "Chef", "Bar owner", "Police / Firefighter", "Military", "Adult student", "Unemployed / rebuilding life", "Custom"];
const SPORTS_JOBS = ["Ice hockey player", "Footballer", "Rugby player", "Coach", "Team doctor", "Physio", "Sports journalist", "Agent", "Club owner"];
const SMALL_TOWN_JOBS = ["Cafe owner", "Farmer", "Vet", "Builder", "Local bartender", "Shop owner", "Mechanic", "Teacher"];
const CELEBRITY_JOBS = ["Actor", "Singer", "Famous athlete", "Celebrity assistant", "Bodyguard", "Manager", "Journalist"];
const PARANORMAL_JOBS = ["Vampire", "Werewolf", "Witch", "Hunter", "Pack leader", "Coven leader", "Supernatural healer"];

const TRAIT_OPTIONS = ["Grumpy", "Sunshine", "Guarded", "Confident", "Shy", "Funny", "Sarcastic", "Soft-hearted", "Hot-headed", "Protective", "Ambitious", "Chaotic", "Quiet", "Dominant", "Nurturing", "Flirty", "Awkward", "Loyal", "Broken but trying"];
const SPEECH_QUIRK_OPTIONS = ["Swears naturally", "Dry sarcasm", "Blunt speaker", "Shy speaker", "Affectionate teasing", "Emotionally guarded", "Playful flirt", "Quiet intensity", "Uses humour to deflect", "Short answers under stress"];
const FLAW_OPTIONS = ["Trust issues", "Commitment issues", "Jealous", "Emotionally closed off", "People pleaser", "Impulsive", "Workaholic", "Self-sabotaging", "Afraid of vulnerability", "Bad temper", "Overprotective", "Runs from conflict"];
const DESIRE_OPTIONS = ["To be loved properly", "To feel safe", "To escape their past", "To prove themselves", "To build a family", "To belong somewhere", "To be chosen", "To start over", "To protect someone", "To finally trust"];
const FEAR_OPTIONS = ["Being abandoned", "Being rejected", "Losing control", "Getting hurt again", "Being trapped", "Being truly known", "Letting someone down", "Repeating the past", "Being vulnerable", "Failing the people they love"];
const SECRET_OPTIONS = ["No major secret", "Hidden debt", "Secret child", "Criminal past", "Family scandal", "Fake identity", "Secret illness", "Secret inheritance", "Hidden heartbreak", "Secret engagement", "Carrying guilt", "Custom"];

const SETTING_OPTIONS = ["Small town", "Big city", "Coastal town", "Countryside", "Workplace office", "Restaurant / bar", "Hospital", "University, adult students only", "Sports team", "Ice rink", "Tour bus / celebrity world", "Ranch / farm", "Mountain lodge", "Island getaway", "Fantasy kingdom", "Paranormal town", "Historical", "Mafia underworld", "Luxury world", "Working class / gritty", "Custom"];

const BASE_SCENES = ["First accidental touch", "Jealousy moment", "Forced close proximity", "Rain kiss", "Angry confession", "Caretaking while sick / injured", "Bed sharing", "First intimate scene", "Public declaration", "Big breakup", "Grovel scene", "Reunion", "Found family moment", "Protective rescue", "Holiday scene", "Custom"];
const SPORTS_SCENES = ["Locker room tension", "After-game celebration", "Injury recovery", "Championship final", "Secret kiss at the rink"];
const SMALL_TOWN_SCENES = ["Town fair", "Community event", "Local gossip spreads", "Snowstorm stuck together", "Bonfire night"];
const CELEBRITY_SCENES = ["Paparazzi scandal", "Secret hotel meeting", "Award show", "Tour life", "Public reveal"];
const PARANORMAL_SCENES = ["First reveal of supernatural identity", "Bite / bond moment", "Pack or coven conflict", "Dangerous full moon", "Forbidden magic"];

const MUST_NOT_HAVE_OPTIONS = ["Cheating", "Love triangle", "Pregnancy plot", "Insta-love", "Billionaire trope", "Miscommunication breakup", "Dark themes", "Death ending", "Cliffhanger", "Public humiliation", "Third act breakup", "Toxic alpha behaviour", "Random object descriptions", "Over-described rooms", "Custom"];
const GROUNDING_OPTIONS = ["Mundane everyday detail", "Work stress", "Family baggage", "Money worries", "Domestic intimacy", "Friendship dynamics", "Class differences", "Physical exhaustion", "Realistic awkwardness", "Messy emotions"];
const AVOID_STYLE_OPTIONS = ["Purple prose", "Overused similes", "Repeated Like openings", "Repeated As if phrasing", "Cheesy banter", "Melodrama", "Therapy-speak", "Trauma dumping", "Repetitive inner monologue", "Over-description", "Cliché romance beats", "Long dashes", "Poetic object descriptions", "Random setting description"];

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

const defaultForm: StoryForm = {
  title: "",
  relationship: "MM Romance",
  subgenre: "Sports Romance",
  subgenreDetail: "Ice hockey",
  subgenreDetailCustom: "",

  romanceDynamic: "Rival x rival",
  romanceDynamicCustom: "",
  attractionStyle: "Hate attraction",
  attractionStyleCustom: "",
  attractionFocus: "Mouth, Voice, Body, Competence",
  sexualStyle: "Teasing, Jealous heat, Rough edge",
  sexualStyleCustom: "",
  spiceTiming: "Middle",

  externalConflict: "Career pressure, Money problems",
  externalConflictCustom: "",
  internalConflict: "Trust issues, Fear of vulnerability",
  internalConflictCustom: "",
  romanticConflict: "Rivals, Jealousy",
  romanticConflictCustom: "",

  authorFlavour: "Gritty hockey romance",
  endingGlow: "Quiet domestic happiness",

  mmNuance: "Masc x masc, One more emotionally closed, No homophobia plot",
  mfNuance: "Strong heroine, Modern gender roles, Hero falls first",

  locale: "Canadian English",
  regionVoice: "Urban Canadian",
  voiceStyle: "Commercial romance",
  dialogueStyle: "Natural / grounded",
  proseDensity: "Lean",
  burnPacing: "Medium burn",
  chapterOpener: "Tension heavy",
  ageBracket: "22 to 30",
  avoidStyle: "Purple prose, Overused similes, Repeated Like openings, Repeated As if phrasing, Therapy-speak, Long dashes, Poetic object descriptions, Random setting description",
  grounding: "Mundane everyday detail, Physical exhaustion, Realistic awkwardness, Messy emotions",
  tropes: "Enemies to lovers, Forced proximity, Only one bed, Jealousy",
  tone: "Emotional",
  heat: "Explicit adult",
  pov: "First person, dual POV",
  ending: "Happy ending",
  length: "Novella",

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
  c1Wound: "",
  c1WoundCustom: "",
  c1LoveLanguage: "",
  c1Attachment: "Guarded but loyal",
  c1Jealousy: "Pretends not to care",
  c1Flirting: "Dry teasing",
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
  c2Wound: "",
  c2WoundCustom: "",
  c2LoveLanguage: "",
  c2Attachment: "Detached until attached",
  c2Jealousy: "Possessive tension",
  c2Flirting: "Cocky banter",
  c2CustomNotes: "",

  setting: "Sports team, Ice rink",
  settingCustom: "",
  plot: "",
  mustHave: "",
  mustHaveCustom: "",
  mustNotHave: "Random object descriptions, Over-described rooms",
  mustNotHaveCustom: "",
  intensity: "Dramatic",
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [step, setStep] = useState(1);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);

  const [form, setForm] = useState<StoryForm>(defaultForm);
  const [chapters, setChapters] = useState<string[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customRewrite, setCustomRewrite] = useState("");

  const steps = [
    "Story Core",
    "Romance Engine",
    "Character 1",
    "Character 2",
    "Plot Architecture",
    "Voice & Style",
    "Review",
  ];

  const jobOptions = getJobOptions(form.subgenre);
  const sceneOptions = getSceneOptions(form.subgenre);
  const regionOptions = REGION_OPTIONS[form.locale] || ["Neutral"];
  const activeChapter = chapters[activeChapterIndex] || "";

  const preparedForm: StoryForm = {
    ...form,
    subgenreDetail: resolveCustom(form.subgenreDetail, form.subgenreDetailCustom),
    romanceDynamic: resolveCustom(form.romanceDynamic, form.romanceDynamicCustom),
    attractionStyle: resolveCustom(form.attractionStyle, form.attractionStyleCustom),
    sexualStyle: resolveCustomList(form.sexualStyle, form.sexualStyleCustom),
    externalConflict: resolveCustomList(form.externalConflict, form.externalConflictCustom),
    internalConflict: resolveCustomList(form.internalConflict, form.internalConflictCustom),
    romanticConflict: resolveCustomList(form.romanticConflict, form.romanticConflictCustom),
    c1Job: resolveCustom(form.c1Job, form.c1JobCustom),
    c2Job: resolveCustom(form.c2Job, form.c2JobCustom),
    c1Secret: resolveCustom(form.c1Secret, form.c1SecretCustom),
    c2Secret: resolveCustom(form.c2Secret, form.c2SecretCustom),
    c1Wound: resolveCustomList(form.c1Wound, form.c1WoundCustom),
    c2Wound: resolveCustomList(form.c2Wound, form.c2WoundCustom),
    setting: resolveCustomList(form.setting, form.settingCustom),
    mustHave: resolveCustomList(form.mustHave, form.mustHaveCustom),
    mustNotHave: resolveCustomList(form.mustNotHave, form.mustNotHaveCustom),
  };

  useEffect(() => {
    async function initAuth() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user || null);
      setLoadingAuth(false);
    }

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      listener.subscription.unsubscribe();
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

  async function signIn() {
    if (!email.trim()) {
      setAuthMessage("Enter your email first. Revolutionary stuff.");
      return;
    }

    setAuthMessage("Sending login link...");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Check your email for the magic login link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSavedStories([]);
    setActiveStoryId(null);
    setForm({ ...defaultForm });
    setChapters([]);
    setActiveChapterIndex(0);
    setCustomRewrite("");
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

  function updateField(field: string, value: string) {
    setForm((prev) => {
      const updated: StoryForm = { ...prev, [field]: value };

      if (field === "locale") {
        updated.regionVoice = (REGION_OPTIONS[value] || ["Neutral"])[0];
      }

      if (field === "subgenre") {
        if (value === "Sports Romance") {
          updated.subgenreDetail = "Ice hockey";
          updated.c1Job = "Ice hockey player";
          updated.c2Job = "Ice hockey player";
          updated.setting = "Sports team, Ice rink";
          updated.authorFlavour = "Gritty hockey romance";
        } else if (value === "Small Town") {
          updated.subgenreDetail = "Seaside town";
          updated.c1Job = "Cafe owner";
          updated.c2Job = "Builder";
          updated.setting = "Small town";
          updated.authorFlavour = "Warm cosy romance";
        } else if (value === "Celebrity") {
          updated.subgenreDetail = "Actor";
          updated.c1Job = "Actor";
          updated.c2Job = "Celebrity assistant";
          updated.setting = "Tour bus / celebrity world";
          updated.authorFlavour = "Spicy commercial romance";
        } else if (value === "Paranormal") {
          updated.subgenreDetail = "Werewolf";
          updated.c1Job = "Werewolf";
          updated.c2Job = "Witch";
          updated.setting = "Paranormal town";
          updated.authorFlavour = "Dark obsessive romance";
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

  function createNewStory() {
    setActiveStoryId(null);
    setForm({ ...defaultForm });
    setChapters([]);
    setActiveChapterIndex(0);
    setCustomRewrite("");
    setStep(1);
  }

  async function saveCurrentStory() {
    if (!user) {
      setAuthMessage("Log in first so it can save to the cloud.");
      return null;
    }

    setSaving(true);

    const payload = {
      user_id: user.id,
      title: getStoryTitle(form),
      form,
      chapters,
      active_chapter_index: activeChapterIndex,
      custom_rewrite: customRewrite,
      updated_at: new Date().toISOString(),
    };

    if (activeStoryId) {
      const { error } = await supabase.from("stories").update(payload).eq("id", activeStoryId);
      setSaving(false);
      if (error) return null;
      await loadStories();
      return activeStoryId;
    }

    const { data, error } = await supabase.from("stories").insert(payload).select().single();
    setSaving(false);
    if (error) return null;

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
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteStory(id: string) {
    if (!window.confirm("Delete this saved story? This cannot be undone.")) return;

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

    const res = await fetch("/api/generate-bible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preparedForm),
    });

    const data = await res.json();
    setChapters([data.result || "Something went wrong."]);
    setActiveChapterIndex(0);
    setLoading(false);

    setTimeout(() => saveCurrentStory(), 500);
  }

  async function rewriteChapter() {
    if (!activeChapter || !customRewrite.trim()) return;

    setRewriteLoading(true);

    const res = await fetch("/api/rewrite-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter: activeChapter, instruction: customRewrite }),
    });

    const data = await res.json();
    const rewritten = data.result || "Rewrite failed.";

    setChapters((prev) => {
      const next = [...prev];
      next[activeChapterIndex] = rewritten;
      return next;
    });

    setRewriteLoading(false);
    setTimeout(() => saveCurrentStory(), 500);
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
    setTimeout(() => saveCurrentStory(), 500);
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
            <p className="text-xs text-rose-300 uppercase tracking-[0.25em]">Private Romance Engine</p>
          </div>

          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden md:block text-sm text-zinc-300">{user.email}</span>
              <button onClick={signOut} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
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
            <p className="text-zinc-300 mb-6">Enter your email to save stories across devices.</p>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          <div className="grid gap-6 lg:grid-cols-[280px_1fr_320px]">
            <aside className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-24">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold">My Stories</h2>
                <button onClick={createNewStory} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold hover:bg-rose-400">
                  New
                </button>
              </div>

              <button onClick={saveCurrentStory} className="mb-5 w-full rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700">
                {saving ? "Saving..." : "Save Story"}
              </button>

              <div className="grid gap-3">
                {savedStories.length === 0 && <p className="text-sm text-zinc-400">No saved stories yet.</p>}

                {savedStories.map((story) => (
                  <div key={story.id} className={`rounded-2xl border p-4 ${activeStoryId === story.id ? "border-rose-400 bg-rose-500/15" : "border-white/10 bg-black/20"}`}>
                    <h3 className="mb-1 font-bold text-rose-100">{story.title}</h3>
                    <p className="mb-3 text-xs text-zinc-400">
                      {(story.chapters || []).length} chapter{(story.chapters || []).length === 1 ? "" : "s"} · {formatDate(story.updated_at)}
                    </p>

                    <div className="flex gap-2">
                      <button onClick={() => loadStory(story)} className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-700">
                        Load
                      </button>
                      <button onClick={() => deleteStory(story.id)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-red-500/30">
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
                    Step {step} of {steps.length}, {steps[step - 1]}
                  </p>
                </div>

                <button onClick={saveCurrentStory} className="rounded-2xl border border-white/10 bg-zinc-800 px-5 py-3 font-semibold hover:bg-zinc-700">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>

              <div className="mb-6 h-3 overflow-hidden rounded-full border border-white/10 bg-zinc-900">
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${(step / steps.length) * 100}%` }} />
              </div>

              <div className="grid gap-6">
                {step === 1 && (
                  <Card title="Story Core">
                    <Input label="Story Title" field="title" form={form} updateField={updateField} />

                    <div className="grid gap-4 md:grid-cols-2">
                      <Select label="Relationship Type" field="relationship" value={form.relationship} updateField={updateField} options={RELATIONSHIP_TYPES} />
                      <Select label="Subgenre" field="subgenre" value={form.subgenre} updateField={updateField} options={SUBGENRES} />

                      {form.subgenre === "Sports Romance" && <Select label="Sport Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={SPORT_OPTIONS} />}
                      {form.subgenre === "Small Town" && <Select label="Town Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={TOWN_OPTIONS} />}
                      {form.subgenre === "Celebrity" && <Select label="Celebrity Type" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={CELEBRITY_OPTIONS} />}
                      {form.subgenre === "Paranormal" && <Select label="Paranormal World" field="subgenreDetail" value={form.subgenreDetail} updateField={updateField} options={PARANORMAL_OPTIONS} />}

                      {form.subgenreDetail === "Custom" && <Input label="Custom Subgenre Detail" field="subgenreDetailCustom" form={form} updateField={updateField} />}

                      <Select label="Book Length" field="length" value={form.length} updateField={updateField} options={LENGTH_OPTIONS} />
                      <Select label="POV" field="pov" value={form.pov} updateField={updateField} options={POV_OPTIONS} />
                      <Select label="Heat Level" field="heat" value={form.heat} updateField={updateField} options={["Fade to black", "Mild", "Spicy", "Explicit adult"]} />
                      <Select label="Ending" field="ending" value={form.ending} updateField={updateField} options={["Happy ending", "Happy for now", "Bittersweet", "Cliffhanger"]} />
                    </div>

                    <CheckboxGroup label="Tropes" field="tropes" selected={form.tropes} options={TROPE_OPTIONS} updateField={updateField} />
                  </Card>
                )}

                {step === 2 && (
                  <Card title="Romance Engine">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select label="Romance Dynamic" field="romanceDynamic" value={form.romanceDynamic} updateField={updateField} options={ROMANCE_DYNAMICS} />
                      {form.romanceDynamic === "Custom" && <Input label="Custom Romance Dynamic" field="romanceDynamicCustom" form={form} updateField={updateField} />}

                      <Select label="Attraction Style" field="attractionStyle" value={form.attractionStyle} updateField={updateField} options={ATTRACTION_STYLE} />
                      {form.attractionStyle === "Custom" && <Input label="Custom Attraction Style" field="attractionStyleCustom" form={form} updateField={updateField} />}

                      <Select label="Spice Timing" field="spiceTiming" value={form.spiceTiming} updateField={updateField} options={SPICE_TIMING} />
                      <Select label="Burn Pacing" field="burnPacing" value={form.burnPacing} updateField={updateField} options={BURN_OPTIONS} />
                    </div>

                    <CheckboxGroup label="Attraction Focus" field="attractionFocus" selected={form.attractionFocus} options={ATTRACTION_FOCUS} updateField={updateField} />
                    <CheckboxGroup label="Sexual Style" field="sexualStyle" selected={form.sexualStyle} options={SEXUAL_STYLE} updateField={updateField} />
                    {hasCustom(form.sexualStyle) && <Input label="Custom Sexual Style" field="sexualStyleCustom" form={form} updateField={updateField} />}

                    {form.relationship === "MM Romance" && <CheckboxGroup label="MM Nuance" field="mmNuance" selected={form.mmNuance} options={MM_NUANCE} updateField={updateField} />}
                    {form.relationship === "MF Romance" && <CheckboxGroup label="MF Nuance" field="mfNuance" selected={form.mfNuance} options={MF_NUANCE} updateField={updateField} />}
                  </Card>
                )}

                {step === 3 && <CharacterSection title="Character 1" prefix="c1" form={form} updateField={updateField} jobOptions={jobOptions} />}

                {step === 4 && <CharacterSection title="Character 2" prefix="c2" form={form} updateField={updateField} jobOptions={jobOptions} />}

                {step === 5 && (
                  <Card title="Plot Architecture">
                    <CheckboxGroup label="Setting" field="setting" selected={form.setting} options={SETTING_OPTIONS} updateField={updateField} />
                    {hasCustom(form.setting) && <Input label="Custom Setting" field="settingCustom" form={form} updateField={updateField} />}

                    <CheckboxGroup label="External Conflict" field="externalConflict" selected={form.externalConflict} options={EXTERNAL_CONFLICT} updateField={updateField} />
                    {hasCustom(form.externalConflict) && <Input label="Custom External Conflict" field="externalConflictCustom" form={form} updateField={updateField} />}

                    <CheckboxGroup label="Internal Conflict" field="internalConflict" selected={form.internalConflict} options={INTERNAL_CONFLICT} updateField={updateField} />
                    {hasCustom(form.internalConflict) && <Input label="Custom Internal Conflict" field="internalConflictCustom" form={form} updateField={updateField} />}

                    <CheckboxGroup label="Romantic Conflict" field="romanticConflict" selected={form.romanticConflict} options={ROMANTIC_CONFLICT} updateField={updateField} />
                    {hasCustom(form.romanticConflict) && <Input label="Custom Romantic Conflict" field="romanticConflictCustom" form={form} updateField={updateField} />}

                    <CheckboxGroup label="Must-Have Scenes" field="mustHave" selected={form.mustHave} options={sceneOptions} updateField={updateField} />
                    {hasCustom(form.mustHave) && <Input label="Custom Must-Have Scene" field="mustHaveCustom" form={form} updateField={updateField} />}

                    <CheckboxGroup label="Must-Not-Have" field="mustNotHave" selected={form.mustNotHave} options={MUST_NOT_HAVE_OPTIONS} updateField={updateField} />
                    {hasCustom(form.mustNotHave) && <Input label="Custom Must-Not-Have" field="mustNotHaveCustom" form={form} updateField={updateField} />}

                    <TextArea label="Plot Notes" field="plot" form={form} updateField={updateField} placeholder="Add the core idea, twists, black moment, or exact scenes you want..." />
                  </Card>
                )}

                {step === 6 && (
                  <Card title="Voice & Style">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select label="Locale" field="locale" value={form.locale} updateField={updateField} options={LOCALE_OPTIONS} />
                      <Select label="Regional Voice" field="regionVoice" value={form.regionVoice} updateField={updateField} options={regionOptions} />
                      <Select label="Author Flavour" field="authorFlavour" value={form.authorFlavour} updateField={updateField} options={AUTHOR_FLAVOUR} />
                      <Select label="Writing Style" field="voiceStyle" value={form.voiceStyle} updateField={updateField} options={VOICE_STYLE_OPTIONS} />
                      <Select label="Dialogue Style" field="dialogueStyle" value={form.dialogueStyle} updateField={updateField} options={DIALOGUE_STYLE_OPTIONS} />
                      <Select label="Prose Density" field="proseDensity" value={form.proseDensity} updateField={updateField} options={PROSE_DENSITY_OPTIONS} />
                      <Select label="Chapter Opener" field="chapterOpener" value={form.chapterOpener} updateField={updateField} options={CHAPTER_OPENER_OPTIONS} />
                      <Select label="Ending Glow" field="endingGlow" value={form.endingGlow} updateField={updateField} options={ENDING_GLOW} />
                    </div>

                    <CheckboxGroup label="Grounding" field="grounding" selected={form.grounding} options={GROUNDING_OPTIONS} updateField={updateField} />
                    <CheckboxGroup label="Avoid Style" field="avoidStyle" selected={form.avoidStyle} options={AVOID_STYLE_OPTIONS} updateField={updateField} />
                  </Card>
                )}

                {step === 7 && (
                  <Card title="Review & Generate">
                    <div className="grid gap-3 text-sm text-zinc-200 md:grid-cols-2">
                      <Review label="Title" value={preparedForm.title || "Untitled"} />
                      <Review label="Relationship" value={preparedForm.relationship} />
                      <Review label="Subgenre" value={`${preparedForm.subgenre}, ${preparedForm.subgenreDetail}`} />
                      <Review label="Dynamic" value={preparedForm.romanceDynamic} />
                      <Review label="Attraction" value={preparedForm.attractionStyle} />
                      <Review label="Heat" value={`${preparedForm.heat}, ${preparedForm.sexualStyle}`} />
                      <Review label="Length" value={preparedForm.length} />
                      <Review label="Tropes" value={preparedForm.tropes} />
                      <Review label="Conflict" value={`${preparedForm.externalConflict}, ${preparedForm.internalConflict}, ${preparedForm.romanticConflict}`} />
                      <Review label="Voice" value={`${preparedForm.authorFlavour}, ${preparedForm.voiceStyle}`} />
                    </div>

                    <button onClick={generateStory} className="mt-6 w-full rounded-2xl bg-rose-500 py-4 text-lg font-bold hover:bg-rose-400">
                      {loading ? "Generating..." : "Generate Chapter 1"}
                    </button>
                  </Card>
                )}

                <div className="flex gap-4">
                  <button onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1} className="w-full rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700 disabled:opacity-40">
                    Back
                  </button>

                  {step < steps.length && (
                    <button onClick={() => setStep((prev) => Math.min(steps.length, prev + 1))} className="w-full rounded-2xl bg-rose-500 py-3 font-bold hover:bg-rose-400">
                      Next
                    </button>
                  )}
                </div>
              </div>
            </section>

            <aside className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl lg:sticky lg:top-24">
              <h2 className="mb-4 text-xl font-bold">Story Controls</h2>

              <div className="grid gap-3 text-sm text-zinc-300">
                <p><strong className="text-rose-200">Target length:</strong> {form.length}</p>
                <p><strong className="text-rose-200">Heat:</strong> {form.heat}</p>
                <p><strong className="text-rose-200">Burn:</strong> {form.burnPacing}</p>
                <p><strong className="text-rose-200">Chapters:</strong> {chapters.length}</p>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                <p className="font-semibold text-rose-200">Length engine</p>
                <p className="mt-2">Novella should aim for 8 to 12 chapters.</p>
                <p>Short novel should aim for 16 to 24.</p>
                <p>Long novel should aim for 28 to 40.</p>
              </div>
            </aside>
          </div>
        )}

        {user && chapters.length > 0 && (
          <section className="mx-auto mt-8 max-w-5xl rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl">
            <div className="mb-6 flex flex-wrap gap-2">
              {chapters.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveChapterIndex(index)}
                  className={`rounded-full border px-4 py-2 text-sm ${activeChapterIndex === index ? "border-rose-400 bg-rose-500 text-white" : "border-white/10 bg-zinc-950/70 text-zinc-300 hover:border-rose-400"}`}
                >
                  Chapter {index + 1}
                </button>
              ))}
            </div>

            <article className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 leading-8 text-zinc-200 whitespace-pre-wrap">
              <h2 className="mb-6 text-3xl font-bold text-rose-200">Chapter {activeChapterIndex + 1}</h2>
              {activeChapter}
            </article>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-2xl font-bold text-rose-200">Rewrite Chapter</h3>

              <textarea
                value={customRewrite}
                onChange={(e) => setCustomRewrite(e.target.value)}
                placeholder="Example: tighten this, cut random descriptions, add more heat, keep enemies-to-lovers tension sharp..."
                className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none"
              />

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button onClick={rewriteChapter} disabled={rewriteLoading || !customRewrite.trim()} className="rounded-2xl border border-white/10 bg-zinc-800 py-3 font-semibold hover:bg-zinc-700 disabled:opacity-50">
                  {rewriteLoading ? "Rewriting..." : "Rewrite This Chapter"}
                </button>

                <button onClick={continueStory} disabled={continueLoading} className="rounded-2xl bg-rose-500 py-3 font-bold hover:bg-rose-400 disabled:opacity-50">
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

function getStoryTitle(form: StoryForm) {
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
  return value.split(", ").filter(Boolean).includes("Custom");
}

function resolveCustomList(value: string, customValue: string) {
  if (!value) return customValue.trim();

  return value
    .split(", ")
    .filter(Boolean)
    .map((part) => (part === "Custom" && customValue.trim() ? customValue.trim() : part))
    .join(", ");
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
  const woundField = `${prefix}Wound`;
  const customWoundField = `${prefix}WoundCustom`;

  return (
    <Card title={title}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Name" field={`${prefix}Name`} form={form} updateField={updateField} />
        <Input label="Age" field={`${prefix}Age`} form={form} updateField={updateField} />
      </div>

      <TextArea label="Appearance" field={`${prefix}Appearance`} form={form} updateField={updateField} />

      <div className="grid gap-4 md:grid-cols-2">
        <Select label="Job / Role" field={jobField} value={form[jobField]} updateField={updateField} options={jobOptions} />
        {form[jobField] === "Custom" && <Input label="Custom Job / Role" field={customJobField} form={form} updateField={updateField} />}

        <Select label="Attachment Style" field={`${prefix}Attachment`} value={form[`${prefix}Attachment`]} updateField={updateField} options={ATTACHMENT_STYLES} />
        <Select label="Jealousy Style" field={`${prefix}Jealousy`} value={form[`${prefix}Jealousy`]} updateField={updateField} options={JEALOUSY_STYLES} />
        <Select label="Flirting Style" field={`${prefix}Flirting`} value={form[`${prefix}Flirting`]} updateField={updateField} options={FLIRTING_STYLES} />
        <Select label="Secret" field={secretField} value={form[secretField]} updateField={updateField} options={SECRET_OPTIONS} />
      </div>

      {form[secretField] === "Custom" && <Input label="Custom Secret" field={customSecretField} form={form} updateField={updateField} />}

      <CheckboxGroup label="Personality" field={`${prefix}Personality`} selected={form[`${prefix}Personality`]} options={TRAIT_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Speech Quirks" field={`${prefix}Speech`} selected={form[`${prefix}Speech`]} options={SPEECH_QUIRK_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Flaws" field={`${prefix}Flaws`} selected={form[`${prefix}Flaws`]} options={FLAW_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Biggest Desire" field={`${prefix}Desire`} selected={form[`${prefix}Desire`]} options={DESIRE_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Biggest Fear" field={`${prefix}Fear`} selected={form[`${prefix}Fear`]} options={FEAR_OPTIONS} updateField={updateField} />
      <CheckboxGroup label="Character Wound" field={woundField} selected={form[woundField]} options={CHARACTER_WOUNDS} updateField={updateField} />
      {hasCustom(form[woundField]) && <Input label="Custom Wound" field={customWoundField} form={form} updateField={updateField} />}
      <CheckboxGroup label="Love Language" field={`${prefix}LoveLanguage`} selected={form[`${prefix}LoveLanguage`]} options={LOVE_LANGUAGES} updateField={updateField} />

      <TextArea label="Extra Character Notes" field={`${prefix}CustomNotes`} form={form} updateField={updateField} placeholder="Anything specific you want included..." />
    </Card>
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

function Input({ label, field, form, updateField }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input value={form[field] || ""} onChange={(e) => updateField(field, e.target.value)} className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none" />
    </label>
  );
}

function TextArea({ label, field, form, updateField, placeholder = "" }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea value={form[field] || ""} onChange={(e) => updateField(field, e.target.value)} placeholder={placeholder} className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none" />
    </label>
  );
}

function Select({ label, field, value, updateField, options }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <select value={value || ""} onChange={(e) => updateField(field, e.target.value)} className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 outline-none">
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
    const updated = current.includes(option) ? current.filter((item: string) => item !== option) : [...current, option];
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
              className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-rose-400 bg-rose-500 text-white" : "border-white/10 bg-zinc-950/70 text-zinc-300 hover:border-rose-400"}`}
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

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-rose-300">{label}</p>
      <p className="mt-2 text-zinc-100">{value || "Not set"}</p>
    </div>
  );
}
