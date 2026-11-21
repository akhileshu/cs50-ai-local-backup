# Backup invariants (mandatory)

## Refresh vs Split Backup

- **Refresh Backup** appends new chat turns to the latest `part-NNN.md` only (no automatic size split).
- **Split Backup** (separate action) re-shards existing `part-*.md` content into `part-001.md`, … + `index.md`.

## Split Backup (mandatory)

1. Never split between Q and A.
2. Split only between complete Q/A pairs.
3. Preserve original ordering and content (fingerprint validation).
4. Stage → verify → archive originals to `archive/pre-split-<timestamp>/` → write new parts (no silent loss).
5. Generate `index.md` with file names and Q/A ranges.
6. Original parts remain in `archive/` until you delete them.

## Q/A pair atomicity

- **Never** split between a question and its matching answer.
- Each **new part file** must begin with the standard header, then a **complete** `### Q…` (and its `### A…` in the same file when present).
- Split **only** between completed Q/A pairs.
- If one pair’s serialized size exceeds the byte cap, **allow the file to exceed the cap** rather than breaking the pair.

## Dedup

- Scan **all** `part-*.md` files in the folder for `cs50-backup-meta` ids/hashes before appending.