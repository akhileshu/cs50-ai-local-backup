# Build: CS50.ai Local Chat Backup Chrome Extension

## Objective

Build a lightweight Chrome extension that backs up CS50.ai conversations to a Markdown file on the local filesystem.

Target: https://cs50.ai/chat

The user should be able to click **Refresh Backup** and have all missing question-answer pairs synchronized to a local file without losing existing data.

## Technology

- WXT
- TypeScript
- Chrome Manifest V3
- Vanilla TypeScript (avoid React unless necessary)
- IndexedDB for persistent file-handle storage
- File System Access API for filesystem access

## User Experience

The extension should provide:

1. A simple popup or side panel.
2. A button named "Refresh Backup".
3. File selection/configuration on first use.
4. Backup status:
   - Not configured
   - Ready
   - Syncing
   - Successfully synced
   - Nothing new to sync
   - Error
5. Last backup timestamp.
6. Number of newly backed-up messages.

## Core Workflow

When Refresh Backup is clicked:

1. Identify the active CS50.ai tab.
2. Extract all currently available question-answer pairs.
3. Preserve their original conversation order.
4. Identify existing backed-up messages.
5. Detect missing messages using stable IDs where available, otherwise content hashes.
6. Append only missing entries.
7. Verify the write completed successfully.
8. Display a sync summary.

## Critical Data Integrity Requirements

- Never delete existing backup content.
- Never truncate the file.
- Never overwrite existing conversation entries.
- Repeated syncs must be idempotent.
- Handle partial failures safely.
- Handle missing or inaccessible file permissions.
- Prevent concurrent sync operations.
- Do not mark messages as backed up before a successful write.

## Ordering

Preserve the original conversation order.

Consider this case:

Existing backup:
Q1, Q2, Q4

Current chat:
Q1, Q2, Q3, Q4

Do not silently append Q3 after Q4 and claim chronological order is preserved.

Design a safe strategy for handling out-of-order discoveries. If maintaining a strictly append-only file cannot satisfy chronological ordering, explicitly document the trade-off and propose a safe alternative.

## DOM Extraction

Before implementing extraction:

1. Inspect the actual CS50.ai page DOM.
2. Identify user-message and assistant-response containers.
3. Inspect how message IDs are represented.
4. Determine whether conversations are virtualized or lazily loaded.
5. Identify how code blocks, Markdown, and multiline answers are rendered.
6. Determine whether multiple conversations can exist.

Do not invent CSS selectors.

Keep extraction logic isolated from synchronization and filesystem logic.

## Suggested Markdown Structure

# CS50.ai Conversation Backup

## Conversation: Example

### Q1
Question content...

### A1
Answer content...

Include stable message identifiers and timestamps where available.

Preserve code blocks and Markdown formatting.

## Architecture

Keep responsibilities separate:

- content-script: DOM extraction
- extractor: conversation parsing and normalization
- sync-engine: comparison, deduplication and ordering
- file-storage: file handles and safe writes
- popup/sidepanel: user interface

## Development Process

1. Inspect the website and document findings.
2. Initialize WXT.
3. Implement DOM extraction independently.
4. Implement Markdown serialization.
5. Implement file selection and persistence.
6. Implement incremental synchronization.
7. Add error handling and tests.
8. Test manually against the real CS50.ai website.

## Scope Restrictions

- No backend.
- No database server.
- No cloud synchronization.
- No authentication.
- No unnecessary abstractions.
- No automatic background syncing in the MVP.

Build the smallest reliable implementation.

Before coding, present the proposed architecture, DOM findings, filesystem strategy, and identified risks. Then implement incrementally.

use folder - /mnt/work/workspace/docs/programming/cs50-chat-backup (`part-NNN.md` with size splits; see BACKUP_INVARIANTS.md)

## Mandatory split invariants (implementation)

- Never split between a question and its answer.
- Every new part file starts with a complete `### Q…` (and its `### A…` in the same file when present).
- Split only between completed Q/A pairs.
- If one pair exceeds the size threshold, allow the file to exceed rather than breaking the pair.

**Split Backup** (popup, not refresh): pair-safe sharding + `index.md`; originals archived under `archive/pre-split-*`.

Test: set “Q&A pairs per file” to `1` in the popup to split a 2-pair backup into two files.