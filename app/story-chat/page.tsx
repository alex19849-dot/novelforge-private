"use client";

import { FormEvent, useEffect, useState } from "react";

import { ActiveTab, StoryWorkspace } from "./types";

const STORAGE_KEY = "novelforge-current-story";

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
    },
    createdAt: now,
    updatedAt: now,
  };
}

function isStoryWorkspace(value: unknown): value is StoryWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoryWorkspace>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.chapters) &&
    Boolean(candidate.storyBible)
  );
}

export default function StoryChatPage() {
  const [story, setStory] = useState<StoryWorkspace | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

  const messages = story?.messages ?? [];
  const storyTitle = story?.title ?? "Untitled story";
  const chapters = story?.chapters ?? [];
  const storyBible = story?.storyBible;

  useEffect(() => {
    try {
      const savedStory = window.localStorage.getItem(STORAGE_KEY);

      if (!savedStory) {
        setStory(createEmptyStory());
        return;
      }

      const parsedStory: unknown = JSON.parse(savedStory);

      if (isStoryWorkspace(parsedStory)) {
        setStory(parsedStory);
      } else {
        setStory(createEmptyStory());
      }
    } catch (error) {
      console.error("Could not load the saved story:", error);
      setStory(createEmptyStory());
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded || !story) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(story));
    } catch (error) {
      console.error("Could not save the story:", error);
    }
  }, [story, hasLoaded]);

  function startNewStory() {
    const confirmed = window.confirm(
      "Start a new story? This will replace the current story on this device.",
    );

    if (!confirmed) {
      return;
    }

    setStory(createEmptyStory());
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = input.trim();

    if (!story || !trimmedMessage || isThinking) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: "user" as const,
      content: trimmedMessage,
    };

    const requestMessages = [...story.messages, userMessage];

    setStory((currentStory) => {
      if (!currentStory) {
        return currentStory;
      }

      return {
        ...currentStory,
        messages: [...currentStory.messages, userMessage],
        updatedAt: new Date().toISOString(),
      };
    });

    setInput("");
    setIsThinking(true);

    try {
      const response = await fetch("/api/story-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

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

      const reply =
        data &&
        typeof data === "object" &&
        "reply" in data &&
        typeof data.reply === "string"
          ? data.reply
          : "";

      if (!reply.trim()) {
        throw new Error("The API returned an empty reply.");
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
              content: reply,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      console.error("Story chat request failed:", error);

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
          <p className="text-sm text-neutral-500">Loading NovelForge...</p>
        </div>
      </main>
    );
  }

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
                onChange={(event) => updateStoryTitle(event.target.value)}
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

          <nav className="mt-5 flex gap-2" aria-label="Story workspace tabs">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
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
              onClick={() => setActiveTab("chapters")}
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
              onClick={() => setActiveTab("bible")}
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
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
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
                      {isUser ? "You" : "NovelForge"}
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
                    Thinking about the story...
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
                      chapters.length === 1 ? "chapter" : "chapters"
                    }`}
              </h2>

              <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                {chapters.length === 0
                  ? "Chapters generated through the conversation will appear here."
                  : "Your generated chapters are saved inside this story workspace."}
              </p>
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
                {storyBible.premise.trim()
                  ? "Story details"
                  : "No story details yet"}
              </h2>

              {storyBible.premise.trim() ? (
                <div className="mt-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Premise
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap leading-7 text-neutral-400">
                      {storyBible.premise}
                    </p>
                  </div>

                  {storyBible.relationship.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Relationship
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.relationship}
                      </p>
                    </div>
                  )}

                  {storyBible.subgenre.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Subgenre
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.subgenre}
                      </p>
                    </div>
                  )}

                  {storyBible.setting.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Setting
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.setting}
                      </p>
                    </div>
                  )}

                  {storyBible.pov.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">POV</h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.pov}
                      </p>
                    </div>
                  )}

                  {storyBible.heatLevel.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Heat Level
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.heatLevel}
                      </p>
                    </div>
                  )}

                  {storyBible.burnPacing.trim() && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Burn Pacing
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.burnPacing}
                      </p>
                    </div>
                  )}

                  {storyBible.tropes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Tropes
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {storyBible.tropes.map((trope, index) => (
                          <span
                            key={`${trope}-${index}`}
                            className="rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1 text-sm text-pink-300"
                          >
                            {trope}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {storyBible.characters.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Characters
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.characters.length}{" "}
                        {storyBible.characters.length === 1
                          ? "character"
                          : "characters"}{" "}
                        saved
                      </p>
                    </div>
                  )}

                  {storyBible.notes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Notes
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-400">
                        {storyBible.notes.length}{" "}
                        {storyBible.notes.length === 1 ? "note" : "notes"} saved
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                  Characters, setting, tropes, plot decisions and series
                  information will be built automatically from your
                  conversation.
                </p>
              )}
            </div>
          </section>
        )}

        {activeTab === "chat" && (
          <footer className="sticky bottom-0 border-t border-white/10 bg-neutral-950/95 px-5 py-5 backdrop-blur">
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
                placeholder="Tell NovelForge anything..."
                rows={1}
                className="min-h-14 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none placeholder:text-neutral-600 focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="h-14 rounded-2xl bg-pink-500 px-6 font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
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
