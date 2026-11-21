import { contentHash, stableMessageId } from './content-hash';
import { htmlToMarkdown } from './html-to-markdown';
import { DISCLAIMER_MESSAGE_ID } from './messages';
import type { ChatMessage, MessageRole } from './types';

export const CHAT_ROOT_SELECTOR = '#ddbChatText';
export const TURN_SELECTOR = '.ddbChat';
export const USER_TURN_CLASS = 'ddbChat-User';
export const ASSISTANT_TURN_CLASS = 'ddbChat-Duck';
export const MESSAGE_BODY_SELECTOR = '.ddbChatMessage';

/** Parse serialized content-script payload into normalized messages. */
export function normalizeExtractedMessages(
  raw: Array<{
    role: MessageRole;
    id: string | null;
    html?: string;
    text?: string;
    domIndex: number;
  }>,
): ChatMessage[] {
  return raw.filter((item) => item.id !== DISCLAIMER_MESSAGE_ID).map((item) => {
    const content =
      item.role === 'assistant'
        ? htmlToMarkdown(item.html ?? '')
        : (item.text ?? '').replace(/\r\n/g, '\n');
    const hash = contentHash(content);
    return {
      id: item.id,
      role: item.role,
      content,
      contentHash: hash,
      domIndex: item.domIndex,
    };
  });
}

export type ChatMessageWithStableId = ChatMessage & { stableId: string };

export function withStableIds(messages: ChatMessage[]): ChatMessageWithStableId[] {
  return messages.map((m) => ({
    ...m,
    stableId: stableMessageId(m.id, m.role, m.contentHash, m.domIndex),
  }));
}