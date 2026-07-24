"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  setReaderTheme: Dispatch<SetStateAction<"light" | "sepia" | "dark">>;
  readerFontSize: number;
  setReaderFontSize: Dispatch<SetStateAction<number>>;
  readerLineHeight: number;
  setReaderLineHeight: Dispatch<SetStateAction<number>>;
  readerWidth: "narrow" | "medium" | "wide";
  setReaderWidth: Dispatch<SetStateAction<"narrow" | "medium" | "wide">>;
};

const MESSAGE_PATTERN =
  /^([A-Za-z][A-Za-z0-9 .'-]{0,30}):\s*([\s\S]+)$/;

function getParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getReaderPadding(
  width: ChapterPanelProps["readerWidth"],
  viewportWidth = 0,
): {
  horizontal: number;
  vertical: number;
  maxContentWidth: number;
} {
  const isMobile = viewportWidth > 0 && viewportWidth < 640;

  if (isMobile) {
    return {
      horizontal: width === "narrow" ? 28 : width === "medium" ? 20 : 14,
      vertical: 24,
      maxContentWidth: viewportWidth,
    };
  }

  if (width === "narrow") {
    return {
      horizontal: 38,
      vertical: 32,
      maxContentWidth: 720,
    };
  }

  if (width === "medium") {
    return {
      horizontal: 32,
      vertical: 28,
      maxContentWidth: 780,
    };
  }

  return {
    horizontal: 28,
    vertical: 24,
    maxContentWidth: 850,
  };
}

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
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPovCharacter, setEditPovCharacter] = useState("");
  const [editContent, setEditContent] = useState("");
  const [pages, setPages] = useState<string[][]>([[]]);
  const [currentPage, setCurrentPage] = useState(1);
const readerRef = useRef<HTMLDivElement | null>(null);
  const measurementRef = useRef<HTMLDivElement | null>(null);
  const paginationFrameRef = useRef<number | null>(null);

  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;

  const pageCount = Math.max(1, pages.length);

  const themeClasses =
    readerTheme === "dark"
      ? "bg-[#111111] text-[#f5f5f5]"
      : readerTheme === "light"
        ? "bg-white text-black"
        : "bg-[#f4ecd8] text-[#17130d]";

  const mutedTextClasses =
    readerTheme === "dark" ? "text-neutral-400" : "text-neutral-600";

  const paginateChapter = useCallback(() => {
    const reader = readerRef.current;

    if (!reader || !selectedChapter || isEditing) {
      return;
    }

    const readerWidthPixels = reader.clientWidth;
    const readerHeightPixels = reader.clientHeight;

    if (readerWidthPixels <= 0 || readerHeightPixels <= 0) {
      return;
    }

   const padding = getReaderPadding(readerWidth, readerWidthPixels);

const contentWidth = Math.max(
  240,
  Math.min(
    readerWidthPixels - padding.horizontal * 2,
    padding.maxContentWidth - padding.horizontal * 2,
  ),
);
    const contentHeight = Math.max(
      240,
      readerHeightPixels - padding.vertical * 2,
    );
    const measurement = measurementRef.current;

if (!measurement) {
  return;
}

measurement.style.width = `${contentWidth}px`;
measurement.style.height = `${contentHeight}px`;
measurement.style.padding = "0";
measurement.style.fontSize = `${readerFontSize}px`;
measurement.style.lineHeight = String(readerLineHeight);
measurement.replaceChildren();
   const createMeasuredParagraph = (content: string): HTMLParagraphElement => {
  const paragraph = document.createElement("p");

  paragraph.style.margin = "0 0 1em";
  paragraph.style.whiteSpace = "pre-wrap";
  paragraph.style.overflowWrap = "anywhere";

  const messageMatch = content.match(MESSAGE_PATTERN);

  if (messageMatch) {
    const [, characterName, message] = messageMatch;

    const name = document.createElement("strong");
    name.textContent = `${characterName}:`;

    const text = document.createElement("em");
    text.textContent = ` ${message}`;

    paragraph.append(name, text);
  } else {
    paragraph.textContent = content;
  }

  return paragraph;
}; 

    const addMeasuredHeading = () => {
  const measurementOverflows = (): boolean =>
  measurement.scrollHeight > measurement.clientHeight + 1;
  const headingWrapper = document.createElement("div");
  headingWrapper.style.paddingBottom = "24px";

  const chapterLabel = document.createElement("p");
  chapterLabel.textContent = `Chapter ${selectedChapter.number}`;
  chapterLabel.style.margin = "0";
  chapterLabel.style.fontFamily = "Arial, sans-serif";
  chapterLabel.style.fontSize = "12px";
  chapterLabel.style.fontWeight = "600";
  chapterLabel.style.lineHeight = "16px";
  chapterLabel.style.letterSpacing = "0.2em";
  chapterLabel.style.textTransform = "uppercase";

  const title = document.createElement("h1");
  title.textContent =
    selectedChapter.title || `Chapter ${selectedChapter.number}`;
  title.style.margin = "12px 0 0";
  title.style.fontSize = "30px";
  title.style.fontWeight = "700";
  title.style.lineHeight = "1.25";
  title.style.overflowWrap = "anywhere";

  headingWrapper.append(chapterLabel, title);

  if (selectedChapter.povCharacter) {
    const pov = document.createElement("p");
    pov.textContent = selectedChapter.povCharacter;
    pov.style.margin = "8px 0 0";
    pov.style.fontStyle = "italic";

    headingWrapper.appendChild(pov);
  }

  measurement.appendChild(headingWrapper);
};
    
    const charactersPerLine = Math.max(
      20,
      Math.floor(contentWidth / (readerFontSize * 0.56)),
    );
    const linesPerPage = Math.max(
      8,
      Math.floor(
        contentHeight / (readerFontSize * readerLineHeight),
      ),
    );
   const normalPageLimit = Math.max(
  350,
  Math.floor(charactersPerLine * linesPerPage * 1.18),
);

    let currentBlocks: string[] = [];
    let currentLength = 0;
    const nextPages: string[][] = [];

    const finishPage = () => {
      nextPages.push(currentBlocks);
      currentBlocks = [];
      currentLength = 0;
    };

    for (const originalParagraph of getParagraphs(selectedChapter.content)) {
      let remaining = originalParagraph;

      while (remaining) {
        const pageLimit =
  nextPages.length === 0
    ? Math.max(220, normalPageLimit - 180)
    : normalPageLimit;
        const paragraphSpacing =
          currentBlocks.length === 0 ? 0 : readerFontSize * 2;
        const available =
          pageLimit - currentLength - paragraphSpacing;

        if (available <= 0) {
          finishPage();
          continue;
        }

        if (remaining.length <= available) {
          currentBlocks.push(remaining);
          currentLength += paragraphSpacing + remaining.length;
          remaining = "";
          continue;
        }

        if (currentBlocks.length > 0) {
          finishPage();
          continue;
        }

        let splitAt = remaining.lastIndexOf(" ", available);

        if (splitAt < 1) {
          splitAt = Math.min(available, remaining.length);
        }

        const pagePart = remaining.slice(0, splitAt).trimEnd();
        currentBlocks.push(pagePart);
        currentLength += pagePart.length;
        remaining = remaining.slice(splitAt).trimStart();

        if (remaining) {
          finishPage();
        }
      }
    }

    if (currentBlocks.length > 0 || nextPages.length === 0) {
      nextPages.push(currentBlocks);
    }

    setPages(nextPages);
    setCurrentPage(1);

    requestAnimationFrame(() => {
      reader.scrollTo({ left: 0, top: 0 });
    });
  }, [
    isEditing,
    readerFontSize,
    readerLineHeight,
    readerWidth,
    selectedChapter,
  ]);

  const schedulePagination = useCallback(() => {
    if (paginationFrameRef.current !== null) {
      cancelAnimationFrame(paginationFrameRef.current);
    }

    paginationFrameRef.current = requestAnimationFrame(() => {
      paginationFrameRef.current = null;
      paginateChapter();
    });
  }, [paginateChapter]);

  useLayoutEffect(() => {
    if (!selectedChapter || isEditing) {
      return;
    }

    schedulePagination();
    const firstRetry = window.setTimeout(schedulePagination, 100);
    const secondRetry = window.setTimeout(schedulePagination, 350);

    const reader = readerRef.current;
    const resizeObserver =
      reader && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedulePagination)
        : null;

    if (reader) {
      resizeObserver?.observe(reader);
    }

    window.addEventListener("resize", schedulePagination);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePagination);
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);

      if (paginationFrameRef.current !== null) {
        cancelAnimationFrame(paginationFrameRef.current);
        paginationFrameRef.current = null;
      }
    };
  }, [isEditing, schedulePagination, selectedChapter]);

  useEffect(() => {
    if (!selectedChapter) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedChapter]);

  function updateCurrentPage() {
    const reader = readerRef.current;

    if (!reader || reader.clientWidth <= 0) {
      return;
    }

    const page = Math.round(reader.scrollLeft / reader.clientWidth) + 1;
    setCurrentPage(Math.min(pageCount, Math.max(1, page)));
  }

  function moveToPage(page: number) {
    const reader = readerRef.current;

    if (!reader) {
      return;
    }

    const safePage = Math.min(pageCount, Math.max(1, page));
    reader.scrollTo({
      left: (safePage - 1) * reader.clientWidth,
      behavior: "smooth",
    });
    setCurrentPage(safePage);
  }

  function openChapter(chapter: StoryChapter) {
    setSelectedChapterId(chapter.id);
    setEditTitle(chapter.title);
    setEditPovCharacter(chapter.povCharacter);
    setEditContent(chapter.content);
    setPages([getParagraphs(chapter.content)]);
    setCurrentPage(1);
    setIsEditing(false);
    setShowReaderSettings(false);
  }

  function closeChapter() {
    setSelectedChapterId(null);
    setIsEditing(false);
    setShowReaderSettings(false);
    setPages([[]]);
    setCurrentPage(1);
  }

  function startEditing() {
    if (!selectedChapter) {
      return;
    }

    setEditTitle(selectedChapter.title);
    setEditPovCharacter(selectedChapter.povCharacter);
    setEditContent(selectedChapter.content);
    setShowReaderSettings(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    if (!selectedChapter) {
      return;
    }

    setEditTitle(selectedChapter.title);
    setEditPovCharacter(selectedChapter.povCharacter);
    setEditContent(selectedChapter.content);
    setIsEditing(false);
  }

  function saveChapter() {
    if (!selectedChapter) {
      return;
    }

    onSaveChapter(selectedChapter.id, {
      title: editTitle,
      povCharacter: editPovCharacter,
      content: editContent,
    });
    setIsEditing(false);
  }

  function renderChapterContent(content: string, keyPrefix: string) {
    const messageMatch = content.match(MESSAGE_PATTERN);

    if (messageMatch) {
      const [, characterName, message] = messageMatch;

      return (
        <p
          key={keyPrefix}
          className="mb-[1em] whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          <strong className="not-italic">{characterName}:</strong>{" "}
          <em>{message}</em>
        </p>
      );
    }

    return (
      <p
        key={keyPrefix}
        className="mb-[1em] whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {content}
      </p>
    );
  }

  if (selectedChapter) {
    const padding = getReaderPadding(readerWidth);

    return (
      <div
        className={`fixed inset-0 z-[2147483647] isolate h-[100dvh] w-screen overflow-hidden ${themeClasses}`}
      >
        <header
          className={`absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b px-3 ${
            readerTheme === "dark"
              ? "border-white/10 bg-[#111111]"
              : readerTheme === "light"
                ? "border-black/10 bg-white"
                : "border-black/10 bg-[#f4ecd8]"
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

          <p className="min-w-0 flex-1 truncate px-2 text-center text-xs font-semibold uppercase tracking-[0.18em]">
            Chapter {selectedChapter.number}
          </p>

          <div className="flex items-center gap-1">
            {!isEditing && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setShowReaderSettings((current) => !current)
                  }
                  className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold"
                  aria-label="Reader settings"
                  aria-expanded={showReaderSettings}
                >
                  Aa
                </button>

                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </header>

        {showReaderSettings && !isEditing && (
          <div
            className={`absolute left-3 right-3 top-16 z-40 mx-auto max-w-lg rounded-2xl border p-4 shadow-xl ${
              readerTheme === "dark"
                ? "border-white/10 bg-neutral-900 text-white"
                : readerTheme === "light"
                  ? "border-black/10 bg-white text-black"
                  : "border-black/10 bg-[#f4ecd8] text-[#17130d]"
            }`}
          >
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setReaderTheme("light")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  readerTheme === "light"
                    ? "border-pink-500 ring-1 ring-pink-500"
                    : "border-black/20"
                } bg-white text-black`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme("sepia")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  readerTheme === "sepia"
                    ? "border-pink-500 ring-1 ring-pink-500"
                    : "border-black/20"
                } bg-[#f4ecd8] text-black`}
              >
                Sepia
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme("dark")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  readerTheme === "dark"
                    ? "border-pink-500 ring-1 ring-pink-500"
                    : "border-white/20"
                } bg-neutral-900 text-white`}
              >
                Dark
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Font size</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setReaderFontSize((size) => Math.max(14, size - 1))
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  A-
                </button>
                <span className="w-8 text-center">{readerFontSize}</span>
                <button
                  type="button"
                  onClick={() =>
                    setReaderFontSize((size) => Math.min(30, size + 1))
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  A+
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Line spacing</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setReaderLineHeight((height) =>
                      Math.max(1.3, Number((height - 0.1).toFixed(1))),
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
                      Math.min(2.4, Number((height + 0.1).toFixed(1))),
                    )
                  }
                  className="rounded-lg border border-current/20 px-3 py-2"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              {(["narrow", "medium", "wide"] as const).map((width) => (
                <button
                  key={width}
                  type="button"
                  onClick={() => setReaderWidth(width)}
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

<div
  ref={measurementRef}
  aria-hidden="true"
  className="pointer-events-none absolute left-[-99999px] top-0 overflow-hidden"
  style={{
    width: "780px",
    height: "600px",
    padding: "28px 32px",
    boxSizing: "border-box",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${readerFontSize}px`,
    lineHeight: readerLineHeight,
    visibility: "hidden",
  }}
/>
        
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
                  onChange={(event) => setEditTitle(event.target.value)}
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
                  onChange={(event) => setEditPovCharacter(event.target.value)}
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
                  onChange={(event) => setEditContent(event.target.value)}
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
                  onClick={saveChapter}
                  className="rounded-xl bg-pink-500 px-5 py-3 font-semibold text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
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
              onScroll={updateCurrentPage}
              className="absolute inset-x-0 bottom-10 top-14 flex touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory"
              style={{
                scrollBehavior: "smooth",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {pages.map((page, pageIndex) => (
               <article
  key={`${selectedChapter.id}-${pageIndex}`}
  className="h-full w-full min-w-full shrink-0 snap-start snap-always overflow-hidden"
  style={{
    boxSizing: "border-box",
    padding: `${padding.vertical}px ${padding.horizontal}px`,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${readerFontSize}px`,
    lineHeight: readerLineHeight,
  }}
>
  <div
    style={{
      width: "100%",
      maxWidth: `${padding.maxContentWidth}px`,
      margin: "0 auto",
    }}
  >
                  {pageIndex === 0 && (
                    <div className="pb-6">
                      <p className="text-xs font-semibold uppercase leading-4 tracking-[0.2em] text-pink-500">
                        Chapter {selectedChapter.number}
                      </p>
                      <h1 className="mt-3 break-words text-3xl font-bold leading-tight">
                        {selectedChapter.title ||
                          `Chapter ${selectedChapter.number}`}
                      </h1>
                      {selectedChapter.povCharacter && (
                        <p className={`mt-2 italic ${mutedTextClasses}`}>
                          {selectedChapter.povCharacter}
                        </p>
                      )}
                    </div>
                  )}

                  {page.map((paragraph, paragraphIndex) =>
                    renderChapterContent(
                      paragraph,
                      `${pageIndex}-${paragraphIndex}`,
                    ),
                  )}
      </div>
                </article>
              ))}

            </div>

            <footer
              className={`absolute inset-x-0 bottom-0 z-30 flex h-10 items-center justify-center border-t text-xs ${
                readerTheme === "dark"
                  ? "border-white/10 bg-[#111111] text-neutral-400"
                  : readerTheme === "light"
                    ? "border-black/10 bg-white text-neutral-600"
                    : "border-black/10 bg-[#f4ecd8] text-neutral-600"
              }`}
            >
              <button
                type="button"
                onClick={() => moveToPage(currentPage - 1)}
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
                onClick={() => moveToPage(currentPage + 1)}
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
                chapters.length === 1 ? "chapter" : "chapters"
              }`}
        </h2>

        {chapters.length === 0 ? (
          <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
            Chapters generated through the conversation will appear here.
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
                  {chapter.title || `Chapter ${chapter.number}`}
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
