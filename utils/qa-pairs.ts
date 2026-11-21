import type { ChatMessageWithStableId } from './extractor';

export interface QAPair {
  question?: ChatMessageWithStableId;
  answer?: ChatMessageWithStableId;
}

/** Group ordered messages into Q→A pairs (never split a pair across files). */
export function groupIntoQAPairs(messages: ChatMessageWithStableId[]): QAPair[] {
  const pairs: QAPair[] = [];
  let open: QAPair | null = null;

  for (const m of messages) {
    if (m.role === 'user') {
      if (open && (open.question || open.answer)) pairs.push(open);
      open = { question: m };
      continue;
    }
    if (!open) open = {};
    open.answer = m;
    pairs.push(open);
    open = null;
  }

  if (open && (open.question || open.answer)) pairs.push(open);
  return pairs;
}

export function pairByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}