import { loadDirHandle, saveDirHandle } from './file-storage';

export type FolderSelectionFailure =
  | 'unsupported'
  | 'aborted'
  | 'not_allowed'
  | 'security'
  | 'indexeddb'
  | 'unknown';

export class FolderSelectionError extends Error {
  readonly code: FolderSelectionFailure;

  constructor(code: FolderSelectionFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FolderSelectionError';
    this.code = code;
  }
}

export function isDirectoryPickerAvailable(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export function mapPickerError(err: unknown): FolderSelectionError {
  if (err instanceof FolderSelectionError) return err;
  if (err instanceof DOMException) {
    if (err.name === 'AbortError') {
      return new FolderSelectionError('aborted', 'Folder selection cancelled.');
    }
    if (err.name === 'NotAllowedError') {
      return new FolderSelectionError(
        'not_allowed',
        'Permission denied for folder access.',
        { cause: err },
      );
    }
    if (err.name === 'SecurityError') {
      return new FolderSelectionError(
        'security',
        `Security error: ${err.message}`,
        { cause: err },
      );
    }
  }
  if (err instanceof Error && /indexedDB|IDB/i.test(err.message)) {
    return new FolderSelectionError('indexeddb', err.message, { cause: err });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new FolderSelectionError('unknown', msg, { cause: err });
}

/** Call synchronously from click handler (first await inside). */
export async function pickDirectoryFromUserGesture(): Promise<FileSystemDirectoryHandle> {
  if (!isDirectoryPickerAvailable()) {
    throw new FolderSelectionError(
      'unsupported',
      'showDirectoryPicker is not available in this popup (use Chromium).',
    );
  }
  const picker = window.showDirectoryPicker;
  if (!picker) {
    throw new FolderSelectionError(
      'unsupported',
      'showDirectoryPicker is not available in this popup (use Chromium).',
    );
  }
  try {
    return await picker({
      mode: 'readwrite',
      id: 'cs50-backup-root',
    });
  } catch (err) {
    throw mapPickerError(err);
  }
}

export type PermissionMode = 'read' | 'readwrite';

export async function queryDirPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = 'readwrite',
): Promise<PermissionState> {
  return handle.queryPermission({ mode });
}

export async function requestDirPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = 'readwrite',
): Promise<PermissionState> {
  try {
    return await handle.requestPermission({ mode });
  } catch (err) {
    throw mapPickerError(err);
  }
}

/**
 * Picking the folder already grants access once; Chrome often reports `prompt` on a
 * new popup until write is used. Request only from a button click (Refresh, etc.).
 */
export async function ensureDirWriteAccess(
  handle: FileSystemDirectoryHandle,
  options: { requestIfNeeded: boolean },
): Promise<boolean> {
  let state = await queryDirPermission(handle, 'readwrite');
  if (state === 'granted') return true;
  if (options.requestIfNeeded && state === 'prompt') {
    state = await requestDirPermission(handle, 'readwrite');
  }
  return state === 'granted';
}

export async function persistDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<{ roundTrip: FileSystemDirectoryHandle; storedName: string }> {
  try {
    await saveDirHandle(handle);
    const roundTrip = await loadDirHandle();
    if (!roundTrip) {
      throw new FolderSelectionError(
        'indexeddb',
        'IndexedDB did not return a directory handle after save.',
      );
    }
    if (roundTrip.name !== handle.name) {
      throw new FolderSelectionError(
        'indexeddb',
        `Handle round-trip name mismatch: saved “${handle.name}”, loaded “${roundTrip.name}”.`,
      );
    }
    return { roundTrip, storedName: roundTrip.name };
  } catch (err) {
    if (err instanceof FolderSelectionError) throw err;
    throw new FolderSelectionError(
      'indexeddb',
      err instanceof Error ? err.message : String(err),
      { cause: err },
    );
  }
}

export type FolderDiagEntry = { step: string; detail: string; at: string };

export function createFolderDiagBuffer(max = 12): {
  log(step: string, detail: string): void;
  entries(): FolderDiagEntry[];
  format(): string;
} {
  const buf: FolderDiagEntry[] = [];
  return {
    log(step, detail) {
      buf.push({ step, detail, at: new Date().toISOString() });
      if (buf.length > max) buf.shift();
      console.info(`[cs50-folder:${step}]`, detail);
    },
    entries: () => [...buf],
    format: () =>
      buf.map((e) => `${e.step}: ${e.detail}`).join(' · ') || '(no steps yet)',
  };
}