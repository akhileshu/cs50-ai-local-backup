/**
 * Split backup folder (non-destructive: archives managed parts only).
 * Usage: npx tsx scripts/run-split-backup.mts <backup-dir> [pairsPerFile]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNoConflicts,
  buildScanFromManifestAndDisk,
  clearManagedParts,
  emptyManifest,
  MANIFEST_FILE_NAME,
  parseManifestJson,
  registerManagedFile,
} from '../utils/backup-manifest';
import {
  validateSplitBackupPlan,
  planSplitBackup,
} from '../utils/split-backup';

const dir = process.argv[2];
const pairs = parseInt(process.argv[3] ?? '1', 10);
if (!dir) {
  console.error('Usage: npx tsx scripts/run-split-backup.mts <backup-dir> [pairsPerFile]');
  process.exit(1);
}

const partNames = fs
  .readdirSync(dir)
  .filter((n) => /^part-\d{3}\.md$/.test(n))
  .sort();

const texts = new Map(
  partNames.map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]),
);

let manifest = emptyManifest();
const manifestPath = path.join(dir, MANIFEST_FILE_NAME);
if (fs.existsSync(manifestPath)) {
  manifest = parseManifestJson(fs.readFileSync(manifestPath, 'utf8'));
}

const scan = buildScanFromManifestAndDisk(manifest, partNames, texts, {
  adoptUnregistered: true,
});
assertNoConflicts(scan);
manifest = scan.manifest;

const managedFiles = scan.managedPartNames.map((name) => ({
  name,
  text: texts.get(name)!,
}));

if (managedFiles.length === 0) {
  console.error('No managed part files (use manifest or adopt via extension Get file count).');
  process.exit(1);
}

const plan = planSplitBackup(managedFiles, {
  mode: 'pairs_per_file',
  pairsPerFile: pairs,
  maxMb: 10,
});
const v = validateSplitBackupPlan(plan);
if (!v.ok) {
  console.error(v.errors);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = path.join(dir, 'archive', `pre-split-${stamp}`);
fs.mkdirSync(archive, { recursive: true });

const toArchive = new Set<string>();
for (const [name, rec] of Object.entries(manifest.files)) {
  if (rec.kind === 'part' || rec.kind === 'index') toArchive.add(name);
}
if (fs.existsSync(manifestPath)) toArchive.add(MANIFEST_FILE_NAME);

for (const name of toArchive) {
  const src = path.join(dir, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(archive, name));
}

const staging = path.join(dir, `.staging-split-${stamp}`);
fs.mkdirSync(staging, { recursive: true });
for (const f of plan.files) {
  fs.writeFileSync(path.join(staging, f.fileName), f.content, 'utf8');
}
fs.writeFileSync(path.join(staging, 'index.md'), plan.indexMarkdown, 'utf8');

for (const f of plan.files) {
  fs.writeFileSync(path.join(dir, f.fileName), f.content, 'utf8');
}
fs.writeFileSync(path.join(dir, 'index.md'), plan.indexMarkdown, 'utf8');
fs.rmSync(staging, { recursive: true, force: true });

clearManagedParts(manifest);
for (const f of plan.files) {
  registerManagedFile(manifest, f.fileName, 'part', f.content);
}
registerManagedFile(manifest, 'index.md', 'index', plan.indexMarkdown);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Split OK: ${plan.files.length} parts, archive at ${archive}`);