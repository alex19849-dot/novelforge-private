import type { StoryBible } from "../app/story-chat/types";

export function stripAionPrefix(message: string): string {
  return message.replace(/^\s*aion(?:\s*[:,-]\s*|\s+)/i, "").trim();
}

// Inspect the instruction, not chapter prose or future events inside a pasted Bible.
export function isStoryBibleRequest(message: string): boolean {
  const text = stripAionPrefix(message);
  if (/^(?:please\s+)?(?:write|generate|continue|rewrite|expand)\s+(?:(?:the|my|this|next)\s+)*(?:chapter|epilogue|scene|passage|paragraph|prose)\b/i.test(text)) return false;
  if (/^(?:rewrite|edit|revise|expand)\s+(?:(?:this|the|my)\s+)?(?:passage|scene|chapter|paragraph|extract)\b|^rewrite\s+this\s*[:\n]/i.test(text)) return false;
  const instruction = text.split(/^\s*(?:#{1,6}\s*)?PREMISE\s*:?\s*$/im)[0];
  if (/\b(?:story\s*bible|bible)\b/i.test(instruction)) return true;
  return /\b(?:create|start|build|develop|plan)\s+(?:a\s+)?(?:new\s+)?(?:standalone\s+)?(?:story|novel|book)\b/i.test(instruction);
}

export function requestsNewBibleWorkspace(message: string): boolean {
  const instruction = stripAionPrefix(message).split(/^\s*(?:#{1,6}\s*)?PREMISE\s*:?\s*$/im)[0];
  return /\b(?:create|start|build)\s+(?:a\s+)?new\s+(?:standalone\s+)?(?:story|novel|book)\b/i.test(instruction);
}

// Complete labelled imports are data. Copy them directly, without asking an LLM
// to repeat, shorten or reinterpret established author decisions.
export function parseStoryBibleImport(message: string): { title: string; storyBible: StoryBible } | null {
  const text = stripAionPrefix(message).replace(/\r\n?/g, "\n");
  const preamble = text.split(/^\s*(?:#{1,6}\s*)?PREMISE\s*:?\s*$/im)[0];
  if (!/\b(?:import|save)\b/i.test(preamble) || !/\b(?:story\s*bible|bible)\b/i.test(preamble)) return null;
  const headings = [...text.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(PREMISE|RELATIONSHIP|SUBGENRE|SETTING|POV|HEAT[ _]?LEVEL|BURN[ _]?PACING|TROPES|CHARACTERS|NOTES)[ \t]*:?[ \t]*$/gim)];
  const names = ["PREMISE", "RELATIONSHIP", "SUBGENRE", "SETTING", "POV", "HEATLEVEL", "BURNPACING", "TROPES", "CHARACTERS", "NOTES"];
  if (headings.length !== names.length || headings.some((heading, i) => heading[1].replace(/[ _]/g, "").toUpperCase() !== names[i])) return null;
  const sections = headings.map((heading, i) => text.slice(heading.index! + heading[0].length, headings[i + 1]?.index ?? text.length).trim());
  if (sections.some(section => !section)) return null;
  const title = preamble.match(/(?:NOVELFORGE\s+)?STORY\s+BIBLE\s*:\s*([^\n]+)/i)?.[1]?.trim()
    ?? preamble.match(/\btitled\s+[“"]?([^\n.]+?)[”"]?(?:\.|$)/i)?.[1]?.trim();
  if (!title) return null;
  return { title, storyBible: {
    premise: sections[0], relationship: sections[1], subgenre: sections[2], setting: sections[3], pov: sections[4], heatLevel: sections[5], burnPacing: sections[6],
    tropes: sections[7].split(/\s*;\s*|\n+/).filter(Boolean),
    characters: sections[8].split(/\n[ \t]*\n/).filter(Boolean),
    notes: sections[9].split(/\n(?=(?:NOTE\s+\d+\b|#{1,6}\s+))/i).filter(Boolean),
  } };
}

export function bibleOutputAllowance(message: string): number {
  // Small edits stay bounded; long imports have room for JSON and reasoning.
  return Math.min(24000, Math.max(6000, Math.ceil(message.length / 2) + 3000));
}
