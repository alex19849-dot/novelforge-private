import type { PassageRewriteRequest } from "./passageRewrite";

export type ReaderPassage = Omit<PassageRewriteRequest, "instruction"> & {
  left: number;
  top: number;
};

export function readerParagraphs(content: string): { text: string; start: number; end: number }[] {
  const paragraphs: { text: string; start: number; end: number }[] = [];
  function add(start: number, end: number) {
    const raw = content.slice(start, end);
    const text = raw.trim();
    if (text) {
      const from = start + raw.length - raw.trimStart().length;
      paragraphs.push({ text, start: from, end: from + text.length });
    }
  }
  let start = 0;
  for (const separator of content.matchAll(/\n\s*\n/g)) {
    add(start, separator.index!);
    start = separator.index! + separator[0].length;
  }
  add(start, content.length);
  return paragraphs;
}

function element(node: Node): Element | null {
  return node.nodeType === 1 ? node as Element : node.parentElement;
}

// Resolve the browser range against paragraph offsets, not a text search. This
// identifies repeated phrases and preserves the original paragraph separators.
export function selectedReaderPassage(
  reader: HTMLElement,
  contentForChapter: (chapterId: string) => string | undefined,
  selection: Selection | null = reader.ownerDocument.getSelection(),
): ReaderPassage | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const root = element(range.startContainer)?.closest<HTMLElement>("[data-reader-content]");
  const endRoot = element(range.endContainer)?.closest<HTMLElement>("[data-reader-content]");
  if (!root || root !== endRoot || !reader.contains(root)) return null;
  const chapterId = root.dataset.readerContent;
  if (!chapterId) return null;
  const content = contentForChapter(chapterId);
  if (content === undefined) return null;
  const paragraphs = Array.from(root.querySelectorAll<HTMLElement>("[data-source-start]"))
    .filter(p => range.intersectsNode(p));
  if (!paragraphs.length) return null;
  // Reject unexpected DOM/source differences instead of guessing at an offset.
  if (paragraphs.some(p => p.textContent !== content.slice(Number(p.dataset.sourceStart), Number(p.dataset.sourceEnd)))) return null;
  const first = paragraphs[0];
  const last = paragraphs[paragraphs.length - 1];
  function offset(p: HTMLElement, node: Node, at: number, end: boolean) {
    if (!p.contains(node)) return end ? p.textContent!.length : 0;
    const prefix = reader.ownerDocument.createRange();
    prefix.selectNodeContents(p);
    prefix.setEnd(node, at);
    return prefix.toString().length;
  }
  let start = Number(first.dataset.sourceStart) + offset(first, range.startContainer, range.startOffset, false);
  let end = Number(last.dataset.sourceStart) + offset(last, range.endContainer, range.endOffset, true);
  const raw = content.slice(start, end);
  start += raw.length - raw.trimStart().length;
  end -= raw.length - raw.trimEnd().length;
  if (end <= start) return null;
  const rects = Array.from(range.getClientRects());
  const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
  const view = reader.ownerDocument.defaultView;
  if (!view || rect.bottom < 0 || rect.top > view.innerHeight) return null;
  const width = Math.min(264, view.innerWidth - 16);
  return {
    chapterId, sourceContent: content, passage: content.slice(start, end), range: { start, end },
    left: Math.max(8, Math.min(view.innerWidth - width - 8, rect.left)),
    top: rect.bottom + 58 < view.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 54),
  };
}
