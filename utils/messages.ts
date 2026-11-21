import type { ChatMessage, MessageRole } from './types';

export const EXTRACT_MESSAGES = 'cs50-backup:extract';
export const PING_CONTENT = 'cs50-backup:ping';

/** ddb welcome/disclaimer turn — excluded from Q/A backup. */
export const DISCLAIMER_MESSAGE_ID = 'disclaimer';

export interface ExtractMessagesResponse {
  ok: boolean;
  messages?: ChatMessage[];
  error?: string;
  url?: string;
}

export interface RawTurn {
  role: MessageRole;
  id: string | null;
  html?: string;
  text?: string;
  domIndex: number;
}