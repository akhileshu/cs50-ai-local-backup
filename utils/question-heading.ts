/** Scan line after `### Qn` — optional ` — summary` (not used for dedup). */
export const Q_HEADING_LINE_RE = /^### (Q\d+)(?: — [^\n]*)?\n/m;
/** Locate first Q block in a file. */
export const Q_HEADING_FIRST_RE = /^### Q\d+(?: — [^\n]*)?\n/m;
export const Q_HEADING_START_RE = /^### Q\d+(?: — [^\n]*)?\n/gm;

export const QUESTION_HEADING_MAX_LEN = 80;

/** Concise one-line title for the `### Qn — …` line; body keeps full original text. */
export function normalizeQuestionHeading(question: string): string {
  const oneLine = question
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return '';
  if (oneLine.length <= QUESTION_HEADING_MAX_LEN) return oneLine;
  return `${oneLine.slice(0, QUESTION_HEADING_MAX_LEN - 3).trimEnd()}...`;
}