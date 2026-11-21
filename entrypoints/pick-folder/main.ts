import { commitBackupFolderSelection } from '../../utils/commit-folder-selection';
import {
  FolderSelectionError,
  pickDirectoryFromUserGesture,
} from '../../utils/folder-selection';

const statusEl = document.querySelector('#status') as HTMLElement;
const pickBtn = document.querySelector('#pick') as HTMLButtonElement;
const closeBtn = document.querySelector('#close') as HTMLButtonElement;

pickBtn.addEventListener('click', () => void runPick());

const wantAutopick =
  new URLSearchParams(location.search).get('autopick') === '1';

if (wantAutopick) {
  void runPick({ autopickAttempt: true });
}

async function runPick(options?: { autopickAttempt?: boolean }): Promise<void> {
  pickBtn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Opening folder picker…';

  try {
    const dir = await pickDirectoryFromUserGesture();
    statusEl.textContent = `Saving “${dir.name}”…`;

    const result = await commitBackupFolderSelection(dir);
    if (!result.ok) {
      statusEl.className = 'status err';
      statusEl.textContent = result.error ?? 'Could not save folder.';
      pickBtn.disabled = false;
      return;
    }

    statusEl.className = 'status ok';
    statusEl.textContent = `Saved “${result.dirName}”. You can close this window and use the toolbar popup.`;
    closeBtn.hidden = false;
    pickBtn.hidden = true;
    window.setTimeout(() => window.close(), 1200);
  } catch (err) {
    if (err instanceof FolderSelectionError && err.code === 'aborted') {
      statusEl.textContent = 'Cancelled. Click Choose folder to try again.';
      pickBtn.disabled = false;
      return;
    }
    if (
      options?.autopickAttempt &&
      err instanceof FolderSelectionError &&
      err.code === 'not_allowed'
    ) {
      statusEl.textContent = 'Click Choose folder… then select cs50-chat-backup.';
      pickBtn.disabled = false;
      pickBtn.focus();
      return;
    }
    statusEl.className = 'status err';
    statusEl.textContent =
      err instanceof Error ? err.message : String(err);
    pickBtn.disabled = false;
  }
}

closeBtn.addEventListener('click', () => window.close());