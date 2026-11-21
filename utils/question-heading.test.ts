import { describe, expect, it } from 'vitest';
import { serializeMessageBlock } from './markdown-serialize';
import { extractPairChunksFromText } from './parse-markdown-pairs';
import { normalizeQuestionHeading, QUESTION_HEADING_MAX_LEN } from './question-heading';
import type { ChatMessageWithStableId } from './extractor';

describe('normalizeQuestionHeading', () => {
  it('collapses whitespace to one line', () => {
    expect(normalizeQuestionHeading('What is\nthe time?')).toBe('What is the time?');
  });

  it('truncates with ellipsis', () => {
    const long = 'a'.repeat(QUESTION_HEADING_MAX_LEN + 10);
    const t = normalizeQuestionHeading(long);
    expect(t.endsWith('...')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(QUESTION_HEADING_MAX_LEN);
  });
});

describe('serializeMessageBlock', () => {
  const q = (content: string): ChatMessageWithStableId => ({
    stableId: 'u1',
    id: 'u1',
    role: 'user',
    content,
    contentHash: 'hq',
    domIndex: 0,
  });

  it('adds summary line for questions only', () => {
    const block = serializeMessageBlock('Q', 1, q("What's the current time?"));
    expect(block).toMatch(/^### Q1 — What's the current time\?\n\nWhat's the current time\?\n\n/);
    const blockA = serializeMessageBlock(
      'A',
      1,
      { ...q('answer'), role: 'assistant', stableId: 'a1', id: 'a1' },
    );
    expect(blockA.startsWith('### A1\n\n')).toBe(true);
  });

  it('pairs parser accepts summarized headings', () => {
    const block = serializeMessageBlock('Q', 1, q('hello'));
    const chunks = extractPairChunksFromText(block + '### A1\n\nhi\n\n');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.qLabel).toBe('Q1');
  });
});