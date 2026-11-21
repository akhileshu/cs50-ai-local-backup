# CS50.ai DOM findings

Sources (not invented selectors):

1. Live site CSS: `https://cs50.ai/static/css/styles.css`
2. CS50 Duck webview markup/CSS in [cs50/ddb50.vsix](https://github.com/cs50/ddb50.vsix) (`static/ddb.js`, `static/style.css`)

## Chat container

| Element | Selector | Role |
|---------|----------|------|
| Message list | `#ddbChatText` | Scrollable column of turns |
| Turn wrapper | `.ddbChat` | One user or assistant message |
| User turn | `.ddbChat.ddbChat-User` | Student question |
| Assistant turn | `.ddbChat.ddbChat-Duck` | Duck reply (Markdown rendered) |
| Body | `.ddbChatMessage` | Message text; may have `id="id-{uuid}"` |

The VS Code extension sets `id="id-${uuid}"` on `.ddbChatMessage` (`ddb.js`); the site uses the same class names.

## Rendering

- **User**: plain text in a `<pre>` (HTML-escaped), not Markdown.
- **Assistant**: `markdown-it` + `highlight.js` HTML inside `.ddbChatMessage`.

## Other UI

- `#ddbChatContainer`, `#ddbInput` — layout (not used for extraction).
- `#compare-container` / `.chatColumn` — compare mode; MVP reads `#ddbChatText` only.

## Virtualization / lazy load

No evidence of virtualized message lists in public assets; turns appear as direct children of `#ddbChatText`. Only messages currently in the DOM are captured—scroll to load older content if the site ever lazy-loads.

## Excluded turns

- `#id-disclaimer` (`ddbChat-Duck`) — static welcome/disclaimer; skipped so backups are user Q / ddb A only.

## Ordering trade-off (append-only backup)

Backup file is append-only. If the file already has Q1, Q2, Q4 and the page shows Q3, Q3 is written under `## Chronological gap fill` at the end with `domIndex` metadata so chronology can be reconstructed without rewriting earlier sections.