import { describe, expect, it } from 'vitest';
import {
  buildScanFromManifestAndDisk,
  emptyManifest,
  hashFileContent,
  registerManagedFile,
} from './backup-manifest';

describe('backup-manifest', () => {
  it('counts only manifest-verified parts', () => {
    const manifest = emptyManifest();
    const text = '# Q1\n\nhello\n\n# A1\n\nworld\n';
    registerManagedFile(manifest, 'part-001.md', 'part', text);
    const scan = buildScanFromManifestAndDisk(
      manifest,
      ['part-001.md'],
      new Map([['part-001.md', text]]),
    );
    expect(scan.managedPartCount).toBe(1);
    expect(scan.unmanagedPartNames).toEqual([]);
  });

  it('flags hash mismatch', () => {
    const manifest = emptyManifest();
    const text = 'original';
    registerManagedFile(manifest, 'part-001.md', 'part', text);
    const scan = buildScanFromManifestAndDisk(
      manifest,
      ['part-001.md'],
      new Map([['part-001.md', 'edited']]),
    );
    expect(scan.managedPartCount).toBe(0);
    expect(scan.conflicts[0]?.reason).toBe('hash_mismatch');
  });

  it('adopts unregistered part files', () => {
    const manifest = emptyManifest();
    const text = 'body';
    const scan = buildScanFromManifestAndDisk(
      manifest,
      ['part-001.md'],
      new Map([['part-001.md', text]]),
      { adoptUnregistered: true },
    );
    expect(scan.managedPartCount).toBe(1);
    expect(scan.manifestCreated).toBe(true);
    expect(scan.manifest.files['part-001.md']?.contentHash).toBe(hashFileContent(text));
  });

  it('ignores part files not in manifest when not adopting', () => {
    const scan = buildScanFromManifestAndDisk(
      emptyManifest(),
      ['part-001.md'],
      new Map([['part-001.md', 'x']]),
    );
    expect(scan.managedPartCount).toBe(0);
    expect(scan.unmanagedPartNames).toEqual(['part-001.md']);
  });
});