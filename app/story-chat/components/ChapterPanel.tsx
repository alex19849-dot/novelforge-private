"use client";

import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { StoryChapter } from "../types";

type ChapterPanelProps = {
  chapters: StoryChapter[];
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

const selectedChapter =
  chapters.find(
    (chapter) => chapter.id === selectedChapterId,
  ) ?? null;
  
  return (
          <section className="flex-1 px-5 py-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
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
              <div className="mb-6 flex items-center gap-3">
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
              <div className="mb-6 flex items-center gap-3">
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

            <div className="mb-6 flex items-center gap-3">
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
                 {selectedChapter ? (
  <article
    key={selectedChapter.id}
    className={`rounded-xl border p-4 shadow-sm sm:p-8 ${
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
    <button
      type="button"
      onClick={() => setSelectedChapterId(null)}
      className="mb-6 rounded-lg border border-white/10 px-3 py-2 text-sm"
    >
      ← Back to chapters
    </button>

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
  </article>
) : (
  <div className="grid gap-3">
    {chapters.map((chapter) => (
      <button
        key={chapter.id}
        type="button"
        onClick={() =>
          setSelectedChapterId(chapter.id)
        }
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
