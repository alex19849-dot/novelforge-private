export type SpecialSectionKind = 'prologue' | 'epilogue';
const clean = (message: string) => message.replace(/^\s*aion(?:\s*[:,-]\s*|\s+)/i,'').replace(/\\r\\n|\\n/g,'\n').trim();
// Read the instruction/header, not future events mentioned in the brief's body.
export function requestedSpecialSection(message: string): SpecialSectionKind | null {
  const line=clean(message).split('\n')[0].replace(/^\s*#{1,6}\s*|\*\*/g,'').trim();
  const match=line.match(/^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:write|generate|create|start|continue|rewrite|expand)\s+(?:(?:me|us|a|an|the|my|this|new|short|long|brief|full|final|opening)\s+)*(prologue|epilogue)\b/i)
    ?? line.match(/^(prologue|epilogue)\b\s*[,;:]?\s*(?:please\s+)?(?:write|generate|create|start|continue|rewrite|expand)\b/i)
    ?? line.match(/^(prologue|epilogue)\s*[:.!]?\s*$/i);
  return match ? match[1].toLowerCase() as SpecialSectionKind : null;
}
export function specialSectionTitle(section: {kind?:unknown;title?:unknown}): string {
  const kind=section.kind==='prologue'||section.kind==='epilogue'?section.kind:typeof section.title==='string'&&/^(prologue|epilogue)$/i.test(section.title.trim())?section.title.trim().toLowerCase():'';
  return kind ? kind[0].toUpperCase()+kind.slice(1) : '';
}
export function sectionLabel(section: {number:number;kind?:unknown;title?:unknown}): string {return specialSectionTitle(section)||`Chapter ${section.number}`;}
