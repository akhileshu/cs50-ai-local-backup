/**
 * Dev harness: apply live extraction JSON to a backup file (same logic as popup).
 * Usage: npx tsx scripts/run-sync-from-json.mts <json-file> <backup-md-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

const win = new Window();
globalThis.DOMParser = win.DOMParser as unknown as typeof globalThis.DOMParser;
// happy-dom node constants for html-to-markdown
const NodeCtor = win.Node;
(globalThis as unknown as { Node: typeof NodeCtor }).Node = NodeCtor;
import { normalizeExtractedMessages } from '../utils/extractor';
import { planSyncAppend, conversationTitleFromMessages } from '../utils/sync-engine';

const jsonPath = process.argv[2];
const mdPath = process.argv[3];
if (!jsonPath || !mdPath) {
  console.error('Usage: npx tsx scripts/run-sync-from-json.mts <json-file> <backup-md-path>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Parameters<
  typeof normalizeExtractedMessages
>[0];
const messages = normalizeExtractedMessages(raw);
const existing = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
const title = conversationTitleFromMessages(messages);
const plan = planSyncAppend(existing, messages, title);

if (plan.appendedCount === 0) {
  console.log('Nothing new to sync.');
  process.exit(0);
}

fs.writeFileSync(mdPath, existing + plan.appendText, 'utf8');
console.log(
  `Appended ${plan.appendedCount} message(s) to ${path.resolve(mdPath)} (gap fill: ${plan.gapFillCount})`,
);