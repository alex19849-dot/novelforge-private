import { isStoryBibleRequest, stripAionPrefix } from "./story-bible-request";

// Shared by chat submission and the planner. A prose request must enter the
// durable chapter queue before the first planning/model call starts.
export function requestsChapterGeneration(message: string): boolean {
  if (isStoryBibleRequest(message)) return false;
  const text = stripAionPrefix(message).trim();
  if (/^(?:please\s+)?(?:do\s+not|don't|never)\s+(?:write|generate|create|start|continue|rewrite|expand)\b/i.test(text)) return false;
  if (/^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:plan|outline|map|discuss|review|check|explain|analyse|analyze)\b/i.test(text)) return false;
  if (/\b(?:write|generate|create|start|continue|rewrite|expand)\b[\s\S]{0,100}\b(?:chapter|epilogue)\b/i.test(text)) return true;
  if (/\bepilogue\b[\s\S]{0,100}\b(?:write|generate|create|start|continue|rewrite)\b/i.test(text)) return true;
  if (/^(?:please\s+)?(?:next\s+chapter|write\s+the\s+next|continue(?:\s+writing)?|carry\s+on|keep\s+going)[.!\s]*$/i.test(text.split("\n")[0].trim())) return true;
  // Pasted chapter guidance is also a writing request without an added verb.
  return /^(?:#{1,6}\s*)?(?:\*\*)?(?:chapter\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|epilogue\b)[^\n]*\n/i.test(text)
    && /^\s*(?:POV|Timing|Endpoint)\s*:/im.test(text);
}

export function continuesPendingChapter(message: string, pendingChapterNumber: number | null): boolean {
  const text = stripAionPrefix(message);
  if (!/^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:continue|carry\s+on|keep\s+going)\b/i.test(text)) return false;
  const requested = text.match(/\bchapter\s+(\d+)\b/i);
  return !requested || Number(requested[1]) === pendingChapterNumber;
}
