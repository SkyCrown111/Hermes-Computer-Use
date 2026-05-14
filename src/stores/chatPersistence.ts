import { logger } from '../lib/logger';

export const CHAT_MESSAGES_KEY = 'hermes-chat-messages';

const pendingSessionIds: Set<string> = new Set();
const MAX_PENDING_SESSIONS = 100;

export function markPendingSessions<T>(sessions: Record<string, { messages: T[] }>): void {
  for (const [sessionId, state] of Object.entries(sessions)) {
    if (state.messages.length > 0) {
      pendingSessionIds.add(sessionId);
    }
  }

  if (pendingSessionIds.size > MAX_PENDING_SESSIONS) {
    const excess = pendingSessionIds.size - MAX_PENDING_SESSIONS;
    const iter = pendingSessionIds.values();
    for (let i = 0; i < excess; i++) {
      const next = iter.next();
      if (!next.done) pendingSessionIds.delete(next.value);
    }
  }
}

export function hasPendingSession(sessionId: string): boolean {
  return pendingSessionIds.has(sessionId);
}

export function clearPendingSession(sessionId: string): void {
  pendingSessionIds.delete(sessionId);
}

export function restorePersistedMessages<T>(): Record<string, T[]> {
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) return {};

    const messages = JSON.parse(raw) as Record<string, T[]>;
    logger.debug('[ChatPersistence] Restored messages for', Object.keys(messages).length, 'sessions');
    return messages;
  } catch (err) {
    logger.error('[ChatPersistence] Failed to restore messages:', err);
    return {};
  }
}
