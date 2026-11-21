/**
 * Automated health check: build artifact, backup folder, extension popup (Playwright).
 * Usage: npm run diagnose
 *        BACKUP_DIR=/path/to/cs50-chat-backup npm run diagnose
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extDir = path.join(root, 'dist', 'chrome-mv3');
const backupDir =
  process.env.BACKUP_DIR ??
  '/mnt/work/workspace/docs/programming/cs50-chat-backup';

type Level = 'ok' | 'warn' | 'fail';
interface Finding {
  level: Level;
  check: string;
  detail: string;
}

const findings: Finding[] = [];

function record(level: Level, check: string, detail: string) {
  findings.push({ level, check, detail });
}

function checkBuild() {
  const manifestPath = path.join(extDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    record(
      'fail',
      'build',
      `Missing ${extDir}. Run: npm run build`,
    );
    return;
  }
  record('ok', 'build', extDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    permissions?: string[];
    host_permissions?: string[];
    action?: { default_popup?: string };
  };
  for (const p of ['storage', 'tabs']) {
    if (!manifest.permissions?.includes(p)) {
      record('fail', 'manifest.permissions', `Missing "${p}"`);
    }
  }
  if (!manifest.host_permissions?.some((h) => h.includes('cs50.ai'))) {
    record('fail', 'manifest.host_permissions', 'Missing cs50.ai');
  } else {
    record('ok', 'manifest', 'storage, tabs, cs50.ai host');
  }
  if (!manifest.action?.default_popup) {
    record('fail', 'manifest.action', 'No default_popup');
  }
  const popupJs = fs
    .readdirSync(path.join(extDir, 'chunks'))
    .find((f) => f.startsWith('popup-') && f.endsWith('.js'));
  if (!popupJs) {
    record('fail', 'popup bundle', 'No popup chunk in dist');
    return;
  }
  const src = fs.readFileSync(path.join(extDir, 'chunks', popupJs), 'utf8');
  if (!src.includes('showDirectoryPicker')) {
    record('warn', 'popup bundle', 'showDirectoryPicker not in bundle (file-only mode?)');
  } else {
    record('ok', 'popup bundle', 'showDirectoryPicker present');
  }
  if (!src.includes('indexedDB')) {
    record('fail', 'popup bundle', 'indexedDB storage missing');
  }
}

function checkBackupFolder() {
  if (!fs.existsSync(backupDir)) {
    record('warn', 'backup folder', `Not found: ${backupDir}`);
    return;
  }
  record('ok', 'backup folder', backupDir);
  const names = fs.readdirSync(backupDir);
  const parts = names.filter((n) => /^part-\d{3}\.md$/.test(n));
  const hasManifest = names.includes('manifest.json');
  const hasIndex = names.includes('index.md');
  const hasMarker = names.includes('.cs50-backup-root.json');
  record(
    parts.length ? 'ok' : 'warn',
    'backup parts',
    parts.length ? parts.join(', ') : 'no part-NNN.md (empty or not initialized)',
  );
  record(
    hasMarker ? 'ok' : 'warn',
    'folder marker',
    hasMarker ? '.cs50-backup-root.json present' : 'run npm run ensure-backup-folder',
  );
  record(hasManifest ? 'ok' : 'warn', 'manifest.json on disk', hasManifest ? 'present' : 'missing — use Get file count in popup');
  if (hasIndex) record('ok', 'index.md', 'present');
  const archive = path.join(backupDir, 'archive');
  if (fs.existsSync(archive)) {
    const buckets = fs.readdirSync(archive).filter((d) =>
      fs.statSync(path.join(archive, d)).isDirectory(),
    );
    record('ok', 'archive', `${buckets.length} snapshot(s)`);
  }
  if (names.includes('ts') || backupDir.endsWith('/ts')) {
    record('warn', 'folder name', 'Path ends with or contains ts — ensure Chrome selected cs50-chat-backup');
  }
}

function checkUnitTests() {
  const r = spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) {
    record('ok', 'vitest', 'all tests passed');
  } else {
    record('fail', 'vitest', (r.stderr || r.stdout || 'failed').slice(0, 400));
  }
}

async function checkBrowserWithPlaywright() {
  let chromium: typeof import('playwright').chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    record(
      'warn',
      'playwright',
      'Not installed. Run: npm install -D playwright && npx playwright install chromium',
    );
    return;
  }

  if (!process.env.DISPLAY && !process.env.FORCE_HEADED_DIAGNOSE) {
    record(
      'warn',
      'playwright',
      'Skipped browser test (no DISPLAY). Extensions need headed Chromium. Run on your desktop: npm run diagnose',
    );
    return;
  }

  const profileDir = fs.mkdtempSync(path.join('/tmp', 'cs50-ext-diag-'));
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null =
    null;

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
      ],
    });

    await new Promise((r) => setTimeout(r, 2_000));
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    const extensionId = new URL(sw.url()).host;
    record('ok', 'extension load', `id=${extensionId}`);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    await popup.waitForSelector('#status', { timeout: 5_000 });
    const status = await popup.locator('#status').textContent();
    const refreshDisabled = await popup.locator('#refresh').isDisabled();
    const pickEnabled = await popup.locator('#pick-file').isEnabled();

    record(
      refreshDisabled ? 'ok' : 'warn',
      'popup initial refresh',
      refreshDisabled ? 'disabled until folder chosen (expected)' : 'enabled without folder?',
    );
    record('ok', 'popup status', (status ?? '').trim() || '(empty)');

    const apis = await popup.evaluate(() => ({
      showDirectoryPicker: 'showDirectoryPicker' in window,
      showOpenFilePicker: 'showOpenFilePicker' in window,
      chromeStorage: typeof chrome !== 'undefined' && !!chrome.storage?.local,
      indexedDB: typeof indexedDB !== 'undefined',
    }));

    for (const [k, v] of Object.entries(apis)) {
      record(
        v ? 'ok' : 'fail',
        `popup API ${k}`,
        v ? 'available' : 'MISSING — folder backup will not work',
      );
    }

    if (!apis.showDirectoryPicker) {
      record(
        'fail',
        'File System Access',
        'showDirectoryPicker false in extension popup (Chromium version or policy)',
      );
    }

    const cs50 = await context.newPage();
    let cs50Detail = '';
    try {
      const resp = await cs50.goto('https://cs50.ai/chat', {
        waitUntil: 'domcontentloaded',
        timeout: 25_000,
      });
      cs50Detail = `HTTP ${resp?.status() ?? '?'}`;
      const hasRoot = (await cs50.locator('#ddbChatText').count()) > 0;
      record(
        hasRoot ? 'ok' : 'warn',
        'cs50.ai DOM',
        hasRoot
          ? '#ddbChatText found (logged in / chat loaded)'
          : `${cs50Detail} — no #ddbChatText (login or empty chat?)`,
      );
    } catch (e) {
      record(
        'warn',
        'cs50.ai',
        e instanceof Error ? e.message : String(e),
      );
    }

    if (pickEnabled) {
      record('ok', 'pick button', 'enabled');
    }
  } catch (e) {
    record(
      'fail',
      'playwright runtime',
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    await context?.close().catch(() => undefined);
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

function printReport() {
  console.log('\n=== CS50 Backup extension diagnose ===\n');
  for (const f of findings) {
    const icon = f.level === 'ok' ? '✓' : f.level === 'warn' ? '!' : '✗';
    console.log(`[${icon}] ${f.check}: ${f.detail}`);
  }
  const fails = findings.filter((f) => f.level === 'fail').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  console.log(`\nSummary: ${fails} fail, ${warns} warn, ${findings.length} checks\n`);
  if (fails > 0) {
    console.log(
      'Likely fixes:\n' +
        '  • npm run build && reload extension in chrome://extensions\n' +
        '  • Choose folder cs50-chat-backup (name in status, not ts)\n' +
        '  • Open cs50.ai/chat logged in before Refresh\n' +
        '  • Use Chromium (not Firefox); enable File System Access\n',
    );
  }
}

async function main() {
  if (!fs.existsSync(extDir)) {
    console.log('Building extension first…');
    const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
  checkBuild();
  checkBackupFolder();
  checkUnitTests();
  await checkBrowserWithPlaywright();
  printReport();
  const exitCode = findings.some((f) => f.level === 'fail') ? 1 : 0;
  process.exit(exitCode);
}

void main();