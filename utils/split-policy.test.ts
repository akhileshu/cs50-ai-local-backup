import { describe, expect, it } from 'vitest';
import { formatPartFileName } from './constants';
import { pairByteLength } from './qa-pairs';
import { splitPairUnitsAcrossFiles } from './split-policy';

const HEADER = '# Header\n\n## Conversation: test\n';

describe('splitPairUnitsAcrossFiles', () => {
  it('keeps Q and A in the same file unit', () => {
    const unit = { text: '### Q1\n\nq\n\n### A1\n\na\n\n', messageCount: 2 };
    const plans = splitPairUnitsAcrossFiles({
      units: [unit],
      activeFileName: formatPartFileName(1),
      activeFileBytes: 0,
      maxFileBytes: 10_000,
      newFileHeader: HEADER,
      activeFileIsEmpty: true,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.appendText).toContain('### Q1');
    expect(plans[0]!.appendText).toContain('### A1');
  });

  it('starts a new part between pairs when over max size', () => {
    const pair1 = { text: 'x'.repeat(900), messageCount: 2 };
    const pair2 = { text: 'y'.repeat(900), messageCount: 2 };
    const plans = splitPairUnitsAcrossFiles({
      units: [pair1, pair2],
      activeFileName: formatPartFileName(1),
      activeFileBytes: 900,
      maxFileBytes: 1500,
      newFileHeader: HEADER,
      activeFileIsEmpty: false,
    });
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.some((p) => p.fileName === formatPartFileName(2))).toBe(true);
  });

  it('allows a single pair to exceed max without splitting the pair', () => {
    const huge = { text: 'z'.repeat(5000), messageCount: 2 };
    const plans = splitPairUnitsAcrossFiles({
      units: [huge],
      activeFileName: formatPartFileName(1),
      activeFileBytes: 100,
      maxFileBytes: 2000,
      newFileHeader: HEADER,
      activeFileIsEmpty: false,
    });
    expect(plans).toHaveLength(1);
    expect(pairByteLength(plans[0]!.appendText)).toBeGreaterThan(2000);
  });
});