"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  ActiveTab,
  ChatMessage,
  StoryWorkspace,
} from "./types";

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

const messages = story?.messages ?? [];

const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
const [workspaceId, setWorkspaceId] = useState("");
const [story, setStory] = useState<StoryWorkspace | null>(null);
  const storyTitle = story?.title ?? "Untitled story";

useEffect(() => {
  try {
    const savedWorkspace = window.localStorage.getItem(
  "novelforge-current-story"
);

if (savedWorkspace) {
  const parsedWorkspace = JSON.parse(
    savedWorkspace
  ) as StoryWorkspace;


  setStory(parsedWorkspace);
setWorkspaceId(parsedWorkspace.id);
setMessages(parsedWorkspace.messages);
} else {
  const emptyStory = createEmptyStory();

  setStory(emptyStory);
  setWorkspaceId(emptyStory.id);
  
}
    
  } catch (error) {
    console.error("Could not load saved chat:", error);
  } finally {
    setHasLoadedMessages(true);
  }
}, []);

  
useEffect(() => {
  if (!hasLoadedMessages || !workspaceId) {
    return;
  }

  setStory((currentStory) => {
    const now = new Date().toISOString();

    return {
      id: workspaceId,
      title: storyTitle,
      seriesType: currentStory?.seriesType ?? "standalone",
      seriesTitle: currentStory?.seriesTitle ?? "",
      bookNumber: currentStory?.bookNumber ?? 1,
      messages,
      chapters: currentStory?.chapters ?? [],
      storyBible: currentStory?.storyBible ?? {
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
      createdAt: currentStory?.createdAt ?? now,
      updatedAt: now,
    };
  });
}, [
  messages,
  storyTitle,
  workspaceId,
  hasLoadedMessages,
]);
  
 useEffect(() => {
  if (!hasLoadedMessages || !story) {
    return;
  }

  window.localStorage.setItem(
    "novelforge-current-story",
    JSON.stringify(story)
  );
}, [story, hasLoadedMessages]);

  
 function startNewStory() {
  const confirmed = window.confirm(
    "Start a new story? This will clear the current story on this device."
  );

  if (!confirmed) {
    return;
  }

  const newStory = createEmptyStory();

  setStory(newStory);
  setWorkspaceId(newStory.id);
  setInput("");
  setActiveTab("chat");

  window.localStorage.setItem(
    "novelforge-current-story",
    JSON.stringify(newStory)
  );

  window.localStorage.removeItem(
    "novelforge-story-chat-messages"
  );

  window.localStorage.removeItem(
    "novelforge-story-chat-title"
  );
}


  async function sendMessage(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const trimmedMessage = input.trim();

 if (!trimmedMessage || isThinking) {
  return;
}

  const updatedMessages = [
    ...messages,
    {
      id: Date.now(),
      role: "user" as const,
      content: trimmedMessage,
    },
  ];

  
setInput("");
setIsThinking(true);

try {
    const response = await fetch("/api/story-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: updatedMessages.map(({ role, content }) => ({
          role,
          content,
        })),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown error");
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      },
    ]);
    } catch (error) {
    console.error(error);

    setMessages((current) => [
      ...current,
      {
        id: Date.now() + 2,
        role: "assistant",
        content:
          "Something went wrong while I was thinking. Try sending that again.",
      },
    ]);
  } finally {
    setIsThinking(false);
  }
}

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
        <header className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">
                NovelForge
              </p>

             <input
  type="text"
  value={storyTitle}
onChange={(event) => {
  setStory((current) =>
    current
      ? {
          ...current,
          title: event.target.value,
        }
      : null
  );
}}
  onBlur={() => {
    if (!storyTitle.trim()) {
     setStory((current) =>
  current
    ? {
        ...current,
        title: "Untitled story",
      }
    : null
);
    }
  }}
  aria-label="Story title"
  className="mt-1 w-full max-w-xl border-none bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-neutral-600"
/>
            </div>

           <button
  type="button"
  onClick={startNewStory}
  disabled={isThinking}
  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
>
  New story
</button>
          </div>

         <nav className="mt-5 flex gap-2">
  <button
    type="button"
    onClick={() => setActiveTab("chat")}
    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
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
    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
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
    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
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
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[85%]">
                  <p
                    className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                      isUser ? "text-right text-neutral-500" : "text-pink-500"
                    }`}
                  >
                    {isUser ? "You" : "NovelForge"}
                  </p>

                  <div
                    className={`rounded-2xl px-5 py-4 text-[15px] leading-7 ${
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
        No chapters yet
      </h2>

      <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
        Chapters generated through the conversation will appear here.
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
        No story details yet
      </h2>

      <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
        Characters, setting, tropes, plot decisions and series information will
        be built automatically from your conversation.
      </p>
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
              placeholder="Tell NovelForge anything..."
              rows={1}
              className="min-h-14 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
            />

            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="h-14 rounded-2xl bg-pink-500 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isThinking ? "Thinking..." : "Send"}
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-neutral-600">
            The AI is not connected yet. Humanity survives another step.
          </p>
        </footer>
  )}
      </div>
    </main>
  );
}
