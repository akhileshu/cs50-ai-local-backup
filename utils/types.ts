export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string | null;
  role: MessageRole;
  /** Markdown (assistant) or plain text (user) */
  content: string;
  contentHash: string;
  domIndex: number;
  timestamp?: string;
}

export interface BackupEntry {
  id: string;
  role: MessageRole;
  domIndex: number;
  label: string;
  content: string;
}

export type SyncStatus =
  | 'not_configured'
  | 'ready'
  | 'syncing'
  | 'splitting'
  | 'synced'
  | 'nothing_new'
  | 'error';

export interface SyncResult {
  status: SyncStatus;
  appendedCount: number;
  gapFillCount: number;
  lastBackupIso: string | null;
  error?: string;
}

export interface SyncState {
  status: SyncStatus;
  lastBackupIso: string | null;
  lastNewCount: number;
  fileName: string | null;
  configured: boolean;
}