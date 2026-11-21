/**
 * Split an oversized part-001.md into part-NNN.md files at Q/A pair boundaries.
 * Usage: npx tsx scripts/rechunk-part-one.mts <backup-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_MAX_FILE_BYTES, formatPartFileName } from '../utils/constants';
import { pairByteLength } from '../utils/qa-pairs';
import { splitPairUnitsAcrossFiles, type PairWriteUnit } from '../utils/split-policy';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npx tsx scripts/rechunk-part-one.mts <backup-dir>');
  process.exit(1);
}

const sourcePath = path.join(dir, 'part-001.md');
if (!fs.existsSync(sourcePath)) {
  console.error('part-001.md not found');
  process.exit(1);
}

const text = fs.readFileSync(sourcePath, 'utf8');
const firstQ = text.search(/^### Q\d+(?: — [^\n]*)?\n/m);
if (firstQ < 0) {
  console.error('No ### Q blocks in part-001.md');
  process.exit(1);
}

const fileHeader = text.slice(0, firstQ).replace(/\s*$/, '\n');
const body = text.slice(firstQ);
const qStarts = [...body.matchAll(/^### Q\d+(?: — [^\n]*)?\n/gm)].map((m) => m.index!);

const units: PairWriteUnit[] = qStarts.map((start, i) => {
  const end = qStarts[i + 1] ?? body.length;
  const chunk = body.slice(start, end);
  const qCount = chunk.includes('### Q') ? 1 : 0;
  const aCount = /^### A\d+\n/m.test(chunk) ? 1 : 0;
  return { text: chunk, messageCount: qCount + aCount };
});

const plans = splitPairUnitsAcrossFiles({
  units,
  activeFileName: formatPartFileName(1),
  activeFileBytes: 0,
  maxFileBytes: BACKUP_MAX_FILE_BYTES,
  newFileHeader: fileHeader.endsWith('\n') ? fileHeader : `${fileHeader}\n`,
  activeFileIsEmpty: true,
});

const written: string[] = [];
for (const plan of plans) {
  const target = path.join(dir, plan.fileName);
  fs.writeFileSync(target, plan.appendText, 'utf8');
  written.push(`${plan.fileName} (${pairByteLength(plan.appendText)} bytes)`);
}

// Remove stale higher parts not touched (only if we shrink file count)
const kept = new Set(plans.map((p) => p.fileName));
for (const name of fs.readdirSync(dir)) {
  if (/^part-\d{3}\.md$/.test(name) && !kept.has(name)) {
    fs.unlinkSync(path.join(dir, name));
  }
}

console.log('Rechunked part-001 →');
written.forEach((line) => console.log(`  ${line}`));