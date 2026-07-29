"use client";

import { FormEvent, useEffect, useState } from "react";

import { supabase } from "../../lib/supabaseClient";

import ChatPanel from "./components/ChatPanel";

import ChapterPanel from "./components/ChapterPanel";

import BiblePanel from "./components/BiblePanel";

import type {
  ActiveTab,
  GenerationDiagnostic,
  StoryBible,
  StoryChapter,
  StoryChatResponse,
  StoryState,
  StoryWorkspace,
} from "./types";

const STORAGE_KEY = "novelforge-current-story";

const PENDING_GENERATION_KEY = "novelforge-pending-chapter-generation";

type PendingChapterGeneration = {
  storyId: string;
  generatedChapter: NonNullable<StoryChatResponse["generatedChapter"]>;
  chapterBrief: string;
  latestUserMessage: string;
  draft: string;
  minimumWordCount: number;
  maximumWordCount: number;
  diagnostics?: GenerationDiagnostic[];
  qualityAccepted?: boolean;
};

type WriterResponse = {
  prose: string;
  totalWordCount: number;
  isComplete: boolean;
  diagnostics: GenerationDiagnostic[];
};

type LedgerResponse = {
  storyState: StoryWorkspace["storyState"];
  diagnostics: GenerationDiagnostic[];
};

type QualityResponse = {
  accepted: boolean;
  chapterContent: string;
  repaired: boolean;
  quality: {
    passed: boolean;
    hardFailures: string[];
    repairInstructions: string[];
    summary: string;
    scores: {
      continuity: number;
      plotMovement: number;
      relationshipProgression: number;
      voiceDistinctiveness: number;
      povAndTense: number;
      repetitionControl: number;
      hookStrength: number;
    };
  };
  diagnostics: GenerationDiagnostic[];
};

const EMPTY_STORY_BIBLE: StoryBible = {
  premise: "",

  relationship: "",

  subgenre: "",

  setting: "",

  pov: "",

  heatLevel: "",

  burnPacing: "",

  tropes: [],

  characters: [],

  notes: [],
};

const EMPTY_STORY_STATE = {
  importantFacts: [],

  characterStates: [],

  relationshipStates: [],

  unresolvedThreads: [],

  timeline: [],

  locations: [],

  activePOV: "",

  chapterLedger: [],

  latestChapterEnding: "",

  characterKnowledge: [],

  repetitionWarnings: [],

  voiceProfiles: [],

  lastGenerationDiagnostics: [],
};

function createEmptyStory(): StoryWorkspace {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    title: "Untitled story",

    seriesType: "standalone",

    seriesTitle: "",

    bookNumber: 1,

    messages: [
      {
        id: Date.now(),

        role: "assistant",

        content: "Hi Alex. What kind of story are we building this time?",
      },
    ],

    chapters: [],

    storyBible: {
      ...EMPTY_STORY_BIBLE,

      tropes: [],

      characters: [],

      notes: [],
    },

    storyState: {
      ...EMPTY_STORY_STATE,
    },

    createdAt: now,

    updatedAt: now,
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getStoryStateBeforeChapter(
  state: StoryState,
  replacementNumber: number | null,
): StoryState {
  if (replacementNumber === null) {
    return state;
  }

  const earlierLedger = (state.chapterLedger ?? []).filter(
    (entry) => entry.chapterNumber < replacementNumber,
  );
  const previousChapter = earlierLedger.at(-1);

  return {
    ...EMPTY_STORY_STATE,
    chapterLedger: earlierLedger,
    latestChapterEnding: previousChapter?.endingExcerpt ?? "",
    repetitionWarnings: earlierLedger
      .flatMap((entry) => entry.repeatedBeats)
      .filter(Boolean)
      .slice(-30),
    voiceProfiles: state.voiceProfiles ?? [],
    activePOV: previousChapter?.povCharacter ?? "",
  };
}

function meetsAcceptedMinimum(text: string, minimumWordCount: number): boolean {
  return countWords(text) >= minimumWordCount;
}

function getRequestedWordCount(message: string): number | null {
  const match = message.match(/\b(\d{3,5})\s*words?\b/i);

  if (!match) {
    return null;
  }

  const wordCount = Number(match[1]);

  return Number.isFinite(wordCount) ? wordCount : null;
}

function isGenerationDiagnostic(value: unknown): value is GenerationDiagnostic {
  if (!value || typeof value !== "object") {
    return false;
  }

  const diagnostic = value as Partial<GenerationDiagnostic>;

  return (
    typeof diagnostic.stage === "string" &&
    (diagnostic.provider === "openai" ||
      diagnostic.provider === "openrouter") &&
    typeof diagnostic.model === "string" &&
    (diagnostic.status === undefined ||
      diagnostic.status === "succeeded" ||
      diagnostic.status === "failed") &&
    typeof diagnostic.inputTokens === "number" &&
    typeof diagnostic.outputTokens === "number" &&
    typeof diagnostic.totalTokens === "number" &&
    (diagnostic.costUsd === null || typeof diagnostic.costUsd === "number") &&
    (diagnostic.costType === undefined ||
      diagnostic.costType === "reported" ||
      diagnostic.costType === "estimated" ||
      diagnostic.costType === "unavailable") &&
    typeof diagnostic.durationMs === "number" &&
    typeof diagnostic.attempt === "number" &&
    (diagnostic.error === undefined || typeof diagnostic.error === "string")
  );
}

function isDiagnosticArray(value: unknown): value is GenerationDiagnostic[] {
  return Array.isArray(value) && value.every(isGenerationDiagnostic);
}

function getDiagnosticCostType(
  diagnostic: GenerationDiagnostic,
): "reported" | "estimated" | "unavailable" {
  if (diagnostic.costType) {
    return diagnostic.costType;
  }

  if (diagnostic.costUsd === null) {
    return "unavailable";
  }

  return diagnostic.provider === "openai" ? "estimated" : "reported";
}

function formatGenerationDiagnostics(
  diagnostics: GenerationDiagnostic[],
  pipelineStatus: "succeeded" | "failed" | "in progress",
): string {
  const totalTokens = diagnostics.reduce(
    (sum, diagnostic) => sum + diagnostic.totalTokens,
    0,
  );
  const totalDurationMs = diagnostics.reduce(
    (sum, diagnostic) => sum + diagnostic.durationMs,
    0,
  );
  const reportedCost = diagnostics.reduce(
    (sum, diagnostic) =>
      getDiagnosticCostType(diagnostic) === "reported"
        ? sum + (diagnostic.costUsd ?? 0)
        : sum,
    0,
  );
  const estimatedCost = diagnostics.reduce(
    (sum, diagnostic) =>
      getDiagnosticCostType(diagnostic) === "estimated"
        ? sum + (diagnostic.costUsd ?? 0)
        : sum,
    0,
  );
  const unavailableCostCalls = diagnostics.filter(
    (diagnostic) => getDiagnosticCostType(diagnostic) === "unavailable",
  ).length;
  const failedCalls = diagnostics.filter(
    (diagnostic) => diagnostic.status === "failed",
  ).length;
  const costParts = [];

  if (reportedCost > 0) {
    costParts.push(`$${reportedCost.toFixed(4)} provider-reported`);
  }

  if (estimatedCost > 0) {
    costParts.push(`$${estimatedCost.toFixed(4)} estimated`);
  }

  if (unavailableCostCalls > 0) {
    costParts.push(
      `${unavailableCostCalls} ${
        unavailableCostCalls === 1 ? "call" : "calls"
      } with unavailable cost`,
    );
  }

  const costText =
    costParts.length > 0 ? costParts.join(", ") : "$0.0000 recorded";

  return `Generation diagnostics: ${diagnostics.length} model ${
    diagnostics.length === 1 ? "call" : "calls"
  }, ${totalTokens.toLocaleString()} tokens, ${(totalDurationMs / 1000).toFixed(
    1,
  )} seconds, ${costText}, pipeline ${pipelineStatus}, ${failedCalls} ${
    failedCalls === 1 ? "provider-call failure" : "provider-call failures"
  }.`;
}

function stripGenerationDiagnostics(content: string): string {
  return content.replace(/\s*Generation diagnostics:[\s\S]*$/i, "").trim();
}

function isWriterResponse(value: unknown): value is WriterResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<WriterResponse>;

  return (
    typeof response.prose === "string" &&
    Boolean(response.prose.trim()) &&
    typeof response.totalWordCount === "number" &&
    typeof response.isComplete === "boolean" &&
    isDiagnosticArray(response.diagnostics)
  );
}

function isPendingGeneration(
  value: unknown,
): value is PendingChapterGeneration {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pending = value as Partial<PendingChapterGeneration>;
  const chapter = pending.generatedChapter;

  return (
    typeof pending.storyId === "string" &&
    Boolean(chapter) &&
    typeof chapter?.title === "string" &&
    typeof chapter?.povCharacter === "string" &&
    typeof chapter?.content === "string" &&
    (chapter?.replaceChapterNumber === null ||
      typeof chapter?.replaceChapterNumber === "number") &&
    typeof pending.chapterBrief === "string" &&
    typeof pending.latestUserMessage === "string" &&
    typeof pending.draft === "string" &&
    typeof pending.minimumWordCount === "number" &&
    typeof pending.maximumWordCount === "number" &&
    (pending.diagnostics === undefined ||
      isDiagnosticArray(pending.diagnostics)) &&
    (pending.qualityAccepted === undefined ||
      typeof pending.qualityAccepted === "boolean")
  );
}

class ApiRequestError extends Error {
  diagnostics: GenerationDiagnostic[];

  constructor(message: string, diagnostics: GenerationDiagnostic[] = []) {
    super(message);
    this.name = "ApiRequestError";
    this.diagnostics = diagnostics;
  }
}

async function readApiJson(response: Response): Promise<unknown> {
  const responseText = await response.text();
  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      const preview = responseText.replace(/\s+/g, " ").trim().slice(0, 120);

      throw new Error(
        `The server returned HTTP ${response.status} with a non-JSON response${
          preview ? `: ${preview}` : "."
        }`,
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `The server returned HTTP ${response.status}.`;

    const diagnostics =
      data &&
      typeof data === "object" &&
      "diagnostics" in data &&
      isDiagnosticArray(data.diagnostics)
        ? data.diagnostics
        : [];

    throw new ApiRequestError(errorMessage, diagnostics);
  }

  return data;
}

function isStoryBible(value: unknown): value is StoryBible {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bible = value as Partial<StoryBible>;

  return (
    typeof bible.premise === "string" &&
    typeof bible.relationship === "string" &&
    typeof bible.subgenre === "string" &&
    typeof bible.setting === "string" &&
    typeof bible.pov === "string" &&
    typeof bible.heatLevel === "string" &&
    typeof bible.burnPacing === "string" &&
    isStringArray(bible.tropes) &&
    isStringArray(bible.characters) &&
    isStringArray(bible.notes)
  );
}

function isStoryState(value: unknown): value is StoryWorkspace["storyState"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<StoryWorkspace["storyState"]>;

  const chapterLedgerIsValid =
    state.chapterLedger === undefined ||
    (Array.isArray(state.chapterLedger) &&
      state.chapterLedger.every(
        (entry) =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.chapterNumber === "number" &&
          typeof entry.title === "string" &&
          typeof entry.povCharacter === "string" &&
          typeof entry.summary === "string" &&
          typeof entry.openingLocation === "string" &&
          typeof entry.endingLocation === "string" &&
          typeof entry.endingTime === "string" &&
          typeof entry.endingExcerpt === "string" &&
          typeof entry.relationshipShift === "string" &&
          typeof entry.intimacyMilestone === "string" &&
          isStringArray(entry.newFacts) &&
          isStringArray(entry.unresolvedThreads) &&
          isStringArray(entry.repeatedBeats),
      ));
  const voiceProfilesAreValid =
    state.voiceProfiles === undefined ||
    (Array.isArray(state.voiceProfiles) &&
      state.voiceProfiles.every(
        (profile) =>
          Boolean(profile) &&
          typeof profile === "object" &&
          typeof profile.characterName === "string" &&
          typeof profile.narrativeRhythm === "string" &&
          typeof profile.vocabulary === "string" &&
          typeof profile.humourStyle === "string" &&
          typeof profile.emotionalDeflection === "string" &&
          typeof profile.sensoryFocus === "string" &&
          typeof profile.dialoguePattern === "string" &&
          typeof profile.internalThoughtPattern === "string" &&
          isStringArray(profile.forbiddenHabits),
      ));

  return (
    isStringArray(state.importantFacts) &&
    isStringArray(state.characterStates) &&
    isStringArray(state.relationshipStates) &&
    isStringArray(state.unresolvedThreads) &&
    isStringArray(state.timeline) &&
    isStringArray(state.locations) &&
    typeof state.activePOV === "string" &&
    chapterLedgerIsValid &&
    (state.latestChapterEnding === undefined ||
      typeof state.latestChapterEnding === "string") &&
    (state.characterKnowledge === undefined ||
      isStringArray(state.characterKnowledge)) &&
    (state.repetitionWarnings === undefined ||
      isStringArray(state.repetitionWarnings)) &&
    voiceProfilesAreValid &&
    (state.lastGenerationDiagnostics === undefined ||
      isDiagnosticArray(state.lastGenerationDiagnostics))
  );
}

function isLedgerResponse(value: unknown): value is LedgerResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<LedgerResponse>;

  return (
    isStoryState(response.storyState) && isDiagnosticArray(response.diagnostics)
  );
}

async function updateContinuityLedger(input: {
  storyBible: StoryBible;
  storyState: StoryState;
  chapters: StoryChapter[];
  chapter: StoryChapter;
  rebuild: boolean;
}): Promise<LedgerResponse> {
  const batches = input.rebuild
    ? Array.from({ length: Math.ceil(input.chapters.length / 3) }, (_, index) =>
        input.chapters.slice(index * 3, index * 3 + 3),
      )
    : [[input.chapter]];
  let workingState: StoryState = input.rebuild
    ? { ...EMPTY_STORY_STATE }
    : input.storyState;
  const diagnostics: GenerationDiagnostic[] = [];

  for (const batch of batches) {
    const latestBatchChapter = batch[batch.length - 1];

    if (!latestBatchChapter) {
      continue;
    }

    let batchCompleted = false;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch("/api/story-chat/ledger", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storyBible: input.storyBible,
            storyState: workingState,
            chapters: batch,
            chapter: latestBatchChapter,
            rebuildMode: input.rebuild ? "batch" : "incremental",
          }),
        });
        const data = await readApiJson(response);

        if (!isLedgerResponse(data)) {
          throw new Error(
            "The continuity endpoint returned an invalid story ledger.",
          );
        }

        workingState = data.storyState;
        diagnostics.push(...data.diagnostics);
        batchCompleted = true;
        break;
      } catch (error) {
        lastError = error;

        if (error instanceof ApiRequestError) {
          diagnostics.push(...error.diagnostics);
        }
      }
    }

    if (!batchCompleted) {
      throw new ApiRequestError(
        lastError instanceof Error
          ? lastError.message
          : "The continuity ledger failed twice.",
        diagnostics,
      );
    }
  }

  return {
    storyState: workingState,
    diagnostics,
  };
}

function isQualityResponse(value: unknown): value is QualityResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<QualityResponse>;
  const quality = response.quality;
  const scores = quality?.scores;

  return (
    typeof response.accepted === "boolean" &&
    typeof response.chapterContent === "string" &&
    Boolean(response.chapterContent.trim()) &&
    typeof response.repaired === "boolean" &&
    Boolean(quality) &&
    typeof quality?.passed === "boolean" &&
    isStringArray(quality?.hardFailures) &&
    isStringArray(quality?.repairInstructions) &&
    typeof quality?.summary === "string" &&
    Boolean(scores) &&
    typeof scores?.continuity === "number" &&
    typeof scores?.plotMovement === "number" &&
    typeof scores?.relationshipProgression === "number" &&
    typeof scores?.voiceDistinctiveness === "number" &&
    typeof scores?.povAndTense === "number" &&
    typeof scores?.repetitionControl === "number" &&
    typeof scores?.hookStrength === "number" &&
    isDiagnosticArray(response.diagnostics)
  );
}

function isStoryChapter(
  value: unknown,
): value is StoryWorkspace["chapters"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const chapter = value as Partial<StoryWorkspace["chapters"][number]>;

  return (
    typeof chapter.id === "string" &&
    typeof chapter.number === "number" &&
    typeof chapter.title === "string" &&
    typeof chapter.povCharacter === "string" &&
    typeof chapter.content === "string" &&
    typeof chapter.createdAt === "string" &&
    typeof chapter.updatedAt === "string"
  );
}

function isStoryWorkspace(value: unknown): value is StoryWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoryWorkspace>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (candidate.seriesType === "standalone" ||
      candidate.seriesType === "series") &&
    typeof candidate.seriesTitle === "string" &&
    typeof candidate.bookNumber === "number" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(
      (message) =>
        Boolean(message) &&
        typeof message === "object" &&
        typeof message.id === "number" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    ) &&
    Array.isArray(candidate.chapters) &&
    candidate.chapters.every(isStoryChapter) &&
    isStoryBible(candidate.storyBible) &&
    isStoryState(candidate.storyState) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isStoryChatResponse(value: unknown): value is StoryChatResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<StoryChatResponse>;

  const generatedChapterIsValid =
    response.generatedChapter === null ||
    (Boolean(response.generatedChapter) &&
      typeof response.generatedChapter?.title === "string" &&
      typeof response.generatedChapter?.povCharacter === "string" &&
      typeof response.generatedChapter?.content === "string" &&
      (response.generatedChapter?.replaceChapterNumber === null ||
        typeof response.generatedChapter?.replaceChapterNumber === "number"));

  return (
    typeof response.reply === "string" &&
    Boolean(response.reply.trim()) &&
    (response.intent === "create_story" ||
      response.intent === "continue_story" ||
      response.intent === "rewrite_chapter" ||
      response.intent === "update_story" ||
      response.intent === "brainstorm" ||
      response.intent === "general_chat") &&
    isStoryWorkspace(response.story) &&
    generatedChapterIsValid &&
    typeof response.chapterBrief === "string" &&
    (response.diagnostics === undefined ||
      isDiagnosticArray(response.diagnostics))
  );
}

function hasStoryBibleContent(storyBible: StoryBible): boolean {
  return Boolean(
    storyBible.premise.trim() ||
      storyBible.relationship.trim() ||
      storyBible.subgenre.trim() ||
      storyBible.setting.trim() ||
      storyBible.pov.trim() ||
      storyBible.heatLevel.trim() ||
      storyBible.burnPacing.trim() ||
      storyBible.tropes.length ||
      storyBible.characters.length ||
      storyBible.notes.length,
  );
}

function applyGeneratedChapter(
  story: StoryWorkspace,
  pending: PendingChapterGeneration,
  content: string,
): StoryWorkspace {
  const now = new Date().toISOString();
  const chapterMetadata = pending.generatedChapter;
  const replacementNumber = chapterMetadata.replaceChapterNumber;

  if (replacementNumber !== null) {
    const chapterExists = story.chapters.some(
      (chapter) => chapter.number === replacementNumber,
    );

    if (!chapterExists) {
      throw new Error(
        `Chapter ${replacementNumber} could not be found for rewriting.`,
      );
    }

    return {
      ...story,
      chapters: story.chapters.map((chapter) =>
        chapter.number === replacementNumber
          ? {
              ...chapter,
              title: chapterMetadata.title.trim() || chapter.title,
              povCharacter:
                chapterMetadata.povCharacter.trim() || chapter.povCharacter,
              content: content.trim(),
              updatedAt: now,
            }
          : chapter,
      ),
      updatedAt: now,
    };
  }

  const nextChapterNumber =
    story.chapters.length > 0
      ? Math.max(...story.chapters.map((chapter) => chapter.number)) + 1
      : 1;

  return {
    ...story,
    chapters: [
      ...story.chapters,
      {
        id: crypto.randomUUID(),
        number: nextChapterNumber,
        title: chapterMetadata.title.trim() || `Chapter ${nextChapterNumber}`,
        povCharacter: chapterMetadata.povCharacter.trim(),
        content: content.trim(),
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}

export default function StoryChatPage() {
  const [story, setStory] = useState<StoryWorkspace | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");

  const [authMessage, setAuthMessage] = useState("");

  const [authChecked, setAuthChecked] = useState(false);

  const [hasLoadedRemoteStory, setHasLoadedRemoteStory] = useState(false);

  const [input, setInput] = useState("");

  const [isThinking, setIsThinking] = useState(false);

  const [hasLoaded, setHasLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [readerOpen, setReaderOpen] = useState(false);

  const [isExportOpen, setIsExportOpen] = useState(false);

  const [exportWarnings, setExportWarnings] = useState("");

  const [isExporting, setIsExporting] = useState(false);

  const [exportError, setExportError] = useState("");

  const [pendingGeneration, setPendingGeneration] =
    useState<PendingChapterGeneration | null>(null);

  const [stories, setStories] = useState<
    {
      id: string;

      title: string;

      createdAt: string;

      updatedAt: string;
    }[]
  >([]);

  const [readerTheme, setReaderTheme] = useState<"light" | "dark" | "sepia">(
    "sepia",
  );

  const [readerFontSize, setReaderFontSize] = useState(18);

  const [readerLineHeight, setReaderLineHeight] = useState(2);

  const [readerWidth, setReaderWidth] = useState<"narrow" | "medium" | "wide">(
    "medium",
  );

  const messages = story?.messages ?? [];

  const storyTitle = story?.title ?? "Untitled story";

  const chapters = story?.chapters ?? [];

  const storyBible = story?.storyBible ?? EMPTY_STORY_BIBLE;

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const id = session?.user?.id ?? null;

        setUserId(id);

        setAuthChecked(true);

        if (id) {
          await loadStoryList(id);
        }
      } catch (error) {
        console.error("Failed to check login:", error);

        setUserId(null);

        setAuthChecked(true);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;

      setUserId(id);

      setAuthChecked(true);

      if (id) {
        loadStoryList(id).catch((error) => {
          console.error("Failed to load stories:", error);
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadStoryList(currentUserId: string) {
    const { data, error } = await supabase

      .from("stories")

      .select("id, title, created_at, updated_at")

      .eq("user_id", currentUserId)

      .order("updated_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Could not load story list:",

        error,
      );

      return;
    }

    setStories(
      (data ?? []).map((item) => ({
        id: item.id,

        title: item.title || "Untitled Story",

        createdAt: item.created_at,

        updatedAt: item.updated_at,
      })),
    );
  }

  async function openStory(storyId: string) {
    if (!userId) {
      return;
    }

    const { data, error } = await supabase

      .from("stories")

      .select("*")

      .eq("id", storyId)

      .eq("user_id", userId)

      .single();

    if (error || !data) {
      console.error("Could not open story:", error);

      return;
    }

    window.localStorage.setItem(
      "novelforge-current-story-id",

      data.id,
    );

    setStory({
      id: data.id,

      title: data.title,

      seriesType: "standalone",

      seriesTitle: "",

      bookNumber: 1,

      messages: data.messages ?? [],

      chapters: data.chapters ?? [],

      storyBible: data.form ?? EMPTY_STORY_BIBLE,

      storyState: data.story_state ?? {},

      createdAt: data.created_at,

      updatedAt: data.updated_at,
    });

    setActiveTab("chapters");

    setReaderOpen((data.chapters ?? []).length > 0);

    setIsMenuOpen(false);
  }

  async function createNewStory() {
    const newStory = createEmptyStory();

    window.localStorage.setItem(
      "novelforge-current-story-id",

      newStory.id,
    );

    window.localStorage.setItem(
      STORAGE_KEY,

      JSON.stringify(newStory),
    );

    setStory(newStory);

    setInput("");

    setActiveTab("chat");

    setReaderOpen(false);

    setIsThinking(false);

    setIsMenuOpen(false);

    if (!userId) {
      return;
    }

    const { error } = await supabase

      .from("stories")

      .insert({
        id: newStory.id,

        user_id: userId,

        title: newStory.title,

        form: newStory.storyBible,

        chapters: newStory.chapters,

        messages: newStory.messages,

        story_state: newStory.storyState,

        active_chapter_index: 0,

        custom_rewrite: "",

        created_at: newStory.createdAt,

        updated_at: newStory.updatedAt,
      });

    if (error) {
      console.error("Could not create story:", error);

      return;
    }

    await loadStoryList(userId);
  }

  async function deleteStory(storyId: string) {
    if (!userId) {
      return;
    }

    const storyToDelete = stories.find((item) => item.id === storyId);

    const confirmed = window.confirm(
      `Delete "${storyToDelete?.title ?? "this story"}"? This cannot be
undone.`,
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase

      .from("stories")

      .delete()

      .eq("id", storyId)

      .eq("user_id", userId);

    if (error) {
      console.error("Could not delete story:", error);

      return;
    }

    if (story?.id === storyId) {
      await createNewStory();

      return;
    }

    await loadStoryList(userId);
  }

  useEffect(() => {
    const savedPending = localStorage.getItem(PENDING_GENERATION_KEY);

    if (!savedPending) {
      return;
    }

    try {
      const parsedPending: unknown = JSON.parse(savedPending);

      if (isPendingGeneration(parsedPending)) {
        setPendingGeneration(parsedPending);
      } else {
        localStorage.removeItem(PENDING_GENERATION_KEY);
      }
    } catch {
      localStorage.removeItem(PENDING_GENERATION_KEY);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("novelforge-reader");

    if (!saved) return;

    try {
      const settings = JSON.parse(saved);

      if (settings.theme) setReaderTheme(settings.theme);

      if (settings.fontSize) setReaderFontSize(settings.fontSize);

      if (settings.lineHeight) setReaderLineHeight(settings.lineHeight);

      if (settings.width) setReaderWidth(settings.width);
    } catch {
      // Ignore invalid settings
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "novelforge-reader",

      JSON.stringify({
        theme: readerTheme,

        fontSize: readerFontSize,

        lineHeight: readerLineHeight,

        width: readerWidth,
      }),
    );
  }, [readerTheme, readerFontSize, readerLineHeight, readerWidth]);

  useEffect(() => {
    async function loadStory() {
      try {
        const currentStoryId = window.localStorage.getItem(
          "novelforge-current-story-id",
        );

        if (userId) {
          let data = null;

          if (currentStoryId) {
            const { data: current } = await supabase

              .from("stories")

              .select("*")

              .eq("id", currentStoryId)

              .eq("user_id", userId)

              .maybeSingle();

            data = current;
          }

          if (!data) {
            const { data: latest } = await supabase

              .from("stories")

              .select("*")

              .eq("user_id", userId)

              .order("updated_at", { ascending: false })

              .limit(1)

              .maybeSingle();

            data = latest;
          }

          if (data) {
            window.localStorage.setItem(
              "novelforge-current-story-id",

              data.id,
            );

            setStory({
              id: data.id,

              title: data.title,

              seriesType: "standalone",

              seriesTitle: "",

              bookNumber: 1,

              messages: data.messages ?? [],

              chapters: data.chapters ?? [],

              storyBible: data.form ?? EMPTY_STORY_BIBLE,

              storyState: data.story_state ?? {},

              createdAt: data.created_at,

              updatedAt: data.updated_at,
            });

            setHasLoaded(true);

            setHasLoadedRemoteStory(true);

            return;
          }
        }

        const savedStory = window.localStorage.getItem(STORAGE_KEY);

        if (!savedStory) {
          setStory(createEmptyStory());
        } else {
          const parsedStory = JSON.parse(savedStory);

          if (isStoryWorkspace(parsedStory)) {
            setStory(parsedStory);
          } else {
            setStory(createEmptyStory());
          }
        }
      } catch (error) {
        console.error(
          "Could not load the saved story:",

          error,
        );

        setStory(createEmptyStory());
      } finally {
        setHasLoaded(true);

        setHasLoadedRemoteStory(true);
      }
    }

    loadStory();
  }, [userId]);

  useEffect(() => {
    if (!hasLoaded || !hasLoadedRemoteStory || !story || isThinking) {
      return;
    }

    try {
      window.localStorage.setItem(
        "novelforge-current-story-id",

        story.id,
      );

      window.localStorage.setItem(
        STORAGE_KEY,

        JSON.stringify(story),
      );
    } catch (error) {
      console.error("Could not save the story:", error);
    }

    if (!userId) {
      return;
    }

    const storyToSave = story;

    const userIdToSave = userId;

    async function saveStoryToSupabase() {
      const { error } = await supabase

        .from("stories")

        .upsert(
          {
            id: storyToSave.id,

            user_id: userIdToSave,

            title: storyToSave.title,

            form: storyToSave.storyBible,

            story_state: storyToSave.storyState,

            chapters: storyToSave.chapters,

            messages: storyToSave.messages,

            updated_at: storyToSave.updatedAt,
          },

          {
            onConflict: "id",
          },
        );

      if (error) {
        console.error(
          "Could not save Story Chat to Supabase:",

          error,
        );
      } else {
        await loadStoryList(userIdToSave);
      }
    }

    saveStoryToSupabase();
  }, [story, hasLoaded, hasLoadedRemoteStory, userId, isThinking]);

  function startNewStory() {
    const confirmed = window.confirm(
      `Start a new story? This will replace the current story on this
device.`,
    );

    if (!confirmed) {
      return;
    }

    const newStory = createEmptyStory();

    setStory(newStory);

    if (userId) {
      void supabase.from("stories").upsert({
        id: newStory.id,

        user_id: userId,

        title: newStory.title,

        form: newStory.storyBible,

        story_state: newStory.storyState,

        chapters: newStory.chapters,

        messages: newStory.messages,

        created_at: newStory.createdAt,

        updated_at: newStory.updatedAt,
      });
    }

    setInput("");

    setActiveTab("chat");

    setIsThinking(false);
  }

  function updateChapter(
    chapterId: string,

    updates: {
      title: string;

      povCharacter: string;

      content: string;
    },
  ) {
    setStory((currentStory) => {
      if (!currentStory) {
        return currentStory;
      }

      return {
        ...currentStory,

        chapters: currentStory.chapters.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,

                ...updates,

                updatedAt: new Date().toISOString(),
              }
            : chapter,
        ),

        updatedAt: new Date().toISOString(),
      };
    });
  }

  function updateStoryTitle(value: string) {
    setStory((currentStory) => {
      if (!currentStory) {
        return currentStory;
      }

      return {
        ...currentStory,

        title: value,

        updatedAt: new Date().toISOString(),
      };
    });
  }

  async function exportWordDocument() {
    if (!story || story.chapters.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError("");

    try {
      const contentWarnings = exportWarnings
        .split(/\n|,/)
        .map((warning) => warning.trim())
        .filter(Boolean);

      const response = await fetch("/api/export-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: story.title,
          author: "Marlow Quinn",
          chapters: story.chapters,
          contentWarnings,
        }),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        const message =
          errorData &&
          typeof errorData === "object" &&
          "error" in errorData &&
          typeof errorData.error === "string"
            ? errorData.error
            : "The Word export failed.";

        throw new Error(message);
      }

      const documentBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(documentBlob);
      const downloadLink = document.createElement("a");
      const filename =
        story.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") ||
        "NovelForge_Book";

      downloadLink.href = downloadUrl;
      downloadLink.download = `${filename}.docx`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      setIsExportOpen(false);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The Word export failed.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function sendLoginLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setAuthMessage("Enter your email address.");

      return;
    }

    setAuthMessage("Sending login link...");

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,

      options: {
        emailRedirectTo: `${window.location.origin}/story-chat`,
      },
    });

    if (error) {
      console.error("Could not send login link:", error);

      setAuthMessage(error.message);

      return;
    }

    setAuthMessage("Check your email and open the login link.");
  }

  function restoreDefaultTitle() {
    setStory((currentStory) => {
      if (!currentStory || currentStory.title.trim()) {
        return currentStory;
      }

      return {
        ...currentStory,

        title: "Untitled story",

        updatedAt: new Date().toISOString(),
      };
    });
  }

  function savePendingGeneration(pending: PendingChapterGeneration) {
    setPendingGeneration(pending);
    localStorage.setItem(PENDING_GENERATION_KEY, JSON.stringify(pending));
  }

  function clearPendingGeneration() {
    setPendingGeneration(null);
    localStorage.removeItem(PENDING_GENERATION_KEY);
  }

  async function persistStory(nextStory: StoryWorkspace) {
    setStory(nextStory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStory));

    if (!userId) {
      return;
    }

    const { error } = await supabase.from("stories").upsert({
      id: nextStory.id,
      user_id: userId,
      title: nextStory.title,
      form: nextStory.storyBible,
      story_state: nextStory.storyState,
      chapters: nextStory.chapters,
      messages: nextStory.messages,
      created_at: nextStory.createdAt,
      updated_at: nextStory.updatedAt,
    });

    if (error) {
      throw new Error(`The story could not be saved: ${error.message}`);
    }

    await loadStoryList(userId);
  }

  async function runPendingChapter(
    initialPending: PendingChapterGeneration,
    baseStory: StoryWorkspace,
  ) {
    setIsThinking(true);
    let workingPending: PendingChapterGeneration =
      initialPending.minimumWordCount === 3000 &&
      initialPending.maximumWordCount === 4000
        ? {
            ...initialPending,
            minimumWordCount: 2000,
          }
        : initialPending;
    savePendingGeneration(workingPending);

    try {
      const replacementNumber =
        workingPending.generatedChapter.replaceChapterNumber;
      const writingStoryState = getStoryStateBeforeChapter(
        baseStory.storyState,
        replacementNumber,
      );
      const recentChapters =
        replacementNumber === null
          ? baseStory.chapters.slice(-1)
          : baseStory.chapters
              .filter((chapter) => chapter.number < replacementNumber)
              .slice(-1);

      const finishCompletedChapter = async (content: string) => {
        const chapterStory = applyGeneratedChapter(
          baseStory,
          workingPending,
          content,
        );
        const completedChapterNumber =
          replacementNumber ??
          Math.max(0, ...baseStory.chapters.map((chapter) => chapter.number)) +
            1;
        const completedChapter = chapterStory.chapters.find(
          (chapter) => chapter.number === completedChapterNumber,
        );

        if (!completedChapter) {
          throw new Error(
            "The completed chapter could not be prepared for continuity.",
          );
        }

        const latestExistingChapterNumber = Math.max(
          0,
          ...baseStory.chapters.map((chapter) => chapter.number),
        );
        const needsLedgerRebuild =
          !baseStory.storyState.chapterLedger?.length ||
          (replacementNumber !== null &&
            replacementNumber < latestExistingChapterNumber);
        const ledgerData = await updateContinuityLedger({
          storyBible: chapterStory.storyBible,
          storyState: baseStory.storyState,
          chapters: chapterStory.chapters,
          chapter: completedChapter,
          rebuild: needsLedgerRebuild,
        });

        const allDiagnostics = [
          ...(workingPending.diagnostics ?? []),
          ...ledgerData.diagnostics,
        ];
        const completedStory: StoryWorkspace = {
          ...chapterStory,
          storyState: {
            ...ledgerData.storyState,
            lastGenerationDiagnostics: allDiagnostics,
          },
          updatedAt: new Date().toISOString(),
        };

        await persistStory(completedStory);
        clearPendingGeneration();
      };

      if (workingPending.draft.trim()) {
        if (
          meetsAcceptedMinimum(
            workingPending.draft,
            workingPending.minimumWordCount,
          )
        ) {
          await finishCompletedChapter(workingPending.draft);
          return;
        }

        const continuationResponse = await fetch("/api/story-chat/write", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storyBible: baseStory.storyBible,
            storyState: writingStoryState,
            recentChapters,
            chapterBrief: "",
            latestUserMessage: workingPending.latestUserMessage,
            existingDraft: workingPending.draft,
            minimumWordCount: workingPending.minimumWordCount,
            maximumWordCount: workingPending.maximumWordCount,
          }),
        });

        const continuationData = await readApiJson(continuationResponse);

        if (!isWriterResponse(continuationData)) {
          throw new Error(
            "The writing endpoint returned an invalid continuation response.",
          );
        }

        workingPending = {
          ...workingPending,
          draft: continuationData.prose.trim(),
          diagnostics: [
            ...(workingPending.diagnostics ?? []),
            ...continuationData.diagnostics,
          ],
        };
        savePendingGeneration(workingPending);

        if (!continuationData.isComplete) {
          throw new Error(
            `Aion Full resumed the chapter to ${continuationData.totalWordCount} words, still outside the accepted ${workingPending.minimumWordCount} to ${workingPending.maximumWordCount} range. The combined draft has been preserved.`,
          );
        }

        await finishCompletedChapter(continuationData.prose.trim());
        return;
      }

      const response = await fetch("/api/story-chat/write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storyBible: baseStory.storyBible,
          storyState: writingStoryState,
          recentChapters,
          chapterBrief: "",
          latestUserMessage: workingPending.latestUserMessage,
          existingDraft: "",
          minimumWordCount: workingPending.minimumWordCount,
          maximumWordCount: workingPending.maximumWordCount,
        }),
      });

      const data = await readApiJson(response);

      if (!isWriterResponse(data)) {
        throw new Error("The writing endpoint returned an invalid response.");
      }

      workingPending = {
        ...workingPending,
        draft: data.prose.trim(),
        diagnostics: [
          ...(workingPending.diagnostics ?? []),
          ...data.diagnostics,
        ],
      };
      savePendingGeneration(workingPending);

      if (!data.isComplete) {
        throw new Error(
          `Aion Full returned ${data.totalWordCount} words, outside the accepted ${workingPending.minimumWordCount} to ${workingPending.maximumWordCount} range. The draft has been preserved for review.`,
        );
      }

      await finishCompletedChapter(data.prose.trim());
    } catch (error) {
      if (error instanceof ApiRequestError && error.diagnostics.length > 0) {
        workingPending = {
          ...workingPending,
          diagnostics: [
            ...(workingPending.diagnostics ?? []),
            ...error.diagnostics,
          ],
        };
        savePendingGeneration(workingPending);
      }

      const message =
        error instanceof Error ? error.message : "The writing request failed.";
      const failedDiagnostics = workingPending.diagnostics ?? [];
      const failedStory: StoryWorkspace = {
        ...baseStory,
        storyState: {
          ...baseStory.storyState,
          lastGenerationDiagnostics: failedDiagnostics,
        },
        messages: [
          ...baseStory.messages,
          {
            id: Date.now(),
            role: "assistant",
            content: `I couldn't complete the chapter: ${message}`,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      setStory(failedStory);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(failedStory));
    } finally {
      setIsThinking(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = input.trim();
    const hasPendingChapter = pendingGeneration?.storyId === story?.id;

    if (!story || !trimmedMessage || isThinking || hasPendingChapter) {
      return;
    }

    const userMessage = {
      id: Date.now(),

      role: "user" as const,

      content: trimmedMessage,
    };

    const requestStory: StoryWorkspace = {
      ...story,
      messages: [...story.messages, userMessage],
      updatedAt: new Date().toISOString(),
    };
    let planningStory = requestStory;
    let preplanningDiagnostics: GenerationDiagnostic[] = [];

    setStory(requestStory);

    setInput("");
    setIsThinking(true);

    try {
      if (
        planningStory.chapters.length > 0 &&
        !planningStory.storyState.chapterLedger?.length
      ) {
        const latestExistingChapter =
          planningStory.chapters[planningStory.chapters.length - 1];
        const ledgerData = await updateContinuityLedger({
          storyBible: planningStory.storyBible,
          storyState: planningStory.storyState,
          chapters: planningStory.chapters,
          chapter: latestExistingChapter,
          rebuild: true,
        });

        preplanningDiagnostics = ledgerData.diagnostics;
        planningStory = {
          ...planningStory,
          storyState: ledgerData.storyState,
          updatedAt: new Date().toISOString(),
        };

        await persistStory(planningStory);
      }

      const response = await fetch("/api/story-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage: "plan",
          story: planningStory,
        }),
      });

      const data = await readApiJson(response);

      if (!isStoryChatResponse(data)) {
        throw new Error("The planning endpoint returned an invalid response.");
      }

      const plannedStory: StoryWorkspace = {
        ...planningStory,
        ...data.story,
        messages: data.story.messages,
        chapters: data.story.chapters,
        storyBible: data.story.storyBible,
        storyState: data.story.storyState,
        updatedAt: data.story.updatedAt,
      };

      await persistStory(plannedStory);

      if (!data.generatedChapter) {
        return;
      }

      const requestedWordCount = getRequestedWordCount(trimmedMessage);
      const requestedTarget = requestedWordCount
        ? Math.min(4000, Math.max(2000, requestedWordCount))
        : null;
      const pending: PendingChapterGeneration = {
        storyId: plannedStory.id,
        generatedChapter: data.generatedChapter,
        chapterBrief: "",
        latestUserMessage: trimmedMessage,
        draft: "",
        minimumWordCount: requestedTarget
          ? Math.max(2000, Math.floor(requestedTarget * 0.95))
          : 2000,
        maximumWordCount: requestedTarget
          ? Math.min(4000, Math.ceil(requestedTarget * 1.1))
          : 4000,
        diagnostics: [...preplanningDiagnostics, ...(data.diagnostics ?? [])],
      };

      savePendingGeneration(pending);
      await runPendingChapter(pending, plannedStory);
    } catch (error) {
      console.error(
        "Story chat request failed:",

        error,
      );

      const errorMessage =
        error instanceof Error && error.message.trim()
          ? `I couldn't complete that: ${error.message}`
          : "Something went wrong while I was thinking. Try sending that again.";
      const failureDiagnostics = [
        ...preplanningDiagnostics,
        ...(error instanceof ApiRequestError ? error.diagnostics : []),
      ];

      const failedStory: StoryWorkspace = {
        ...planningStory,
        storyState: {
          ...planningStory.storyState,
          lastGenerationDiagnostics: failureDiagnostics,
        },
        messages: [
          ...planningStory.messages,
          {
            id: Date.now(),
            role: "assistant",
            content: errorMessage,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      setStory(failedStory);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(failedStory));
    } finally {
      setIsThinking(false);
    }
  }

  if (!authChecked) {
    return (
      <main
        className="flex min-h-screen items-center justify-center
bg-neutral-950 px-5 text-white"
      >
        <p className="text-sm text-neutral-500">Checking login...</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main
        className="flex min-h-screen items-center justify-center
bg-neutral-950 px-5 text-white"
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/10
bg-neutral-900 p-6"
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.3em]
text-pink-500"
          >
            NovelForge
          </p>

          <h1 className="mt-3 text-2xl font-semibold">Sign in</h1>

          <p className="mt-2 text-sm text-neutral-400">
            Sign in with the same email on every device to access your stories.
          </p>

          <form onSubmit={sendLoginLink} className="mt-6 space-y-4">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3
text-white outline-none placeholder:text-neutral-600
focus:border-pink-500"
            />

            <button
              type="submit"
              className="w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold
text-white transition hover:bg-pink-400"
            >
              Send login link
            </button>
          </form>

          {authMessage && (
            <p className="mt-4 text-sm text-neutral-300">{authMessage}</p>
          )}
        </div>
      </main>
    );
  }

  if (!hasLoaded || !story) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div
          className="mx-auto flex min-h-screen max-w-5xl items-center
justify-center px-5"
        >
          <p className="text-sm text-neutral-500">Loading NovelForge...</p>
        </div>
      </main>
    );
  }

  const bibleHasContent = hasStoryBibleContent(storyBible);
  const pendingForCurrentStory =
    pendingGeneration?.storyId === story.id ? pendingGeneration : null;
  const visibleChatMessages = messages
    .map((message) => ({
      ...message,
      content: stripGenerationDiagnostics(message.content),
    }))
    .filter((message) => Boolean(message.content));
  const currentDiagnostics =
    pendingForCurrentStory?.diagnostics ??
    story.storyState.lastGenerationDiagnostics ??
    [];

  return (
    <main className="h-[100dvh] overflow-hidden bg-neutral-950 text-white">
      <div className="mx-auto flex h-full min-h-0 max-w-5xl flex-col">
        <header className="z-30 shrink-0 border-b border-white/10 bg-neutral-950/95 px-5 py-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center rounded-xl border
border-white/10 bg-white/5 text-2xl text-white transition
hover:bg-white/10"
            >
              ☰
            </button>

            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold uppercase tracking-[0.3em]
text-pink-500"
              >
                NovelForge
              </p>

              <input
                type="text"
                value={storyTitle}
                onChange={(event) => updateStoryTitle(event.target.value)}
                onBlur={restoreDefaultTitle}
                aria-label="Story title"
                className="mt-1 w-full max-w-xl border-none bg-transparent text-2xl
font-semibold text-white outline-none placeholder:text-neutral-600"
              />
            </div>
          </div>
        </header>

        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsMenuOpen(false)}
            />

            <aside
              className="fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw] border-r
border-white/10 bg-neutral-900 p-6 shadow-2xl overflow-y-auto"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">NovelForge</h2>

                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-2xl text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <button
                type="button"
                onClick={createNewStory}
                className="mb-3 w-full rounded-xl bg-pink-500 px-4 py-3 text-left
font-semibold text-white"
              >
                + New Story
              </button>

              <button
                type="button"
                disabled={chapters.length === 0}
                onClick={() => {
                  setExportError("");
                  setIsExportOpen(true);
                  setIsMenuOpen(false);
                }}
                className="mb-3 w-full rounded-xl border border-pink-500/40
bg-pink-500/10 px-4 py-3 text-left font-semibold text-pink-300
transition hover:bg-pink-500/20 disabled:cursor-not-allowed
disabled:border-white/10 disabled:bg-white/5 disabled:text-neutral-600"
              >
                Export Book
              </button>

              <div className="mb-6 space-y-2 border-b border-white/10 pb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("chat");

                    setIsMenuOpen(false);
                  }}
                  className={`w-full rounded-xl px-4 py-3 text-left font-semibold
transition ${
                    activeTab === "chat"
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Chat
                </button>

                {story && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("chapters");

                      setReaderOpen(chapters.length > 0);

                      setIsMenuOpen(false);
                    }}
                    className={`w-full rounded-xl px-4 py-3 text-left font-semibold
transition ${
                      activeTab === "chapters"
                        ? "bg-white/10 text-white"
                        : "text-neutral-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    Chapters
                  </button>
                )}

                {story && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("bible");

                      setIsMenuOpen(false);
                    }}
                    className={`w-full rounded-xl px-4 py-3 text-left font-semibold
transition ${
                      activeTab === "bible"
                        ? "bg-white/10 text-white"
                        : "text-neutral-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    Story Bible
                  </button>
                )}
              </div>

              <div className="mt-6">
                <p
                  className="mb-3 text-xs font-semibold uppercase tracking-widest
text-neutral-500"
                >
                  Your Stories
                </p>

                <div className="space-y-2">
                  {stories.length === 0 ? (
                    <div
                      className="rounded-xl border border-white/10 bg-white/5 p-4
text-neutral-400"
                    >
                      No stories found.
                    </div>
                  ) : (
                    stories.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 rounded-xl border p-2 transition ${
                          story?.id === item.id
                            ? "border-pink-500 bg-pink-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            await openStory(item.id);

                            setIsMenuOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate font-semibold text-white">
                            {item.title}
                          </p>

                          <p className="mt-1 text-xs text-neutral-500">
                            Updated{" "}
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteStory(item.id)}
                          className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10
hover:text-red-300"
                          aria-label="Delete story"
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </>
        )}

        {isExportOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">
                    Export Book
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    KDP-ready Word document
                  </h2>
                </div>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setIsExportOpen(false)}
                  aria-label="Close export"
                  className="text-2xl text-neutral-400 transition hover:text-white disabled:opacity-40"
                >
                  ✕
                </button>
              </div>

              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Enter one content warning per line. Leave this blank to use the
                standard mature-content warning.
              </p>

              <textarea
                value={exportWarnings}
                disabled={isExporting}
                onChange={(event) => setExportWarnings(event.target.value)}
                placeholder={
                  "Explicit adult content\nStrong language\nViolence"
                }
                rows={6}
                className="mt-4 w-full resize-none rounded-xl border border-white/10
bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600
focus:border-pink-500 disabled:opacity-60"
              />

              {exportError && (
                <p className="mt-3 text-sm text-red-400">{exportError}</p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setIsExportOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-3 font-semibold
text-neutral-300 transition hover:bg-white/5 disabled:opacity-40"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void exportWordDocument()}
                  className="rounded-xl bg-pink-500 px-5 py-3 font-semibold text-white
transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isExporting ? "Creating..." : "Download Word"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <ChatPanel messages={visibleChatMessages} isThinking={isThinking} />
        )}

        {activeTab === "chapters" && (
          <div className="flex-1 overflow-y-auto px-4 py-5 pb-32 sm:px-6">
            <ChapterPanel
              storyId={story.id}
              storyTitle={storyTitle}
              chapters={chapters}
              readerOpen={readerOpen}
              onCloseReader={() => {
                setReaderOpen(false);
                setIsMenuOpen(true);
              }}
              onSaveChapter={updateChapter}
              readerTheme={readerTheme}
              setReaderTheme={setReaderTheme}
              readerFontSize={readerFontSize}
              setReaderFontSize={setReaderFontSize}
              readerLineHeight={readerLineHeight}
              setReaderLineHeight={setReaderLineHeight}
              readerWidth={readerWidth}
              setReaderWidth={setReaderWidth}
            />
          </div>
        )}

        {activeTab === "bible" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BiblePanel
              storyBible={storyBible}
              bibleHasContent={bibleHasContent}
            />
          </div>
        )}

        {activeTab === "chat" && (
          <footer
            className="shrink-0 border-t border-white/10
bg-neutral-950/95 px-5 py-5 backdrop-blur"
          >
            {currentDiagnostics.length > 0 && (
              <details className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
                <summary className="cursor-pointer font-medium text-neutral-300">
                  {formatGenerationDiagnostics(
                    currentDiagnostics,
                    pendingForCurrentStory
                      ? isThinking
                        ? "in progress"
                        : "failed"
                      : "succeeded",
                  )}
                </summary>

                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {currentDiagnostics.map((diagnostic, index) => (
                    <p
                      key={`${diagnostic.stage}-${diagnostic.attempt}-${index}`}
                      className={
                        diagnostic.status === "failed"
                          ? "text-red-300"
                          : "text-neutral-400"
                      }
                    >
                      {diagnostic.stage.replaceAll("_", " ")},{" "}
                      {diagnostic.status ?? "succeeded"},{" "}
                      {diagnostic.totalTokens.toLocaleString()} tokens,{" "}
                      {(diagnostic.durationMs / 1000).toFixed(1)} seconds,{" "}
                      {diagnostic.costUsd === null
                        ? "cost unavailable"
                        : `$${diagnostic.costUsd.toFixed(4)} ${getDiagnosticCostType(
                            diagnostic,
                          )}`}
                      {diagnostic.error ? `, ${diagnostic.error}` : ""}
                    </p>
                  ))}
                </div>
              </details>
            )}

            {pendingForCurrentStory && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-pink-500/30 bg-pink-500/10 p-3">
                <p className="min-w-0 flex-1 text-sm text-pink-100">
                  Chapter progress saved
                  {pendingForCurrentStory.draft
                    ? `, ${countWords(pendingForCurrentStory.draft)} words`
                    : ""}
                  .
                </p>

                <button
                  type="button"
                  disabled={isThinking}
                  onClick={() =>
                    void runPendingChapter(pendingForCurrentStory, story)
                  }
                  className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-semibold
text-white transition hover:bg-pink-400 disabled:opacity-40"
                >
                  {isThinking ? "Writing..." : "Resume"}
                </button>

                <button
                  type="button"
                  disabled={isThinking}
                  onClick={clearPendingGeneration}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm
font-semibold text-neutral-300 transition hover:bg-white/5
disabled:opacity-40"
                >
                  Discard
                </button>
              </div>
            )}

            <form onSubmit={sendMessage} className="flex items-end gap-3">
              <textarea
                value={input}
                disabled={isThinking || Boolean(pendingForCurrentStory)}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();

                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Tell NovelForge anything..."
                rows={5}
                className="min-h-14 flex-1 resize-none rounded-2xl border
border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none
placeholder:text-neutral-600 focus:border-pink-500
disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={
                  !input.trim() || isThinking || Boolean(pendingForCurrentStory)
                }
                className="h-14 rounded-2xl bg-pink-500 px-6 font-semibold text-white
transition hover:bg-pink-400 disabled:cursor-not-allowed
disabled:opacity-40"
              >
                {isThinking ? "Thinking..." : "Send"}
              </button>
            </form>

            <p className="mt-3 text-center text-xs text-neutral-600">
              Your story workspace saves automatically on this device.
            </p>
          </footer>
        )}
      </div>
    </main>
  );
}
