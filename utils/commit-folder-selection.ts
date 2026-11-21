import { formatPartFileName } from './constants';
import {
  clearFileHandle,
  loadDirHandle,
  saveConfig,
} from './file-storage';
import {
  persistDirectoryHandle,
  queryDirPermission,
  requestDirPermission,
} from './folder-selection';
import { verifyPickedBackupFolder } from './verify-backup-folder';

export const FOLDER_PICK_DONE_KEY = 'folderPickDoneAt';

/** Persist handle + config immediately after the system picker returns. */
export async function commitBackupFolderSelection(
  dir: FileSystemDirectoryHandle,
): Promise<{ ok: boolean; error?: string; dirName: string }> {
  await clearFileHandle();
  await persistDirectoryHandle(dir);
  await saveConfig({
    configured: true,
    backupMode: 'folder',
    folderName: dir.name,
    activePart: formatPartFileName(1),
    fileName: null,
  });

  const roundTrip = await loadDirHandle();
  if (!roundTrip || roundTrip.name !== dir.name) {
    return {
      ok: false,
      dirName: dir.name,
      error: 'Could not persist folder access (IndexedDB).',
    };
  }

  const nameCheck = await verifyPickedBackupFolder(dir);
  if (!nameCheck.ok) {
    return { ok: false, dirName: dir.name, error: nameCheck.message };
  }

  let perm = await queryDirPermission(dir, 'readwrite');
  if (perm === 'prompt') {
    perm = await requestDirPermission(dir, 'readwrite');
  }

  if (perm === 'denied') {
    return {
      ok: false,
      dirName: dir.name,
      error: 'Write access denied for this folder.',
    };
  }

  await chrome.storage.local.set({ [FOLDER_PICK_DONE_KEY]: Date.now() });
  return { ok: true, dirName: dir.name };
}