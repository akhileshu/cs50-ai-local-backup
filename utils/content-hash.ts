import type { MessageRole } from './types';

/** FNV-1a 32-bit — sync-safe in content scripts without async crypto. */
export function contentHash(input: string): string {
  let h = 0x811c9dc5;
  const normalized = input.replace(/\r\n/g, '\n').trim();
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stableMessageId(
  id: string | null,
  role: MessageRole,
  contentHashValue: string,
  domIndex: number,
): string {
  if (id) return id;
  return `hash-${role}-${domIndex}-${contentHashValue}`;
}
