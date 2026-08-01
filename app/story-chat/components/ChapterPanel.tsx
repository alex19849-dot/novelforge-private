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

type ReaderTheme = "light" | "sepia" | "dark";
type ReaderWidth = "narrow" | "medium" | "wide";

type ChapterPanelProps = {
  storyId: string;
  storyTitle: string;
  chapters: StoryChapter[];
  readerOpen: boolean;
  onCloseReader: () => void;
  onSaveChapter: (
    chapterId: string,
    updates: {
      title: string;
      povCharacter: string;
      content: string;
    },
  ) => void;
  readerTheme: ReaderTheme;
  setReaderTheme: Dispatch<SetStateAction<ReaderTheme>>;
  readerFontSize: number;
  setReaderFontSize: Dispatch<SetStateAction<number>>;
  readerLineHeight: number;
  setReaderLineHeight: Dispatch<SetStateAction<number>>;
  readerWidth: ReaderWidth;
  setReaderWidth: Dispatch<SetStateAction<ReaderWidth>>;
};

type ReaderPage = {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  povCharacter: string;
  showHeading: boolean;
  startWordIndex: number;
  paragraphs: string[];
};

const MESSAGE_PATTERN = /^([A-Za-z][A-Za-z0-9 .'-]{0,30}):\s*([\s\S]+)$/;

function getParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getReaderPadding(
  width: ReaderWidth,
  viewportWidth: number,
): {
  horizontal: number;
  vertical: number;
  maxContentWidth: number;
} {
  if (viewportWidth < 640) {
    return {
      horizontal: width === "narrow" ? 28 : width === "medium" ? 20 : 14,
      vertical: 28,
      maxContentWidth: viewportWidth,
    };
  }

  if (width === "narrow") {
    return { horizontal: 38, vertical: 36, maxContentWidth: 720 };
  }

  if (width === "medium") {
    return { horizontal: 32, vertical: 32, maxContentWidth: 780 };
  }

  return { horizontal: 28, vertical: 28, maxContentWidth: 850 };
}

function progressKey(storyId: string) {
  return `novelforge-reader-page-${storyId}`;
}

function characterOffsetForWordIndex(
  content: string,
  wordIndex: number,
): number {
  if (wordIndex <= 0) {
    return 0;
  }

  const wordPattern = /\S+/g;
  let match: RegExpExecArray | null = null;
  let currentWord = 0;

  while ((match = wordPattern.exec(content)) !== null) {
    if (currentWord === wordIndex) {
      return match.index;
    }

    currentWord += 1;
  }

  return content.length;
}

export default function ChapterPanel({
  storyId,
  storyTitle,
  chapters,
  readerOpen,
  onCloseReader,
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
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPovCharacter, setEditPovCharacter] = useState("");
  const [editContent, setEditContent] = useState("");
  const [pageMetrics, setPageMetrics] = useState({
    horizontalPadding: 32,
    verticalPadding: 32,
    contentWidth: 716,
  });

  const readerRef = useRef<HTMLDivElement | null>(null);
  const measurementRef = useRef<HTMLDivElement | null>(null);
  const editContentRef = useRef<HTMLTextAreaElement | null>(null);
  const paginationFrameRef = useRef<number | null>(null);
  const restoredStoryRef = useRef<string | null>(null);
  const currentPageRef = useRef(1);
  const pageCountRef = useRef(1);
  const editingAnchorRef = useRef<{
    chapterId: string;
    wordIndex: number;
  } | null>(null);
  const editingSourceContentRef = useRef("");
  const restoreAfterSaveRef = useRef<{
    chapterId: string;
    wordIndex: number;
  } | null>(null);

  const pageCount = Math.max(1, pages.length);
  const currentReaderPage = pages[currentPage - 1] ?? pages[0] ?? null;
  const currentChapter =
    chapters.find((chapter) => chapter.id === currentReaderPage?.chapterId) ??
    null;

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    pageCountRef.current = pageCount;
  }, [pageCount]);

  useEffect(() => {
    restoredStoryRef.current = null;
    currentPageRef.current = 1;
    setCurrentPage(1);
    setControlsVisible(false);
    setSettingsVisible(false);
    setIsEditing(false);
  }, [storyId]);

  const themeClasses =
    readerTheme === "dark"
      ? "bg-[#111111] text-[#f5f5f5]"
      : readerTheme === "light"
        ? "bg-white text-black"
        : "bg-[#f4ecd8] text-[#17130d]";

  const chromeClasses =
    readerTheme === "dark"
      ? "border-white/10 bg-[#111111]/95 text-white"
      : readerTheme === "light"
        ? "border-black/10 bg-white/95 text-black"
        : "border-black/10 bg-[#f4ecd8]/95 text-[#17130d]";

  const mutedTextClasses =
    readerTheme === "dark" ? "text-neutral-400" : "text-neutral-600";

  const paginateBook = useCallback(() => {
    const reader = readerRef.current;
    const measurement = measurementRef.current;

    if (
      !reader ||
      !measurement ||
      !readerOpen ||
      isEditing ||
      chapters.length === 0
    ) {
      return;
    }

    const viewportWidth = reader.clientWidth;
    const viewportHeight = reader.clientHeight;

    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const padding = getReaderPadding(readerWidth, viewportWidth);
    const contentWidth = Math.max(
      240,
      Math.min(
        viewportWidth - padding.horizontal * 2,
        padding.maxContentWidth - padding.horizontal * 2,
      ),
    );
    const contentHeight = Math.max(240, viewportHeight - padding.vertical * 2);

    setPageMetrics({
      horizontalPadding: padding.horizontal,
      verticalPadding: padding.vertical,
      contentWidth,
    });

    measurement.style.width = `${contentWidth}px`;
    measurement.style.height = `${contentHeight}px`;
    measurement.style.padding = "0";
    measurement.style.fontSize = `${readerFontSize}px`;
    measurement.style.lineHeight = String(readerLineHeight);
    measurement.replaceChildren();

    const createMeasuredParagraph = (content: string) => {
      const paragraph = document.createElement("p");
      paragraph.style.margin = "0 0 1em";
      paragraph.style.whiteSpace = "pre-wrap";
      paragraph.style.overflowWrap = "anywhere";

      const messageMatch = content.match(MESSAGE_PATTERN);

      if (messageMatch) {
        const [, characterName, message] = messageMatch;
        const name = document.createElement("strong");
        const text = document.createElement("em");
        name.textContent = `${characterName}:`;
        text.textContent = ` ${message}`;
        paragraph.append(name, text);
      } else {
        paragraph.textContent = content;
      }

      return paragraph;
    };

    const addMeasuredHeading = (chapter: StoryChapter) => {
      const wrapper = document.createElement("div");
      wrapper.style.paddingBottom = "24px";

      const label = document.createElement("p");
      label.textContent = `Chapter ${chapter.number}`;
      label.style.margin = "0";
      label.style.fontFamily = "Arial, sans-serif";
      label.style.fontSize = "12px";
      label.style.fontWeight = "600";
      label.style.lineHeight = "16px";
      label.style.letterSpacing = "0.2em";
      label.style.textTransform = "uppercase";

      const title = document.createElement("h1");
      title.textContent = chapter.title || `Chapter ${chapter.number}`;
      title.style.margin = "12px 0 0";
      title.style.fontSize = "30px";
      title.style.fontWeight = "700";
      title.style.lineHeight = "1.25";
      title.style.overflowWrap = "anywhere";

      wrapper.append(label, title);

      if (chapter.povCharacter) {
        const pov = document.createElement("p");
        pov.textContent = chapter.povCharacter;
        pov.style.margin = "8px 0 0";
        pov.style.fontStyle = "italic";
        wrapper.appendChild(pov);
      }

      measurement.appendChild(wrapper);
    };

    const overflows = () =>
      measurement.scrollHeight > measurement.clientHeight + 1;

    const nextPages: ReaderPage[] = [];
    let activeChapter: StoryChapter | null = null;
    let activePage: ReaderPage | null = null;
    let chapterWordCursor = 0;

    const resetMeasurement = () => {
      measurement.replaceChildren();

      if (!activeChapter || !activePage) {
        return;
      }

      if (activePage.showHeading) {
        addMeasuredHeading(activeChapter);
      }

      for (const paragraph of activePage.paragraphs) {
        measurement.appendChild(createMeasuredParagraph(paragraph));
      }
    };

    const startPage = (
      chapter: StoryChapter,
      showHeading: boolean,
      startWordIndex = chapterWordCursor,
    ) => {
      activeChapter = chapter;
      activePage = {
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        povCharacter: chapter.povCharacter,
        showHeading,
        startWordIndex,
        paragraphs: [],
      };
      resetMeasurement();
    };

    const finishPage = () => {
      if (activePage) {
        nextPages.push(activePage);
      }
      activePage = null;
      measurement.replaceChildren();
    };

    const largestFittingWordCount = (words: string[]) => {
      let low = 1;
      let high = words.length;
      let best = 0;

      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = words.slice(0, middle).join(" ");
        const paragraph = createMeasuredParagraph(candidate);
        measurement.appendChild(paragraph);
        const fits = !overflows();
        paragraph.remove();

        if (fits) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      return best;
    };

    const orderedChapters = [...chapters].sort(
      (first, second) => first.number - second.number,
    );

    for (const chapter of orderedChapters) {
      chapterWordCursor = 0;

      if (activePage) {
        finishPage();
      }

      startPage(chapter, true);

      for (const originalParagraph of getParagraphs(chapter.content)) {
        let remainingWords = originalParagraph.split(/\s+/).filter(Boolean);

        while (remainingWords.length > 0) {
          if (!activePage) {
            startPage(chapter, false);
          }

          if (!activePage) {
            continue;
          }

          const remainingText = remainingWords.join(" ");
          const paragraph = createMeasuredParagraph(remainingText);
          measurement.appendChild(paragraph);

          if (!overflows()) {
            activePage.paragraphs.push(remainingText);
            chapterWordCursor += remainingWords.length;
            remainingWords = [];
            continue;
          }

          paragraph.remove();
          const fittingCount = largestFittingWordCount(remainingWords);

          if (fittingCount > 0) {
            activePage.paragraphs.push(
              remainingWords.slice(0, fittingCount).join(" "),
            );
            chapterWordCursor += fittingCount;
            remainingWords = remainingWords.slice(fittingCount);
            finishPage();
            continue;
          }

          if (activePage.paragraphs.length > 0 || activePage.showHeading) {
            finishPage();
            continue;
          }

          activePage.paragraphs.push(remainingWords.shift() ?? "");
          chapterWordCursor += 1;
          finishPage();
        }
      }

      if (activePage) {
        finishPage();
      }
    }

    if (nextPages.length === 0) {
      return;
    }

    const previousRatio =
      pageCountRef.current > 1
        ? (currentPageRef.current - 1) / (pageCountRef.current - 1)
        : 0;

    let targetPage = Math.round(previousRatio * (nextPages.length - 1)) + 1;

    const savedAnchor = restoreAfterSaveRef.current;

    if (savedAnchor) {
      let anchoredPageIndex = -1;

      for (let index = nextPages.length - 1; index >= 0; index -= 1) {
        const page = nextPages[index];

        if (
          page.chapterId === savedAnchor.chapterId &&
          page.startWordIndex <= savedAnchor.wordIndex
        ) {
          anchoredPageIndex = index;
          break;
        }
      }

      if (anchoredPageIndex >= 0) {
        targetPage = anchoredPageIndex + 1;
      }

      restoreAfterSaveRef.current = null;
    }

    if (!savedAnchor && restoredStoryRef.current !== storyId) {
      const savedPage = Number(
        window.localStorage.getItem(progressKey(storyId)) ?? "1",
      );
      targetPage = Number.isFinite(savedPage) ? savedPage : 1;
      restoredStoryRef.current = storyId;
    }

    targetPage = Math.min(nextPages.length, Math.max(1, targetPage));
    setPages(nextPages);
    setCurrentPage(targetPage);
    currentPageRef.current = targetPage;
    pageCountRef.current = nextPages.length;

    requestAnimationFrame(() => {
      reader.scrollTo({
        left: (targetPage - 1) * reader.clientWidth,
        top: 0,
      });
    });
  }, [
    chapters,
    isEditing,
    readerFontSize,
    readerLineHeight,
    readerOpen,
    readerWidth,
    storyId,
  ]);

  const schedulePagination = useCallback(() => {
    if (paginationFrameRef.current !== null) {
      cancelAnimationFrame(paginationFrameRef.current);
    }

    paginationFrameRef.current = requestAnimationFrame(() => {
      paginationFrameRef.current = null;
      paginateBook();
    });
  }, [paginateBook]);

  useLayoutEffect(() => {
    if (!readerOpen || isEditing) {
      return;
    }

    schedulePagination();
    const retry = window.setTimeout(schedulePagination, 180);
    const reader = readerRef.current;
    const observer =
      reader && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedulePagination)
        : null;

    if (reader) {
      observer?.observe(reader);
    }

    window.addEventListener("resize", schedulePagination);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedulePagination);
      window.clearTimeout(retry);

      if (paginationFrameRef.current !== null) {
        cancelAnimationFrame(paginationFrameRef.current);
        paginationFrameRef.current = null;
      }
    };
  }, [isEditing, readerOpen, schedulePagination]);

  useEffect(() => {
    if (!readerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [readerOpen]);

  function updateCurrentPage() {
    const reader = readerRef.current;

    if (!reader || reader.clientWidth <= 0) {
      return;
    }

    const nextPage = Math.min(
      pageCount,
      Math.max(1, Math.round(reader.scrollLeft / reader.clientWidth) + 1),
    );

    setCurrentPage(nextPage);
    currentPageRef.current = nextPage;
    window.localStorage.setItem(progressKey(storyId), String(nextPage));
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
    currentPageRef.current = safePage;
    window.localStorage.setItem(progressKey(storyId), String(safePage));
  }

  function toggleControls() {
    if (isEditing) {
      return;
    }

    setControlsVisible((visible) => {
      if (visible) {
        setSettingsVisible(false);
      }
      return !visible;
    });
  }

  function startEditing() {
    if (!currentChapter || !currentReaderPage) {
      return;
    }

    editingAnchorRef.current = {
      chapterId: currentChapter.id,
      wordIndex: currentReaderPage.startWordIndex,
    };
    editingSourceContentRef.current = currentChapter.content;
    setEditTitle(currentChapter.title);
    setEditPovCharacter(currentChapter.povCharacter);
    setEditContent(currentChapter.content);
    setSettingsVisible(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    editingAnchorRef.current = null;
    editingSourceContentRef.current = "";
    setIsEditing(false);
  }

  function saveChapter() {
    if (!currentChapter) {
      return;
    }

    onSaveChapter(currentChapter.id, {
      title: editTitle,
      povCharacter: editPovCharacter,
      content: editContent,
    });
    restoreAfterSaveRef.current = editingAnchorRef.current;
    editingAnchorRef.current = null;
    editingSourceContentRef.current = "";
    setIsEditing(false);
  }

  useEffect(() => {
    if (!isEditing || !editContentRef.current || !editingAnchorRef.current) {
      return;
    }

    const textarea = editContentRef.current;
    const characterOffset = characterOffsetForWordIndex(
      editingSourceContentRef.current,
      editingAnchorRef.current.wordIndex,
    );
    const frameId = requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(characterOffset, characterOffset);

      const availableScroll = Math.max(
        0,
        textarea.scrollHeight - textarea.clientHeight,
      );
      const progress =
        editingSourceContentRef.current.length > 0
          ? characterOffset / editingSourceContentRef.current.length
          : 0;
      textarea.scrollTop = Math.max(0, availableScroll * progress - 32);
    });

    return () => cancelAnimationFrame(frameId);
  }, [isEditing]);

  function renderParagraph(content: string, key: string) {
    const messageMatch = content.match(MESSAGE_PATTERN);

    if (messageMatch) {
      const [, characterName, message] = messageMatch;
      return (
        <p
          key={key}
          className="mb-[1em] whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          <strong>{characterName}:</strong> <em>{message}</em>
        </p>
      );
    }

    return (
      <p
        key={key}
        className="mb-[1em] whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {content}
      </p>
    );
  }

  if (readerOpen && chapters.length > 0) {
    return (
      <div
        className={`fixed inset-0 z-[2147483647] isolate h-[100dvh] w-screen overflow-hidden ${themeClasses}`}
      >
        <div
          ref={measurementRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-[-99999px] top-0 overflow-hidden"
          style={{
            boxSizing: "border-box",
            fontFamily: "Georgia, 'Times New Roman', serif",
            visibility: "hidden",
          }}
        />

        {isEditing && currentChapter ? (
          <>
            <header
              className={`absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b px-3 ${chromeClasses}`}
            >
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg px-3 py-2 font-semibold"
              >
                Cancel
              </button>
              <p className="truncate px-2 text-sm font-semibold">
                Edit Chapter {currentChapter.number}
              </p>
              <button
                type="button"
                onClick={saveChapter}
                className="rounded-lg bg-pink-500 px-3 py-2 font-semibold text-white"
              >
                Save
              </button>
            </header>

            <div className="absolute inset-x-0 bottom-0 top-14 overflow-y-auto p-4">
              <div className="mx-auto max-w-4xl space-y-4 pb-10">
                <input
                  aria-label="Chapter title"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-pink-500"
                />
                <input
                  aria-label="POV character"
                  value={editPovCharacter}
                  onChange={(event) => setEditPovCharacter(event.target.value)}
                  className="w-full rounded-xl border border-neutral-600 bg-neutral-900 px-4 py-3 text-white outline-none focus:border-pink-500"
                />
                <textarea
                  ref={editContentRef}
                  aria-label="Chapter content"
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
            </div>
          </>
        ) : (
          <>
            <div
              ref={readerRef}
              onScroll={updateCurrentPage}
              className="absolute inset-0 flex touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {pages.map((page, pageIndex) => (
                <article
                  key={`${page.chapterId}-${pageIndex}`}
                  onClick={toggleControls}
                  className="h-full w-full min-w-full shrink-0 snap-start snap-always overflow-hidden"
                  style={{
                    boxSizing: "border-box",
                    padding: `${pageMetrics.verticalPadding}px ${pageMetrics.horizontalPadding}px`,
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: `${readerFontSize}px`,
                    lineHeight: readerLineHeight,
                  }}
                >
                  <div
                    style={{
                      width: `${pageMetrics.contentWidth}px`,
                      maxWidth: "100%",
                      margin: "0 auto",
                    }}
                  >
                    {page.showHeading && (
                      <div className="pb-6">
                        <p className="text-xs font-semibold uppercase leading-4 tracking-[0.2em] text-pink-500">
                          Chapter {page.chapterNumber}
                        </p>
                        <h1 className="mt-3 break-words text-3xl font-bold leading-tight">
                          {page.chapterTitle || `Chapter ${page.chapterNumber}`}
                        </h1>
                        {page.povCharacter && (
                          <p className={`mt-2 italic ${mutedTextClasses}`}>
                            {page.povCharacter}
                          </p>
                        )}
                      </div>
                    )}

                    {page.paragraphs.map((paragraph, paragraphIndex) =>
                      renderParagraph(
                        paragraph,
                        `${pageIndex}-${paragraphIndex}`,
                      ),
                    )}
                  </div>
                </article>
              ))}
            </div>

            {controlsVisible && (
              <>
                <header
                  className={`absolute inset-x-0 top-0 z-40 flex min-h-14 items-center justify-between border-b px-3 py-2 backdrop-blur ${chromeClasses}`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseReader();
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-2xl"
                    aria-label="Back to stories"
                  >
                    ‹
                  </button>

                  <div className="min-w-0 flex-1 px-2 text-center">
                    <p className="truncate text-sm font-semibold">
                      {storyTitle}
                    </p>
                    {currentReaderPage && (
                      <p className="text-xs opacity-60">
                        Chapter {currentReaderPage.chapterNumber}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSettingsVisible((visible) => !visible);
                      }}
                      className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 font-semibold"
                      aria-label="Reader settings"
                    >
                      Aa
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditing();
                      }}
                      className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Edit
                    </button>
                  </div>
                </header>

                <footer
                  className={`absolute inset-x-0 bottom-0 z-40 border-t px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur ${chromeClasses}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {settingsVisible && (
                    <div className="mx-auto mb-2 max-w-2xl space-y-3 rounded-xl border border-current/10 p-3">
                      <div className="flex gap-2">
                        {(["light", "sepia", "dark"] as const).map((theme) => (
                          <button
                            key={theme}
                            type="button"
                            onClick={() => setReaderTheme(theme)}
                            className={`flex-1 rounded-lg border px-2 py-2 text-sm capitalize ${
                              readerTheme === theme
                                ? "border-pink-500 bg-pink-500 text-white"
                                : "border-current/20"
                            }`}
                          >
                            {theme}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between rounded-lg border border-current/10 p-2">
                          <span className="text-xs">Font</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setReaderFontSize((size) =>
                                  Math.max(14, size - 1),
                                )
                              }
                              className="px-2 py-1"
                            >
                              A-
                            </button>
                            <span className="text-sm">{readerFontSize}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setReaderFontSize((size) =>
                                  Math.min(30, size + 1),
                                )
                              }
                              className="px-2 py-1"
                            >
                              A+
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-current/10 p-2">
                          <span className="text-xs">Spacing</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setReaderLineHeight((height) =>
                                  Math.max(
                                    1.3,
                                    Number((height - 0.1).toFixed(1)),
                                  ),
                                )
                              }
                              className="px-2 py-1"
                            >
                              -
                            </button>
                            <span className="text-sm">
                              {readerLineHeight.toFixed(1)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setReaderLineHeight((height) =>
                                  Math.min(
                                    2.4,
                                    Number((height + 0.1).toFixed(1)),
                                  ),
                                )
                              }
                              className="px-2 py-1"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {(["narrow", "medium", "wide"] as const).map(
                          (width) => (
                            <button
                              key={width}
                              type="button"
                              onClick={() => setReaderWidth(width)}
                              className={`flex-1 rounded-lg border px-2 py-2 text-sm capitalize ${
                                readerWidth === width
                                  ? "border-pink-500 bg-pink-500 text-white"
                                  : "border-current/20"
                              }`}
                            >
                              {width}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mx-auto flex max-w-2xl items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => moveToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="px-3 py-1 text-xl disabled:opacity-20"
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
                      className="px-3 py-1 text-xl disabled:opacity-20"
                    >
                      ›
                    </button>
                  </div>
                </footer>
              </>
            )}

            {!controlsVisible && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 text-center text-[11px] opacity-40">
                {currentPage} / {pageCount}
              </div>
            )}
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
          <p className="mt-3 leading-7 text-neutral-400">
            Chapters generated through the conversation will appear here.
          </p>
        ) : (
          <p className="mt-3 leading-7 text-neutral-400">
            Select this story from Your Stories to open the complete book.
          </p>
        )}
      </div>
    </section>
  );
}
