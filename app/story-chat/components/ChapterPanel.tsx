"use client";

import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { StoryChapter } from "../types";

type ChapterPanelProps = {
  chapters: StoryChapter[];
  onSaveChapter: (
  chapterId: string,
  updates: {
    title: string;
    povCharacter: string;
    content: string;
  },
) => void;
  readerTheme: "light" | "sepia" | "dark";
  setReaderTheme: Dispatch<
    SetStateAction<"light" | "sepia" | "dark">
  >;
  readerFontSize: number;
  setReaderFontSize: Dispatch<
    SetStateAction<number>
  >;
  readerLineHeight: number;
  setReaderLineHeight: Dispatch<
    SetStateAction<number>
  >;
  readerWidth: "narrow" | "medium" | "wide";
  setReaderWidth: Dispatch<
    SetStateAction<"narrow" | "medium" | "wide">
  >;
};

export default function ChapterPanel({
  chapters,
  onSaveChapter,
  readerTheme,
  setReaderTheme,
  readerFontSize,
  setReaderFontSize,
  readerLineHeight,
  setReaderLineHeight,
  readerWidth,
  setReaderWidth,
}: ChapterPanelProps) {

const [selectedChapterId, setSelectedChapterId] =
  useState<string | null>(null);
const [showReaderSettings, setShowReaderSettings] =
  useState(false);
const [isEditing, setIsEditing] = useState(false);
const [editTitle, setEditTitle] = useState("");
const [editPovCharacter, setEditPovCharacter] =
  useState("");
const [editContent, setEditContent] = useState("");
  
const selectedChapter =
  chapters.find(
    (chapter) => chapter.id === selectedChapterId,
  ) ?? null;
  
  return (
          <section className="w-full px-3 py-4 sm:px-5 sm:py-8">
         <div
  className={`rounded-2xl border border-white/10 bg-white/5 ${
    selectedChapter
      ? "fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8"
      : "p-3 sm:p-6"
  }`}
>
             
              {!selectedChapter && (
  <>
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
  </>
)}
              {chapters.length === 0 ? (
                <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                  Chapters generated through
                  the conversation will appear
                  here.
                </p>
              ) : (
                <div
  className={`mt-6 space-y-4 ${
    selectedChapter
      ? "overflow-hidden"
      : "overflow-visible"
  }`}
>
                 {selectedChapter ? (
  <article
  style={{
    minHeight: "100vh",
  }}
    key={selectedChapter.id}
    className={`min-h-full rounded-xl border p-4 shadow-sm sm:p-8 ${
      readerTheme === "dark"
        ? "border-neutral-700 bg-neutral-900"
        : readerTheme === "light"
          ? "border-neutral-200 bg-white"
          : "border-amber-200 bg-[#f4ecd8]"
    } ${
      readerWidth === "narrow"
        ? "mx-auto max-w-2xl"
        : readerWidth === "medium"
          ? "mx-auto max-w-4xl"
          : "max-w-full"
    }`}
  >
    {showReaderSettings && (
  <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
    {showReaderSettings && (
  <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">

    {/* Theme */}
    <div className="mb-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => setReaderTheme("light")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Light
      </button>

      <button
        type="button"
        onClick={() => setReaderTheme("sepia")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Sepia
      </button>

      <button
        type="button"
        onClick={() => setReaderTheme("dark")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Dark
      </button>
    </div>

    {/* Font */}
    <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="text-sm">Font size</span>

      <button
        type="button"
        onClick={() =>
          setReaderFontSize((size) => Math.max(14, size - 1))
        }
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        A-
      </button>

      <span className="w-8 text-center text-sm">
        {readerFontSize}
      </span>

      <button
        type="button"
        onClick={() =>
          setReaderFontSize((size) => Math.min(30, size + 1))
        }
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        A+
      </button>
    </div>

    {/* Line spacing */}
    <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="text-sm">Line spacing</span>

      <button
        type="button"
        onClick={() =>
          setReaderLineHeight((height) =>
            Math.max(1.4, Number((height - 0.1).toFixed(1)))
          )
        }
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        -
      </button>

      <span className="w-10 text-center text-sm">
        {readerLineHeight.toFixed(1)}
      </span>

      <button
        type="button"
        onClick={() =>
          setReaderLineHeight((height) =>
            Math.min(3, Number((height + 0.1).toFixed(1)))
          )
        }
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        +
      </button>
    </div>

    {/* Width */}
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="text-sm">Width</span>

      <button
        type="button"
        onClick={() => setReaderWidth("narrow")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Narrow
      </button>

      <button
        type="button"
        onClick={() => setReaderWidth("medium")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Medium
      </button>

      <button
        type="button"
        onClick={() => setReaderWidth("wide")}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      >
        Wide
      </button>
    </div>
  </div>
)}
    <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-inherit px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
  <button
    type="button"
   onClick={() => {
  setSelectedChapterId(null);
  setIsEditing(false);
  setShowReaderSettings(false);
}}
    className="rounded-lg border border-white/10 px-3 py-2 text-sm"
  >
    ← Back to chapters
<button
  type="button"
  onClick={() =>
    setShowReaderSettings(
      (current) => !current,
    )
  }
  className={`rounded-lg border px-3 py-2 text-sm transition ${
    showReaderSettings
      ? "border-pink-500 bg-pink-500 text-white"
      : "border-white/10"
  }`}
  aria-label="Reader settings"
  title="Reader settings"
>
  ☰
</button>

  {!isEditing && (
    <button
      type="button"
      onClick={() => {
        setEditTitle(selectedChapter.title);
        setEditPovCharacter(
          selectedChapter.povCharacter,
        );
        setEditContent(selectedChapter.content);
        setIsEditing(true);
      }}
      className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white"
    >
      ✏️ Edit
    </button>
  )}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      
        ← Back to chapters
      </button>

      {!isEditing && (
        <button
          type="button"
          onClick={() => {
            setEditTitle(selectedChapter.title);
            setEditPovCharacter(
              selectedChapter.povCharacter,
            );
            setEditContent(selectedChapter.content);
            setIsEditing(true);
          }}
          className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white"
        >
          ✏️ Edit
        </button>
      )}
    </div>
      </div>
)}

    {isEditing ? (
      <div className="space-y-4">
        <div>
          <label
            htmlFor="chapter-title"
            className={`mb-2 block text-sm font-semibold ${
              readerTheme === "dark"
                ? "text-white"
                : "text-black"
            }`}
          >
            Chapter title
          </label>

          <input
            id="chapter-title"
            name="chapterTitle"
            type="text"
            value={editTitle}
            onChange={(event) =>
              setEditTitle(event.target.value)
            }
            className="w-full rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-pink-500"
          />
        </div>

        <div>
          <label
            htmlFor="chapter-pov"
            className={`mb-2 block text-sm font-semibold ${
              readerTheme === "dark"
                ? "text-white"
                : "text-black"
            }`}
          >
            POV character
          </label>

          <input
            id="chapter-pov"
            name="chapterPov"
            type="text"
            value={editPovCharacter}
            onChange={(event) =>
              setEditPovCharacter(event.target.value)
            }
            className="w-full rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-pink-500"
          />
        </div>

        <div>
          <label
            htmlFor="chapter-content"
            className={`mb-2 block text-sm font-semibold ${
              readerTheme === "dark"
                ? "text-white"
                : "text-black"
            }`}
          >
            Chapter content
          </label>

          <textarea
            id="chapter-content"
            name="chapterContent"
            value={editContent}
            onChange={(event) =>
              setEditContent(event.target.value)
            }
            rows={24}
            className="w-full resize-y rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-4 text-white outline-none focus:border-pink-500"
            style={{
              fontSize: `${readerFontSize}px`,
              lineHeight: readerLineHeight,
            }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              onSaveChapter(selectedChapter.id, {
                title: editTitle,
                povCharacter: editPovCharacter,
                content: editContent,
              });

              setIsEditing(false);
            }}
            className="rounded-xl bg-pink-500 px-5 py-3 font-semibold text-white"
          >
            💾 Save
          </button>

          <button
            type="button"
            onClick={() => {
              setEditTitle(selectedChapter.title);
              setEditPovCharacter(
                selectedChapter.povCharacter,
              );
              setEditContent(selectedChapter.content);
              setIsEditing(false);
            }}
            className={`rounded-xl border px-5 py-3 ${
              readerTheme === "dark"
                ? "border-white/10 text-white"
                : "border-black/20 text-black"
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
          Chapter {selectedChapter.number}
        </p>

        <h3
          className={`mt-2 text-2xl font-bold sm:text-3xl ${
            readerTheme === "dark"
              ? "text-white"
              : "text-black"
          }`}
        >
          {selectedChapter.title ||
            `Chapter ${selectedChapter.number}`}
        </h3>

        {selectedChapter.povCharacter && (
          <p
            className={`mt-2 text-base italic ${
              readerTheme === "dark"
                ? "text-neutral-400"
                : "text-neutral-700"
            }`}
          >
            POV: {selectedChapter.povCharacter}
          </p>
        )}

        <p className="mb-4 text-sm font-semibold text-red-500">
          Words:{" "}
          {
            selectedChapter.content
              .trim()
              .split(/\s+/)
              .filter(Boolean).length
          }
        </p>

        <p
          className={`mt-4 whitespace-pre-wrap ${
            readerTheme === "dark"
              ? "text-neutral-100"
              : "text-black"
          }`}
          style={{
            fontSize: `${readerFontSize}px`,
            lineHeight: readerLineHeight,
          }}
        >
          {selectedChapter.content}
        </p>
        
          <div className="mt-10 flex justify-between border-t border-white/10 pt-6">
        <button
          type="button"
          disabled={selectedChapter.number === 1}
          onClick={() => {
            const previous = chapters.find(
              (chapter) =>
                chapter.number ===
                selectedChapter.number - 1,
            );

           if (previous) {
  setSelectedChapterId(previous.id);

  setEditTitle(previous.title);
  setEditPovCharacter(previous.povCharacter);
  setEditContent(previous.content);

  setShowReaderSettings(false);
  setIsEditing(false);
}
          }}
          className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-40"
        >
          ← Previous
        </button>

        <button
  type="button"
  disabled={
    selectedChapter.number === chapters.length
  }
  onClick={() => {
    const next = chapters.find(
      (chapter) =>
        chapter.number ===
        selectedChapter.number + 1,
    );

    if (next) {
  setSelectedChapterId(next.id);

  setEditTitle(next.title);
  setEditPovCharacter(next.povCharacter);
  setEditContent(next.content);

  setShowReaderSettings(false);
  setIsEditing(false);
}
  }}
  className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-40"
>
          type="button"
          onClick={() => {
            const next = chapters.find(
              (chapter) =>
                chapter.number ===
                selectedChapter.number + 1,
            );

            if (next) {
              setSelectedChapterId(next.id);
              setShowReaderSettings(false);
              setIsEditing(false);
            }
          }}
          className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    )}
  </article>
) : (

  <div className="grid gap-3">
    {chapters.map((chapter) => (
      <button
        key={chapter.id}
        type="button"
        onClick={() => {
  setSelectedChapterId(chapter.id);

  setEditTitle(chapter.title);
  setEditPovCharacter(chapter.povCharacter);
  setEditContent(chapter.content);

setIsEditing(false);
setShowReaderSettings(false);
}}
        className="group w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-pink-500/40 hover:bg-white/10"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
          Chapter {chapter.number}
        </p>

        <h3 className="mt-2 text-xl font-semibold text-white transition group-hover:text-pink-400">
          {chapter.title ||
            `Chapter ${chapter.number}`}
        </h3>

               {chapter.povCharacter && (
          <p className="mt-1 text-sm text-neutral-400">
            POV: {chapter.povCharacter}
          </p>
        )}
      </button>
    ))}
  </div>
)}
                </div>
              )}
            </div>
          </section>
  );
}
