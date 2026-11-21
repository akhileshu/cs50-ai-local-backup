import { describe, expect, it } from 'vitest';
import { FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY } from './constants';
import { planFolderSync, planSyncAppend } from './sync-engine';
import type { ChatMessage } from './types';

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content' | 'domIndex'>,
): ChatMessage {
  return {
    id: partial.id ?? null,
    role: partial.role,
    content: partial.content,
    contentHash: partial.contentHash ?? `h-${partial.domIndex}`,
    domIndex: partial.domIndex,
  };
}

describe('planSyncAppend', () => {
  it('appends only missing messages', () => {
    const existing = `# CS50.ai Conversation Backup

## Conversation: test

### Q1

hello

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":0,"contentHash":"h0"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'hello', domIndex: 0, contentHash: 'h0' }),
      msg({ id: 'a1', role: 'assistant', content: 'hi', domIndex: 1, contentHash: 'h1' }),
    ];
    const plan = planSyncAppend(existing, live, 'test');
    expect(plan.appendedCount).toBe(1);
    expect(plan.appendText).toContain('### A1');
    expect(plan.appendText).not.toContain('### Q1');
  });

  it('is idempotent on second sync', () => {
    const existing = `# CS50.ai Conversation Backup

## Conversation: test

### Q1

q

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":0,"contentHash":"hq"} -->

### A1

a

<!-- cs50-backup-meta: {"id":"a1","role":"assistant","domIndex":1,"contentHash":"ha"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'q', domIndex: 0, contentHash: 'hq' }),
      msg({ id: 'a1', role: 'assistant', content: 'a', domIndex: 1, contentHash: 'ha' }),
    ];
    const plan = planSyncAppend(existing, live, 'test');
    expect(plan.appendedCount).toBe(0);
  });

  it('labels first answer A1 after Q1 (not A2)', () => {
    const existing = `# CS50.ai Conversation Backup

## Conversation: test

### Q1

question

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":1,"contentHash":"hq"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'question', domIndex: 1, contentHash: 'hq' }),
      msg({
        id: 'a1',
        role: 'assistant',
        content: 'answer',
        domIndex: 2,
        contentHash: 'ha',
      }),
    ];
    const plan = planSyncAppend(existing, live, 'test');
    expect(plan.appendText).toContain('### A1');
    expect(plan.appendText).not.toMatch(/^### A2/m);
  });

  it('folder sync: tail in sync when last Q is in active part (not full corpus)', () => {
    const olderOnly = `# CS50.ai Conversation Backup

## Conversation: test

### Q1

only in part-001

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":0,"contentHash":"h0"} -->

`;
    const active = `# CS50.ai Conversation Backup

## Conversation: test

### Q2

in active part

<!-- cs50-backup-meta: {"id":"u2","role":"user","domIndex":1,"contentHash":"h1"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'only in part-001', domIndex: 0, contentHash: 'h0' }),
      msg({ id: 'u2', role: 'user', content: 'in active part', domIndex: 1, contentHash: 'h1' }),
    ];
    const plan = planFolderSync([olderOnly], active, 'part-002.md', live);
    if (FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY) {
      expect(plan.appendedCount).toBe(0);
    } else {
      expect(plan.appendedCount).toBe(0);
    }
  });

  it('folder sync: part-004 with Q4 only does not re-append Q1–Q3', () => {
    const q4Only = `# backup

### Q4 — summary

question four

<!-- cs50-backup-meta: {"id":"u4","role":"user","domIndex":3,"contentHash":"h4"} -->

### A4

answer four

<!-- cs50-backup-meta: {"id":"a4","role":"assistant","domIndex":4,"contentHash":"h4a"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'q1', domIndex: 0, contentHash: 'h0' }),
      msg({ id: 'a1', role: 'assistant', content: 'a1', domIndex: 1, contentHash: 'h0a' }),
      msg({ id: 'u2', role: 'user', content: 'q2', domIndex: 2, contentHash: 'h1' }),
      msg({ id: 'u3', role: 'user', content: 'q3', domIndex: 3, contentHash: 'h2' }),
      msg({ id: 'u4', role: 'user', content: 'question four', domIndex: 4, contentHash: 'h4' }),
      msg({ id: 'a4', role: 'assistant', content: 'answer four', domIndex: 5, contentHash: 'h4a' }),
    ];
    const plan = planFolderSync([], q4Only, 'part-004.md', live);
    expect(plan.appendedCount).toBe(0);
  });

  it('folder sync: appends only after active tail when new messages arrive', () => {
    const q4Only = `### Q4

q4

<!-- cs50-backup-meta: {"id":"u4","role":"user","domIndex":3,"contentHash":"h4"} -->

`;
    const live = [
      msg({ id: 'u4', role: 'user', content: 'q4', domIndex: 3, contentHash: 'h4' }),
      msg({ id: 'u5', role: 'user', content: 'q5', domIndex: 4, contentHash: 'h5' }),
    ];
    const plan = planFolderSync([], q4Only, 'part-004.md', live);
    if (FOLDER_SYNC_DEDUP_ACTIVE_PART_ONLY) {
      expect(plan.appendedCount).toBe(1);
      expect(plan.filePlans[0]?.appendText).toContain('q5');
    }
  });

  it('routes lower domIndex to gap fill', () => {
    const existing = `# CS50.ai Conversation Backup

## Conversation: test

### Q1

one

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":0,"contentHash":"h0"} -->

### Q2

three

<!-- cs50-backup-meta: {"id":"u3","role":"user","domIndex":2,"contentHash":"h2"} -->

`;
    const live = [
      msg({ id: 'u1', role: 'user', content: 'one', domIndex: 0, contentHash: 'h0' }),
      msg({ id: 'u2', role: 'user', content: 'two', domIndex: 1, contentHash: 'h1' }),
      msg({ id: 'u3', role: 'user', content: 'three', domIndex: 2, contentHash: 'h2' }),
    ];
    const plan = planSyncAppend(existing, live, 'test');
    expect(plan.gapFillCount).toBe(1);
    expect(plan.appendText).toContain('Chronological gap fill');
    expect(plan.appendText).toContain('two');
  });
});