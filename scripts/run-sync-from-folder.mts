/**
 * Dev harness: folder backup with pair-atomic size splits.
 * Usage: npx tsx scripts/run-sync-from-folder.mts <json-file> <backup-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { formatPartFileName } from '../utils/constants';
import { normalizeExtractedMessages } from '../utils/extractor';
import { planFolderSync } from '../utils/sync-engine';

const win = new Window();
globalThis.DOMParser = win.DOMParser as unknown as typeof globalThis.DOMParser;
const NodeCtor = win.Node;
(globalThis as unknown as { Node: typeof NodeCtor }).Node = NodeCtor;

const jsonPath = process.argv[2];
const dirPath = process.argv[3];
if (!jsonPath || !dirPath) {
  console.error('Usage: npx tsx scripts/run-sync-from-folder.mts <json-file> <backup-dir>');
  process.exit(1);
}

fs.mkdirSync(dirPath, { recursive: true });

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Parameters<
  typeof normalizeExtractedMessages
>[0];
const messages = normalizeExtractedMessages(raw);

const partNames = fs
  .readdirSync(dirPath)
  .filter((n) => /^part-\d{3}\.md$/.test(n))
  .sort();
const activePart = partNames[partNames.length - 1] ?? formatPartFileName(1);
const corpus = partNames.map((name) =>
  fs.readFileSync(path.join(dirPath, name), 'utf8'),
);
const activeText = partNames.length
  ? fs.readFileSync(path.join(dirPath, activePart), 'utf8')
  : '';

const plan = planFolderSync(corpus, activeText, activePart, messages);

if (plan.appendedCount === 0) {
  console.log('Nothing new to sync.');
  process.exit(0);
}

for (const filePlan of plan.filePlans) {
  const target = path.join(dirPath, filePlan.fileName);
  if (filePlan.createNewFile && !fs.existsSync(target)) {
    fs.writeFileSync(target, filePlan.appendText, 'utf8');
  } else {
    const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    fs.writeFileSync(target, prev + filePlan.appendText, 'utf8');
  }
  console.log(`Wrote ${filePlan.fileName} (+${filePlan.appendText.length} bytes)`);
}

console.log(
  `Appended ${plan.appendedCount} message(s) across ${plan.filePlans.length} part(s)`,
);