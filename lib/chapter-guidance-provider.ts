import { isGuidanceProposal } from './chapter-guidance';
import type { StoryWorkspace } from '../app/story-chat/types';
import { createAionChapterPlan, assertChapterPlanSchema } from './aion-chapter-planner';

export const CHAPTER_GUIDANCE_PROMPT = `You draft detailed chapter guidance for an author's review, not novel prose and not an approved chapter contract. Return JSON with guidance and question strings. If a crucial author decision is missing, leave guidance empty and ask one focused question. Otherwise leave question empty.
Use this readable plain-text format, with normal line breaks, no code fences, tables or long dashes:
WRITE CHAPTER [number] (use REWRITE CHAPTER only when the author explicitly requests replacing a saved chapter)
For an epilogue, use WRITE EPILOGUE (or REWRITE EPILOGUE) instead. Keep the same POV, TIME, continuity and ending fields.
POV: [established character and tense]
TIME: [placement relative to the preceding chapter]

PURPOSE
A specific paragraph describing what this chapter changes for the leads.

CONTINUITY FROM CHAPTER [previous number] (for Chapter 1, use CONTINUITY FROM STORY BIBLE)
- Relevant established facts and practical agreements the writer must preserve.

[DESCRIPTIVE SCENE HEADING]
- Detailed actionable guidance covering the sequence, dialogue opportunities, private thoughts, attraction, behaviour, friction and practical logistics.
[Further scene headings as the chapter needs, never a fixed three-beat template.]

ENDING
The precise final action or realisation, and where the chapter stops.

EXCLUSIONS
- Applicable limits from the author or established pacing.
Match the author's requested level of detail, normally several developed bullets per scene. Make guidance specific enough to write from, without scripting every line or filling space. Keep romance and the leads' inner lives central, according to this book's genre and the author's direction. Let attraction register through specific traits the POV character notices. Humour should arise naturally, not in every exchange. Do not turn the chapter into a checklist of scenery or recap.
For an existing chapter rewrite, use only chapters before the requested chapter as prior history; later chapters are future constraints, never events that have already happened at that point. Use the Story Bible, saved continuity and actual preceding chapter to ground facts. Distinguish proposed events from established history. Do not invent prior disclosures, meetings, exact wages, schedules, injuries, relationship milestones or supporting-character identities. Preserve exact amounts and times when supplied. If revising, return the complete revised guidance and preserve unaffected requirements. Do not recycle completed discoveries or conflicts. No new numerical word target unless supplied by the author or already established for this book. Use the author's explicit chapter number or the next saved chapter number. Do not change the Bible, saved chapters or canon. Nothing is approved until the author confirms.`;

const schema = { type: 'object', additionalProperties: false, required: ['guidance', 'question'], properties: { guidance: { type: 'string' }, question: { type: 'string' } } };
export async function draftChapterGuidance(story: StoryWorkspace, diagnostics: Parameters<typeof createAionChapterPlan>[0]['diagnostics']) {
  // A full author-supplied brief already is the guidance. Do not pay a model
  // to rewrite it, or reject it because it uses the author's own scene headings.
  const latest = story.messages.at(-1);
  const supplied = latest?.role === 'user' ? latest.content.trim() : '';
  const suppliedHeadings = [/^(?:RE)?WRITE CHAPTER \d+\s*$/im, /^POV:/im, /^TIME:/im, /^PURPOSE\s*$/im, /^(?:ENDING|ENDPOINT)\s*:?\s*$/im];
  // Epilogues use an unnumbered heading and often put the endpoint in a
  // final bullet. Preserve a complete supplied brief verbatim for review.
  const suppliedEpilogue = /^(?:RE)?WRITE EPILOGUE\s*$/im.test(supplied)
    && /^POV:\s*\S/im.test(supplied) && /^TIME:\s*\S/im.test(supplied)
    && (supplied.match(/^[-*]\s+\S/gm)?.length ?? 0) >= 3
    && /^(?:[-*]\s+)?(?:END(?:ING|POINT)?\b|STOP\b)\s*:?\s*\S/im.test(supplied);
  if (supplied.length >= 400 && (suppliedHeadings.every(heading => heading.test(supplied)) || suppliedEpilogue) && /^[-*]\s+\S/m.test(supplied)) {
    return { guidance: supplied, question: '' };
  }
  const previousCount = diagnostics.length;
  const { parkedChapterDrafts: _parked, chapterGuidanceDraft: _draft, ...promptState } = story.storyState;
  try {
    const response = await createAionChapterPlan({ messages: [
      { role: 'system', content: CHAPTER_GUIDANCE_PROMPT },
      { role: 'user', content: JSON.stringify({ storyBible: story.storyBible, storyState: promptState,
        savedChapterIndex: story.chapters.map(c => ({ number: c.number, title: c.title, pov: c.povCharacter })),
        recentChapters: story.chapters.slice(-3), conversation: story.messages.filter(message => message.role !== 'assistant' || !isGuidanceProposal(message.content)).slice(-12),
        guidanceBeingRevised: story.storyState.chapterGuidanceDraft?.text ?? null }) }
    ], schema, diagnostics, attempt: 1 });
    const output: unknown = JSON.parse(response.output_text);
    assertChapterPlanSchema(output, schema);
    const result = output as { guidance: string; question: string };
    if (result.guidance.trim()) {
      const headings = [/^(?:RE)?WRITE (?:CHAPTER \d+|EPILOGUE)\s*$/im, /^POV:/im, /^TIME:/im, /^PURPOSE\s*$/im, /^ENDING\s*$/im, /^EXCLUSIONS\s*$/im];
      // Chapter 1 has no preceding chapter. Opening continuity belongs to the Bible.
      if (!/^(?:RE)?WRITE CHAPTER 1\s*$/im.test(result.guidance)) headings.push(/^CONTINUITY FROM CHAPTER/im);
      for (const heading of headings) {
        if (!heading.test(result.guidance)) throw new Error('The guidance draft was incomplete. Your chapters are unchanged; no automatic retry was started.');
      }
    } else if (!result.question.trim()) throw new Error('No chapter guidance was returned. No automatic retry was started.');
    return { guidance: result.guidance.trim(), question: result.question.trim() };
  } finally {
    diagnostics.slice(previousCount).forEach(d => { d.stage = 'chapter_guidance'; });
  }
}

