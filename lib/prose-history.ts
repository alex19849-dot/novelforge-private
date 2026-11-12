import { projectNarrativeMemory, memorySourceHash, type MemoryQuery } from './narrative-memory';
import type { StoryState } from '../app/story-chat/types';

export const PROSE_HISTORY_LIMIT = 4200;
type Chapter = { number: number; content: string; povCharacter?: string };
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
const excerpt = (text: string, maximum = 155) => tidy(text).slice(0, maximum);
const sentences = (text: string) => text.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map(tidy).filter(Boolean) ?? [];

// Review signals, not bans or automatic replacements. Match the action rather
// than one exact spelling; count occurrences only in actual accepted prose.
const habits: Array<[string, RegExp]> = [
  ['hand behind the neck', /\b(?:hand|palm|fingers?|grip|catch|catches|caught|hold|holds|held)\b[^.!?\n]{0,100}\b(?:(?:back of|behind) (?:his|my|their|your|the) neck|nape)\b|\b(?:(?:back of|behind) (?:his|my|their|your|the) neck|nape)\b[^.!?\n]{0,70}\b(?:hand|palm|fingers?|grip)\b/i],
  ['one hand covering the other during intimacy', /\b(?:cover|covers|covered|covering)\b[^.!?\n]{0,55}\bhand\b[^.!?\n]{0,40}\b(?:mine|his|my|own)\b/i],
  ['warm-cloth cleanup', /\b(?:warm|wet|damp)\b[^.!?\n]{0,25}\bcloth\b|\bcloth\b[^.!?\n]{0,30}\bwarm water\b/i],
  ['announcing a joke withheld instead of showing the reaction', /\b(?:without (?:making|adding|a single)|don.t have|no|not a|several|perfectly good)\b[^.!?\n]{0,55}\b(?:joke|jokes|smart remark)\b|\b(?:joke|jokes)\b[^.!?\n]{0,45}\b(?:don.t|doesn.t|none|instead)\b/i],
  ['performance or scoring metaphors during attraction', /\b(?:scoreboard|review.{0,20}website|portfolio I don.t have|built this set|catalogue what lands)\b/i],
];

function recurringWording(chapters: Chapter[]): string[] {
  const phrases = new Map<string, Set<number>>();
  const ordinary = new Set(['i','he','his','him','my','me','the','a','an','and','but','or','to','of','in','on','at','for','with','is','it','that','this','as','was','were','be','we','you','your','not','so','says','said']);
  for (const chapter of chapters) {
    const words = chapter.content.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']+/g) ?? [];
    for (let i = 0; i + 6 <= words.length; i++) {
      const window = words.slice(i, i + 6);
      if (window.filter(word => !ordinary.has(word)).length < 3) continue;
      const phrase = window.join(' '), seen = phrases.get(phrase) ?? new Set<number>();
      seen.add(chapter.number); phrases.set(phrase, seen);
    }
  }
  const chosen: string[] = [];
  for (const [phrase, chapters] of [...phrases].filter(([, chapters]) => chapters.size >= 3).sort((a, b) => b[1].size - a[1].size)) {
    if (chosen.some(previous => previous.includes(phrase.split(' ').slice(0, 4).join(' ')))) continue;
    chosen.push(`Recurring wording in chapters ${[...chapters].slice(-8).join(', ')}: "${phrase}". Retain only when purposeful.`);
    if (chosen.length === 2) break;
  }
  return chosen;
}

/** Bounded prose evidence for the current book only. No model call or save. */
export function priorProseContext(chapters: unknown, state: unknown = {}, query: MemoryQuery = {}): string {
  const memory = state && typeof state === 'object' ? state as Partial<StoryState> : {};
  const boundary = Math.min(query.beforeChapter ?? Infinity, memory.continuityDirtyFromChapter ?? Infinity);
  const accepted: Chapter[] = (Array.isArray(chapters) ? chapters : [])
    .filter((c): c is Chapter => Boolean(c) && typeof c === 'object' && Number.isInteger(c.number) && c.number > 0 && c.number < boundary && typeof c.content === 'string' && Boolean(c.content.trim()))
    .sort((a, b) => a.number - b.number);
  const records = projectNarrativeMemory(memory, boundary).filter(r => {
    const source = accepted.find(c => c.number === r.evidence.chapterNumber);
    return r.manual || !source || r.evidence.sourceHash === memorySourceHash(source.content);
  });
  const knownPatterns = records.filter(r => r.kind === 'pattern' && (r.status === 'AVOID' || r.status === 'MOTIF'));
  const parts = [
    'PRIOR PROSE COMPARISON, BACKGROUND ONLY',
    'Examples below are accepted past prose, never new beats or wording to copy. Another POV character\'s private thoughts are not knowledge the current character possesses. Notice repeated habits; do not mechanically ban words, replace a gesture with another stock gesture, remove meaningful touch, or reduce thoughts, feelings, humour or heat. Author instructions and deliberate MOTIF records take precedence. Vary only where the current scene permits it. Excerpts are selective evidence, not a complete account of an encounter.',
  ];
  const add = (line: string, ceiling = PROSE_HISTORY_LIMIT) => { if (parts.join('\n').length + line.length + 1 <= ceiling) parts.push(line); };
  for (const record of knownPatterns.slice(-3)) add(`${record.status} (${record.manual ? 'author correction' : `Ch${record.evidence.chapterNumber}`}): ${excerpt(record.claim, 180)}`, 1100);
  const prose = accepted.map(c => ({ ...c, sentences: sentences(c.content) }));
  for (const [label, pattern] of habits) {
    const matches = prose.flatMap(c => c.sentences.filter(s => pattern.test(s)).map(s => ({ number: c.number, text: s })));
    const chapterNumbers = [...new Set(matches.map(m => m.number))];
    if (matches.length < 3 || chapterNumbers.length < 2) continue;
    const example = matches.at(-1)!;
    add(`Recurring ${label}: ${matches.length} sentences across chapters ${chapterNumbers.slice(-12).join(', ')}. Compare before repeating. Ch${example.number}: "${excerpt(example.text, 160)}"`, 1800);
  }
  for (const phrase of recurringWording(accepted)) add(phrase, 2000);
  const sexual = /\b(?:condoms?|lube|orgasm\w*|penetrat\w*|cock|climax\w*|blowjob|handjob|inside (?:him|me|you)|(?:press|push|ease)(?:es|ing)? into (?:him|me|you)|opening (?:him|me|you) up)\b/i;
  const encounters = prose.filter(c => c.sentences.filter(s => sexual.test(s)).length >= 2).slice(-2).reverse();
  for (const chapter of encounters) {
    const relevant = chapter.sentences.filter(s => sexual.test(s));
    const samples = [...new Set([relevant[0], relevant[Math.floor((relevant.length - 1) / 2)], relevant.at(-1)!])];
    const start = chapter.sentences.indexOf(relevant[0]);
    const end = chapter.sentences.indexOf(relevant.at(-1)!);
    const after = chapter.sentences.slice(start, end + 8).filter(s => /\b(?:afterward|afterwards|clean.{0,20}(?:us|him)|warm cloth)\b/i.test(s)).at(-1);
    const mood = chapter.sentences.slice(Math.max(0, start - 8), end + 1).find(s => /\b(?:laugh|laughs|laughing|jealous|tender|playful|desperate)\b/i.test(s) && /\b(?:kiss|bed|mouth|touch|hands?|skin)\b/i.test(s));
    const established = records.filter(r => r.kind === 'intimacy' && r.evidence.chapterNumber === chapter.number).slice(0, 2);
    add(`EARLIER INTIMATE ENCOUNTER, Ch${chapter.number}${chapter.povCharacter ? `, POV ${excerpt(chapter.povCharacter, 50)}` : ''}: ${established.map(r => excerpt(r.claim, 130)).join('; ')}\nSelected progression in source order: ${samples.map(s => `"${excerpt(s)}"`).join(' / ')}${mood ? `\nMood/initiative example: "${excerpt(mood)}"` : ''}${after ? `\nAftermath example: "${excerpt(after)}"` : ''}`);
  }
  // Existing memory remains useful to legacy callers without full chapter prose.
  if (!encounters.length) for (const r of records.filter(r => r.kind === 'intimacy').slice(-3)) add(`Established intimacy, Ch${r.evidence.chapterNumber}: ${excerpt(r.claim, 220)}`);
  if (parts.length === 2) return '';
  return parts.join('\n');
}
