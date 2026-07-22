"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ChatPanel from "./components/ChatPanel";
import ChapterPanel from "./components/ChapterPanel";
import BiblePanel from "./components/BiblePanel";

import type {
  ActiveTab,
  StoryBible,
  StoryChatResponse,
  StoryWorkspace,
} from "./types";

const STORAGE_KEY = "novelforge-current-story";

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
        content:
          "Hi Alex. What kind of story are we building this time?",
      },
    ],
    chapters: [],
    storyBible: {
      ...EMPTY_STORY_BIBLE,
      tropes: [],
      characters: [],
      notes: [],
    },
    storyState: {},
    createdAt: now,
    updatedAt: now,
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
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

function isStoryWorkspace(
  value: unknown,
): value is StoryWorkspace {
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
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string",
    ) &&
    Array.isArray(candidate.chapters) &&
    isStoryBible(candidate.storyBible) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isStoryChatResponse(
  value: unknown,
): value is StoryChatResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<StoryChatResponse>;

  const generatedChapterIsValid =
    response.generatedChapter === null ||
    (
      Boolean(response.generatedChapter) &&
      typeof response.generatedChapter?.title === "string" &&
      typeof response.generatedChapter?.povCharacter === "string" &&
      typeof response.generatedChapter?.content === "string" &&
      (
        response.generatedChapter?.replaceChapterNumber === null ||
        typeof response.generatedChapter?.replaceChapterNumber === "number"
      )
    );

  return (
    typeof response.reply === "string" &&
    Boolean(response.reply.trim()) &&
    isStoryBible(response.storyBible) &&
    generatedChapterIsValid &&
    (
      response.chapters === undefined ||
      Array.isArray(response.chapters)
    )
  );
}
function hasStoryBibleContent(
  storyBible: StoryBible,
): boolean {
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
  const [story, setStory] =
    useState<StoryWorkspace | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasLoadedRemoteStory, setHasLoadedRemoteStory] =
  useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] =
    useState<ActiveTab>("chat");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
 const [stories, setStories] =
  useState<
    {
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }[]
  >([]);

const [readerTheme, setReaderTheme] = useState<
  "light" | "dark" | "sepia"
>("sepia");

const [readerFontSize, setReaderFontSize] =
  useState(18);

const [readerLineHeight, setReaderLineHeight] =
  useState(2);

const [readerWidth, setReaderWidth] = useState<
  "narrow" | "medium" | "wide"
>("medium");
  
  const messages = story?.messages ?? [];
  const storyTitle = story?.title ?? "Untitled story";
  const chapters = story?.chapters ?? [];
  const storyBible =
    story?.storyBible ?? EMPTY_STORY_BIBLE;

 useEffect(() => {
  async function loadUser() {
    const { data } = await supabase.auth.getUser();

    const id = data.user?.id ?? null;

    setUserId(id);

    if (id) {
      await loadStoryList(id);
    }
  }

  loadUser();
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

  setActiveTab("chat");
  setIsMenuOpen(false);
}
  async function createNewStory() {
  if (!userId) {
    return;
  }

  const newStory = createEmptyStory();

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
    });

  if (error) {
    console.error("Could not create story:", error);
    return;
  }

  window.localStorage.setItem(
    "novelforge-current-story-id",
    newStory.id,
  );

  setStory(newStory);
  setActiveTab("chat");
  setIsMenuOpen(false);

  await loadStoryList(userId);
}
  useEffect(() => {
  const saved = localStorage.getItem("novelforge-reader");

  if (!saved) return;

  try {
    const settings = JSON.parse(saved);

    if (settings.theme) setReaderTheme(settings.theme);
    if (settings.fontSize) setReaderFontSize(settings.fontSize);
    if (settings.lineHeight)
      setReaderLineHeight(settings.lineHeight);
    if (settings.width)
      setReaderWidth(settings.width);
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
    })
  );
}, [
  readerTheme,
  readerFontSize,
  readerLineHeight,
  readerWidth,
]);
  
useEffect(() => {
  async function loadStory() {
    try {
      const currentStoryId =
        window.localStorage.getItem(
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

      const savedStory =
        window.localStorage.getItem(STORAGE_KEY);

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
if (
  !hasLoaded ||
  !hasLoadedRemoteStory ||
  !story
) {
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

  async function saveStoryToSupabase() {
    const { error } = await supabase
      .from("stories")
     .upsert(
  {
    id: story.id,
    user_id: userId,
    title: story.title,
    form: story.storyBible,
    story_state: story.storyState,
    chapters: story.chapters,
    messages: story.messages,
    updated_at: story.updatedAt,
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
  console.log(
    "Story saved to Supabase:",
    story.id,
    story.chapters,
  );
}
}
  saveStoryToSupabase();
}, [
  story,
  hasLoaded,
  hasLoadedRemoteStory,
  userId,
]);

  function startNewStory() {
  const confirmed = window.confirm(
    "Start a new story? This will replace the current story on this device.",
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

  function restoreDefaultTitle() {
    setStory((currentStory) => {
      if (
        !currentStory ||
        currentStory.title.trim()
      ) {
        return currentStory;
      }

      return {
        ...currentStory,
        title: "Untitled story",
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedMessage = input.trim();

    if (
      !story ||
      !trimmedMessage ||
      isThinking
    ) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: "user" as const,
      content: trimmedMessage,
    };

    const requestMessages = [
      ...story.messages,
      userMessage,
    ];

    const requestStoryBible = story.storyBible;

    setStory((currentStory) => {
      if (!currentStory) {
        return currentStory;
      }

      return {
        ...currentStory,
        messages: [
          ...currentStory.messages,
          userMessage,
        ],
        updatedAt: new Date().toISOString(),
      };
    });

    setInput("");
    setIsThinking(true);

    try {
      const response = await fetch(
        "/api/story-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
         body: JSON.stringify({
  story: {
    ...story,
    messages: [...story.messages, userMessage],
  },
}),
        },
      );

      const data: unknown = await response.json();
      console.log("Story API response:", data);
      
      if (!response.ok) {
        const errorMessage =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Unknown error";

        throw new Error(errorMessage);
      }

      if (!isStoryChatResponse(data)) {
        throw new Error(
          "The API returned an invalid story response.",
        );
      }

      setStory((currentStory) => {
        if (!currentStory) {
          return currentStory;
        }

        return {
          ...currentStory,
          messages: [
            ...currentStory.messages,
            {
              id: Date.now(),
              role: "assistant",
              content: data.reply,
            },
          ],
          storyState:
  data.storyState ??
  currentStory.storyState,
          chapters:
            data.chapters ??
            currentStory.chapters,
          updatedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      console.error(
        "Story chat request failed:",
        error,
      );

      setStory((currentStory) => {
        if (!currentStory) {
          return currentStory;
        }

        return {
          ...currentStory,
          messages: [
            ...currentStory.messages,
            {
              id: Date.now(),
              role: "assistant",
              content:
                "Something went wrong while I was thinking. Try sending that again.",
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      });
    } finally {
      setIsThinking(false);
    }
  }

  if (!hasLoaded || !story) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-5">
          <p className="text-sm text-neutral-500">
            Loading NovelForge...
          </p>
        </div>
      </main>
    );
  }

  const bibleHasContent =
    hasStoryBibleContent(storyBible);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
        <header className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <button
  type="button"
  onClick={() => setIsMenuOpen(true)}
  aria-label="Open menu"
  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-2xl text-white transition hover:bg-white/10"
>
  ☰
</button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">
                NovelForge
              </p>

              <input
                type="text"
                value={storyTitle}
                onChange={(event) =>
                  updateStoryTitle(
                    event.target.value,
                  )
                }
                onBlur={restoreDefaultTitle}
                aria-label="Story title"
                className="mt-1 w-full max-w-xl border-none bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-neutral-600"
              />
            </div>

            <button
              type="button"
              onClick={startNewStory}
              disabled={isThinking}
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              New Story
            </button>
          </div>

          <nav
            className="mt-5 flex gap-2"
            aria-label="Story workspace tabs"
          >
            <button
              type="button"
              onClick={() =>
                setActiveTab("chat")
              }
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "chat"
                  ? "bg-pink-500 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              Chat
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab("chapters")
              }
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "chapters"
                  ? "bg-pink-500 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              Chapters
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab("bible")
              }
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "bible"
                  ? "bg-pink-500 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              Story Bible
            </button>
          </nav>
        </header>
{isMenuOpen && (
  <aside className="fixed inset-y-0 left-0 z-50 w-80 border-r border-white/10 bg-neutral-900 p-6 shadow-2xl">
    <div className="mb-6 flex items-center justify-between">
      <h2 className="text-xl font-bold text-white">
        NovelForge
      </h2>

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
  className="mb-3 w-full rounded-xl bg-pink-500 px-4 py-3 text-left font-semibold text-white"
>
  + New Story
</button>

    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        Your Stories
      </p>

      <div className="space-y-2">
  {stories.length === 0 ? (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-neutral-400">
      No stories found.
    </div>
  ) : (
    stories.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => openStory(item.id)}
       className={`w-full rounded-xl border p-4 text-left transition ${
  story?.id === item.id
    ? "border-pink-500 bg-pink-500/10"
    : "border-white/10 bg-white/5 hover:bg-white/10"
}`}
      >
        <p className="truncate font-semibold text-white">
          {item.title}
        </p>

        <p className="mt-1 text-xs text-neutral-500">
          Updated{" "}
          {new Date(item.updatedAt).toLocaleDateString()}
        </p>
      </button>
    ))
  )}
</div>
        
        {activeTab === "chat" && (
  <ChatPanel
    messages={messages}
    isThinking={isThinking}
  />
)}

        {activeTab === "chapters" && (
  <ChapterPanel
    chapters={chapters}
    readerTheme={readerTheme}
    setReaderTheme={setReaderTheme}
    readerFontSize={readerFontSize}
    setReaderFontSize={setReaderFontSize}
    readerLineHeight={readerLineHeight}
    setReaderLineHeight={setReaderLineHeight}
    readerWidth={readerWidth}
    setReaderWidth={setReaderWidth}
  />
)}
       
{activeTab === "bible" && (
  <BiblePanel
    storyBible={storyBible}
    bibleHasContent={bibleHasContent}
  />
)}
        
        {activeTab === "chat" && (
          <footer className="sticky bottom-0 border-t border-white/10 bg-neutral-950/95 px-5 py-5 backdrop-blur">
            <form
              onSubmit={sendMessage}
              className="flex items-end gap-3"
            >
              <textarea
                value={input}
                disabled={isThinking}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent
                      .isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Tell NovelForge anything..."
                rows={5}
                className="min-h-14 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none placeholder:text-neutral-600 focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={
                  !input.trim() ||
                  isThinking
                }
                className="h-14 rounded-2xl bg-pink-500 px-6 font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isThinking
                  ? "Thinking..."
                  : "Send"}
              </button>
            </form>

            <p className="mt-3 text-center text-xs text-neutral-600">
              Your story workspace saves
              automatically on this device.
            </p>
          </footer>
        )}
      </div>
    </main>
  );
}
