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
};
