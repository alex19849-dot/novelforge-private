import type { StoryIntent } from "../../src/lib/detect-story-intent";

export type ActiveTab = "chat" | "chapters" | "bible";
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: number;
  role: ChatRole;
  content: string;
};

export type StoryBible = {
  premise: string;
  relationship: string;
  subgenre: string;
  setting: string;
  pov: string;
  heatLevel: string;
  burnPacing: string;
  tropes: string[];
  characters: string[];
  notes: string[];
};

export type StoryChapter = {
  id: string;
  number: number;
  title: string;
  povCharacter: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ChapterLedgerEntry = {
  chapterNumber: number;
  title: string;
  povCharacter: string;
  summary: string;
  openingLocation: string;
  endingLocation: string;
  endingTime: string;
  endingExcerpt: string;
  relationshipShift: string;
  intimacyMilestone: string;
  newFacts: string[];
  unresolvedThreads: string[];
  repeatedBeats: string[];
};

export type StoryVoiceProfile = {
  characterName: string;
  narrativeRhythm: string;
  vocabulary: string;
  humourStyle: string;
  emotionalDeflection: string;
  sensoryFocus: string;
  dialoguePattern: string;
  internalThoughtPattern: string;
  forbiddenHabits: string[];
};

/**
 * A movement is a bounded piece of one chapter. Several movements may remain
 * in the same physical scene. This prevents the writer from repeatedly
 * restarting one oversized scene merely to reach the chapter word target.
 */
export type ChapterPlanScene = {
  order: number;
  location: string;
  objective: string;
  conflict: string;
  newInformation: string;
  exitBeat: string;

  /**
   * Present on every newly generated plan. Optional here only so stories with
   * legacy saved plans continue to load while the clean pipeline is deployed.
   */
  entryState?: string;
  endingState?: string;
  wordTarget?: number;
  mustNotHappen?: string[];
};

export type ChapterPlan = {
  chapterNumber: number;
  title: string;
  povCharacter: string;
  chapterGoal: string;
  relationshipChange: string;
  scenes: ChapterPlanScene[];
  completedBeatsToAvoid: string[];

  /**
   * These fields form the binding chapter contract for all new plans.
   * They remain optional at the storage boundary for legacy compatibility.
   */
  startingState?: string;
  endingState?: string;
  knowledgeLimits?: string[];
  premiseLocks?: string[];
  mustNotHappen?: string[];

  status: "draft" | "approved";
  updatedAt: string;
};

export type GenerationDiagnostic = {
  stage: string;
  provider: "openai" | "openrouter";
  model: string;
  status?: "succeeded" | "failed";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  costType?: "reported" | "estimated" | "unavailable";
  durationMs: number;
  attempt: number;
  error?: string;
};

export type StoryState = {
  importantFacts: string[];
  characterStates: string[];
  relationshipStates: string[];
  unresolvedThreads: string[];
  timeline: string[];
  locations: string[];
  activePOV: string;
  chapterLedger?: ChapterLedgerEntry[];
  latestChapterEnding?: string;
  characterKnowledge?: string[];
  repetitionWarnings?: string[];
  voiceProfiles?: StoryVoiceProfile[];
  chapterPlans?: ChapterPlan[];
  lastGenerationDiagnostics?: GenerationDiagnostic[];
};

export type StoryWorkspace = {
  id: string;
  title: string;
  seriesType: "standalone" | "series";
  seriesTitle: string;
  bookNumber: number;
  messages: ChatMessage[];
  chapters: StoryChapter[];
  storyBible: StoryBible;
  storyState: StoryState;
  createdAt: string;
  updatedAt: string;
};

export type StoryChatRequest = {
  story: StoryWorkspace;
};

export type GeneratedChapter = {
  title: string;
  povCharacter: string;
  content: string;
  replaceChapterNumber: number | null;
};

export type StoryChatResponse = {
  reply: string;
  intent: StoryIntent;
  story: StoryWorkspace;
  generatedChapter: GeneratedChapter | null;
  chapterBrief: string;
  diagnostics?: GenerationDiagnostic[];
};
