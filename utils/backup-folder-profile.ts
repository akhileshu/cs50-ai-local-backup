/** Hint only — Chrome never exposes full paths from the directory picker. */
export const EXPECTED_BACKUP_PATH =
  '/mnt/work/workspace/docs/programming/cs50-chat-backup';

export const EXPECTED_BACKUP_DIR_BASENAME = 'cs50-chat-backup';

/** Written by scripts/ensure-backup-folder.mts; extension reads it after pick. */
export const BACKUP_FOLDER_MARKER_FILE = '.cs50-backup-root.json';

export interface BackupFolderMarker {
  version: 1;
  intendedPath: string;
  createdAt: string;
}

export function folderNameMatchesExpected(dirName: string): boolean {
  return dirName === EXPECTED_BACKUP_DIR_BASENAME;
}