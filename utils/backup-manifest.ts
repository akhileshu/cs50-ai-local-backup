import { contentHash } from './content-hash';
import { parsePartSequence } from './constants';

export const MANIFEST_FILE_NAME = 'manifest.json';
const PART_FILE_RE = /^part-\d{3}\.md$/;

export type ManagedFileKind = 'part' | 'index';

export interface ManagedFileRecord {
  managedId: string;
  kind: ManagedFileKind;
  contentHash: string;
  updatedAt: string;
}

export interface BackupManifestV1 {
  version: 1;
  files: Record<string, ManagedFileRecord>;
}

export interface ManagedPartConflict {
  fileName: string;
  reason: 'hash_mismatch' | 'missing_on_disk' | 'orphaned_in_manifest';
  detail?: string;
}

export interface ManagedBackupScan {
  manifest: BackupManifestV1;
  managedPartCount: number;
  managedPartNames: string[];
  conflicts: ManagedPartConflict[];
  /** Matches part-NNN.md on disk but not registered in the manifest */
  unmanagedPartNames: string[];
  manifestCreated: boolean;
}

export function isManagedPartFileName(name: string): boolean {
  return PART_FILE_RE.test(name);
}

export function hashFileContent(text: string): string {
  return contentHash(text);
}

export function emptyManifest(): BackupManifestV1 {
  return { version: 1, files: {} };
}

export function parseManifestJson(raw: string): BackupManifestV1 {
  const parsed = JSON.parse(raw) as BackupManifestV1;
  if (parsed?.version !== 1 || typeof parsed.files !== 'object') {
    throw new Error('Invalid manifest.json format.');
  }
  return parsed;
}

export function registerManagedFile(
  manifest: BackupManifestV1,
  fileName: string,
  kind: ManagedFileKind,
  content: string,
  managedId?: string,
): void {
  const existing = manifest.files[fileName];
  manifest.files[fileName] = {
    managedId: managedId ?? existing?.managedId ?? crypto.randomUUID(),
    kind,
    contentHash: hashFileContent(content),
    updatedAt: new Date().toISOString(),
  };
}

export function removeManagedFile(manifest: BackupManifestV1, fileName: string): void {
  delete manifest.files[fileName];
}

export function clearManagedParts(manifest: BackupManifestV1): void {
  for (const [name, rec] of Object.entries(manifest.files)) {
    if (rec.kind === 'part') removeManagedFile(manifest, name);
  }
}

export function sortPartNames(names: string[]): string[] {
  return [...names].sort((a, b) => (parsePartSequence(a) ?? 0) - (parsePartSequence(b) ?? 0));
}

export function buildScanFromManifestAndDisk(
  manifest: BackupManifestV1,
  diskPartNames: string[],
  diskTexts: Map<string, string>,
  options?: { adoptUnregistered?: boolean },
): ManagedBackupScan {
  const unmanagedPartNames = diskPartNames.filter((n) => !manifest.files[n]);
  let manifestCreated = false;
  let working = manifest;

  if (options?.adoptUnregistered && unmanagedPartNames.length > 0) {
    working = {
      version: 1,
      files: { ...manifest.files },
    };
    for (const name of sortPartNames(unmanagedPartNames)) {
      const text = diskTexts.get(name);
      if (text !== undefined) {
        registerManagedFile(working, name, 'part', text);
        manifestCreated = true;
      }
    }
  }

  const conflicts: ManagedPartConflict[] = [];
  const managedPartNames: string[] = [];

  for (const fileName of sortPartNames(diskPartNames)) {
    const rec = working.files[fileName];
    if (!rec || rec.kind !== 'part') continue;
    const text = diskTexts.get(fileName);
    if (text === undefined) {
      conflicts.push({
        fileName,
        reason: 'orphaned_in_manifest',
        detail: 'Listed in manifest but missing on disk (renamed or removed).',
      });
      continue;
    }
    const h = hashFileContent(text);
    if (h !== rec.contentHash) {
      conflicts.push({
        fileName,
        reason: 'hash_mismatch',
        detail: `Expected ${rec.contentHash}, found ${h}.`,
      });
      continue;
    }
    managedPartNames.push(fileName);
  }

  const stillUnmanaged =
    options?.adoptUnregistered ? [] : diskPartNames.filter((n) => !working.files[n]);

  return {
    manifest: working,
    managedPartCount: managedPartNames.length,
    managedPartNames,
    conflicts,
    unmanagedPartNames: stillUnmanaged,
    manifestCreated,
  };
}

export function assertNoConflicts(scan: ManagedBackupScan): void {
  const blocking = scan.conflicts.filter((c) => c.reason === 'hash_mismatch');
  if (blocking.length === 0) return;
  const lines = blocking.map(
    (c) => `${c.fileName}: ${c.reason}${c.detail ? ` (${c.detail})` : ''}`,
  );
  throw new Error(`Managed backup conflict: ${lines.join('; ')}`);
}

export function conflictIfUnmanagedPartExists(
  fileName: string,
  manifest: BackupManifestV1,
  existsOnDisk: boolean,
): void {
  if (!existsOnDisk || !isManagedPartFileName(fileName)) return;
  if (!manifest.files[fileName]) {
    throw new Error(
      `Conflict: ${fileName} exists but is not managed. Use Get file count to adopt, or rename it.`,
    );
  }
}