import { requestedSpecialSection } from './story-section';
import { getStoryStateBeforeChapter } from '../app/story-chat/generation';
import { isGuidanceProposal } from './chapter-guidance';
import type { StoryWorkspace } from '../app/story-chat/types';
import { createAionChapterPlan, assertChapterPlanSchema } from './aion-chapter-planner';

export const CHAPTER_GUIDANCE_PROMPT = `You draft detailed chapter guidance for an author's review, not novel prose and not an approved chapter contract. Return JSON with guidance and question strings. If a crucial author decision is missing, leave guidance empty and ask one focused question. Otherwise leave question empty.
Use this readable plain-text format, with normal line breaks, no code fences, tables or long dashes:
WRITE CHAPTER [number] (use REWRITE CHAPTER only when the author explicitly requests replacing a saved chapter)
For a prologue or epilogue, use WRITE PROLOGUE / WRITE EPILOGUE (or REWRITE) instead. A prologue precedes Chapter 1 and must not assume later events have already happened. An epilogue follows the main story. Keep the same POV, TIME, continuity and ending fields.
POV: [established character and tense]
TIME: [placement relative to the preceding chapter]

PURPOSE
A specific paragraph describing what this chapter changes for the leads.

CONTINUITY FROM CHAPTER [previous number] (for Chapter 1 or a prologue, use CONTINUITY FROM STORY BIBLE)
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

// Repair transport formatting only, never ask the model to regenerate paid work.
export function parseGuidanceResponse(raw: string): unknown {
  const source = raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(source); } catch { /* Try harmless string escaping below. */ }
  let repaired = '', inString = false;
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === '"') { inString = !inString; repaired += character; continue; }
    if (inString && character === '\\') {
      const next = source[i + 1];
      if (next && /["\\/bfnrt]/.test(next)) { repaired += character + next; i++; continue; }
      if (next === 'u' && /^[0-9a-f]{4}$/i.test(source.slice(i + 2, i + 6))) {
        repaired += source.slice(i, i + 6); i += 5; continue;
      }
      // Aion sometimes escapes apostrophes/markdown (e.g. \\') inside JSON strings.
      if (next && /['*\[\]_`]/.test(next)) { repaired += next; i++; continue; }
    }
    if (inString && character.charCodeAt(0) < 32) {
      repaired += JSON.stringify(character).slice(1, -1);
    } else repaired += character;
  }
  try { return JSON.parse(repaired); } catch {
    throw new Error('Aion returned unreadable guidance data. Your chapters are unchanged; no automatic retry was started.');
  }
}

export function normaliseGuidanceHeadings(text: string): string {
  return text.trim().replace(/^```(?:text|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/, '')
    .split(/\r?\n/).map(line => {
      const candidate = line.trim().replace(/^#{1,6}\s+/, '')
        .replace(/^\*\*(.*?)\*\*(.*)$/, '$1$2').replace(/^__(.*?)__(.*)$/, '$1$2');
      const title = candidate.match(/^((?:RE)?WRITE\s+(?:CHAPTER\s+\d+|PROLOGUE|EPILOGUE))\s*(?:[:.\-]\s*(.*))?$/i);
      if (title) return title[1].replace(/\s+/g, ' ').toUpperCase() + (title[2] ? '\nTITLE: ' + title[2] : '');
      const field = candidate.match(/^(POV|POINT OF VIEW|TIME|TIMING)\s*:\s*(.*)$/i);
      if (field) return (/^(?:POV|POINT OF VIEW)$/i.test(field[1]) ? 'POV' : 'TIME') + ': ' + field[2];
      const heading = candidate.match(/^(PURPOSE|ENDING|ENDPOINT|EXCLUSIONS|CONTINUITY(?: FROM (?:CHAPTER\s+\d+|STORY BIBLE))?)\s*:?\s*$/i);
      if (heading) return heading[1].toUpperCase().replace(/^ENDPOINT$/, 'ENDING');
      const inline = candidate.match(/^(PURPOSE|ENDING|ENDPOINT|EXCLUSIONS)\s*:\s*(\S.*)$/i);
      if (inline) return inline[1].toUpperCase().replace(/^ENDPOINT$/, 'ENDING') + '\n' + inline[2];
      return line;
    }).join('\n');
}

export function validateGuidanceDraft(text: string): void {
  const required: Array<[string, RegExp]> = [
    ['chapter heading', /^(?:RE)?WRITE (?:CHAPTER \d+|PROLOGUE|EPILOGUE)\s*$/im],
    ['POV', /^POV:[ \t]*\S[^\n]*$/im], ['TIME', /^TIME:[ \t]*\S[^\n]*$/im],
    ['PURPOSE', /^PURPOSE\s*\n+\s*\S/im], ['ENDING', /^ENDING\s*\n+\s*\S/im],
    ['scene instructions', /^\s*[-*•]\s+\S/m],
  ];
  if (!/^(?:RE)?WRITE (?:CHAPTER 1|PROLOGUE)\s*$/im.test(text)) {
    required.push(['continuity', /^CONTINUITY(?: FROM (?:CHAPTER\s+\d+|STORY BIBLE))?\s*\n+\s*\S/im]);
  }
  const missing = required.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
  for (const label of ['PURPOSE', 'ENDING']) {
    const body = text.split(new RegExp('^' + label + '[ \\t]*$', 'im'))[1]?.trim();
    if ((!body || /^(?:PURPOSE|ENDING|EXCLUSIONS|CONTINUITY(?: FROM .*)?|POV:.*|TIME:.*)$/i.test(body.split('\n')[0])) && !missing.includes(label)) missing.push(label);
  }
  if (missing.length) throw new Error(`The guidance draft was incomplete (missing ${missing.join(', ')}). Your chapters are unchanged; no automatic retry was started.`);
}

export async function draftChapterGuidance(story: StoryWorkspace, diagnostics: Parameters<typeof createAionChapterPlan>[0]['diagnostics']) {
  // A full author-supplied brief already is the guidance. Do not pay a model
  // to rewrite it, or reject it because it uses the author's own scene headings.
  const latest = story.messages.at(-1);
  const supplied = latest?.role === 'user' ? latest.content.trim() : '';
  const suppliedHeadings = [/^(?:RE)?WRITE (?:CHAPTER \d+|PROLOGUE|EPILOGUE)\s*$/im, /^POV:/im, /^TIME:/im, /^PURPOSE\s*$/im, /^(?:ENDING|ENDPOINT)\s*:?\s*$/im];
  // Prologues and epilogues use an unnumbered heading and often put the endpoint in a
  // final bullet. Preserve a complete supplied brief verbatim for review.
  const suppliedSpecialSection = /^(?:RE)?WRITE (?:PROLOGUE|EPILOGUE)\s*$/im.test(supplied)
    && /^POV:\s*\S/im.test(supplied) && /^TIME:\s*\S/im.test(supplied)
    && (supplied.match(/^[-*]\s+\S/gm)?.length ?? 0) >= 3
    && /^(?:[-*]\s+)?(?:END(?:ING|POINT)?\b|STOP\b)\s*:?\s*\S/im.test(supplied);
  if (supplied.length >= 400 && (suppliedHeadings.every(heading => heading.test(supplied)) || suppliedSpecialSection) && /^[-*]\s+\S/m.test(supplied)) {
    return { guidance: supplied, question: '' };
  }
  const isPrologue = requestedSpecialSection(supplied.replace(/^(?:plan|outline)\s+/i, "Write ")) === "prologue";
  const priorState = isPrologue ? getStoryStateBeforeChapter(story.storyState, 0) : story.storyState;
  const previousCount = diagnostics.length;
  const { parkedChapterDrafts: _parked, chapterGuidanceDraft: _draft, ...promptState } = priorState;
  try {
    const response = await createAionChapterPlan({ messages: [
      { role: 'system', content: CHAPTER_GUIDANCE_PROMPT },
      { role: 'user', content: JSON.stringify({ storyBible: story.storyBible, storyState: promptState,
        savedChapterIndex: (isPrologue ? [] : story.chapters).map(c => ({ number: c.number, title: c.title, pov: c.povCharacter })),
        recentChapters: isPrologue ? [] : story.chapters.slice(-3), conversation: story.messages.filter(message => message.role !== 'assistant' || !isGuidanceProposal(message.content)).slice(-12),
        guidanceBeingRevised: story.storyState.chapterGuidanceDraft?.text ?? null }) }
    ], schema, diagnostics, attempt: 1 });
    const output: unknown = parseGuidanceResponse(response.output_text);
    assertChapterPlanSchema(output, schema);
    const result = output as { guidance: string; question: string };
    const guidance = normaliseGuidanceHeadings(result.guidance);
    if (guidance) validateGuidanceDraft(guidance);
    else if (!result.question.trim()) throw new Error('No chapter guidance was returned. No automatic retry was started.');
    return { guidance, question: result.question.trim() };
  } finally {
    diagnostics.slice(previousCount).forEach(d => { d.stage = 'chapter_guidance'; });
  }
}



