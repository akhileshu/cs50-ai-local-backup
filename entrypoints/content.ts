import {
  ASSISTANT_TURN_CLASS,
  CHAT_ROOT_SELECTOR,
  MESSAGE_BODY_SELECTOR,
  TURN_SELECTOR,
  USER_TURN_CLASS,
  normalizeExtractedMessages,
} from '../utils/extractor';
import { EXTRACT_MESSAGES, PING_CONTENT, type RawTurn } from '../utils/messages';
import type { MessageRole } from '../utils/types';

const CONTENT_LOADED = '__cs50BackupContentLoaded';

export default defineContentScript({
  matches: ['https://cs50.ai/*'],
  runAt: 'document_idle',
  main() {
    if ((globalThis as Record<string, unknown>)[CONTENT_LOADED]) return;
    (globalThis as Record<string, unknown>)[CONTENT_LOADED] = true;

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === PING_CONTENT) {
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type !== EXTRACT_MESSAGES) return false;
      try {
        const raw = extractRawTurns();
        const messages = normalizeExtractedMessages(raw);
        sendResponse({ ok: true, messages, url: location.href });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return true;
    });
  },
});

function extractRawTurns(): RawTurn[] {
  const root = document.querySelector(CHAT_ROOT_SELECTOR);
  if (!root) {
    throw new Error(
      `Chat container not found (${CHAT_ROOT_SELECTOR}). Open a CS50.ai chat page and scroll to load messages.`,
    );
  }

  const turns = root.querySelectorAll<HTMLElement>(`:scope > ${TURN_SELECTOR}`);
  const out: RawTurn[] = [];

  turns.forEach((turn, domIndex) => {
    const body = turn.querySelector<HTMLElement>(MESSAGE_BODY_SELECTOR);
    if (!body) return;

    let role: MessageRole;
    if (turn.classList.contains(USER_TURN_CLASS)) role = 'user';
    else if (turn.classList.contains(ASSISTANT_TURN_CLASS)) role = 'assistant';
    else return;

    const rawId = body.id?.startsWith('id-') ? body.id.slice(3) : null;

    if (role === 'user') {
      const pre = body.querySelector('pre');
      const text = (pre?.textContent ?? body.textContent ?? '').trimEnd();
      out.push({ role, id: rawId, text, domIndex });
    } else {
      out.push({ role, id: rawId, html: body.innerHTML, domIndex });
    }
  });

  return out;
}