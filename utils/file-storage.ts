import {
  assertNoConflicts,
  buildScanFromManifestAndDisk,
  clearManagedParts,
  conflictIfUnmanagedPartExists,
  emptyManifest,
  hashFileContent,
  isManagedPartFileName,
  MANIFEST_FILE_NAME,
  parseManifestJson,
  registerManagedFile,
  type BackupManifestV1,
  type ManagedBackupScan,
} from './backup-manifest';
import { formatPartFileName } from './constants';
import {
  corpusPairFingerprint,
  extractPairChunksFromText,
} from './parse-markdown-pairs';
import {
  validateSplitBackupPlan,
  type SplitBackupPlan,
} from './split-backup';

const DB_NAME = 'cs50-chat-backup';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'backup-file';
const DIR_HANDLE_KEY = 'backup-dir';

export const BACKUP_INDEX_FILE = 'index.md';
const STAGING_PREFIX = '.staging-split-';
const ARCHIVE_DIR = 'archive';

export interface StoredBackupConfig {
  fileName: string | null;
  folderName: string | null;
  activePart: string | null;
  backupMode: 'file' | 'folder';
  configured: boolean;
  lastBackupIso: string | null;
  lastNewCount: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function saveFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
  });
  db.close();
}

export async function loadFileHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(handle, DIR_HANDLE_KEY);
  });
  db.close();
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(DIR_HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

/** Query only — does not open a permission prompt (use during Refresh). */
export async function verifyDirPermission(
  handle: FileSystemDirectoryHandle,
  withWrite = false,
): Promise<boolean> {
  const mode = withWrite ? 'readwrite' : 'read';
  return (await handle.queryPermission({ mode })) === 'granted';
}

export async function sampleDirectoryEntryNames(
  dir: FileSystemDirectoryHandle,
  limit = 8,
): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'file') names.push(name);
    else names.push(`${name}/`);
    if (names.length >= limit) break;
  }
  names.sort();
  return names;
}

export async function listPartFileNames(
  dir: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  const entries = dir.entries();
  for await (const [name, entry] of entries) {
    if (entry.kind === 'file' && isManagedPartFileName(name)) names.push(name);
  }
  return names.sort();
}

export async function readManifestFromDir(
  dir: FileSystemDirectoryHandle,
): Promise<BackupManifestV1> {
  try {
    const fh = await dir.getFileHandle(MANIFEST_FILE_NAME);
    const raw = await readFileText(fh);
    return parseManifestJson(raw);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      return emptyManifest();
    }
    throw e;
  }
}

export async function writeManifestToDir(
  dir: FileSystemDirectoryHandle,
  manifest: BackupManifestV1,
): Promise<void> {
  const fh = await dir.getFileHandle(MANIFEST_FILE_NAME, { create: true });
  const w = await fh.createWritable();
  await w.write(`${JSON.stringify(manifest, null, 2)}\n`);
  await w.close();
}

async function loadDiskPartTexts(
  dir: FileSystemDirectoryHandle,
): Promise<{ names: string[]; texts: Map<string, string> }> {
  const names = await listPartFileNames(dir);
  const texts = new Map<string, string>();
  for (const name of names) {
    const fh = await dir.getFileHandle(name);
    texts.set(name, await readFileText(fh));
  }
  return { names, texts };
}

export async function scanManagedBackup(
  dir: FileSystemDirectoryHandle,
  options?: { adoptUnregistered?: boolean },
): Promise<ManagedBackupScan> {
  const manifest = await readManifestFromDir(dir);
  const { names, texts } = await loadDiskPartTexts(dir);
  const scan = buildScanFromManifestAndDisk(manifest, names, texts, options);
  if (scan.manifestCreated) {
    await writeManifestToDir(dir, scan.manifest);
  }
  return scan;
}

export async function readManagedPartText(
  dir: FileSystemDirectoryHandle,
  partFileName: string,
): Promise<string> {
  const fh = await dir.getFileHandle(partFileName);
  return readFileText(fh);
}

export async function readManagedPartTexts(
  dir: FileSystemDirectoryHandle,
): Promise<{ name: string; text: string }[]> {
  const scan = await scanManagedBackup(dir);
  assertNoConflicts(scan);
  const out: { name: string; text: string }[] = [];
  for (const name of scan.managedPartNames) {
    const fh = await dir.getFileHandle(name);
    out.push({ name, text: await readFileText(fh) });
  }
  return out;
}

export async function resolveActivePartFileName(
  dir: FileSystemDirectoryHandle,
): Promise<string> {
  const scan = await scanManagedBackup(dir);
  if (scan.managedPartNames.length === 0) return formatPartFileName(1);
  return scan.managedPartNames[scan.managedPartNames.length - 1]!;
}

/** @deprecated Prefer readManagedPartTexts */
export async function readAllPartTexts(
  dir: FileSystemDirectoryHandle,
): Promise<{ name: string; text: string }[]> {
  return readManagedPartTexts(dir);
}

async function fileExistsInDir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return false;
    throw e;
  }
}

async function assertCanWriteManagedPart(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  manifest: BackupManifestV1,
): Promise<void> {
  const exists = await fileExistsInDir(dir, fileName);
  conflictIfUnmanagedPartExists(fileName, manifest, exists);
  if (!exists) return;
  const rec = manifest.files[fileName];
  if (!rec) {
    throw new Error(`Conflict: ${fileName} exists but is not managed by the extension.`);
  }
  const fh = await dir.getFileHandle(fileName);
  const text = await readFileText(fh);
  if (hashFileContent(text) !== rec.contentHash) {
    throw new Error(
      `Conflict: ${fileName} was changed outside the extension. Reconcile or restore from archive.`,
    );
  }
}

export async function executeSplitBackupPlan(
  dir: FileSystemDirectoryHandle,
  plan: SplitBackupPlan,
): Promise<{ archived: string[]; written: string[]; removed: string[] }> {
  const validation = validateSplitBackupPlan(plan);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingName = `${STAGING_PREFIX}${stamp}`;
  const staging = await dir.getDirectoryHandle(stagingName, { create: true });

  for (const f of plan.files) {
    const fh = await staging.getFileHandle(f.fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(f.content);
    await w.close();
  }
  const indexFh = await staging.getFileHandle(BACKUP_INDEX_FILE, { create: true });
  const indexW = await indexFh.createWritable();
  await indexW.write(plan.indexMarkdown);
  await indexW.close();

  const stagedPairs = [];
  for (const f of plan.files) {
    const fh = await staging.getFileHandle(f.fileName);
    const text = await readFileText(fh);
    if (text !== f.content) {
      throw new Error(`Staging verify failed for ${f.fileName}`);
    }
    stagedPairs.push(...extractPairChunksFromText(text));
  }
  stagedPairs.sort((a, b) => a.sortKey - b.sortKey);
  if (corpusPairFingerprint(stagedPairs) !== plan.stagingFingerprint) {
    throw new Error('Staging fingerprint mismatch; aborting commit.');
  }

  const scan = await scanManagedBackup(dir);
  assertNoConflicts(scan);
  const manifest = scan.manifest;

  for (const f of plan.files) {
    await assertCanWriteManagedPart(dir, f.fileName, manifest);
  }
  if (await fileExistsInDir(dir, BACKUP_INDEX_FILE)) {
    const indexRec = manifest.files[BACKUP_INDEX_FILE];
    if (indexRec) {
      await assertCanWriteManagedPart(dir, BACKUP_INDEX_FILE, manifest);
    } else {
      throw new Error(
        `Conflict: ${BACKUP_INDEX_FILE} exists but is not managed. Rename it or remove it before split.`,
      );
    }
  }

  const archive = await dir.getDirectoryHandle(ARCHIVE_DIR, { create: true });
  const archBucket = await archive.getDirectoryHandle(`pre-split-${stamp}`, {
    create: true,
  });
  const archived: string[] = [];
  const toArchive = new Set<string>();
  for (const [name, rec] of Object.entries(manifest.files)) {
    if (rec.kind === 'part' || rec.kind === 'index') toArchive.add(name);
  }
  if (await fileExistsInDir(dir, MANIFEST_FILE_NAME)) {
    toArchive.add(MANIFEST_FILE_NAME);
  }

  for (const name of toArchive) {
    if (!(await fileExistsInDir(dir, name))) continue;
    const fh = await dir.getFileHandle(name);
    const text = await readFileText(fh);
    const ah = await archBucket.getFileHandle(name, { create: true });
    const w = await ah.createWritable();
    await w.write(text);
    await w.close();
    archived.push(name);
  }

  const written: string[] = [];
  for (const f of plan.files) {
    const sfh = await staging.getFileHandle(f.fileName);
    const content = await readFileText(sfh);
    const rootFh = await dir.getFileHandle(f.fileName, { create: true });
    const w = await rootFh.createWritable();
    await w.write(content);
    await w.close();
    written.push(f.fileName);
  }

  const stagedIndexFh = await staging.getFileHandle(BACKUP_INDEX_FILE);
  const indexText = await readFileText(stagedIndexFh);
  const rootIndexFh = await dir.getFileHandle(BACKUP_INDEX_FILE, { create: true });
  const iw = await rootIndexFh.createWritable();
  await iw.write(indexText);
  await iw.close();
  written.push(BACKUP_INDEX_FILE);

  const newPartNames = new Set(plan.files.map((f) => f.fileName));
  const retiredParts = Object.entries(manifest.files)
    .filter(([name, rec]) => rec.kind === 'part' && !newPartNames.has(name))
    .map(([name]) => name);

  clearManagedParts(manifest);
  for (const f of plan.files) {
    registerManagedFile(manifest, f.fileName, 'part', f.content);
  }
  registerManagedFile(manifest, BACKUP_INDEX_FILE, 'index', plan.indexMarkdown);
  await writeManifestToDir(dir, manifest);

  for (const name of retiredParts) {
    if (await fileExistsInDir(dir, name)) {
      await dir.removeEntry(name);
    }
  }

  await dir.removeEntry(stagingName, { recursive: true });

  return { archived, written, removed: retiredParts };
}

export async function appendOrCreatePart(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  appendText: string,
  createNewFile: boolean,
): Promise<void> {
  if (!isManagedPartFileName(fileName)) {
    throw new Error(`Refusing to write non-managed filename: ${fileName}`);
  }

  const manifest = await readManifestFromDir(dir);
  const exists = await fileExistsInDir(dir, fileName);

  if (createNewFile) {
    conflictIfUnmanagedPartExists(fileName, manifest, exists);
  } else {
    await assertCanWriteManagedPart(dir, fileName, manifest);
  }

  const fh = await dir.getFileHandle(fileName, { create: createNewFile });
  let newContent: string;
  if (createNewFile && appendText.length > 0) {
    const writable = await fh.createWritable();
    await writable.write(appendText);
    await writable.close();
    newContent = appendText;
  } else {
    const file = await fh.getFile();
    const existing = await file.text();
    const writable = await fh.createWritable();
    newContent = existing + appendText;
    await writable.write(newContent);
    await writable.close();
  }

  registerManagedFile(manifest, fileName, 'part', newContent);
  await writeManifestToDir(dir, manifest);
}

export async function clearFileHandle(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(HANDLE_KEY);
  });
  db.close();
}

export async function clearDirHandle(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(DIR_HANDLE_KEY);
  });
  db.close();
}

export async function verifyFilePermission(
  handle: FileSystemFileHandle,
  withWrite = false,
): Promise<boolean> {
  const mode = withWrite ? 'readwrite' : 'read';
  return (await handle.queryPermission({ mode })) === 'granted';
}

export async function readFileText(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function appendToFile(
  handle: FileSystemFileHandle,
  appendText: string,
): Promise<void> {
  const file = await handle.getFile();
  const existing = await file.text();
  const writable = await handle.createWritable();
  await writable.write(existing + appendText);
  await writable.close();
}

export const CONFIG_KEY = 'syncConfig';

export async function loadConfig(): Promise<StoredBackupConfig> {
  const data = await chrome.storage.local.get(CONFIG_KEY);
  const cfg = data[CONFIG_KEY] as StoredBackupConfig | undefined;
  return (
    cfg ?? {
      fileName: null,
      folderName: null,
      activePart: null,
      backupMode: 'folder',
      configured: false,
      lastBackupIso: null,
      lastNewCount: 0,
    }
  );
}

export async function saveConfig(patch: Partial<StoredBackupConfig>): Promise<void> {
  const current = await loadConfig();
  await chrome.storage.local.set({
    [CONFIG_KEY]: { ...current, ...patch },
  });
}