import {
  appendOrCreatePart,
  appendToFile,
  clearDirHandle,
  clearFileHandle,
  executeSplitBackupPlan,
  loadConfig,
  loadDirHandle,
  loadFileHandle,
  readManagedPartText,
  readManagedPartTexts,
  scanManagedBackup,
  readFileText,
  resolveActivePartFileName,
  saveConfig,
  saveFileHandle,
  verifyFilePermission,
} from '../../utils/file-storage';
import { assertNoConflicts } from '../../utils/backup-manifest';
import { EXPECTED_BACKUP_DIR_BASENAME } from '../../utils/backup-folder-profile';
import { FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY } from '../../utils/constants';
import { FOLDER_PICK_DONE_KEY } from '../../utils/commit-folder-selection';
import {
  ensureDirWriteAccess,
  queryDirPermission,
} from '../../utils/folder-selection';
import { verifyPickedBackupFolder } from '../../utils/verify-backup-folder';
import {
  isSplitBackupNeeded,
  planSplitBackup,
  summarizeSplitActions,
  type SplitBackupMode,
  type SplitBackupOptions,
} from '../../utils/split-backup';
import { extractMessagesFromTab } from '../../utils/tab-extract';
import {
  conversationTitleFromMessages,
  planFolderSync,
  planSyncAppend,
} from '../../utils/sync-engine';
import { flashActionFeedback } from '../../utils/action-feedback';
import type { SyncStatus } from '../../utils/types';

const statusEl = document.querySelector('#status') as HTMLElement;
const metaEl = document.querySelector('#meta') as HTMLElement;
const refreshBtn = document.querySelector('#refresh') as HTMLButtonElement;
const pickFileBtn = document.querySelector('#pick-file') as HTMLButtonElement;
const folderDiagEl = document.querySelector('#folder-diag') as HTMLElement;
const resetConfigBtn = document.querySelector('#reset-config') as HTMLButtonElement;
const splitCountBtn = document.querySelector('#split-count') as HTMLButtonElement;
const splitBtn = document.querySelector('#split-backup') as HTMLButtonElement;
const splitPairsInput = document.querySelector('#split-pairs') as HTMLInputElement;
const splitMbInput = document.querySelector('#split-mb') as HTMLInputElement;
const splitFieldPairs = document.querySelector('#split-field-pairs') as HTMLElement;
const splitFieldMb = document.querySelector('#split-field-mb') as HTMLElement;
const splitPanelEl = document.querySelector('.split-panel') as HTMLElement;

let syncing = false;
let splitting = false;
let managedPartCount = 0;
/** Managed parts that exceed the current split threshold (size or pair count). */
let splitActionCount = 0;

const FOLDER_DIAG_KEY = 'folderSelectionDiag';

async function setFolderDiag(text: string): Promise<void> {
  if (text) {
    folderDiagEl.hidden = false;
    folderDiagEl.textContent = text;
  } else {
    folderDiagEl.hidden = true;
    folderDiagEl.textContent = '';
  }
  await chrome.storage.local.set({ [FOLDER_DIAG_KEY]: text });
}

async function loadFolderDiag(): Promise<void> {
  const data = await chrome.storage.local.get(FOLDER_DIAG_KEY);
  const text = (data[FOLDER_DIAG_KEY] as string | undefined) ?? '';
  await setFolderDiag(text);
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  not_configured: 'Not configured',
  ready: 'Ready',
  syncing: 'Syncing…',
  splitting: 'Splitting…',
  synced: 'Successfully synced',
  nothing_new: 'Nothing new to sync',
  error: 'Error',
};

void init();

async function init() {
  pickFileBtn.addEventListener('click', () => {
    void openFolderPickerWindow();
  });
  resetConfigBtn.addEventListener('click', () => void resetConfiguration());
  refreshBtn.addEventListener('click', () => void refreshBackup());
  splitCountBtn.addEventListener('click', () => void runGetFileCount());
  splitBtn.addEventListener('click', () => void runSplitBackup());
  for (const el of document.querySelectorAll('input[name="split-mode"]')) {
    el.addEventListener('change', () => {
      updateSplitModeFields();
      splitActionCount = 0;
      void refreshSplitActionCountQuiet();
    });
  }
  splitPairsInput.addEventListener('change', () => {
    splitActionCount = 0;
    void refreshSplitActionCountQuiet();
  });
  splitMbInput.addEventListener('change', () => {
    splitActionCount = 0;
    void refreshSplitActionCountQuiet();
  });
  updateSplitModeFields();
  await hydrateConfigFromStoredHandle();
  folderDiagEl.hidden = true;
  await syncAfterExternalFolderPick();
  await refreshSplitActionCountQuiet();
  await renderFromConfig();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[FOLDER_PICK_DONE_KEY]) {
      void syncAfterExternalFolderPick().then(() => {
        void renderFromConfig();
        reportActionResult(pickFileBtn, true);
      });
    }
  });
}

function splitOptionsFromUi(): SplitBackupOptions {
  return {
    mode: splitMode(),
    pairsPerFile: Math.max(1, parseInt(splitPairsInput.value, 10) || 1),
    maxMb: Math.max(0.001, parseFloat(splitMbInput.value) || 10),
  };
}

async function refreshSplitActionCountQuiet(): Promise<void> {
  try {
    const dir = await loadDirHandle();
    if (!dir) {
      managedPartCount = 0;
      splitActionCount = 0;
      return;
    }
    if ((await queryDirPermission(dir, 'readwrite')) !== 'granted') {
      managedPartCount = 0;
      splitActionCount = 0;
      return;
    }
    const parts = await readManagedPartTexts(dir);
    managedPartCount = parts.length;
    splitActionCount = summarizeSplitActions(parts, splitOptionsFromUi()).actionCount;
  } catch {
    managedPartCount = 0;
    splitActionCount = 0;
  }
}

async function hydrateConfigFromStoredHandle(): Promise<void> {
  const dir = await loadDirHandle();
  if (!dir) return;
  await saveConfig({
    configured: true,
    backupMode: 'folder',
    folderName: dir.name,
    fileName: null,
  });
}

function splitMode(): SplitBackupMode {
  const checked = document.querySelector(
    'input[name="split-mode"]:checked',
  ) as HTMLInputElement | null;
  return checked?.value === 'max_mb' ? 'max_mb' : 'pairs_per_file';
}

function updateSplitModeFields() {
  const mode = splitMode();
  splitFieldPairs.classList.toggle('field-hidden', mode !== 'pairs_per_file');
  splitFieldMb.classList.toggle('field-hidden', mode !== 'max_mb');
}

function setStatus(state: SyncStatus, detail?: string) {
  statusEl.dataset.state = state;
  statusEl.textContent = detail ? `${STATUS_LABEL[state]}: ${detail}` : STATUS_LABEL[state];
}

function reportActionResult(
  trigger: HTMLElement,
  ok: boolean,
  options?: { highlightSplit?: boolean },
): void {
  const kind = ok ? 'success' : 'error';
  const targets: HTMLElement[] = [trigger];
  if (options?.highlightSplit) targets.push(splitPanelEl);
  flashActionFeedback(targets, kind);
}

async function renderFromConfig(pickedDir?: FileSystemDirectoryHandle | null) {
  const cfg = await loadConfig();
  const dir = pickedDir ?? (await loadDirHandle());
  const file = await loadFileHandle();
  const folderMode = cfg.backupMode === 'folder' || (dir !== null && file === null);

  let writePermission: PermissionState | null = null;
  if (dir) writePermission = await queryDirPermission(dir, 'readwrite');

  const nameCheck = dir ? await verifyPickedBackupFolder(dir) : null;
  const folderLinked = dir !== null && (nameCheck?.ok ?? false);
  const configured = folderMode ? folderLinked : file !== null;

  refreshBtn.disabled = !configured || syncing || splitting;
  splitCountBtn.disabled = !configured || syncing || splitting;
  splitBtn.disabled =
    !configured || syncing || splitting || splitActionCount <= 0;

  let state: SyncStatus = configured ? 'ready' : 'not_configured';
  let statusDetail: string | undefined;

  if (dir && !nameCheck?.ok) {
    state = 'error';
    statusDetail = nameCheck?.message;
  } else if (dir && writePermission === 'denied') {
    state = 'error';
    statusDetail = 'Write access denied. Choose folder again.';
  } else if (cfg.backupMode === 'file' && !file && cfg.fileName) {
    state = 'not_configured';
  } else if (folderMode && cfg.folderName && !dir) {
    state = 'not_configured';
  }

  if (!syncing && !splitting) {
    setStatus(state, statusDetail);
  }
  const parts: string[] = [];
  if (dir) {
    parts.push(`Folder: ${dir.name}`);
    if (cfg.activePart) parts.push(`Part: ${cfg.activePart}`);
  } else if (cfg.backupMode === 'folder' && cfg.folderName) {
    parts.push(`Folder: ${cfg.folderName} (unlinked)`);
  } else if (cfg.fileName) parts.push(`File: ${cfg.fileName}`);
  if (cfg.lastBackupIso) parts.push(`Last backup: ${new Date(cfg.lastBackupIso).toLocaleString()}`);
  if (cfg.lastNewCount > 0) parts.push(`Last sync: +${cfg.lastNewCount} messages`);
  if (cfg.backupMode === 'folder' && managedPartCount > 0) {
    parts.push(`Managed parts: ${managedPartCount}`);
    const opts = splitOptionsFromUi();
    const overLabel =
      opts.mode === 'max_mb'
        ? `Over ${opts.maxMb} MB`
        : `Over ${opts.pairsPerFile} pair(s)/file`;
    parts.push(`${overLabel}: ${splitActionCount}`);
  }
  metaEl.textContent = parts.join(' · ');
}

async function runGetFileCount() {
  if (syncing || splitting) return;
  splitCountBtn.disabled = true;
  let countOk: boolean | null = null;
  try {
    const dir = await loadDirHandle();
    if (!dir) throw new Error('Choose a backup folder first.');
    if (!(await ensureDirWriteAccess(dir, { requestIfNeeded: true }))) {
      throw new Error('Could not get write access. Allow the prompt or pick the folder again.');
    }

    const scan = await scanManagedBackup(dir, { adoptUnregistered: true });
    assertNoConflicts(scan);
    const parts = await readManagedPartTexts(dir);
    managedPartCount = parts.length;
    const opts = splitOptionsFromUi();
    const summary = summarizeSplitActions(parts, opts);
    splitActionCount = summary.actionCount;

    countOk = true;
    await renderFromConfig();
  } catch (err) {
    managedPartCount = 0;
    splitActionCount = 0;
    setStatus('error', err instanceof Error ? err.message : String(err));
    countOk = false;
    await renderFromConfig();
  } finally {
    const cfg = await loadConfig();
    const dir = await loadDirHandle();
    const folderOk =
      cfg.backupMode === 'folder' && dir !== null;
    splitCountBtn.disabled = !folderOk || syncing || splitting;
    if (countOk !== null) {
      reportActionResult(splitCountBtn, countOk, { highlightSplit: true });
    }
  }
}

async function resetConfiguration(): Promise<void> {
  await clearDirHandle();
  await clearFileHandle();
  managedPartCount = 0;
  await saveConfig({
    configured: false,
    folderName: null,
    fileName: null,
    activePart: null,
    lastNewCount: 0,
  });
  await renderFromConfig();
  setStatus('not_configured', 'Configuration cleared. Choose cs50-chat-backup.');
  reportActionResult(resetConfigBtn, true);
}

/** Toolbar popup closes when the OS folder dialog opens — pick in a small extension window. */
async function openFolderPickerWindow(): Promise<void> {
  const pickUrl = chrome.runtime.getURL('/pick-folder.html?autopick=1');
  const pickBase = chrome.runtime.getURL('/pick-folder.html');
  const existing = await chrome.windows.getAll({ populate: true });
  const already = existing.find((w) =>
    w.tabs?.some(
      (t) => t.url === pickUrl || t.url?.startsWith(`${pickBase}?`),
    ),
  );
  if (already?.id) {
    await chrome.windows.update(already.id, { focused: true });
    const tab = already.tabs?.find((t) => t.url?.startsWith(pickBase));
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url: pickUrl });
    }
    return;
  }

  await chrome.windows.create({
    url: pickUrl,
    type: 'popup',
    width: 400,
    height: 280,
    focused: true,
  });
}

async function syncAfterExternalFolderPick(): Promise<void> {
  const data = await chrome.storage.local.get(FOLDER_PICK_DONE_KEY);
  if (!data[FOLDER_PICK_DONE_KEY]) return;
  managedPartCount = 0;
  splitActionCount = 0;
  await refreshSplitActionCountQuiet();
  await renderFromConfig();
}

async function findCs50Tab(): Promise<chrome.tabs.Tab> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id && active.url?.includes('cs50.ai')) return active;

  const tabs = await chrome.tabs.query({ url: 'https://cs50.ai/*' });
  const chat = tabs.find((t) => t.url?.includes('/chat')) ?? tabs[0];
  if (!chat?.id) {
    throw new Error('Open https://cs50.ai/chat and log in, then try again.');
  }
  await chrome.tabs.update(chat.id, { active: true });
  return chat;
}

async function runSplitBackup() {
  if (splitting || syncing) return;
  splitting = true;
  splitBtn.disabled = true;
  refreshBtn.disabled = true;
  setStatus('splitting');
  let splitOk: boolean | null = null;

  try {
    const dir = await loadDirHandle();
    if (!dir) throw new Error('Choose a backup folder first.');
    if (!(await ensureDirWriteAccess(dir, { requestIfNeeded: true }))) {
      throw new Error('Could not get write access. Allow the prompt or pick the folder again.');
    }

    const parts = await readManagedPartTexts(dir);
    if (parts.length === 0) {
      throw new Error('No managed part files. Use Get file count first.');
    }

    const mode = splitMode();
    const options = {
      mode,
      pairsPerFile: Math.max(1, parseInt(splitPairsInput.value, 10) || 1),
      maxMb: Math.max(0.001, parseFloat(splitMbInput.value) || 10),
    };

    if (!isSplitBackupNeeded(parts, options)) {
      splitActionCount = 0;
      splitOk = true;
      await renderFromConfig();
      return;
    }

    const plan = planSplitBackup(parts, options);

    await executeSplitBackupPlan(dir, plan);
    await refreshSplitActionCountQuiet();
    await saveConfig({
      activePart: plan.files[plan.files.length - 1]!.fileName,
    });
    splitOk = true;
    await renderFromConfig();
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : String(err));
    splitOk = false;
    await renderFromConfig();
  } finally {
    splitting = false;
    refreshBtn.disabled = false;
    await renderFromConfig();
    if (splitOk !== null) {
      reportActionResult(splitBtn, splitOk, { highlightSplit: true });
    }
  }
}

async function refreshBackup() {
  if (syncing || splitting) return;
  syncing = true;
  refreshBtn.disabled = true;
  setStatus('syncing');
  let refreshOk: boolean | null = null;

  try {
    const cfg = await loadConfig();
    const tab = await findCs50Tab();
    if (cfg.backupMode === 'folder' && cfg.folderName !== EXPECTED_BACKUP_DIR_BASENAME) {
      throw new Error(
        `Wrong backup folder “${cfg.folderName}”. Choose ${EXPECTED_BACKUP_DIR_BASENAME}.`,
      );
    }

    const response = await extractMessagesFromTab(tab.id!);

    if (!response.ok || !response.messages) {
      throw new Error(response.error ?? 'Extract failed.');
    }

    const now = new Date().toISOString();

    if (cfg.backupMode === 'folder') {
      const dir = await loadDirHandle();
      if (!dir) throw new Error('Backup folder not configured.');
      if (!(await ensureDirWriteAccess(dir, { requestIfNeeded: true }))) {
        throw new Error('Could not get write access. Allow the prompt or pick the folder again.');
      }

      const preScan = await scanManagedBackup(dir);
      if (preScan.unmanagedPartNames.length > 0 && preScan.managedPartCount === 0) {
        throw new Error(
          'Part files exist but are not in manifest. Use Get file count to register them.',
        );
      }

      const activePart = await resolveActivePartFileName(dir);
      let corpusTexts: string[];
      let activeText: string;
      if (FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY) {
        activeText = await readManagedPartText(dir, activePart).catch(() => '');
        corpusTexts = [];
      } else {
        const parts = await readManagedPartTexts(dir);
        activeText =
          parts.find((p) => p.name === activePart)?.text ??
          (parts.length ? parts[parts.length - 1]!.text : '');
        corpusTexts = parts.map((p) => p.text);
      }

      const plan = planFolderSync(
        corpusTexts,
        activeText,
        activePart,
        response.messages,
      );

      if (plan.appendedCount === 0) {
        await saveConfig({ lastNewCount: 0 });
        refreshOk = true;
        await renderFromConfig();
        return;
      }

      for (const filePlan of plan.filePlans) {
        await appendOrCreatePart(
          dir,
          filePlan.fileName,
          filePlan.appendText,
          filePlan.createNewFile,
        );
      }

      const latestPart = plan.filePlans[plan.filePlans.length - 1]!.fileName;
      await saveConfig({
        lastBackupIso: now,
        lastNewCount: plan.appendedCount,
        configured: true,
        activePart: latestPart,
        folderName: dir.name,
      });
      refreshOk = true;
    } else {
      const handle = await loadFileHandle();
      if (!handle) throw new Error('Backup file not configured.');
      if (!(await verifyFilePermission(handle, true))) {
        throw new Error('Cannot write to backup file. Re-select the file.');
      }

      const existing = await readFileText(handle);
      const title = conversationTitleFromMessages(response.messages);
      const plan = planSyncAppend(existing, response.messages, title);

      if (plan.appendedCount === 0) {
        await saveConfig({ lastNewCount: 0 });
        refreshOk = true;
        await renderFromConfig();
        return;
      }

      await appendToFile(handle, plan.appendText);
      await saveConfig({
        lastBackupIso: now,
        lastNewCount: plan.appendedCount,
        configured: true,
        fileName: handle.name,
      });
      refreshOk = true;
    }

    await renderFromConfig();
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : String(err));
    refreshOk = false;
  } finally {
    syncing = false;
    const cfg = await loadConfig();
    const dir = await loadDirHandle();
    const file = await loadFileHandle();
    const ok =
      cfg.configured &&
      (cfg.backupMode === 'folder' ? dir !== null : file !== null);
    refreshBtn.disabled = !ok;
    if (refreshOk !== null) {
      reportActionResult(refreshBtn, refreshOk);
    }
  }
}