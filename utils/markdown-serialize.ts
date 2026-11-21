import type { BackupMeta } from './parse-backup';
import type { ChatMessageWithStableId } from './extractor';
import { normalizeQuestionHeading } from './question-heading';

const FILE_HEADER = `# CS50.ai Conversation Backup

> Append-only backup. Message metadata is in HTML comments. Out-of-order inserts use the "Chronological gap fill" section (see DOM_FINDINGS.md).

`;

export function defaultHeader(conversationTitle: string): string {
  return `${FILE_HEADER}## Conversation: ${conversationTitle}\n`;
}

export function serializeMessageBlock(
  kind: 'Q' | 'A',
  labelNum: number,
  message: ChatMessageWithStableId,
  metaExtra?: Partial<BackupMeta>,
): string {
  const meta: BackupMeta = {
    id: message.stableId,
    role: message.role,
    domIndex: message.domIndex,
    contentHash: message.contentHash,
    ...metaExtra,
  };
  const heading =
    kind === 'Q'
      ? (() => {
          const summary = normalizeQuestionHeading(message.content);
          return summary
            ? `### Q${labelNum} — ${summary}\n\n`
            : `### Q${labelNum}\n\n`;
        })()
      : `### ${kind}${labelNum}\n\n`;
  const body = message.content.trim() + '\n\n';
  const comment = `<!-- cs50-backup-meta: ${JSON.stringify(meta)} -->\n\n`;
  return heading + body + comment;
}

export function gapFillSectionHeader(): string {
  return `\n## Chronological gap fill\n\n> Messages discovered after later turns were already backed up. \`domIndex\` reflects true chat order.\n\n`;
}