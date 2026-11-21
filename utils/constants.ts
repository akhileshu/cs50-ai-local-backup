/**
 * Folder refresh: read/parse only the latest managed part (e.g. part-004).
 * isInSync ⇔ latest live question is already in that part; append only messages with domIndex
 * past the active part’s maxDomIndex (no re-copy of Q1–Q3 from older parts).
 * Set false to scan every part and allow chronological gap fill.
 */
export const FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY = true;

/** Test-friendly cap; raise for production (e.g. 10 * 1024 * 1024). */
export const BACKUP_MAX_FILE_BYTES = 2 * 1024;

export const BACKUP_PART_PREFIX = 'part-';
export const BACKUP_PART_SUFFIX = '.md';

export function formatPartFileName(sequence: number): string {
  return `${BACKUP_PART_PREFIX}${String(sequence).padStart(3, '0')}${BACKUP_PART_SUFFIX}`;
}

const PART_RE = /^part-(\d{3})\.md$/;

export function parsePartSequence(fileName: string): number | null {
  const m = fileName.match(PART_RE);
  return m ? parseInt(m[1] ?? '0', 10) : null;
}

export function nextPartSequence(existingFileNames: string[]): number {
  const nums = existingFileNames
    .map(parsePartSequence)
    .filter((n): n is number => n !== null);
  return nums.length ? Math.max(...nums) + 1 : 1;
}