import { formatPartFileName } from './constants';
import {
  corpusPairFingerprint,
  extractHeaderFromText,
  extractPairChunksFromText,
  mergePairsFromCorpus,
  pairBytes,
  type ExtractedPair,
} from './parse-markdown-pairs';
import { pairByteLength } from './qa-pairs';

export type SplitBackupMode = 'pairs_per_file' | 'max_mb';

export interface SplitBackupOptions {
  mode: SplitBackupMode;
  pairsPerFile: number;
  maxMb: number;
}

export interface PlannedSplitFile {
  fileName: string;
  content: string;
  qRange: { from: string; to: string };
  aRange: { from: string; to: string } | null;
  pairCount: number;
}

export interface SplitBackupPlan {
  files: PlannedSplitFile[];
  indexMarkdown: string;
  sourcePairCount: number;
  sourceFingerprint: string;
  stagingFingerprint: string;
}

export interface SplitBackupValidation {
  ok: boolean;
  errors: string[];
}

export interface SplitActionSummary {
  managedPartCount: number;
  /** Parts that would be split (over size / over pair limit). */
  actionCount: number;
  targetNames: string[];
  mode: SplitBackupMode;
}

export function partNeedsMaxMbSplit(text: string, maxMb: number): boolean {
  const maxBytes = Math.max(1, maxMb) * 1024 * 1024;
  if (pairByteLength(text) > maxBytes) return true;
  return extractPairChunksFromText(text).some((p) => pairBytes(p) > maxBytes);
}

export function partNeedsPairsSplit(text: string, pairsPerFile: number): boolean {
  const n = Math.max(1, Math.floor(pairsPerFile));
  return extractPairChunksFromText(text).length > n;
}

export function summarizeSplitActions(
  corpusFiles: { name: string; text: string }[],
  options: SplitBackupOptions,
): SplitActionSummary {
  const managedPartCount = corpusFiles.length;
  if (options.mode === 'max_mb') {
    const targetNames = corpusFiles
      .filter((f) => partNeedsMaxMbSplit(f.text, options.maxMb))
      .map((f) => f.name);
    return {
      managedPartCount,
      actionCount: targetNames.length,
      targetNames,
      mode: 'max_mb',
    };
  }
  const targetNames = corpusFiles
    .filter((f) => partNeedsPairsSplit(f.text, options.pairsPerFile))
    .map((f) => f.name);
  return {
    managedPartCount,
    actionCount: targetNames.length,
    targetNames,
    mode: 'pairs_per_file',
  };
}

export function isSplitBackupNeeded(
  corpusFiles: { name: string; text: string }[],
  options: SplitBackupOptions,
): boolean {
  return summarizeSplitActions(corpusFiles, options).actionCount > 0;
}

export function planSplitBackup(
  corpusFiles: { name: string; text: string }[],
  options: SplitBackupOptions,
): SplitBackupPlan {
  const { header, pairs } = mergePairsFromCorpus(corpusFiles);
  if (pairs.length === 0) {
    throw new Error('No Q/A pairs found in backup files.');
  }

  const safeHeader = header || extractHeaderFromText(corpusFiles[0]?.text ?? '');
  const groups = buildPairGroupsPerPart(corpusFiles, options);
  if (groups.length === 0) {
    throw new Error('No Q/A pairs to split.');
  }
  const files: PlannedSplitFile[] = [];

  groups.forEach((group, i) => {
    const fileName = formatPartFileName(i + 1);
    const body = group.map((p) => p.text).join('');
    const content = `${safeHeader}${body}`;
    const qLabels = group.map((p) => p.qLabel);
    const aLabels = group.map((p) => p.aLabel).filter(Boolean) as string[];

    files.push({
      fileName,
      content,
      qRange: { from: qLabels[0]!, to: qLabels[qLabels.length - 1]! },
      aRange:
        aLabels.length > 0
          ? { from: aLabels[0]!, to: aLabels[aLabels.length - 1]! }
          : null,
      pairCount: group.length,
    });
  });

  const indexMarkdown = renderIndex(files);
  const stagedPairs = files
    .flatMap((f) => extractPairChunksFromText(f.content))
    .sort((a, b) => a.sortKey - b.sortKey);

  return {
    files,
    indexMarkdown,
    sourcePairCount: pairs.length,
    sourceFingerprint: corpusPairFingerprint(pairs),
    stagingFingerprint: corpusPairFingerprint(stagedPairs),
  };
}

/** Only split parts that exceed limits; leave other parts unchanged. */
function buildPairGroupsPerPart(
  corpusFiles: { name: string; text: string }[],
  options: SplitBackupOptions,
): ExtractedPair[][] {
  const sorted = [...corpusFiles].sort((a, b) => a.name.localeCompare(b.name));
  const groups: ExtractedPair[][] = [];

  if (options.mode === 'max_mb') {
    const maxBytes = Math.max(1, options.maxMb) * 1024 * 1024;
    for (const file of sorted) {
      const pairs = extractPairChunksFromText(file.text);
      if (pairs.length === 0) continue;
      if (!partNeedsMaxMbSplit(file.text, options.maxMb)) {
        groups.push(pairs);
        continue;
      }
      groups.push(...chunkPairsByMaxBytes(pairs, maxBytes));
    }
    return groups;
  }

  const n = Math.max(1, Math.floor(options.pairsPerFile));
  for (const file of sorted) {
    const pairs = extractPairChunksFromText(file.text);
    if (pairs.length === 0) continue;
    if (pairs.length <= n) {
      groups.push(pairs);
      continue;
    }
    for (let i = 0; i < pairs.length; i += n) {
      groups.push(pairs.slice(i, i + n));
    }
  }
  return groups;
}

function chunkPairsByMaxBytes(
  pairs: ExtractedPair[],
  maxBytes: number,
): ExtractedPair[][] {
  const out: ExtractedPair[][] = [];
  let current: ExtractedPair[] = [];
  let currentBytes = 0;

  for (const pair of pairs) {
    const bytes = pairBytes(pair);
    const allowExceed = bytes > maxBytes;

    if (
      !allowExceed &&
      current.length > 0 &&
      currentBytes + bytes > maxBytes
    ) {
      out.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(pair);
    currentBytes += bytes;
  }

  if (current.length > 0) out.push(current);
  return out;
}

function renderIndex(files: PlannedSplitFile[]): string {
  const lines = [
    '# CS50 Backup Index',
    '',
    'Generated by **Split Backup**. Each part contains complete Q/A pairs only.',
    '',
    '| Part file | Q range | A range | Pairs |',
    '| --- | --- | --- | ---: |',
  ];

  for (const f of files) {
    const a = f.aRange ? `${f.aRange.from}–${f.aRange.to}` : '—';
    lines.push(
      `| ${f.fileName} | ${f.qRange.from}–${f.qRange.to} | ${a} | ${f.pairCount} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function validateSplitBackupPlan(plan: SplitBackupPlan): SplitBackupValidation {
  const errors: string[] = [];

  if (plan.sourceFingerprint !== plan.stagingFingerprint) {
    errors.push('Fingerprint mismatch: split output does not preserve all pair content.');
  }

  const stagedCount = plan.files.reduce((n, f) => n + f.pairCount, 0);
  if (stagedCount !== plan.sourcePairCount) {
    errors.push(
      `Pair count mismatch: source ${plan.sourcePairCount}, planned ${stagedCount}.`,
    );
  }

  for (const f of plan.files) {
    if (!/^### Q\d+(?: — [^\n]*)?\n/m.test(f.content)) {
      errors.push(`${f.fileName} must start with a complete ### Q block.`);
    }
    const bytes = pairByteLength(f.content);
    if (bytes === 0) errors.push(`${f.fileName} is empty.`);
  }

  if (!plan.indexMarkdown.includes('| Part file |')) {
    errors.push('Index markdown is invalid.');
  }

  return { ok: errors.length === 0, errors };
}