"use client";

import {
  useEffect,
  useRef,
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
  setReaderFontSize: Dispatch<SetStateAction<number>>;
  readerLineHeight: number;
  setReaderLineHeight: Dispatch<SetStateAction<number>>;
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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const readerRef = useRef<HTMLDivElement | null>(null);

  const selectedChapter =
    chapters.find(
      (chapter) => chapter.id === selectedChapterId,
    ) ?? null;

  const themeClasses =
    readerTheme === "dark"
      ? "bg-[#111111] text-[#f5f5f5]"
      : readerTheme === "light"
        ? "bg-white text-black"
        : "bg-[#f4ecd8] text-[#17130d]";

  const mutedTextClasses =
    readerTheme === "dark"
      ? "text-neutral-400"
      : "text-neutral-600";

  function calculatePages() {
    const reader = readerRef.current;

    if (!reader) {
      setCurrentPage(1);
      setPageCount(1);
      return;
    }

    const width = reader.clientWidth;

    if (width <= 0) {
      return;
    }

    const total = Math.max(
      1,
      Math.ceil(reader.scrollWidth / width),
    );

    const page = Math.min(
      total,
      Math.max(
        1,
        Math.round(reader.scrollLeft / width) + 1,
      ),
    );

    setPageCount(total);
    setCurrentPage(page);
  }

  function snapToNearestPage() {
    const reader = readerRef.current;

    if (!reader) {
      return;
    }

    const width = reader.clientWidth;

    if (width <= 0) {
      return;
    }

    const pageIndex = Math.round(
      reader.scrollLeft / width,
    );

    reader.scrollTo({
      left: pageIndex * width,
      behavior: "smooth",
    });
  }

  function moveToPage(page: number) {
    const reader = readerRef.current;

    if (!reader) {
      return;
    }

    const safePage = Math.min(
      pageCount,
      Math.max(1, page),
    );

    reader.scrollTo({
      left: (safePage - 1) * reader.clientWidth,
      behavior: "smooth",
    });
  }

  function openChapter(chapter: StoryChapter) {
    setSelectedChapterId(chapter.id);
    setEditTitle(chapter.title);
    setEditPovCharacter(chapter.povCharacter);
    setEditContent(chapter.content);
    setIsEditing(false);
    setShowReaderSettings(false);
    setCurrentPage(1);

    requestAnimationFrame(() => {
      readerRef.current?.scrollTo({
        left: 0,
        top: 0,
      });

      calculatePages();
    });
  }

  function closeChapter() {
    setSelectedChapterId(null);
    setIsEditing(false);
    setShowReaderSettings(false);
    setCurrentPage(1);
    setPageCount(1);
  }

  useEffect(() => {
    if (!selectedChapter || isEditing) {
      return;
    }

    const timer = window.setTimeout(() => {
      readerRef.current?.scrollTo({
        left: 0,
        top: 0,
      });

      calculatePages();
    }, 100);

    window.addEventListener("resize", calculatePages);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(
        "resize",
        calculatePages,
      );
    };
  }, [
    selectedChapter,
    isEditing,
    readerFontSize,
    readerLineHeight,
    readerWidth,
    readerTheme,
  ]);

  function renderChapterContent(content: string) {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    return paragraphs.map((paragraph, index) => {
      const messageMatch = paragraph.match(
  /^([A-Za-z][A-Za-z0-9 .'-]{0,30}):\s*([\s\S]+)$/,
);

      if (messageMatch) {
        const [, characterName, message] =
          messageMatch;

        return (
          <p
            key={`${characterName}-${index}`}
            className="mb-[1em]"
          >
            <strong className="not-italic">
              {characterName}:
            </strong>{" "}
            <em>{message}</em>
          </p>
        );
      }

      return (
        <p
          key={`paragraph-${index}`}
          className="mb-[1em]"
        >
          {paragraph}
        </p>
      );
    });
  }

  if (selectedChapter) {
    return (
      <div
        className={`fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden ${themeClasses}`}
      >
        <header
          className={`absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b px-3 ${
            readerTheme === "dark"
              ? "border-white/10 bg-[#111111]"
              : "border-black/10 bg-inherit"
          }`}
        >
          <button
            type="button"
            onClick={closeChapter}
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl"
            aria-label="Back to chapters"
          >
            ‹
          </button>

          <div className="min-w-0 flex-1 px-2 text-center">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em]">
              Chapter {selectedChapter.number}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {!isEditing && (
              <button
                type="button"
                onClick={() =>
                  setShowReaderSettings(
                    (current) => !current,
                  )
                }
                className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold"
                aria-label="Reader settings"
              >
                Aa
              </button>
            )}

            {!isEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditTitle(
                    selectedChapter.title,
                  );
                  setEditPovCharacter(
                    selectedChapter.povCharacter,
                  );
                  setEditContent(
                    selectedChapter.content,
                  );
                  setIsEditing(true);
                  setShowReaderSettings(false);
                }}
                className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white"
              >
                Edit
              </button>
            )}
          </div>
        </header>

        {showReaderSettings && !isEditing && (
          <div
            className={`absolute inset-x-3 top-16 z-40 rounded-2xl border p-4 shadow-xl ${
              readerTheme === "dark"
                ? "border-white/10 bg-neutral-900"
                : "border-black/10 bg-white text-black"
            }`}
          >
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setReaderTheme("light")
                }
                className="flex-1 rounded-lg border border-black/20 px-3 py-2 text-sm"
              >
                Light
              </button>

              <button
                type="button"
                onClick={() =>
                  setReaderTheme("sepia")
                }
                className="flex-1 rounded-lg border border-black/20 bg-[#f4ecd8] px-3 py-2 text-sm text-black"
              >
                Sepia
              </button>

              <button
                type="button"
                onClick={() =>
                  setReaderTheme("dark")
                }
                className="flex-1 rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-sm text-white"
              >
                Dark
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">
                Font size
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setReaderFontSize((size) =>
                      Math.max(14, size - 1),
                    )
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  A-
                </button>

                <span className="w-8 text-center">
                  {readerFontSize}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setReaderFontSize((size) =>
                      Math.min(30, size + 1),
                    )
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  A+
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">
                Line spacing
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setReaderLineHeight((height) =>
                      Math.max(
                        1.3,
                        Number(
                          (height - 0.1).toFixed(1),
                        ),
                      ),
                    )
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  -
                </button>

                <span className="w-10 text-center">
                  {readerLineHeight.toFixed(1)}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setReaderLineHeight((height) =>
                      Math.min(
                        2.4,
                        Number(
                          (height + 0.1).toFixed(1),
                        ),
                      ),
                    )
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              {(
                [
                  "narrow",
                  "medium",
                  "wide",
                ] as const
              ).map((width) => (
                <button
                  key={width}
                  type="button"
                  onClick={() =>
                    setReaderWidth(width)
                  }
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
                    readerWidth === width
                      ? "border-pink-500 bg-pink-500 text-white"
                      : "border-current/20"
                  }`}
                >
                  {width}
                </button>
              ))}
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="absolute inset-x-0 bottom-0 top-14 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4 pb-10">
              <div>
                <label
                  htmlFor="chapter-title"
                  className="mb-2 block text-sm font-semibold"
                >
                  Chapter title
                </label>

                <input
                  id="chapter-title"
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
                  className="mb-2 block text-sm font-semibold"
                >
                  POV character
                </label>

                <input
                  id="chapter-pov"
                  type="text"
                  value={editPovCharacter}
                  onChange={(event) =>
                    setEditPovCharacter(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label
                  htmlFor="chapter-content"
                  className="mb-2 block text-sm font-semibold"
                >
                  Chapter content
                </label>

                <textarea
                  id="chapter-content"
                  value={editContent}
                  onChange={(event) =>
                    setEditContent(
                      event.target.value,
                    )
                  }
                  rows={28}
                  className="w-full resize-y rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-4 text-white outline-none focus:border-pink-500"
                  style={{
                    fontSize: `${readerFontSize}px`,
                    lineHeight: readerLineHeight,
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onSaveChapter(
                      selectedChapter.id,
                      {
                        title: editTitle,
                        povCharacter:
                          editPovCharacter,
                        content: editContent,
                      },
                    );

                    setIsEditing(false);
                  }}
                  className="rounded-xl bg-pink-500 px-5 py-3 font-semibold text-white"
                >
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(
                      selectedChapter.title,
                    );
                    setEditPovCharacter(
                      selectedChapter.povCharacter,
                    );
                    setEditContent(
                      selectedChapter.content,
                    );
                    setIsEditing(false);
                  }}
                  className="rounded-xl border border-current/20 px-5 py-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
  ref={readerRef}
  onScroll={calculatePages}
  className="absolute inset-0 top-14 bottom-10 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
  style={{
    scrollBehavior: "smooth",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  }}
>
              <article
                className="h-full"
                style={{
                  
                  padding:
                    readerWidth === "narrow"
                      ? "32px 38px"
                      : readerWidth === "medium"
                        ? "28px 26px"
                        : "24px 18px",
                  fontFamily:
                    "Georgia, 'Times New Roman', serif",
                  fontSize: `${readerFontSize}px`,
                  lineHeight: readerLineHeight,
                }}
              >
                <div className="break-inside-avoid pb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
                    Chapter {selectedChapter.number}
                  </p>

                  <h1 className="mt-3 text-3xl font-bold leading-tight">
                    {selectedChapter.title ||
                      `Chapter ${selectedChapter.number}`}
                  </h1>

                  {selectedChapter.povCharacter && (
                    <p
                      className={`mt-2 italic ${mutedTextClasses}`}
                    >
                      {selectedChapter.povCharacter}
                    </p>
                  )}
                </div>

                {renderChapterContent(
                  selectedChapter.content,
                )}
              </article>
            </div>

            <footer
              className={`absolute inset-x-0 bottom-0 z-30 flex h-10 items-center justify-center border-t text-xs ${
                readerTheme === "dark"
                  ? "border-white/10 bg-[#111111] text-neutral-400"
                  : "border-black/10 bg-inherit text-neutral-600"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  moveToPage(currentPage - 1)
                }
                disabled={currentPage <= 1}
                className="absolute left-4 px-2 py-1 text-lg disabled:opacity-20"
                aria-label="Previous page"
              >
                ‹
              </button>

              <span>
                Page {currentPage} of {pageCount}
              </span>

              <button
                type="button"
                onClick={() =>
                  moveToPage(currentPage + 1)
                }
                disabled={currentPage >= pageCount}
                className="absolute right-4 px-2 py-1 text-lg disabled:opacity-20"
                aria-label="Next page"
              >
                ›
              </button>
            </footer>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="w-full px-3 py-4 sm:px-5 sm:py-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-6">
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
            Chapters generated through the conversation
            will appear here.
          </p>
        ) : (
          <div className="mt-6 grid gap-3">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => openChapter(chapter)}
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
    </section>
  );
}
