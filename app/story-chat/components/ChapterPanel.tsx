"use client";

import type {
  Dispatch,
  SetStateAction,
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
                 {chapters.map((chapter) => (
  <article
  key={chapter.id}
  className={`rounded-xl border p-8 shadow-sm ${
    readerTheme === "dark"
      ? "border-neutral-700 bg-neutral-900"
      : readerTheme === "light"
        ? "border-neutral-200 bg-white"
        : "border-amber-200 bg-[#f4ecd8]"
  } ${
    readerWidth === "narrow"
      ? "max-w-2xl mx-auto"
      : readerWidth === "medium"
        ? "max-w-4xl mx-auto"
        : "max-w-full"
  }`}
>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
      Chapter {chapter.number}
    </p>

    <h3
      className={`mt-2 text-3xl font-bold ${
        readerTheme === "dark"
          ? "text-white"
          : "text-black"
      }`}
    >
      {chapter.title || `Chapter ${chapter.number}`}
    </h3>

    {chapter.povCharacter && (
      <p
        className={`mt-2 text-base italic ${
          readerTheme === "dark"
            ? "text-neutral-400"
            : "text-neutral-700"
        }`}
      >
        POV: {chapter.povCharacter}
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
      {chapter.content}
    </p>
  </article>
))}
                </div>
              )}
            </div>
          </section>
        )}

