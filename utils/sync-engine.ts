import { FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY } from './constants';
import { withStableIds, type ChatMessageWithStableId } from './extractor';
import { defaultHeader, gapFillSectionHeader, serializeMessageBlock } from './markdown-serialize';
import { parseBackupCorpus, parseBackupFile, type ParsedBackup } from './parse-backup';
import { groupIntoQAPairs } from './qa-pairs';
import type { FileAppendPlan, PairWriteUnit } from './split-policy';
import type { ChatMessage } from './types';

export interface AppendPlan {
  appendText: string;
  appendedCount: number;
  gapFillCount: number;
}

export interface FolderSyncPlan {
  filePlans: FileAppendPlan[];
  appendedCount: number;
  gapFillCount: number;
}

export function planSyncAppend(
  existingFileText: string,
  liveMessages: ChatMessage[],
  conversationTitle: string,
): AppendPlan {
  const stable = withStableIds(liveMessages);
  const parsed: ParsedBackup =
    existingFileText.trim().length > 0
      ? parseBackupFile(existingFileText)
      : emptyParsed();

  const missing = stable.filter(
    (m) =>
      !parsed.existingIds.has(m.stableId) &&
      !parsed.existingHashes.has(m.contentHash),
  );

  if (missing.length === 0) {
    return { appendText: '', appendedCount: 0, gapFillCount: 0 };
  }

  let text = '';
  let appendedCount = 0;
  let gapFillCount = 0;
  const inOrder: ChatMessageWithStableId[] = [];
  const gap: ChatMessageWithStableId[] = [];

  for (const msg of missing) {
    if (parsed.maxDomIndex >= 0 && msg.domIndex < parsed.maxDomIndex) {
      gap.push(msg);
    } else {
      inOrder.push(msg);
    }
  }

  inOrder.sort((a, b) => a.domIndex - b.domIndex);
  gap.sort((a, b) => a.domIndex - b.domIndex);

  if (parsed.rawBody.trim().length === 0) {
    text += defaultHeader(conversationTitle);
  }

  for (const msg of inOrder) {
    const { kind, num } = pairLabelForMessage(stable, msg);
    text += serializeMessageBlock(kind, num, msg);
    appendedCount++;
  }

  if (gap.length > 0) {
    let gapHeaderAdded = parsed.rawBody.includes('## Chronological gap fill');
    for (const msg of gap) {
      if (!gapHeaderAdded) {
        text += gapFillSectionHeader();
        gapHeaderAdded = true;
      }
      const { kind, num } = pairLabelForMessage(stable, msg);
      text += serializeMessageBlock(kind, num, msg, { gapFill: true });
      appendedCount++;
      gapFillCount++;
    }
  }

  return { appendText: text, appendedCount, gapFillCount };
}

/** Refresh backup: append to active part only (no size split; use Split Backup action). */
export function planFolderSync(
  corpusFileTexts: string[],
  activeFileText: string,
  activeFileName: string,
  liveMessages: ChatMessage[],
): FolderSyncPlan {
  const stable = withStableIds(liveMessages);
  const parsed = parsedBackupForFolderSync(corpusFileTexts, activeFileText);
  const missing = missingForFolderSync(stable, parsed);

  if (missing.length === 0) {
    return { filePlans: [], appendedCount: 0, gapFillCount: 0 };
  }

  const inOrder: ChatMessageWithStableId[] = [];
  const gap: ChatMessageWithStableId[] = [];

  for (const msg of missing) {
    if (
      !FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY &&
      parsed.maxDomIndex >= 0 &&
      msg.domIndex < parsed.maxDomIndex
    ) {
      gap.push(msg);
    } else {
      inOrder.push(msg);
    }
  }

  inOrder.sort((a, b) => a.domIndex - b.domIndex);
  gap.sort((a, b) => a.domIndex - b.domIndex);

  const title = conversationTitleFromMessages(liveMessages);
  const units: PairWriteUnit[] = [];
  let appendedCount = 0;
  let gapFillCount = 0;

  if (parsed.rawBody.trim().length === 0 && inOrder.length > 0) {
    // header added via split policy on first unit
  }

  units.push(...pairUnitsFromMessages(inOrder, stable, false, ''));
  appendedCount += inOrder.length;

  if (gap.length > 0) {
    const gapLead = parsed.rawBody.includes('## Chronological gap fill')
      ? ''
      : gapFillSectionHeader();
    units.push(...pairUnitsFromMessages(gap, stable, true, gapLead));
    appendedCount += gap.length;
    gapFillCount += gap.length;
  }

  let appendText = '';
  const activeFileIsEmpty = activeFileText.trim().length === 0;
  if (activeFileIsEmpty && units.length > 0) {
    appendText += defaultHeader(title);
  }
  appendText += units.map((u) => u.text).join('');

  const filePlans: FileAppendPlan[] = appendText
    ? [
        {
          fileName: activeFileName,
          appendText,
          createNewFile: activeFileIsEmpty,
        },
      ]
    : [];

  return { filePlans, appendedCount, gapFillCount };
}

function pairUnitsFromMessages(
  messages: ChatMessageWithStableId[],
  stable: ChatMessageWithStableId[],
  gapFill: boolean,
  prefixOnFirstPair: string,
): PairWriteUnit[] {
  const pairs = groupIntoQAPairs(messages);
  const units: PairWriteUnit[] = [];
  let prefix = prefixOnFirstPair;

  for (const pair of pairs) {
    let text = prefix;
    prefix = '';
    let messageCount = 0;
    const metaExtra = gapFill ? { gapFill: true as const } : undefined;

    if (pair.question) {
      const { kind, num } = pairLabelForMessage(stable, pair.question);
      text += serializeMessageBlock(kind, num, pair.question, metaExtra);
      messageCount++;
    }
    if (pair.answer) {
      const { kind, num } = pairLabelForMessage(stable, pair.answer);
      text += serializeMessageBlock(kind, num, pair.answer, metaExtra);
      messageCount++;
    }
    if (messageCount > 0) units.push({ text, messageCount });
  }

  return units;
}

/** Qn / An share the same n by position in the live thread (not separate file counters). */
export function pairLabelForMessage(
  liveInOrder: ChatMessageWithStableId[],
  target: ChatMessageWithStableId,
): { kind: 'Q' | 'A'; num: number } {
  let pairNum = 0;
  for (const m of liveInOrder) {
    if (m.role === 'user') {
      pairNum++;
      if (m.stableId === target.stableId) return { kind: 'Q', num: pairNum };
    } else if (m.stableId === target.stableId) {
      const num = pairNum === 0 ? 1 : pairNum;
      return { kind: 'A', num };
    }
  }
  throw new Error(`Message not found in live list: ${target.stableId}`);
}

/** Active-part mode: tail caught up when the latest live question is already in the active part. */
export function isFolderTailInSync(
  stable: ChatMessageWithStableId[],
  parsed: ParsedBackup,
): boolean {
  const lastUser = stable
    .filter((m) => m.role === 'user')
    .sort((a, b) => b.domIndex - a.domIndex)[0];
  if (!lastUser) {
    return stable.every(
      (m) =>
        parsed.existingIds.has(m.stableId) ||
        parsed.existingHashes.has(m.contentHash),
    );
  }
  return (
    parsed.existingIds.has(lastUser.stableId) ||
    parsed.existingHashes.has(lastUser.contentHash)
  );
}

function missingForFolderSync(
  stable: ChatMessageWithStableId[],
  parsed: ParsedBackup,
): ChatMessageWithStableId[] {
  if (!FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY) {
    return stable.filter(
      (m) =>
        !parsed.existingIds.has(m.stableId) &&
        !parsed.existingHashes.has(m.contentHash),
    );
  }
  if (isFolderTailInSync(stable, parsed)) return [];
  return stable.filter(
    (m) =>
      m.domIndex > parsed.maxDomIndex &&
      !parsed.existingIds.has(m.stableId) &&
      !parsed.existingHashes.has(m.contentHash),
  );
}

function parsedBackupForFolderSync(
  corpusFileTexts: string[],
  activeFileText: string,
): ParsedBackup {
  if (FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY) {
    return activeFileText.trim().length > 0
      ? parseBackupFile(activeFileText)
      : emptyParsed();
  }
  return corpusFileTexts.some((t) => t.trim().length > 0)
    ? parseBackupCorpus(corpusFileTexts)
    : emptyParsed();
}

function emptyParsed(): ParsedBackup {
  return {
    header: '',
    entries: [],
    existingIds: new Set(),
    existingHashes: new Set(),
    maxDomIndex: -1,
    rawBody: '',
  };
}

export function conversationTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser?.content) return 'CS50.ai chat';
  const line = (firstUser.content.split('\n')[0] ?? '').trim();
  if (line.length <= 60) return line;
  return line.slice(0, 57) + '...';
}