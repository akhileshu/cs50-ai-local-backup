import { pairByteLength } from './qa-pairs';
import {
  Q_HEADING_FIRST_RE,
  Q_HEADING_LINE_RE,
  Q_HEADING_START_RE,
} from './question-heading';

export interface ExtractedPair {
  text: string;
  qLabel: string;
  aLabel: string | null;
  sortKey: number;
  messageCount: number;
}

const META_DOM_RE =
  /<!--\s*cs50-backup-meta:\s*(\{[\s\S]*?\})\s*-->/;
const A_HEAD_RE = /^### (A\d+)\n/m;

function domIndexFromChunk(text: string): number {
  const m = text.match(META_DOM_RE);
  if (!m?.[1]) return Number.MAX_SAFE_INTEGER;
  try {
    const meta = JSON.parse(m[1]) as { domIndex?: number };
    return typeof meta.domIndex === 'number' ? meta.domIndex : Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** One complete Q (optional A) block — never split this string. */
export function extractPairChunksFromText(text: string): ExtractedPair[] {
  const firstQ = text.search(Q_HEADING_FIRST_RE);
  if (firstQ < 0) return [];

  const body = text.slice(firstQ);
  const qStarts = [...body.matchAll(Q_HEADING_START_RE)].map((m) => m.index!);

  return qStarts.map((start, i) => {
    const end = qStarts[i + 1] ?? body.length;
    const chunk = body.slice(start, end);
    const qMatch = chunk.match(Q_HEADING_LINE_RE);
    const aMatch = chunk.match(A_HEAD_RE);
    const messageCount =
      (qMatch ? 1 : 0) + (aMatch ? 1 : 0);
    return {
      text: chunk,
      qLabel: qMatch?.[1] ?? `Q?`,
      aLabel: aMatch?.[1] ?? null,
      sortKey: domIndexFromChunk(chunk),
      messageCount,
    };
  });
}

export function extractHeaderFromText(text: string): string {
  const firstQ = text.search(Q_HEADING_FIRST_RE);
  if (firstQ <= 0) {
    return `# CS50.ai Conversation Backup\n\n`;
  }
  return text.slice(0, firstQ).replace(/\s*$/, '\n');
}

export function mergePairsFromCorpus(
  files: { name: string; text: string }[],
): { header: string; pairs: ExtractedPair[] } {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const pairs: ExtractedPair[] = [];
  let header = '';

  for (const file of sorted) {
    if (!header) header = extractHeaderFromText(file.text);
    pairs.push(...extractPairChunksFromText(file.text));
  }

  pairs.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.qLabel.localeCompare(b.qLabel, undefined, { numeric: true });
  });

  return { header, pairs: dedupePairsByDomOrder(pairs) };
}

/** Drop duplicate Q/A blocks re-read from multiple part files (same dom order / labels). */
export function dedupePairsByDomOrder(pairs: ExtractedPair[]): ExtractedPair[] {
  const seen = new Set<string>();
  const out: ExtractedPair[] = [];
  for (const p of pairs) {
    const key = `${p.sortKey}:${p.qLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function corpusPairFingerprint(pairs: ExtractedPair[]): string {
  let h = 0;
  const s = pairs.map((p) => p.text).join('\0');
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export function pairBytes(pair: ExtractedPair): number {
  return pairByteLength(pair.text);
}