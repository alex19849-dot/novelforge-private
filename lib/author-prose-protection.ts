import { memorySourceHash } from './narrative-memory';

export type AuthorProtection = { sourceHash: string; ranges: Array<{ start: number; end: number; text: string }> };
const paragraphs = (content: string) => [...content.matchAll(/\S[^\n]*(?:\n(?!\s*\n)[^\n]*)*/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length, text: m[0] }));
export function validAuthorProtection(content: string, value?: AuthorProtection): value is AuthorProtection {
  return Boolean(value && value.sourceHash === memorySourceHash(content) && Array.isArray(value.ranges) && value.ranges.every(r => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start && r.end <= content.length && content.slice(r.start,r.end) === r.text));
}
/** Exact paragraph LCS: changed paragraphs are author-owned; unchanged ones remain editable. */
export function protectAuthorChanges(before: string, after: string, previous?: AuthorProtection, markChanges = true): AuthorProtection {
  const old = paragraphs(before), next = paragraphs(after), locked = new Set<number>(), matchedOld = new Set<number>();
  const prior = validAuthorProtection(before,previous) ? previous.ranges : [];
  if (old.length * next.length <= 2_000_000) {
    const cols = next.length + 1, dp = new Uint32Array((old.length + 1) * cols);
    for (let a = old.length - 1; a >= 0; a--) for (let b = next.length - 1; b >= 0; b--) dp[a * cols + b] = old[a].text === next[b].text ? 1 + dp[(a + 1) * cols + b + 1] : Math.max(dp[(a + 1) * cols + b],dp[a * cols + b + 1]);
    let a = 0, b = 0;
    const matchedNew = new Set<number>(), pairs: Array<{ a: number; b: number }> = [];
    while (a < old.length && b < next.length) {
      if (old[a].text === next[b].text) {
        matchedOld.add(a); matchedNew.add(b); pairs.push({ a,b });
        if (prior.some(r => r.start < old[a].end && r.end > old[a].start)) locked.add(b);
        a++; b++;
      } else if (dp[(a + 1) * cols + b] >= dp[a * cols + b + 1]) a++;
      else b++;
    }
    if (markChanges) {
      next.forEach((_,i) => { if (!matchedNew.has(i)) locked.add(i); });
      // A deletion can leave no replacement paragraph. Preserve its new join.
      const anchors = [{ a: -1,b: -1 },...pairs,{ a: old.length,b: next.length }];
      for (let i = 1; i < anchors.length; i++) {
        const left = anchors[i - 1], right = anchors[i];
        if (right.a - left.a > 1 && right.b - left.b === 1) {
          if (next[right.b]) locked.add(right.b);
          if (next[left.b]) locked.add(left.b);
        }
      }
    }
  } else {
    // Bounded conservative fallback for unusually fragmented documents.
    // Never discard an existing author lock merely to make analysis cheaper.
    next.forEach((_,i) => locked.add(i));
  }
  return { sourceHash: memorySourceHash(after), ranges: [...locked].sort((a,b) => a - b).map(i => next[i]) };
}
export function overlapsAuthorProtection(start: number, end: number, protection?: AuthorProtection): boolean {
  return Boolean(protection?.ranges.some(r => r.start < end && r.end > start));
}
export function assertAuthorChangesKept(before: string, after: string, protection?: AuthorProtection): AuthorProtection | undefined {
  if (!validAuthorProtection(before,protection)) return undefined;
  const mapped = protectAuthorChanges(before,after,protection,false);
  // Count duplicates too. One identical surviving paragraph cannot account for two locked copies.
  const remaining = mapped.ranges.map(r => r.text);
  for (const r of protection.ranges) {
    const index = remaining.indexOf(r.text);
    if (index < 0) throw Error('The automatic edit would change an author-edited passage. Your current draft is kept.');
    remaining.splice(index,1);
  }
  return mapped;
}
