export type PassageRewriteRequest = {
  chapterId: string;
  sourceContent: string;
  passage: string;
  instruction: string;
};

export function findPassageRange(content: string, passage: string): {
  start: number;
  end: number;
} {
  const words = passage.trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error("Paste the passage you want rewritten first.");
  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  // Reader copy/paste may change paragraph spacing. Match whitespace only;
  // never guess at altered words or silently choose between duplicate passages.
  const matches = [...content.matchAll(new RegExp(`(?=(${pattern}))`, "g"))];
  if (!matches.length) {
    throw new Error("That passage was not found in this chapter. Copy it again from the chapter you are reading.");
  }
  if (matches.length !== 1) {
    throw new Error("That passage occurs more than once. Include a little more surrounding text to identify it.");
  }
  const start = matches[0].index!;
  return { start, end: start + matches[0][1].length };
}

export function replacePassage(content: string, passage: string, replacement: string): string {
  const range = findPassageRange(content, passage);
  if (!replacement.trim()) throw new Error("The writer returned an empty replacement.");
  return content.slice(0, range.start) + replacement.trim() + content.slice(range.end);
}

export function passageWriter(instruction: string): { model: "astra" | "aion"; instruction: string } {
  const isAion = /^\s*aion\s*:/i.test(instruction);
  return {
    model: isAion ? "aion" : "astra",
    instruction: (isAion ? instruction.replace(/^\s*aion\s*:\s*/i, "") : instruction).trim() || "Rewrite this passage.",
  };
}
