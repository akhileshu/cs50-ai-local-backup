import {
  BACKUP_FOLDER_MARKER_FILE,
  EXPECTED_BACKUP_DIR_BASENAME,
  EXPECTED_BACKUP_PATH,
  folderNameMatchesExpected,
  type BackupFolderMarker,
} from './backup-folder-profile';

export interface BackupFolderVerification {
  ok: boolean;
  dirName: string;
  markerPath: string | null;
  markerMatches: boolean;
  nameMatches: boolean;
  message: string;
}

export async function verifyPickedBackupFolder(
  dir: FileSystemDirectoryHandle,
): Promise<BackupFolderVerification> {
  const dirName = dir.name;
  const nameMatches = folderNameMatchesExpected(dirName);
  let markerPath: string | null = null;
  let markerMatches = false;

  try {
    const fh = await dir.getFileHandle(BACKUP_FOLDER_MARKER_FILE);
    const file = await fh.getFile();
    const text = await file.text();
    const marker = JSON.parse(text) as BackupFolderMarker;
    markerPath = marker.intendedPath ?? null;
    markerMatches =
      marker.version === 1 &&
      typeof marker.intendedPath === 'string' &&
      marker.intendedPath.replace(/\/+$/, '') ===
        EXPECTED_BACKUP_PATH.replace(/\/+$/, '');
  } catch {
  }

  const ok = nameMatches;
  let message: string;
  if (ok && markerMatches) {
    message = `Confirmed: ${EXPECTED_BACKUP_DIR_BASENAME} (+ marker)`;
  } else if (ok && !markerMatches) {
    message = `Folder name OK; optional marker ${BACKUP_FOLDER_MARKER_FILE} missing (run npm run ensure-backup-folder)`;
  } else if (!nameMatches) {
    message = `Wrong folder name “${dirName}” — select “${EXPECTED_BACKUP_DIR_BASENAME}”.`;
  } else {
    message = 'Folder verification failed.';
  }

  return { ok, dirName, markerPath, markerMatches, nameMatches, message };
}