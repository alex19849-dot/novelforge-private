"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

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

  const messages = story?.messages ?? [];
  const storyTitle = story?.title ?? "Untitled story";
  const chapters = story?.chapters ?? [];
  const storyBible =
    story?.storyBible ?? EMPTY_STORY_BIBLE;

  useEffect(() => {
  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  }

  loadUser();
}, []);
  
useEffect(() => {
  async function loadStory() {
    try {
      if (userId) {
        const { data } = await supabase
          .from("stories")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setStory({
            id: data.id,
            title: data.title,
            seriesType: "standalone",
            seriesTitle: "",
            bookNumber: 1,
            messages: data.messages ?? [],
            chapters: data.chapters ?? [],
            storyBible: data.form ?? EMPTY_STORY_BIBLE,
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
    }
  }

  saveStoryToSupabase();
}, [story, hasLoaded, userId]);

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
          storyBible: data.storyBible,
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

        {activeTab === "chat" && (
          <section className="flex-1 space-y-6 overflow-y-auto px-5 py-8">
            {messages.map((message) => {
              const isUser =
                message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isUser
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div className="max-w-[85%]">
                    <p
                      className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                        isUser
                          ? "text-right text-neutral-500"
                          : "text-pink-500"
                      }`}
                    >
                      {isUser
                        ? "You"
                        : "NovelForge"}
                    </p>

                    <div
                      className={`whitespace-pre-wrap rounded-2xl px-5 py-4 text-[15px] leading-7 ${
                        isUser
                          ? "rounded-br-md bg-pink-500 text-white"
                          : "rounded-bl-md border border-white/10 bg-white/5 text-neutral-100"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-pink-500">
                    NovelForge
                  </p>

                  <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-5 py-4 text-[15px] text-neutral-400">
                    Thinking about the
                    story...
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "chapters" && (
          <section className="flex-1 px-5 py-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">
                Chapters
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                {chapters.length === 0
                  ? "No chapters yet"
                  : `${chapters.length} ${
                      chapters.length === 1
                        ? "chapter"
                        : "chapters"
                    }`}
              </h2>

              {chapters.length === 0 ? (
                <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                  Chapters generated through
                  the conversation will appear
                  here.
                </p>
              ) : (
                <div className="mt-6 space-y-4">
                  {chapters.map((chapter) => (
                    <article
                      key={chapter.id}
                      className="rounded-xl border border-white/10 bg-neutral-950/40 p-5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
                        Chapter {chapter.number}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold text-white">
                        {chapter.title ||
                          `Chapter ${chapter.number}`}
                      </h3>

                      {chapter.povCharacter && (
                        <p className="mt-2 text-sm text-neutral-500">
                          POV:{" "}
                          {
                            chapter.povCharacter
                          }
                        </p>
                      )}

                      <p className="mt-4 whitespace-pre-wrap text-[18px] leading-9 text-black">
                        {chapter.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "bible" && (
          <section className="flex-1 px-5 py-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">
                Story Bible
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                {bibleHasContent
                  ? "Story details"
                  : "No story details yet"}
              </h2>

              {!bibleHasContent ? (
                <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                  Characters, setting, tropes,
                  plot decisions and series
                  information will be built
                  automatically from your
                  conversation.
                </p>
              ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {storyBible.premise && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Premise
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-neutral-300">
                        {storyBible.premise}
                      </p>
                    </div>
                  )}

                  {storyBible.relationship && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Relationship
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {
                          storyBible.relationship
                        }
                      </p>
                    </div>
                  )}

                  {storyBible.subgenre && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Subgenre
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.subgenre}
                      </p>
                    </div>
                  )}

                  {storyBible.setting && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Setting
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-neutral-300">
                        {storyBible.setting}
                      </p>
                    </div>
                  )}

                  {storyBible.pov && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        POV
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.pov}
                      </p>
                    </div>
                  )}

                  {storyBible.heatLevel && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Heat Level
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.heatLevel}
                      </p>
                    </div>
                  )}

                  {storyBible.burnPacing && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Burn Pacing
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.burnPacing}
                      </p>
                    </div>
                  )}

                  {storyBible.tropes.length >
                    0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Tropes
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {storyBible.tropes.map(
                          (trope) => (
                            <span
                              key={trope}
                              className="rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1 text-sm text-pink-300"
                            >
                              {trope}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {storyBible.characters
                    .length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Characters
                      </h3>
                      <div className="mt-3 space-y-3">
                        {storyBible.characters.map(
                          (character) => (
                            <p
                              key={character}
                              className="rounded-lg border border-white/5 bg-white/5 px-4 py-3 leading-7 text-neutral-300"
                            >
                              {character}
                            </p>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {storyBible.notes.length >
                    0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Notes
                      </h3>
                      <ul className="mt-3 space-y-3">
                        {storyBible.notes.map(
                          (note) => (
                            <li
                              key={note}
                              className="rounded-lg border border-white/5 bg-white/5 px-4 py-3 leading-7 text-neutral-300"
                            >
                              {note}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
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
                rows={1}
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
