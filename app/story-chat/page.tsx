"use client";

import { PendingChapterGeneration, QualityResponse, SectionAction, WriterResponse, getStoryStateBeforeChapter, applyGeneratedChapter, getContractWordRange, isWriterResponse, isStringArray, isDiagnosticArray, isGenerationDiagnostic, isQualityResponse, isLedgerResponse, LedgerResponse, isStoryState, isChapterPlan, readApiJson, ApiRequestError, qualityReviewWarnings, EMPTY_STORY_STATE } from "./generation";

import { chapterSourceFingerprint, type ChapterJobInput } from "../../lib/chapter-job";

import { FormEvent, useEffect, useRef, useState } from "react";

import { supabase } from "../../lib/supabaseClient";

import ChatPanel from "./components/ChatPanel";

import ChapterPanel from "./components/ChapterPanel";

import BiblePanel from "./components/BiblePanel";
import { findPassageRange, replacePassage, type PassageRewriteRequest } from "./passageRewrite";

import type {
  ActiveTab,
  ChapterPlan,
  GenerationDiagnostic,
  StoryBible,
  StoryChapter,
  StoryChatResponse,
  StoryState,
  StoryWorkspace,
} from "./types";

const STORAGE_KEY = "novelforge-current-story";

const PENDING_GENERATION_KEY = "novelforge-pending-chapter-generation";

type AionPassageResponse = {
  reply: string;
  diagnostics: GenerationDiagnostic[];
};

type WorkspaceMetadata = {
  seriesType: StoryWorkspace["seriesType"];
  seriesTitle: string;
  bookNumber: number;
  lineage?: StoryWorkspace["lineage"];
};

function getWorkspaceMetadata(value: unknown): WorkspaceMetadata {
  if (!value || typeof value !== "object") {
    return { seriesType: "standalone", seriesTitle: "", bookNumber: 1 };
  }

  const state = value as Record<string, unknown>;
  const metadata =
    state.workspaceMetadata && typeof state.workspaceMetadata === "object"
      ? (state.workspaceMetadata as Record<string, unknown>)
      : {};

  return {
    seriesType: metadata.seriesType === "series" ? "series" : "standalone",
    seriesTitle:
      typeof metadata.seriesTitle === "string" ? metadata.seriesTitle : "",
    bookNumber:
      typeof metadata.bookNumber === "number" && metadata.bookNumber > 0
        ? metadata.bookNumber
        : 1,
    lineage:
      metadata.lineage && typeof metadata.lineage === "object"
        ? (metadata.lineage as StoryWorkspace["lineage"])
        : undefined,
  };
}

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

function getRequestedWordCount(message: string): number | null {
  const match = message.match(/\b(\d{3,5})\s*words?\b/i);

  if (!match) {
    return null;
  }

  const wordCount = Number(match[1]);

  return Number.isFinite(wordCount) ? wordCount : null;
}

type ChapterDeletionRequest =
  | { kind: "none" }
  | { kind: "ambiguous" }
  | { kind: "exact"; chapterNumber: number };

const CHAPTER_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

function getChapterNumberFromMessage(message: string): number | null {
  const numberedChapter = message.match(/\bchapter\s+(?:number\s+)?(\d+)\b/i);

  if (numberedChapter) {
    const chapterNumber = Number(numberedChapter[1] ?? "");

    return Number.isInteger(chapterNumber) && chapterNumber > 0
      ? chapterNumber
      : null;
  }

  const wordedChapter = message.match(
    /\bchapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
  );

  if (!wordedChapter) {
    return null;
  }

  return CHAPTER_NUMBER_WORDS[wordedChapter[1]?.toLowerCase() ?? ""] ?? null;
}

function requestsChapterGeneration(message: string): boolean {
  return (
    /\b(?:write|generate|create)\b[\s\S]{0,100}\bchapter\b/i.test(message) ||
    /\brewrite\b[\s\S]{0,100}\bchapter\b/i.test(message) ||
    /\b(?:write|generate|create|start|continue|rewrite)\b[\s\S]{0,100}\bepilogue\b|\bepilogue\b[\s\S]{0,100}\b(?:write|generate|create|start|continue|rewrite)\b/i.test(
      message,
    )
  );
}

function getChapterDeletionRequest(message: string): ChapterDeletionRequest {
  const commandText = message.replace(
    /\b(?:do\s+not|don't|never)\s+(?:delete|remove)\b/gi,
    "",
  );
  const directlyRequestsChapterDeletion =
    /\b(?:delete|remove)\s+(?:the\s+)?(?:saved\s+)?chapter\b/i.test(
      commandText,
    );
  const directlyRequestsPronounDeletion =
    /\b(?:delete|remove)\s+(?:that|this|it)\b/i.test(commandText);

  if (!directlyRequestsChapterDeletion && !directlyRequestsPronounDeletion) {
    return { kind: "none" };
  }

  const chapterNumber = directlyRequestsChapterDeletion
    ? getChapterNumberFromMessage(commandText)
    : null;

  if (chapterNumber !== null) {
    return { kind: "exact", chapterNumber };
  }

  if (directlyRequestsChapterDeletion || directlyRequestsPronounDeletion) {
    return { kind: "ambiguous" };
  }

  return { kind: "none" };
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
    (pending.savedAt === undefined || typeof pending.savedAt === "string") &&
    Boolean(chapter) &&
    typeof chapter?.title === "string" &&
    typeof chapter?.povCharacter === "string" &&
    typeof chapter?.content === "string" &&
    (chapter?.replaceChapterNumber === null ||
      typeof chapter?.replaceChapterNumber === "number") &&
    typeof pending.chapterBrief === "string" &&
    typeof pending.latestUserMessage === "string" &&
    typeof pending.draft === "string" &&
    (pending.lastSection === undefined ||
      typeof pending.lastSection === "string") &&
    (pending.repetitionWarnings === undefined ||
      isStringArray(pending.repetitionWarnings)) &&
    typeof pending.minimumWordCount === "number" &&
    typeof pending.maximumWordCount === "number" &&
    (pending.qualityReview === undefined ||
      (Boolean(pending.qualityReview) &&
        typeof pending.qualityReview === "object")) &&
    (pending.qualityCheckedDraft === undefined ||
      typeof pending.qualityCheckedDraft === "string") &&
    (pending.qualityOverrideReady === undefined ||
      typeof pending.qualityOverrideReady === "boolean") &&
    (pending.qualityTechnicalError === undefined ||
      typeof pending.qualityTechnicalError === "string") &&
    (pending.diagnostics === undefined ||
      isDiagnosticArray(pending.diagnostics))
  );
}

function parseRemotePendingGeneration(
  value: unknown,
): PendingChapterGeneration | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isPendingGeneration(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

function getPlannedSceneCount(chapterBrief: string): number {
  try {
    const parsed = JSON.parse(chapterBrief) as Record<string, unknown>;

    if (Array.isArray(parsed.scenes)) {
      return Math.min(5, Math.max(1, parsed.scenes.length));
    }

    if (parsed.scene1 && parsed.scene2 && parsed.scene3) {
      return 3;
    }
  } catch {
    return 3;
  }

  return 3;
}

async function updateContinuityLedger(input: {
  storyBible: StoryBible;
  storyState: StoryState;
  chapters: StoryChapter[];
  chapter: StoryChapter;
  rebuild: boolean;
  rebuildFromChapter?: number;
}): Promise<LedgerResponse> {
  const partialRebuildStart = input.rebuild
    ? undefined
    : input.rebuildFromChapter;
  const chaptersToAnalyse = input.rebuild
    ? input.chapters
    : partialRebuildStart !== undefined
      ? input.chapters.filter(
          (chapter) => chapter.number >= partialRebuildStart,
        )
      : [input.chapter];
  if (chaptersToAnalyse.length === 0) {
    throw new Error("No chapters were available for continuity rebuilding.");
  }
  const usesBatches = input.rebuild || partialRebuildStart !== undefined;
  const batches = usesBatches
    ? Array.from(
        { length: Math.ceil(chaptersToAnalyse.length / 3) },
        (_, index) => chaptersToAnalyse.slice(index * 3, index * 3 + 3),
      )
    : [chaptersToAnalyse];
  let workingState: StoryState = input.rebuild
    ? { ...EMPTY_STORY_STATE }
    : partialRebuildStart !== undefined
      ? getStoryStateBeforeChapter(input.storyState, partialRebuildStart)
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
            rebuildMode: usesBatches ? "batch" : "incremental",
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

  const completedState: StoryState = {
    ...workingState,
    chapterPlans: input.storyState.chapterPlans ?? [],
  };
  delete completedState.continuityDirtyFromChapter;

  return {
    storyState: completedState,
    diagnostics,
  };
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

  const createdStoryIsValid =
    response.createdStory === undefined ||
    response.createdStory === null ||
    isStoryWorkspace(response.createdStory);

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
    createdStoryIsValid &&
    typeof response.chapterBrief === "string" &&
    (response.diagnostics === undefined ||
      isDiagnosticArray(response.diagnostics))
  );
}

function isAionPassageResponse(value: unknown): value is AionPassageResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<AionPassageResponse>;

  return (
    typeof response.reply === "string" &&
    Boolean(response.reply.trim()) &&
    Array.isArray(response.diagnostics) &&
    isDiagnosticArray(response.diagnostics)
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

export default function StoryChatPage() {
  const [story, setStory] = useState<StoryWorkspace | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");

  const [authMessage, setAuthMessage] = useState("");

  const [authChecked, setAuthChecked] = useState(false);

  const [hasLoadedRemoteStory, setHasLoadedRemoteStory] = useState(false);

  const [input, setInput] = useState("");

  const [isThinkingLocal, setIsThinking] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundCheckedFor, setBackgroundCheckedFor] = useState("");
  const [backgroundNotice, setBackgroundNotice] = useState("");
  const [recoveredDraft, setRecoveredDraft] = useState<PendingChapterGeneration | null>(null);
  const backgroundJobRef = useRef<string | null>(null);
  const backgroundSubmitInFlight = useRef(false);
  const isThinking = isThinkingLocal || backgroundBusy || Boolean(userId && story && backgroundCheckedFor !== story.id);

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

  const [sectionInstruction, setSectionInstruction] = useState("");
  const passageRewriteBusy = useRef(false);
  const currentStoryRef = useRef(story);
  const currentPendingRef = useRef(pendingGeneration);
  currentStoryRef.current = story;
  currentPendingRef.current = pendingGeneration;


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
    let isActive = true;
    const authTimeoutId = window.setTimeout(() => {
      if (isActive) {
        setAuthChecked(true);
      }
    }, 5000);

    function applySession(
      session: {
        user?: { id?: string } | null;
      } | null,
    ) {
      if (!isActive) {
        return;
      }

      const id = session?.user?.id ?? null;

      window.clearTimeout(authTimeoutId);
      setUserId(id);
      setAuthChecked(true);

      if (id) {
        window.setTimeout(() => {
          if (!isActive) {
            return;
          }

          void loadStoryList(id).catch((error) => {
            console.error("Failed to load stories:", error);
          });
        }, 0);
      }
    }

    async function loadUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        applySession(session);
      } catch (error) {
        console.error("Failed to check login:", error);

        applySession(null);
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      isActive = false;
      window.clearTimeout(authTimeoutId);
      subscription.unsubscribe();
    };
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

    const workspaceMetadata = getWorkspaceMetadata(data.story_state);

    setStory({
      id: data.id,

      title: data.title,

      seriesType: workspaceMetadata.seriesType,

      seriesTitle: workspaceMetadata.seriesTitle,

      bookNumber: workspaceMetadata.bookNumber,

      lineage: workspaceMetadata.lineage,

      messages: data.messages ?? [],

      chapters: data.chapters ?? [],

      storyBible: data.form ?? EMPTY_STORY_BIBLE,

      storyState: data.story_state ?? {},

      createdAt: data.created_at,

      updatedAt: data.updated_at,
    });

    const remotePending = parseRemotePendingGeneration(data.custom_rewrite);

    if (remotePending?.storyId === data.id) {
      setPendingGeneration(remotePending);
      window.localStorage.setItem(
        PENDING_GENERATION_KEY,
        JSON.stringify(remotePending),
      );
    } else {
      setPendingGeneration(null);
      window.localStorage.removeItem(PENDING_GENERATION_KEY);
    }

    setActiveTab("chapters");

    setReaderOpen(
      (data.chapters ?? []).length > 0 || remotePending?.storyId === data.id,
    );

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
    const storyId = story?.id;
    if (!userId || !storyId || !hasLoadedRemoteStory) return;
    let stopped = false;
    let checking = false;
    let timer: ReturnType<typeof setTimeout>;
    let sawActive = false;
    setBackgroundCheckedFor("");
    setBackgroundBusy(false);
    backgroundJobRef.current = null;
    setBackgroundNotice("");
    setRecoveredDraft(null);
    async function check() {
      if (stopped || checking) return;
      checking = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const id = backgroundJobRef.current;
        const response = await fetch(`/api/story-chat/jobs?storyId=${encodeURIComponent(storyId!)}${id ? `&id=${encodeURIComponent(id)}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const data = await readApiJson(response) as { job?: { id: string; status: string; stage: string; updated_at: string; error_message: string; result?: { story: StoryWorkspace; pending: PendingChapterGeneration | null; recoveryPending?: PendingChapterGeneration | null } } | null };
        if (stopped || currentStoryRef.current?.id !== storyId) return;
        if (backgroundJobRef.current && backgroundJobRef.current !== id) return;
        const job = data.job;
        if (!job && backgroundSubmitInFlight.current) return;
        if (job?.status === "generating") {
          sawActive = true;
          backgroundJobRef.current = job.id;
          setBackgroundBusy(true);
          setBackgroundNotice(`Chapter generation is running in the background (${job.stage}). You can leave this tab or app.`);
        } else {
          // The worker saves into the existing story/draft storage. Reload it
          // before re-enabling autosave, including after returning from mobile.
          if (sawActive || backgroundJobRef.current || job && Date.parse(job.updated_at) > Date.parse(currentStoryRef.current?.updatedAt ?? "")) {
            if (job?.status === "conflict") {
              setBackgroundNotice(job.error_message);
              setRecoveredDraft(job.result?.pending ?? job.result?.recoveryPending ?? null);
            } else if (job) {
              await openStory(storyId!);
              setSectionInstruction("");
              setBackgroundNotice(job.error_message || "Chapter generation finished. Your draft is ready.");
            }
          } else if (job?.status === "conflict") {
            setBackgroundNotice(job.error_message);
            setRecoveredDraft(job.result?.pending ?? job.result?.recoveryPending ?? null);
          }
          backgroundJobRef.current = null;
          sawActive = false;
          setBackgroundBusy(false);
        }
        setBackgroundCheckedFor(storyId!);
      } catch (error) {
        if (!stopped) setBackgroundNotice(error instanceof Error ? error.message : "Chapter progress could not be checked. Checking again shortly.");
      } finally {
        checking = false;
        if (!stopped) {
          clearTimeout(timer);
          timer = setTimeout(() => void check(), backgroundJobRef.current ? 5000 : 30000);
        }
      }
    }
    const wake = () => { clearTimeout(timer); void check(); };
    const visible = () => { if (document.visibilityState === "visible") wake(); };
    void check();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("novelforge-chapter-job", wake);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("novelforge-chapter-job", wake);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, story?.id, hasLoadedRemoteStory]);

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

            const workspaceMetadata = getWorkspaceMetadata(data.story_state);

            setStory({
              id: data.id,

              title: data.title,

              seriesType: workspaceMetadata.seriesType,

              seriesTitle: workspaceMetadata.seriesTitle,

              bookNumber: workspaceMetadata.bookNumber,

              lineage: workspaceMetadata.lineage,

              messages: data.messages ?? [],

              chapters: data.chapters ?? [],

              storyBible: data.form ?? EMPTY_STORY_BIBLE,

              storyState: data.story_state ?? {},

              createdAt: data.created_at,

              updatedAt: data.updated_at,
            });

            const remotePending = parseRemotePendingGeneration(
              data.custom_rewrite,
            );

            if (remotePending?.storyId === data.id) {
              setPendingGeneration(remotePending);
              window.localStorage.setItem(
                PENDING_GENERATION_KEY,
                JSON.stringify(remotePending),
              );
            }

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
    if (!hasLoaded || !hasLoadedRemoteStory || !story || isThinking || backgroundCheckedFor !== story.id) {
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
  }, [story, hasLoaded, hasLoadedRemoteStory, userId, isThinking, backgroundCheckedFor]);

  useEffect(() => {
    if (
      !hasLoadedRemoteStory ||
      backgroundBusy ||
      backgroundCheckedFor !== story?.id ||
      !userId ||
      !story ||
      !pendingGeneration ||
      pendingGeneration.storyId !== story.id
    ) {
      return;
    }

    const pendingToSave = pendingGeneration;
    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabase
        .from("stories")
        .update({
          custom_rewrite: JSON.stringify(pendingToSave),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingToSave.storyId)
        .eq("user_id", userId);

      if (error) {
        console.error("Could not sync the unfinished chapter draft:", error);
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [pendingGeneration, story, userId, hasLoadedRemoteStory, backgroundBusy, backgroundCheckedFor]);

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

  async function rewritePassage(request: PassageRewriteRequest): Promise<void> {
    const sourceStory = currentStoryRef.current;
    if (!sourceStory || isThinking || passageRewriteBusy.current) {
      throw new Error("Wait for the current writing request to finish.");
    }
    const isDraft = request.chapterId === "__draft__";
    const sourcePending = currentPendingRef.current;
    const chapter = sourceStory.chapters.find((item) => item.id === request.chapterId);
    const sourceContent = isDraft && sourcePending?.storyId === sourceStory.id
      ? sourcePending.draft : chapter?.content;
    if (sourceContent !== request.sourceContent) {
      throw new Error("This chapter has changed. Copy the passage again before rewriting.");
    }
    findPassageRange(request.sourceContent, request.passage);
    const chapterNumber = isDraft ? sourcePending?.generatedChapter.replaceChapterNumber : chapter?.number;
    const plan = sourceStory.storyState.chapterPlans?.find((item) => item.chapterNumber === chapterNumber);
    passageRewriteBusy.current = true;
    setIsThinking(true);
    try {
      const response = await fetch("/api/story-chat/rewrite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterContent: request.sourceContent,
          passage: request.passage, instruction: request.instruction,
          povCharacter: isDraft ? sourcePending?.generatedChapter.povCharacter : chapter?.povCharacter,
          storyBible: sourceStory.storyBible,
          storyState: getStoryStateBeforeChapter(sourceStory.storyState, chapterNumber ?? null),
          chapterBrief: isDraft ? sourcePending?.chapterBrief : plan ? JSON.stringify(plan) : "",
        }),
      });
      const payload = await readApiJson(response);
      if (!payload || typeof payload !== "object") throw new Error("The writer returned an invalid response.");
      const data = payload as { replacement?: unknown; diagnostics?: unknown };
      if (typeof data.replacement !== "string" || !data.replacement.trim() || !Array.isArray(data.diagnostics)) {
        throw new Error("The writer returned an invalid replacement. Your chapter is unchanged.");
      }
      const latestStory = currentStoryRef.current;
      const latestPending = currentPendingRef.current;
      const latestChapter = latestStory?.chapters.find((item) => item.id === request.chapterId);
      if (!latestStory || latestStory.id !== sourceStory.id ||
          (isDraft ? latestPending?.storyId !== sourceStory.id || latestPending.draft !== request.sourceContent
            : latestChapter?.content !== request.sourceContent)) {
        throw new Error("The chapter changed while the rewrite was running. The rewrite was not applied; your latest edits are kept.");
      }
      const content = replacePassage(request.sourceContent, request.passage, data.replacement);
      const diagnostics = data.diagnostics as GenerationDiagnostic[];
      if (isDraft && latestPending) {
        const nextPending: PendingChapterGeneration = {
          ...latestPending, draft: content, lastSection: undefined,
          repetitionWarnings: [], qualityReview: undefined, qualityCheckedDraft: undefined,
          qualityOverrideReady: undefined, qualityTechnicalError: undefined,
          diagnostics: [...(latestPending.diagnostics ?? []), ...diagnostics],
        };
        currentPendingRef.current = nextPending;
        savePendingGeneration(nextPending);
      }
      const now = new Date().toISOString();
      const dirtyChapter = latestStory.storyState.continuityDirtyFromChapter;
      const nextStory: StoryWorkspace = {
        ...latestStory,
        chapters: isDraft ? latestStory.chapters : latestStory.chapters.map((item) =>
          item.id === request.chapterId ? { ...item, content, updatedAt: now } : item),
        storyState: {
          ...latestStory.storyState, lastGenerationDiagnostics: diagnostics,
          ...(!isDraft && latestChapter ? {
            continuityDirtyFromChapter: Math.min(dirtyChapter ?? latestChapter.number, latestChapter.number),
          } : {}),
        },
        updatedAt: now,
      };
      currentStoryRef.current = nextStory;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStory));
      setStory(nextStory);
      // Existing story and draft effects sync these edits to the signed-in account.
    } finally {
      passageRewriteBusy.current = false;
      setIsThinking(false);
    }
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

      const editedChapter = currentStory.chapters.find(
        (chapter) => chapter.id === chapterId,
      );
      const existingDirtyChapter =
        currentStory.storyState.continuityDirtyFromChapter;
      const dirtyFromChapter = editedChapter
        ? existingDirtyChapter === undefined
          ? editedChapter.number
          : Math.min(existingDirtyChapter, editedChapter.number)
        : existingDirtyChapter;

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

        storyState: {
          ...currentStory.storyState,
          continuityDirtyFromChapter: dirtyFromChapter,
        },

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
    const pendingWithTimestamp = {
      ...pending,
      savedAt: new Date().toISOString(),
    };

    setPendingGeneration(pendingWithTimestamp);
    localStorage.setItem(
      PENDING_GENERATION_KEY,
      JSON.stringify(pendingWithTimestamp),
    );
  }

  function clearPendingGeneration() {
    const pendingStoryId = pendingGeneration?.storyId;

    setPendingGeneration(null);
    localStorage.removeItem(PENDING_GENERATION_KEY);

    if (userId && pendingStoryId) {
      void supabase
        .from("stories")
        .update({
          custom_rewrite: "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingStoryId)
        .eq("user_id", userId)
        .then(({ error }) => {
          if (error) {
            console.error("Could not clear the synced chapter draft:", error);
          }
        });
    }
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
      story_state: {
        ...nextStory.storyState,
        workspaceMetadata: {
          seriesType: nextStory.seriesType,
          seriesTitle: nextStory.seriesTitle,
          bookNumber: nextStory.bookNumber,
          lineage: nextStory.lineage,
        },
      },
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

  function updatePendingDraft(content: string) {
    if (!pendingGeneration) {
      return;
    }

    savePendingGeneration({
      ...pendingGeneration,
      draft: content,
      lastSection:
        pendingGeneration.lastSection &&
        content.includes(pendingGeneration.lastSection)
          ? pendingGeneration.lastSection
          : undefined,
      qualityReview: undefined,
      qualityCheckedDraft: undefined,
      qualityOverrideReady: undefined,
      qualityTechnicalError: undefined,
    });
  }

  async function queueChapterBackground(input: ChapterJobInput) {
    backgroundSubmitInFlight.current = true;
    setBackgroundBusy(true);
    setBackgroundNotice("Starting chapter generation. Once accepted, you can leave this tab or app.");
    const id = crypto.randomUUID();
    backgroundJobRef.current = id;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in before starting background generation.");
      const response = await fetch("/api/story-chat/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id, input, sourceFingerprint: chapterSourceFingerprint(currentStoryRef.current ?? input.story) }),
      });
      const data = await readApiJson(response) as { job?: { id: string }; error?: string };
      if (!data.job?.id) throw new Error("The background job was not accepted.");
      backgroundJobRef.current = data.job.id;
      setBackgroundNotice("Chapter generation is running in the background. You can use another tab or app and return when ready.");
      window.dispatchEvent(new Event("novelforge-chapter-job"));
    } catch (error) {
      // A lost response does not prove that the server rejected the job.
      // Poll its saved ID before allowing another paid submission.
      setBackgroundNotice(error instanceof Error ? error.message : "Checking whether the chapter job started.");
      window.dispatchEvent(new Event("novelforge-chapter-job"));
    } finally {
      backgroundSubmitInFlight.current = false;
      window.dispatchEvent(new Event("novelforge-chapter-job"));
    }
  }

  async function writeChapterSection(pending: PendingChapterGeneration, baseStory: StoryWorkspace, action: SectionAction) {
    await queueChapterBackground({ operation: "write", story: baseStory, pending, action, sectionInstruction });
  }

  async function completePendingChapter(pending: PendingChapterGeneration, baseStory: StoryWorkspace) {
    await queueChapterBackground({ operation: "complete", story: baseStory, pending, action: pending.draft.trim() ? "continue" : "start", sectionInstruction });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = input.trim();
    const deletionRequest = getChapterDeletionRequest(trimmedMessage);
    const hasPendingChapter = pendingGeneration?.storyId === story?.id;
    const isAionRequest = /^\s*aion(?:\s*[:,-]|\s+)/i.test(trimmedMessage);

    if (!story || !trimmedMessage || isThinking) {
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
      if (isAionRequest) {
        const currentPending = hasPendingChapter ? pendingGeneration : null;
        const latestChapter = requestStory.chapters.at(-1) ?? null;
        const currentChapterNumber =
          currentPending?.generatedChapter.replaceChapterNumber ??
          latestChapter?.number ??
          null;
        const currentPlan =
          currentChapterNumber === null
            ? null
            : ((requestStory.storyState.chapterPlans ?? []).find(
                (plan) => plan.chapterNumber === currentChapterNumber,
              ) ?? null);
        const response = await fetch("/api/story-chat/aion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmedMessage,
            storyBible: requestStory.storyBible,
            storyState: requestStory.storyState,
            chapterBrief:
              currentPending?.chapterBrief ??
              (currentPlan ? JSON.stringify(currentPlan) : ""),
            chapterDraft: currentPending?.draft ?? latestChapter?.content ?? "",
            povCharacter:
              currentPending?.generatedChapter.povCharacter ??
              latestChapter?.povCharacter ??
              "",
          }),
        });
        const data = await readApiJson(response);

        if (!isAionPassageResponse(data)) {
          throw new Error("Aion returned an invalid passage response.");
        }

        const aionStory: StoryWorkspace = {
          ...requestStory,
          storyState: {
            ...requestStory.storyState,
            lastGenerationDiagnostics: data.diagnostics,
          },
          messages: [
            ...requestStory.messages,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: `AION\n\n${data.reply}`,
            },
          ],
          updatedAt: new Date().toISOString(),
        };

        await persistStory(aionStory);
        return;
      }

      if (deletionRequest.kind === "ambiguous") {
        const clarificationStory: StoryWorkspace = {
          ...requestStory,
          messages: [
            ...requestStory.messages,
            {
              id: Date.now() + 1,
              role: "assistant",
              content:
                "Which saved chapter number do you want me to delete? If you mean a Story Bible entry instead, name that entry.",
            },
          ],
          updatedAt: new Date().toISOString(),
        };

        await persistStory(clarificationStory);
        return;
      }

      if (deletionRequest.kind === "exact") {
        const chapterNumber = deletionRequest.chapterNumber;
        const chapterExists = requestStory.chapters.some(
          (chapter) => chapter.number === chapterNumber,
        );
        const pendingTargetNumber =
          pendingGeneration?.storyId === requestStory.id
            ? (pendingGeneration.generatedChapter.replaceChapterNumber ??
              Math.max(
                0,
                ...requestStory.chapters.map((chapter) => chapter.number),
              ) + 1)
            : null;
        const clearsPendingDraft = pendingTargetNumber === chapterNumber;

        if (!chapterExists) {
          const missingChapterStory: StoryWorkspace = {
            ...requestStory,
            messages: [
              ...requestStory.messages,
              {
                id: Date.now() + 1,
                role: "assistant",
                content: clearsPendingDraft
                  ? `Chapter ${chapterNumber} was not saved, but its preserved draft has been cleared.`
                  : `Chapter ${chapterNumber} does not exist, so nothing was deleted.`,
              },
            ],
            updatedAt: new Date().toISOString(),
          };

          await persistStory(missingChapterStory);

          if (clearsPendingDraft) {
            clearPendingGeneration();
          }

          return;
        }

        const remainingChapters = requestStory.chapters.filter(
          (chapter) => chapter.number !== chapterNumber,
        );
        let rebuiltStoryState: StoryState = {
          ...EMPTY_STORY_STATE,
        };
        let deletionDiagnostics: GenerationDiagnostic[] = [];

        if (remainingChapters.length > 0) {
          const latestRemainingChapter = remainingChapters.at(-1);

          if (!latestRemainingChapter) {
            throw new Error(
              "The remaining chapters could not be prepared for continuity.",
            );
          }

          const ledgerData = await updateContinuityLedger({
            storyBible: requestStory.storyBible,
            storyState: {
              ...EMPTY_STORY_STATE,
            },
            chapters: remainingChapters,
            chapter: latestRemainingChapter,
            rebuild: true,
          });

          rebuiltStoryState = ledgerData.storyState;
          deletionDiagnostics = ledgerData.diagnostics;
        }

        const deletedChapterStory: StoryWorkspace = {
          ...requestStory,
          chapters: remainingChapters,
          storyState: {
            ...rebuiltStoryState,
            chapterPlans: (requestStory.storyState.chapterPlans ?? []).filter(
              (plan) => plan.chapterNumber !== chapterNumber,
            ),
            lastGenerationDiagnostics: deletionDiagnostics,
          },
          messages: [
            ...requestStory.messages,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: `Chapter ${chapterNumber} has been deleted${
                clearsPendingDraft
                  ? " and its preserved draft has been cleared"
                  : ""
              }. Continuity has been rebuilt from the remaining chapters. Later chapter numbers were left unchanged.`,
            },
          ],
          updatedAt: new Date().toISOString(),
        };

        await persistStory(deletedChapterStory);

        if (clearsPendingDraft) {
          clearPendingGeneration();
        }

        return;
      }

      if (!hasPendingChapter && requestsChapterGeneration(trimmedMessage)) {
        await queueChapterBackground({ operation: "generate", story: requestStory });
        return;
      }

      const requestsChapterPlanning =
        requestsChapterGeneration(trimmedMessage) ||
        /\b(?:plan|outline|map)\b[\s\S]{0,100}\bchapter\b/i.test(
          trimmedMessage,
        );
      const dirtyFromChapter =
        planningStory.storyState.continuityDirtyFromChapter;
      const hasContinuityLedger = Boolean(
        planningStory.storyState.chapterLedger?.length,
      );

      if (
        !hasPendingChapter &&
        requestsChapterPlanning &&
        planningStory.chapters.length > 0 &&
        (!hasContinuityLedger || dirtyFromChapter !== undefined)
      ) {
        const latestExistingChapter = planningStory.chapters.at(-1);
        if (!latestExistingChapter) {
          throw new Error(
            "The latest chapter could not be prepared for continuity.",
          );
        }

        const ledgerData = await updateContinuityLedger({
          storyBible: planningStory.storyBible,
          storyState: planningStory.storyState,
          chapters: planningStory.chapters,
          chapter: latestExistingChapter,
          rebuild: !hasContinuityLedger,
          rebuildFromChapter: hasContinuityLedger
            ? dirtyFromChapter
            : undefined,
        });

        preplanningDiagnostics = ledgerData.diagnostics;
        planningStory = {
          ...planningStory,
          storyState: ledgerData.storyState,
          updatedAt: new Date().toISOString(),
        };

        await persistStory(planningStory);
      }

      const requestedPlanChapterNumber =
        getChapterNumberFromMessage(trimmedMessage);
      const savedPlan =
        requestedPlanChapterNumber === null
          ? null
          : ((planningStory.storyState.chapterPlans ?? []).find(
              (plan) => plan.chapterNumber === requestedPlanChapterNumber,
            ) ?? null);
      const existingPlannedChapter =
        requestedPlanChapterNumber === null
          ? null
          : (planningStory.chapters.find(
              (chapter) => chapter.number === requestedPlanChapterNumber,
            ) ?? null);
      const explicitlyRewritesPlan =
        /\brewrite\b[\s\S]{0,100}\bchapter\b/i.test(trimmedMessage);
      // Legacy plans remain readable, but generation is now directed one
      // section at a time by the author's latest instruction.
      const usesSavedPlan = false;

      if (usesSavedPlan && savedPlan) {
        const approvedPlan: ChapterPlan = {
          ...savedPlan,
          status: "approved",
          updatedAt: new Date().toISOString(),
        };
        const reply = `Chapter ${approvedPlan.chapterNumber} plan locked. Writing ${approvedPlan.scenes.length} ${
          approvedPlan.scenes.length === 1 ? "scene" : "scenes"
        } now.`;
        const plannedStory: StoryWorkspace = {
          ...planningStory,
          storyState: {
            ...planningStory.storyState,
            chapterPlans: [
              ...(planningStory.storyState.chapterPlans ?? []).filter(
                (plan) => plan.chapterNumber !== approvedPlan.chapterNumber,
              ),
              approvedPlan,
            ].sort((left, right) => left.chapterNumber - right.chapterNumber),
          },
          messages: [
            ...planningStory.messages,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: reply,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
        const requestedWordCount = getRequestedWordCount(trimmedMessage);
        const requestedTarget = requestedWordCount
          ? Math.min(4000, Math.max(2000, requestedWordCount))
          : null;
        const pending: PendingChapterGeneration = {
          storyId: plannedStory.id,
          generatedChapter: {
            title: approvedPlan.title,
            povCharacter: approvedPlan.povCharacter,
            content: "",
            replaceChapterNumber:
              explicitlyRewritesPlan && existingPlannedChapter
                ? approvedPlan.chapterNumber
                : null,
          },
          chapterBrief: JSON.stringify(approvedPlan),
          latestUserMessage: trimmedMessage,
          draft: "",
          minimumWordCount: requestedTarget
            ? Math.max(2000, Math.floor(requestedTarget * 0.95))
            : 2000,
          maximumWordCount: requestedTarget
            ? Math.min(4000, Math.ceil(requestedTarget * 1.1))
            : 4000,
          diagnostics: [],
        };

        await persistStory(plannedStory);
        savePendingGeneration(pending);
        await writeChapterSection(pending, plannedStory, "start");
        return;
      }

      const response = await fetch("/api/story-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage: "plan",
          story: planningStory,
          chatOnly: hasPendingChapter,
          draftContext: hasPendingChapter
            ? (pendingGeneration?.draft ?? "")
            : "",
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

      if (data.createdStory) {
        const createdStory: StoryWorkspace = {
          ...data.createdStory,
          messages: [
            {
              id: Date.now() + 2,
              role: "assistant",
              content: data.reply,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
        await persistStory(createdStory);
        window.localStorage.setItem(
          "novelforge-current-story-id",
          createdStory.id,
        );
        clearPendingGeneration();
        setActiveTab("chat");
        setReaderOpen(false);
        return;
      }

      if (!data.generatedChapter) {
        return;
      }

      const returnedChapter = data.generatedChapter;
      const returnedReplacement = returnedChapter.replaceChapterNumber;
      const nextChapterNumber =
        Math.max(0, ...plannedStory.chapters.map((chapter) => chapter.number)) +
        1;
      const replacementExists =
        returnedReplacement !== null &&
        plannedStory.chapters.some(
          (chapter) => chapter.number === returnedReplacement,
        );
      const generatedChapter =
        returnedReplacement === nextChapterNumber && !replacementExists
          ? { ...returnedChapter, replaceChapterNumber: null }
          : returnedChapter;
      const contractWordRange = getContractWordRange(data.chapterBrief);
      const legacyRequestedWordCount = getRequestedWordCount(trimmedMessage);
      const legacyRequestedTarget = legacyRequestedWordCount
        ? Math.min(4000, Math.max(2000, legacyRequestedWordCount))
        : null;
      const pending: PendingChapterGeneration = {
        storyId: plannedStory.id,
        generatedChapter,
        chapterBrief: data.chapterBrief,
        latestUserMessage: trimmedMessage,
        draft: "",
        minimumWordCount:
          contractWordRange?.minimum ??
          (legacyRequestedTarget
            ? Math.max(2000, Math.floor(legacyRequestedTarget * 0.95))
            : 2000),
        maximumWordCount:
          contractWordRange?.maximum ??
          (legacyRequestedTarget
            ? Math.min(4000, Math.ceil(legacyRequestedTarget * 1.1))
            : 4000),
        diagnostics: [...preplanningDiagnostics, ...(data.diagnostics ?? [])],
      };

      savePendingGeneration(pending);
      await writeChapterSection(pending, plannedStory, "start");
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
  const pendingChapterNumber = pendingForCurrentStory
    ? (pendingForCurrentStory.generatedChapter.replaceChapterNumber ??
      Math.max(0, ...chapters.map((chapter) => chapter.number)) + 1)
    : null;

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
                disabled={backgroundBusy}
                onChange={(event) => updateStoryTitle(event.target.value)}
                onBlur={restoreDefaultTitle}
                aria-label="Story title"
                className="mt-1 w-full max-w-xl border-none bg-transparent text-2xl
font-semibold text-white outline-none placeholder:text-neutral-600"
              />
            </div>
          </div>
        </header>

        {backgroundNotice && (
          <div role="status" aria-live="polite" className="shrink-0 border-b border-white/10 px-5 py-3 text-sm text-neutral-300">
            {backgroundNotice}
            {recoveredDraft && (
              <button type="button" className="ml-3 underline" onClick={() => {
                savePendingGeneration(recoveredDraft);
                setRecoveredDraft(null);
                setActiveTab("chapters");
                setReaderOpen(true);
              }}>Open recovered draft</button>
            )}
          </div>
        )}

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

              <a
                href="/social-studio"
                onClick={() => setIsMenuOpen(false)}
                className="mb-3 flex w-full items-center rounded-xl border border-pink-500/40
bg-pink-500/10 px-4 py-3 text-left font-semibold text-pink-300
transition hover:bg-pink-500/20"
              >
                Social Studio
              </a>

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

                      setReaderOpen(
                        chapters.length > 0 || Boolean(pendingForCurrentStory),
                      );

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
              onRewritePassage={rewritePassage}
              isWriting={isThinking}
              readerTheme={readerTheme}
              setReaderTheme={setReaderTheme}
              readerFontSize={readerFontSize}
              setReaderFontSize={setReaderFontSize}
              readerLineHeight={readerLineHeight}
              setReaderLineHeight={setReaderLineHeight}
              readerWidth={readerWidth}
              setReaderWidth={setReaderWidth}
              draftWorkspace={
                pendingForCurrentStory && pendingChapterNumber !== null
                  ? {
                      chapterNumber: pendingChapterNumber,
                      title: pendingForCurrentStory.generatedChapter.title,
                      povCharacter:
                        pendingForCurrentStory.generatedChapter.povCharacter,
                      content: pendingForCurrentStory.draft,
                      guidance: sectionInstruction,
                      isGenerating: isThinking,
                      repetitionWarnings:
                        pendingForCurrentStory.repetitionWarnings,
                    }
                  : null
              }
              onDraftContentChange={updatePendingDraft}
              onDraftGuidanceChange={setSectionInstruction}
              onGenerateNextSection={
                pendingForCurrentStory
                  ? () =>
                      void writeChapterSection(
                        pendingForCurrentStory,
                        story,
                        pendingForCurrentStory.draft.trim() ? "continue" : "start",
                      )
                  : undefined
              }
              onRewriteLastSection={
                pendingForCurrentStory?.lastSection?.trim()
                  ? () =>
                      void writeChapterSection(
                        pendingForCurrentStory,
                        story,
                        "rewrite",
                      )
                  : undefined
              }
              onCompleteDraft={
                pendingForCurrentStory
                  ? () =>
                      void completePendingChapter(pendingForCurrentStory, story)
                  : undefined
              }
              onDiscardDraft={
                pendingForCurrentStory ? clearPendingGeneration : undefined
              }
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
          <footer className="shrink-0 border-t border-white/10 bg-neutral-950/95 px-4 py-4 backdrop-blur sm:px-5">
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

            <form onSubmit={sendMessage} className="flex items-end gap-3">
              <textarea
                value={input}
                disabled={isThinking}
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
                placeholder={
                  pendingForCurrentStory
                    ? "Ask NovelForge about the current draft..."
                    : "Tell NovelForge anything..."
                }
                rows={pendingForCurrentStory ? 3 : 5}
                className="min-h-14 flex-1 resize-none rounded-2xl border
border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none
placeholder:text-neutral-600 focus:border-pink-500
disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!input.trim() || isThinking}
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



