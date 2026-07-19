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

export type StoryWorkspace = {
  id: string;
  title: string;
  seriesType: "standalone" | "series";
  seriesTitle: string;
  bookNumber: number;
  messages: ChatMessage[];
  chapters: StoryChapter[];
  storyBible: StoryBible;
  createdAt: string;
  updatedAt: string;
};

export type StoryChatRequest = {
  story: StoryWorkspace;
};
 
export type StoryChatResponse = {
  reply: string;
  storyBible: StoryBible;
  chapters?: StoryChapter[];
  timeline?: unknown[];
  world?: Record<string, unknown>;
  notes?: string[];
};
