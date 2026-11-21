import {
  EXTRACT_MESSAGES,
  PING_CONTENT,
  type ExtractMessagesResponse,
} from './messages';

const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

function connectionLostMessage(error: unknown): boolean {
  const msg =
    (error instanceof Error ? error.message : String(error)) +
    (chrome.runtime.lastError?.message ?? '');
  return /Receiving end does not exist|Could not establish connection/i.test(msg);
}

export async function pingTabContent(tabId: number): Promise<boolean> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, {
      type: PING_CONTENT,
    })) as { ok?: boolean } | undefined;
    return r?.ok === true;
  } catch {
    return false;
  }
}

export async function ensureTabContentScript(tabId: number): Promise<void> {
  if (await pingTabContent(tabId)) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE],
  });
  await new Promise((r) => setTimeout(r, 200));
  if (await pingTabContent(tabId)) return;
  throw new Error(
    'Content script not loaded. Reload https://cs50.ai/chat once, then try Refresh again.',
  );
}

export async function extractMessagesFromTab(
  tabId: number,
): Promise<ExtractMessagesResponse> {
  try {
    await ensureTabContentScript(tabId);
  } catch (err) {
    if (!connectionLostMessage(err)) throw err;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: EXTRACT_MESSAGES,
    })) as ExtractMessagesResponse | undefined;
    if (!response) {
      throw new Error('No response from content script.');
    }
    return response;
  } catch (err) {
    if (connectionLostMessage(err)) {
      throw new Error(
        'Cannot talk to cs50.ai page. Reload the chat tab, then click Refresh Backup.',
      );
    }
    throw err;
  }
}