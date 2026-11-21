import type { BackupEntry, MessageRole } from './types';

const META_RE =
  /<!--\s*cs50-backup-meta:\s*(\{[\s\S]*?\})\s*-->/g;

export interface ParsedBackup {
  header: string;
  entries: BackupEntry[];
  existingIds: Set<string>;
  existingHashes: Set<string>;
  maxDomIndex: number;
  rawBody: string;
}

export interface BackupMeta {
  id: string;
  role: MessageRole;
  domIndex: number;
  contentHash: string;
  gapFill?: boolean;
}

export function parseBackupFile(text: string): ParsedBackup {
  const existingIds = new Set<string>();
  const existingHashes = new Set<string>();
  const entries: BackupEntry[] = [];
  let maxDomIndex = -1;

  const headerEnd = text.indexOf('\n## Conversation');
  const header =
    headerEnd >= 0 ? text.slice(0, headerEnd).trimEnd() : text.trimEnd();

  META_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = META_RE.exec(text)) !== null) {
    try {
      const metaJson = match[1];
      if (!metaJson) continue;
      const meta = JSON.parse(metaJson) as BackupMeta;
      existingIds.add(meta.id);
      existingHashes.add(meta.contentHash);
      if (meta.domIndex > maxDomIndex) maxDomIndex = meta.domIndex;
      entries.push({
        id: meta.id,
        role: meta.role,
        domIndex: meta.domIndex,
        label: meta.role === 'user' ? `Q${++idx}` : `A${idx}`,
        content: '',
      });
    } catch {
      // skip bad meta
    }
  }

  return {
    header,
    entries,
    existingIds,
    existingHashes,
    maxDomIndex,
    rawBody: text,
  };
}

/** Merge all part files for dedup (ids/hashes), not for label numbering. */
export function parseBackupCorpus(fileTexts: string[]): ParsedBackup {
  const merged: ParsedBackup = {
    header: '',
    entries: [],
    existingIds: new Set(),
    existingHashes: new Set(),
    maxDomIndex: -1,
    rawBody: '',
  };

  for (const text of fileTexts) {
    const part = parseBackupFile(text);
    part.existingIds.forEach((id) => merged.existingIds.add(id));
    part.existingHashes.forEach((h) => merged.existingHashes.add(h));
    if (part.maxDomIndex > merged.maxDomIndex) merged.maxDomIndex = part.maxDomIndex;
    merged.entries.push(...part.entries);
    merged.rawBody += text;
  }

  return merged;
}

export function nextLabelNumbers(text: string): { nextQ: number; nextA: number } {
  const qNums = [...text.matchAll(/^### Q(\d+)/gm)].map((m) => parseInt(m[1] ?? '0', 10));
  const aNums = [...text.matchAll(/^### A(\d+)/gm)].map((m) => parseInt(m[1] ?? '0', 10));
  const nextQ = qNums.length ? Math.max(...qNums) + 1 : 1;
  const nextA = aNums.length ? Math.max(...aNums) + 1 : 1;
  return { nextQ, nextA };
}