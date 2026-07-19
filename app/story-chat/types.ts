export type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

export type ActiveTab = "chat" | "chapters" | "bible";

export type SeriesType =
  | "standalone"
  | "duet"
  | "trilogy"
  | "interconnected-standalones";

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

export type StoryWorkspace = {
  id: string;
  title: string;
  seriesType: SeriesType;
  seriesTitle: string;
  bookNumber: number;
  messages: ChatMessage[];
  chapters: string[];
  storyBible: StoryBible;
  createdAt: string;
  updatedAt: string;
};
