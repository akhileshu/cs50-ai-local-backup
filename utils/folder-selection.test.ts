import { describe, expect, it } from 'vitest';
import { FolderSelectionError, mapPickerError } from './folder-selection';

describe('folder-selection errors', () => {
  it('maps AbortError', () => {
    const e = mapPickerError(new DOMException('cancel', 'AbortError'));
    expect(e.code).toBe('aborted');
  });

  it('maps NotAllowedError', () => {
    const e = mapPickerError(new DOMException('denied', 'NotAllowedError'));
    expect(e.code).toBe('not_allowed');
  });

  it('maps SecurityError', () => {
    const e = mapPickerError(new DOMException('blocked', 'SecurityError'));
    expect(e.code).toBe('security');
  });

  it('preserves FolderSelectionError', () => {
    const orig = new FolderSelectionError('indexeddb', 'fail');
    expect(mapPickerError(orig)).toBe(orig);
  });
});