"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { StoryChapter } from "../types";

type ReaderTheme = "light" | "sepia" | "dark";
type ReaderWidth = "narrow" | "medium" | "wide";

export type ChapterDraftWorkspace = {
  chapterNumber: number;
  title: string;
  povCharacter: string;
  content: string;
  guidance: string;
  isGenerating: boolean;
  repetitionWarnings?: string[];
};

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
  draftWorkspace?: ChapterDraftWorkspace | null;
  onDraftContentChange?: (content: string) => void;
  onDraftGuidanceChange?: (guidance: string) => void;
  onGenerateNextSection?: () => void;
  onRewriteLastSection?: () => void;
  onCompleteDraft?: () => void;
  onDiscardDraft?: () => void;
  onOpenChapterPlan?: () => void;
};

const MESSAGE_PATTERN = /^([A-Za-z][A-Za-z0-9 .'-]{0,30}):\s*([\s\S]+)$/;

function progressKey(storyId: string): string {
  return `novelforge-reader-scroll-${storyId}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function widthClass(width: ReaderWidth): string {
  if (width === "narrow") return "max-w-[720px]";
  if (width === "wide") return "max-w-[920px]";
  return "max-w-[800px]";
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
  draftWorkspace = null,
  onDraftContentChange,
  onDraftGuidanceChange,
  onGenerateNextSection,
  onRewriteLastSection,
  onCompleteDraft,
  onDiscardDraft,
  onOpenChapterPlan,
}: ChapterPanelProps) {
  const orderedChapters = useMemo(
    () => [...chapters].sort((first, second) => first.number - second.number),
    [chapters],
  );
  const [controlsVisible, setControlsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [guidanceVisible, setGuidanceVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPovCharacter, setEditPovCharacter] = useState("");
  const [editContent, setEditContent] = useState("");
  const readerRef = useRef<HTMLDivElement | null>(null);
  const chapterRefs = useRef(new Map<string, HTMLElement>());
  const editAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const pendingChapterAnchorRef = useRef<{
    chapterId: string;
    progress: number;
  } | null>(null);
  const restoredStoryRef = useRef<string | null>(null);
  const previousDraftContentRef = useRef(draftWorkspace?.content ?? "");

  const activeChapter =
    orderedChapters.find((chapter) => chapter.id === activeChapterId) ??
    orderedChapters[0] ??
    null;
  const editingChapter =
    orderedChapters.find((chapter) => chapter.id === editingChapterId) ?? null;
  const editingDraft =
    editingChapterId === "__draft__" && Boolean(draftWorkspace);
  const hasReadableContent =
    orderedChapters.length > 0 || Boolean(draftWorkspace);
  const navigationItems = useMemo(
    () => [
      ...orderedChapters.map((chapter) => ({
        id: chapter.id,
        label: `Chapter ${chapter.number}`,
      })),
      ...(draftWorkspace
        ? [
            {
              id: "__draft__",
              label: `Chapter ${draftWorkspace.chapterNumber} draft`,
            },
          ]
        : []),
    ],
    [draftWorkspace, orderedChapters],
  );
  const activeNavigationIndex = navigationItems.findIndex(
    (item) => item.id === activeChapterId,
  );

  const themeClasses =
    readerTheme === "dark"
      ? "bg-[#111111] text-[#f5f5f5]"
      : readerTheme === "light"
        ? "bg-white text-[#171717]"
        : "bg-[#f4ecd8] text-[#241d15]";
  const chromeClasses =
    readerTheme === "dark"
      ? "border-white/10 bg-[#111111]/95 text-white"
      : readerTheme === "light"
        ? "border-black/10 bg-white/95 text-black"
        : "border-black/10 bg-[#f4ecd8]/95 text-[#241d15]";
  const mutedClasses =
    readerTheme === "dark" ? "text-neutral-400" : "text-[#6f6252]";

  const resizeEditArea = useCallback(() => {
    const area = editAreaRef.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${area.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    if (isEditing) resizeEditArea();

    const reader = readerRef.current;
    const anchor = pendingChapterAnchorRef.current;
    if (reader && anchor) {
      const chapter = chapterRefs.current.get(anchor.chapterId);
      if (chapter) {
        reader.scrollTop =
          chapter.offsetTop + anchor.progress * chapter.offsetHeight;
      }
      pendingChapterAnchorRef.current = null;
      pendingScrollRestoreRef.current = null;
      return;
    }
    const scrollTop = pendingScrollRestoreRef.current;
    if (reader && scrollTop !== null) {
      reader.scrollTop = scrollTop;
      pendingScrollRestoreRef.current = null;
    }
  }, [
    editContent,
    isEditing,
    readerFontSize,
    readerLineHeight,
    resizeEditArea,
  ]);

  useEffect(() => {
    if (!readerOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, [readerOpen]);

  useEffect(() => {
    restoredStoryRef.current = null;
    setControlsVisible(false);
    setSettingsVisible(false);
    setGuidanceVisible(false);
    setIsEditing(false);
    setEditingChapterId(null);
    setActiveChapterId(orderedChapters[0]?.id ?? null);
  }, [storyId, orderedChapters]);

  useLayoutEffect(() => {
    if (!readerOpen || restoredStoryRef.current === storyId) return;
    const reader = readerRef.current;
    if (!reader) return;
    const saved = Number(
      window.localStorage.getItem(progressKey(storyId)) ?? 0,
    );
    requestAnimationFrame(() => {
      reader.scrollTop = Number.isFinite(saved) ? Math.max(0, saved) : 0;
      restoredStoryRef.current = storyId;
    });
  }, [readerOpen, storyId, hasReadableContent]);

  useEffect(() => {
    const previousContent = previousDraftContentRef.current.trim();
    const nextContent = draftWorkspace?.content.trim() ?? "";
    const appendedSection =
      Boolean(nextContent) &&
      nextContent.length > previousContent.length &&
      (!previousContent || nextContent.startsWith(previousContent));

    if (readerOpen && draftWorkspace && appendedSection && readerRef.current) {
      const firstNewParagraphIndex = getParagraphs(previousContent).length;
      requestAnimationFrame(() => {
        const firstNewParagraph = document.querySelector<HTMLElement>(
          `[data-draft-paragraph-index="${firstNewParagraphIndex}"]`,
        );
        const reader = readerRef.current;
        if (!firstNewParagraph || !reader) return;
        const readerTop = reader.getBoundingClientRect().top;
        const paragraphTop = firstNewParagraph.getBoundingClientRect().top;
        reader.scrollTo({
          top: Math.max(0, reader.scrollTop + paragraphTop - readerTop - 82),
          behavior: "smooth",
        });
      });
    }
    previousDraftContentRef.current = nextContent;
  }, [draftWorkspace, readerOpen]);

  function handleScroll() {
    const reader = readerRef.current;
    if (!reader) return;
    window.localStorage.setItem(progressKey(storyId), String(reader.scrollTop));
    const marker = reader.scrollTop + reader.clientHeight * 0.3;
    let closestId = orderedChapters[0]?.id ?? null;
    for (const chapter of orderedChapters) {
      const node = chapterRefs.current.get(chapter.id);
      if (node && node.offsetTop <= marker) closestId = chapter.id;
    }
    const draftNode = chapterRefs.current.get("__draft__");
    if (draftNode && draftNode.offsetTop <= marker) closestId = "__draft__";
    setActiveChapterId(closestId);
  }

  function goToChapter(chapterId: string) {
    const reader = readerRef.current;
    const chapter = chapterRefs.current.get(chapterId);
    if (!reader || !chapter) return;
    reader.scrollTo({
      top: Math.max(0, chapter.offsetTop - 72),
      behavior: "smooth",
    });
    setActiveChapterId(chapterId);
  }

  function moveChapter(direction: -1 | 1) {
    const currentIndex = navigationItems.findIndex(
      (item) => item.id === activeChapterId,
    );
    const fallbackIndex = direction > 0 ? 0 : navigationItems.length - 1;
    const nextIndex = Math.min(
      navigationItems.length - 1,
      Math.max(0, currentIndex < 0 ? fallbackIndex : currentIndex + direction),
    );
    const nextItem = navigationItems[nextIndex];
    if (nextItem) goToChapter(nextItem.id);
  }

  function toggleControls() {
    if (isEditing) return;
    setControlsVisible((visible) => {
      if (visible) {
        setSettingsVisible(false);
        setGuidanceVisible(false);
      }
      return !visible;
    });
  }

  function startEditing() {
    if (!readerRef.current) return;
    const chapterId = activeChapterId ?? activeChapter?.id;
    const chapter = chapterId ? chapterRefs.current.get(chapterId) : null;
    if (chapterId && chapter) {
      pendingChapterAnchorRef.current = {
        chapterId,
        progress: Math.max(
          0,
          Math.min(
            1,
            (readerRef.current.scrollTop - chapter.offsetTop) /
              Math.max(1, chapter.offsetHeight),
          ),
        ),
      };
    } else {
      pendingScrollRestoreRef.current = readerRef.current.scrollTop;
    }
    if (activeChapterId === "__draft__" && draftWorkspace) {
      setEditingChapterId("__draft__");
      setEditTitle(draftWorkspace.title);
      setEditPovCharacter(draftWorkspace.povCharacter);
      setEditContent(draftWorkspace.content);
    } else if (activeChapter) {
      setEditingChapterId(activeChapter.id);
      setEditTitle(activeChapter.title);
      setEditPovCharacter(activeChapter.povCharacter);
      setEditContent(activeChapter.content);
    } else {
      return;
    }
    setSettingsVisible(false);
    setGuidanceVisible(false);
    setIsEditing(true);
  }

  function finishEditing(restore: boolean) {
    if (restore && readerRef.current) {
      const chapterId = editingChapterId;
      const chapter = chapterId ? chapterRefs.current.get(chapterId) : null;
      if (chapterId && chapter) {
        pendingChapterAnchorRef.current = {
          chapterId,
          progress: Math.max(
            0,
            Math.min(
              1,
              (readerRef.current.scrollTop - chapter.offsetTop) /
                Math.max(1, chapter.offsetHeight),
            ),
          ),
        };
      } else {
        pendingScrollRestoreRef.current = readerRef.current.scrollTop;
      }
    }
    setIsEditing(false);
    setEditingChapterId(null);
  }

  function updateEditContent(content: string) {
    if (readerRef.current) {
      pendingScrollRestoreRef.current = readerRef.current.scrollTop;
    }
    setEditContent(content);
  }

  function saveEditing() {
    if (editingDraft) {
      onDraftContentChange?.(editContent);
    } else if (editingChapter) {
      onSaveChapter(editingChapter.id, {
        title: editTitle,
        povCharacter: editPovCharacter,
        content: editContent,
      });
    } else {
      return;
    }
    finishEditing(true);
  }

  function renderParagraph(
    paragraph: string,
    key: string,
    draftParagraphIndex?: number,
  ) {
    const message = paragraph.match(MESSAGE_PATTERN);
    return (
      <p
        key={key}
        data-draft-paragraph-index={draftParagraphIndex}
        className="mb-[1em] whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {message ? (
          <>
            <strong>{message[1]}:</strong> <em>{message[2]}</em>
          </>
        ) : (
          paragraph
        )}
      </p>
    );
  }

  function renderHeading(number: number, title: string, pov: string) {
    return (
      <div className="pb-8 pt-3 sm:pb-10">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
          Chapter {number}
        </p>
        <h1 className="mt-3 break-words text-3xl font-bold leading-tight sm:text-4xl">
          {title || `Chapter ${number}`}
        </h1>
        {pov && <p className={`mt-2 italic ${mutedClasses}`}>{pov}</p>}
      </div>
    );
  }

  if (readerOpen && hasReadableContent) {
    return (
      <div
        className={`fixed inset-0 z-[2147483647] isolate h-[100dvh] w-screen overflow-hidden ${themeClasses}`}
      >
        <div
          ref={readerRef}
          onScroll={handleScroll}
          className={`absolute inset-0 overflow-y-auto overscroll-y-contain px-5 py-12 sm:px-8 sm:py-16 ${
            controlsVisible || isEditing ? "pb-40 pt-20" : ""
          }`}
          style={{
            WebkitOverflowScrolling: "touch",
            overflowAnchor: "none",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: `${readerFontSize}px`,
            lineHeight: readerLineHeight,
          }}
        >
          <main className={`mx-auto w-full ${widthClass(readerWidth)}`}>
            {orderedChapters.map((chapter) => {
              const editingThisChapter =
                isEditing && editingChapterId === chapter.id;
              return (
                <article
                  key={chapter.id}
                  ref={(node) => {
                    if (node) chapterRefs.current.set(chapter.id, node);
                    else chapterRefs.current.delete(chapter.id);
                  }}
                  onClick={editingThisChapter ? undefined : toggleControls}
                  className="min-h-[60dvh] scroll-mt-20 pb-16 sm:pb-24"
                >
                  {editingThisChapter ? (
                    <>
                      <div className="pb-8 pt-3 sm:pb-10">
                        <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-pink-500">
                          Chapter {chapter.number}
                        </p>
                        <input
                          aria-label="Chapter title"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="mt-3 w-full border-0 bg-transparent p-0 font-serif text-3xl font-bold leading-tight text-inherit outline-none sm:text-4xl"
                        />
                        <input
                          aria-label="POV character"
                          value={editPovCharacter}
                          onChange={(event) =>
                            setEditPovCharacter(event.target.value)
                          }
                          className={`mt-2 w-full border-0 bg-transparent p-0 font-serif italic outline-none ${mutedClasses}`}
                        />
                      </div>
                      <textarea
                        ref={editAreaRef}
                        aria-label={`Edit Chapter ${chapter.number}`}
                        value={editContent}
                        onChange={(event) =>
                          updateEditContent(event.target.value)
                        }
                        className="block min-h-[65dvh] w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-serif text-inherit caret-pink-500 outline-none"
                        style={{
                          fontSize: `${readerFontSize}px`,
                          lineHeight: readerLineHeight,
                          overflowAnchor: "none",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      {renderHeading(
                        chapter.number,
                        chapter.title,
                        chapter.povCharacter,
                      )}
                      {getParagraphs(chapter.content).map((paragraph, index) =>
                        renderParagraph(paragraph, `${chapter.id}-${index}`),
                      )}
                    </>
                  )}
                </article>
              );
            })}

            {draftWorkspace && (
              <article
                ref={(node) => {
                  if (node) chapterRefs.current.set("__draft__", node);
                  else chapterRefs.current.delete("__draft__");
                }}
                onClick={editingDraft ? undefined : toggleControls}
                className="min-h-[70dvh] scroll-mt-20 pb-28"
              >
                {editingDraft ? (
                  <>
                    {renderHeading(
                      draftWorkspace.chapterNumber,
                      draftWorkspace.title,
                      draftWorkspace.povCharacter,
                    )}
                    <textarea
                      ref={editAreaRef}
                      aria-label={`Edit Chapter ${draftWorkspace.chapterNumber} draft`}
                      value={editContent}
                      onChange={(event) =>
                        updateEditContent(event.target.value)
                      }
                      className="block min-h-[65dvh] w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-serif text-inherit caret-pink-500 outline-none"
                      style={{
                        fontSize: `${readerFontSize}px`,
                        lineHeight: readerLineHeight,
                        overflowAnchor: "none",
                      }}
                    />
                  </>
                ) : (
                  <>
                    {renderHeading(
                      draftWorkspace.chapterNumber,
                      draftWorkspace.title,
                      draftWorkspace.povCharacter,
                    )}
                    {getParagraphs(draftWorkspace.content).map(
                      (paragraph, index) =>
                        renderParagraph(paragraph, `draft-${index}`, index),
                    )}
                    {!draftWorkspace.content.trim() && (
                      <p className={mutedClasses}>
                        The chapter draft will appear here.
                      </p>
                    )}
                  </>
                )}
              </article>
            )}
          </main>
        </div>

        {(controlsVisible || isEditing) && (
          <header
            className={`absolute inset-x-0 top-0 z-40 flex min-h-14 items-center justify-between border-b px-3 py-2 backdrop-blur ${chromeClasses}`}
          >
            <button
              type="button"
              onClick={isEditing ? () => finishEditing(true) : onCloseReader}
              className="flex min-h-10 items-center rounded-lg px-3 font-semibold"
            >
              {isEditing ? "Cancel" : "‹ Back"}
            </button>
            <div className="min-w-0 flex-1 px-2 text-center">
              <p className="truncate text-sm font-semibold">{storyTitle}</p>
              {isEditing ? (
                <p className="text-xs opacity-60">
                  {editingDraft
                    ? `Chapter ${draftWorkspace?.chapterNumber ?? ""} draft`
                    : editingChapter
                      ? `Chapter ${editingChapter.number}`
                      : "Editing"}
                </p>
              ) : (
                <select
                  aria-label="Select chapter"
                  value={activeChapterId ?? navigationItems[0]?.id ?? ""}
                  onChange={(event) => goToChapter(event.target.value)}
                  className="max-w-full cursor-pointer border-0 bg-transparent text-center text-xs font-semibold text-inherit opacity-70 outline-none"
                >
                  {navigationItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={saveEditing}
                className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsVisible((visible) => !visible);
                    setGuidanceVisible(false);
                  }}
                  className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 font-semibold"
                >
                  Aa
                </button>
                <button
                  type="button"
                  onClick={startEditing}
                  disabled={
                    !activeChapter &&
                    !(activeChapterId === "__draft__" && draftWorkspace)
                  }
                  className="rounded-lg bg-pink-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Edit
                </button>
              </div>
            )}
          </header>
        )}

        {controlsVisible && !isEditing && (
          <footer
            className={`absolute inset-x-0 bottom-0 z-40 border-t px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur ${chromeClasses}`}
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-current/10 p-2">
                    <span className="text-xs">Font</span>
                    <button
                      type="button"
                      onClick={() =>
                        setReaderFontSize((size) => Math.max(14, size - 1))
                      }
                      className="px-2"
                    >
                      A-
                    </button>
                    <span className="text-sm">{readerFontSize}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setReaderFontSize((size) => Math.min(30, size + 1))
                      }
                      className="px-2"
                    >
                      A+
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-current/10 p-2">
                    <span className="text-xs">Spacing</span>
                    <button
                      type="button"
                      onClick={() =>
                        setReaderLineHeight((height) =>
                          Math.max(1.3, Number((height - 0.1).toFixed(1))),
                        )
                      }
                      className="px-2"
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
                          Math.min(2.4, Number((height + 0.1).toFixed(1))),
                        )
                      }
                      className="px-2"
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
                      className={`flex-1 rounded-lg border px-2 py-2 text-sm capitalize ${
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

            {draftWorkspace && guidanceVisible && (
              <div className="mx-auto mb-2 max-w-3xl">
                <textarea
                  value={draftWorkspace.guidance}
                  disabled={draftWorkspace.isGenerating}
                  onChange={(event) =>
                    onDraftGuidanceChange?.(event.target.value)
                  }
                  placeholder="Tell NovelForge exactly what must happen in the next section."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-current/15 bg-transparent px-4 py-3 text-sm outline-none placeholder:opacity-50 focus:border-pink-500 disabled:opacity-50"
                />
                {(draftWorkspace.repetitionWarnings?.length ?? 0) > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    {draftWorkspace.repetitionWarnings?.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous chapter"
                  disabled={activeNavigationIndex <= 0}
                  onClick={() => moveChapter(-1)}
                  className="rounded-lg px-2 py-2 text-xl disabled:opacity-20"
                >
                  ‹
                </button>
                <p className="min-w-0 truncate text-xs opacity-60">
                  {activeChapterId === "__draft__" && draftWorkspace
                    ? `Draft, ${countWords(draftWorkspace.content)} words`
                    : activeChapter
                      ? `Chapter ${activeChapter.number}`
                      : "Continuous reading"}
                </p>
                <button
                  type="button"
                  aria-label="Next chapter"
                  disabled={
                    activeNavigationIndex < 0 ||
                    activeNavigationIndex >= navigationItems.length - 1
                  }
                  onClick={() => moveChapter(1)}
                  className="rounded-lg px-2 py-2 text-xl disabled:opacity-20"
                >
                  ›
                </button>
              </div>
              {onOpenChapterPlan && (
                <button
                  type="button"
                  onClick={onOpenChapterPlan}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                >
                  Plan
                </button>
              )}
              {draftWorkspace && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setGuidanceVisible((visible) => !visible);
                      setSettingsVisible(false);
                    }}
                    className="rounded-lg border border-current/15 px-3 py-2 text-sm font-semibold"
                  >
                    Guide
                  </button>
                  <button
                    type="button"
                    disabled={
                      draftWorkspace.isGenerating ||
                      !draftWorkspace.content.trim()
                    }
                    onClick={onGenerateNextSection}
                    className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {draftWorkspace.isGenerating
                      ? "Writing..."
                      : "Generate next"}
                  </button>
                </>
              )}
            </div>

            {draftWorkspace && guidanceVisible && (
              <div className="mx-auto mt-2 flex max-w-3xl flex-wrap justify-end gap-2 text-xs">
                {onRewriteLastSection && (
                  <button
                    type="button"
                    onClick={onRewriteLastSection}
                    disabled={draftWorkspace.isGenerating}
                    className="rounded-lg border border-current/15 px-3 py-2 disabled:opacity-40"
                  >
                    Rewrite last
                  </button>
                )}
                {onDiscardDraft && (
                  <button
                    type="button"
                    onClick={onDiscardDraft}
                    disabled={draftWorkspace.isGenerating}
                    className="rounded-lg border border-current/15 px-3 py-2 disabled:opacity-40"
                  >
                    Discard
                  </button>
                )}
                {onCompleteDraft && (
                  <button
                    type="button"
                    onClick={onCompleteDraft}
                    disabled={
                      draftWorkspace.isGenerating ||
                      !draftWorkspace.content.trim()
                    }
                    className="rounded-lg border border-emerald-600/40 px-3 py-2 text-emerald-700 disabled:opacity-40"
                  >
                    Complete chapter
                  </button>
                )}
              </div>
            )}
          </footer>
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
            : `${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"}`}
        </h2>
        <p className="mt-3 leading-7 text-neutral-400">
          {chapters.length === 0
            ? "Chapters generated through the conversation will appear here."
            : "Select this story from Your Stories to open the complete book."}
        </p>
      </div>
    </section>
  );
}
