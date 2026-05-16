import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_MESSAGES_KEY,
  __resetPendingSessionsForTests,
  clearPendingSession,
  hasPendingSession,
  markPendingSessions,
  restorePersistedMessages,
} from '../chatPersistence';

vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('chatPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetPendingSessionsForTests();
    vi.clearAllMocks();
  });

  it('restorePersistedMessages returns {} when key missing', () => {
    expect(restorePersistedMessages<string>()).toEqual({});
  });

  it('restorePersistedMessages parses JSON from localStorage', () => {
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify({ s1: [{ id: 'm1' }] }));
    const out = restorePersistedMessages<{ id: string }>();
    expect(out.s1).toHaveLength(1);
    expect(out.s1[0].id).toBe('m1');
  });

  it('restorePersistedMessages returns {} on invalid JSON', async () => {
    const { logger } = await import('../../lib/logger');
    localStorage.setItem(CHAT_MESSAGES_KEY, 'not-json');
    expect(restorePersistedMessages()).toEqual({});
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });

  it('markPendingSessions registers sessions with messages and trims past cap', () => {
    const sessions: Record<string, { messages: string[] }> = {};
    for (let i = 0; i < 105; i++) {
      sessions[`id-${i}`] = { messages: ['x'] };
    }
    markPendingSessions(sessions);
    expect(hasPendingSession('id-104')).toBe(true);
    // Set size must not exceed MAX_PENDING_SESSIONS (100)
    let count = 0;
    for (let i = 0; i < 105; i++) {
      if (hasPendingSession(`id-${i}`)) count++;
    }
    expect(count).toBe(100);
  });

  it('hasPendingSession and clearPendingSession', () => {
    markPendingSessions({ a: { messages: [1] } } as Record<string, { messages: number[] }>);
    expect(hasPendingSession('a')).toBe(true);
    clearPendingSession('a');
    expect(hasPendingSession('a')).toBe(false);
  });

  it('markPendingSessions ignores empty message lists', () => {
    markPendingSessions({ z: { messages: [] } });
    expect(hasPendingSession('z')).toBe(false);
  });
});
