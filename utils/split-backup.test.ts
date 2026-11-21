import { describe, expect, it } from 'vitest';
import {
  isSplitBackupNeeded,
  planSplitBackup,
  summarizeSplitActions,
  validateSplitBackupPlan,
} from './split-backup';

const corpus = [
  {
    name: 'part-001.md',
    text: `# H

## Conversation: t
### Q1

q1

<!-- cs50-backup-meta: {"id":"u1","role":"user","domIndex":1,"contentHash":"a"} -->

### A1

a1

<!-- cs50-backup-meta: {"id":"a1","role":"assistant","domIndex":2,"contentHash":"b"} -->

### Q2

q2

<!-- cs50-backup-meta: {"id":"u2","role":"user","domIndex":3,"contentHash":"c"} -->

### A2

a2

<!-- cs50-backup-meta: {"id":"a2","role":"assistant","domIndex":4,"contentHash":"d"} -->

`,
  },
];

describe('planSplitBackup', () => {
  it('splits by pairs per file without breaking Q/A', () => {
    const plan = planSplitBackup(corpus, {
      mode: 'pairs_per_file',
      pairsPerFile: 1,
      maxMb: 10,
    });
    expect(plan.files).toHaveLength(2);
    expect(validateSplitBackupPlan(plan).ok).toBe(true);
    expect(plan.indexMarkdown).toContain('part-001.md');
    expect(plan.files[0]!.content).toMatch(/### Q1[\s\S]*### A1/);
    expect(plan.files[1]!.content).toMatch(/### Q2[\s\S]*### A2/);
  });

  it('max_mb: no split when every part is under the limit', () => {
    const small = [
      { name: 'part-001.md', text: corpus[0]!.text },
      { name: 'part-002.md', text: '### Q9\n\nx\n\n### A9\n\ny\n\n' },
    ];
    const opts = { mode: 'max_mb' as const, pairsPerFile: 1, maxMb: 10 };
    expect(isSplitBackupNeeded(small, opts)).toBe(false);
    expect(summarizeSplitActions(small, opts).actionCount).toBe(0);
    const plan = planSplitBackup(small, opts);
    expect(plan.files).toHaveLength(2);
    expect(validateSplitBackupPlan(plan).ok).toBe(true);
  });

  it('max_mb: split when a part exceeds the limit', () => {
    const big = 'x'.repeat(11 * 1024 * 1024);
    expect(
      isSplitBackupNeeded(
        [{ name: 'part-001.md', text: `# H\n\n${big}\n\n### Q1\n\nq\n\n` }],
        { mode: 'max_mb', pairsPerFile: 1, maxMb: 10 },
      ),
    ).toBe(true);
  });
});