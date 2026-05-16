import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../tauri', () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/notifications', () => ({
  playNotificationSound: vi.fn(),
  sendNotification: vi.fn(),
}));

const setStreamingText = vi.fn();
const setStreaming = vi.fn();
const addMessage = vi.fn();
const updateMessage = vi.fn();
const clearStreamingTools = vi.fn();
const clearReasoningText = vi.fn();

vi.mock('../../stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      sessions: {
        'session-1': {
          messages: [{ id: 'm1', role: 'assistant', content: 'partial' }],
          streamingTools: [],
          streamingText: 'partial',
          reasoningText: '',
        },
      },
      setStreamingText,
      setStreaming,
      addMessage,
      updateMessage,
      clearStreamingTools,
      clearReasoningText,
      migrateSession: vi.fn(),
    }),
  },
  resolveSessionId: (id: string) => id,
}));

vi.mock('../../stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      updateSessionActivity: vi.fn(),
      refreshSessions: vi.fn(),
      addSessionOptimistic: vi.fn(),
      clearCache: vi.fn(),
    }),
  },
}));

vi.mock('../../stores/navigationStore', () => ({
  useNavigationStore: {
    getState: () => ({
      replaceTabId: vi.fn(),
    }),
  },
}));

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: {
    getState: () => ({
      displayPreferences: { notifications: { enabled: false, sound: false, desktop: false } },
      language: 'zh',
    }),
  },
}));

import {
  beginChatStream,
  endChatStream,
  getActiveChatStreamRequestSessionId,
  applyStreamingChunk,
  finalizeChatStreamComplete,
  abortChatStreamWait,
  waitForChatStreamEnd,
} from '../chatStreamBridge';

describe('chatStreamBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    endChatStream();
  });

  it('tracks active request session across begin/end', () => {
    expect(getActiveChatStreamRequestSessionId()).toBeNull();
    beginChatStream('req-1');
    expect(getActiveChatStreamRequestSessionId()).toBe('req-1');
    endChatStream();
    expect(getActiveChatStreamRequestSessionId()).toBeNull();
  });

  it('applyStreamingChunk updates store for session', () => {
    beginChatStream('session-1');
    applyStreamingChunk('session-1', 'hello world');
    expect(setStreamingText).toHaveBeenCalledWith('session-1', 'hello world');
  });

  it('finalizeChatStreamComplete clears streaming and updates message', () => {
    beginChatStream('session-1');
    finalizeChatStreamComplete('session-1', 'done', null, null, []);
    expect(setStreaming).toHaveBeenCalledWith('session-1', false);
    expect(clearStreamingTools).toHaveBeenCalledWith('session-1');
    expect(updateMessage).toHaveBeenCalled();
  });

  it('abortChatStreamWait rejects waitForChatStreamEnd', async () => {
    beginChatStream('session-1');
    const wait = waitForChatStreamEnd();
    abortChatStreamWait('cancelled');
    await expect(wait).rejects.toThrow('cancelled');
  });
});
