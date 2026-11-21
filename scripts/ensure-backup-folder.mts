/**
 * Create backup dir + marker so the extension can confirm the correct folder after pick.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_FOLDER_MARKER_FILE,
  EXPECTED_BACKUP_PATH,
} from '../utils/backup-folder-profile';

const dir = process.env.BACKUP_DIR ?? EXPECTED_BACKUP_PATH;
fs.mkdirSync(dir, { recursive: true });

const marker = {
  version: 1 as const,
  intendedPath: dir.replace(/\/+$/, ''),
  createdAt: new Date().toISOString(),
};

const markerPath = path.join(dir, BACKUP_FOLDER_MARKER_FILE);
fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');

console.log('OK:', dir);
console.log('Marker:', markerPath);
console.log('In Chrome: Choose backup folder → select this folder (basename cs50-chat-backup).');