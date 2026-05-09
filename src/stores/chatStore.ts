// Chat Store - 按会话独立存储消息和流式状态
// 参考 cc-haha 的 chatStore 实现

import { create } from 'zustand';
import { logger } from '../lib/logger';

// LocalStorage key for message persistence
const CHAT_MESSAGES_KEY = 'hermes-chat-messages';

// 每个会话的状态
export interface PerSessionState {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingText: string;  // Status message like "正在思考..."
  reasoningText: string; // Actual reasoning content from AI
  streamingTools: ToolCallInfo[]; // Tools during streaming
  pendingPermission: {
    id: string;
    command: string;
    description: string;
    allow_permanent: boolean;
  } | null;
  pendingClarify: {
    id: string;
    question: string;
    choices: string[];
    is_open_ended: boolean;
  } | null;
  pendingSecret: {
    id: string;
    var_name: string;
    prompt: string;
    metadata: Record<string, unknown>;
  } | null;
  tokenUsage: {
    input_tokens: number;
    output_tokens: number;
  };
  error: string | null;
}

// 消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  reasoning?: string;
  tools?: ToolCallInfo[];
  thinkingTime?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  thinking?: string;  // Thinking status during streaming
}

// 工具调用信息
export interface ToolCallInfo {
  name: string;
  event_type: string;
  preview?: string;
  args?: Record<string, unknown>;
  duration?: number;
  is_error?: boolean;
}

// 默认会话状态
const DEFAULT_SESSION_STATE: PerSessionState = {
  messages: [],
  streamingText: '',
  isStreaming: false,
  isThinking: false,
  thinkingText: '',
  reasoningText: '',
  streamingTools: [],
  pendingPermission: null,
  pendingClarify: null,
  pendingSecret: null,
  tokenUsage: { input_tokens: 0, output_tokens: 0 },
  error: null,
};

function createDefaultSessionState(): PerSessionState {
  return {
    ...DEFAULT_SESSION_STATE,
    messages: [],
    tokenUsage: { input_tokens: 0, output_tokens: 0 },
  };
}

// 消息ID生成
let msgCounter = 0;
const nextId = () => `msg-${++msgCounter}-${Date.now()}`;

interface ChatStore {
  // 按会话ID存储状态
  sessions: Record<string, PerSessionState>;

  // 获取指定会话的状态
  getSession: (sessionId: string) => PerSessionState;

  // 添加消息
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;

  // 更新消息
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;

  // 设置流式状态
  setStreaming: (sessionId: string, isStreaming: boolean) => void;
  setStreamingText: (sessionId: string, text: string) => void;
  appendStreamingText: (sessionId: string, text: string) => void;

  // 设置思考状态
  setThinking: (sessionId: string, isThinking: boolean, text?: string) => void;

  // 设置推理内容
  setReasoningText: (sessionId: string, text: string) => void;
  appendReasoningText: (sessionId: string, text: string) => void;
  clearReasoningText: (sessionId: string) => void;

  // 设置流式工具
  addStreamingTool: (sessionId: string, tool: ToolCallInfo) => void;
  clearStreamingTools: (sessionId: string) => void;

  // 设置工具
  addToolCall: (sessionId: string, tool: ToolCallInfo) => void;
  updateToolCall: (sessionId: string, toolName: string, updates: Partial<ToolCallInfo>) => void;

  // 设置权限请求
  setPendingPermission: (sessionId: string, permission: PerSessionState['pendingPermission']) => void;
  clearPendingPermission: (sessionId: string) => void;

  // 设置澄清问题
  setPendingClarify: (sessionId: string, clarify: PerSessionState['pendingClarify']) => void;
  clearPendingClarify: (sessionId: string) => void;

  // 设置密钥输入请求
  setPendingSecret: (sessionId: string, secret: PerSessionState['pendingSecret']) => void;
  clearPendingSecret: (sessionId: string) => void;

  // 设置 token 使用量
  setTokenUsage: (sessionId: string, usage: { input_tokens: number; output_tokens: number }) => void;

  // 设置错误
  setError: (sessionId: string, error: string | null) => void;

  // 清除会话状态
  clearSession: (sessionId: string) => void;

  // 从服务器加载消息历史
  loadMessages: (sessionId: string, messages: ChatMessage[]) => void;

  // 获取最后一条消息
  getLastMessage: (sessionId: string) => ChatMessage | undefined;

  // 迁移会话（用于 new_xxx -> real session ID）
  migrateSession: (oldId: string, newId: string) => void;

  // 删除单条消息
  deleteMessage: (sessionId: string, messageId: string) => void;
}

// 辅助函数：更新指定会话的状态
// 如果 session 不存在且 createIfMissing 为 false，则返回原 sessions
function updateSessionIn(
  sessions: Record<string, PerSessionState>,
  sessionId: string,
  updater: (s: PerSessionState) => Partial<PerSessionState>,
  createIfMissing: boolean = true
): Record<string, PerSessionState> {
  const session = sessions[sessionId];
  if (!session && !createIfMissing) {
    // Session doesn't exist and we shouldn't create it - return unchanged
    return sessions;
  }
  const targetSession = session ?? createDefaultSessionState();
  return { ...sessions, [sessionId]: { ...targetSession, ...updater(targetSession) } };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: {},

  getSession: (sessionId) => {
    return get().sessions[sessionId] ?? createDefaultSessionState();
  },

  addMessage: (sessionId, message) => {
    const fullMessage: ChatMessage = {
      ...message,
      id: nextId(),
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const session = s.sessions[sessionId] ?? createDefaultSessionState();
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...session,
            messages: [...session.messages, fullMessage],
          },
        },
      };
    });

    // Persist after adding message
    persistMessages(get().sessions);
  },

  updateMessage: (sessionId, messageId, updates) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
        messages: session.messages.map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      })),
    }));

    // Persist after updating message
    persistMessages(get().sessions);
  },

  setStreaming: (sessionId, isStreaming) => {
    set((s) => {
      // Don't create a new session if it doesn't exist (e.g., after migration)
      const session = s.sessions[sessionId];
      if (!session) {
        logger.debug('[ChatStore] setStreaming - session not found:', sessionId, 'skipping');
        return s;
      }
      return {
        sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
          isStreaming,
          isThinking: isStreaming ? false : session.isThinking,
        }), false),
      };
    });
  },

  setStreamingText: (sessionId, text) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, () => ({
          streamingText: text,
        }), false),
      };
    });
  },

  appendStreamingText: (sessionId, text) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
          streamingText: session.streamingText + text,
        }), false),
      };
    });
  },

  setThinking: (sessionId, isThinking, text) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, () => ({
          isThinking,
          thinkingText: text ?? '',
        }), false),
      };
    });
  },

  setReasoningText: (sessionId, text) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, () => ({
          reasoningText: text,
        }), false),
      };
    });
  },

  appendReasoningText: (sessionId, text) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
          reasoningText: session.reasoningText + text,
        }), false),
      };
    });
  },

  clearReasoningText: (sessionId) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, () => ({
          reasoningText: '',
        }), false),
      };
    });
  },

  addStreamingTool: (sessionId, tool) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, (session) => {
          // Deduplicate: check if tool with same name and args already exists
          const toolKey = `${tool.name}-${JSON.stringify(tool.args)}`;
          const existingIndex = session.streamingTools.findIndex(
            t => `${t.name}-${JSON.stringify(t.args)}` === toolKey
          );

          if (existingIndex >= 0) {
            // Update existing tool (e.g., add duration to completed tool)
            const updatedTools = [...session.streamingTools];
            updatedTools[existingIndex] = { ...updatedTools[existingIndex], ...tool };
            return { streamingTools: updatedTools };
          }

          // Add new tool
          return { streamingTools: [...session.streamingTools, tool] };
        }, false),
      };
    });
  },

  clearStreamingTools: (sessionId) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: updateSessionIn(s.sessions, sessionId, () => ({
          streamingTools: [],
        }), false),
      };
    });
  },

  addToolCall: (sessionId, tool) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          return {
            messages: session.messages.map((m, idx) =>
              idx === session.messages.length - 1
                ? { ...m, tools: [...(m.tools || []), tool] }
                : m
            ),
          };
        }
        return {};
      }),
    }));
  },

  updateToolCall: (sessionId, toolName, updates) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.tools) {
          return {
            messages: session.messages.map((m, idx) =>
              idx === session.messages.length - 1
                ? {
                    ...m,
                    tools: m.tools?.map((t) =>
                      t.name === toolName ? { ...t, ...updates } : t
                    ),
                  }
                : m
            ),
          };
        }
        return {};
      }),
    }));
  },

  setPendingPermission: (sessionId, permission) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingPermission: permission,
      })),
    }));
  },

  clearPendingPermission: (sessionId) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingPermission: null,
      })),
    }));
  },

  setPendingClarify: (sessionId, clarify) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingClarify: clarify,
      })),
    }));
  },

  clearPendingClarify: (sessionId) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingClarify: null,
      })),
    }));
  },

  setPendingSecret: (sessionId, secret) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingSecret: secret,
      })),
    }));
  },

  clearPendingSecret: (sessionId) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        pendingSecret: null,
      })),
    }));
  },

  setTokenUsage: (sessionId, usage) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        tokenUsage: usage,
      })),
    }));
  },

  setError: (sessionId, error) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        error,
      })),
    }));
  },

  clearSession: (sessionId) => {
    set((s) => {
      const { [sessionId]: _, ...rest } = s.sessions;
      return { sessions: rest };
    });
  },

  loadMessages: (sessionId, messages) => {
    set((s) => {
      const session = s.sessions[sessionId] ?? createDefaultSessionState();
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...session,
            messages,
          },
        },
      };
    });

    // Persist after loading messages
    persistMessages(get().sessions);
  },

  getLastMessage: (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session || session.messages.length === 0) return undefined;
    return session.messages[session.messages.length - 1];
  },

  // Migrate session from old ID to new ID (used when new_xxx -> real session ID)
  migrateSession: (oldId: string, newId: string) => {
    const { sessions } = get();
    const oldSession = sessions[oldId];

    if (!oldSession) {
      logger.debug('[ChatStore] No session to migrate for:', oldId);
      return;
    }

    // Check if new session already exists
    if (sessions[newId]) {
      logger.debug('[ChatStore] Session already exists:', newId);
      return;
    }

    logger.debug('[ChatStore] Migrating session from', oldId, 'to', newId);
    logger.debug('[ChatStore] Old session messages:', oldSession.messages.length);
    logger.debug('[ChatStore] Old session streamingText:', oldSession.streamingText?.length || 0);
    logger.debug('[ChatStore] Old session isStreaming:', oldSession.isStreaming);

    // Register the migration so resolveSessionId can map old ID to new ID
    registerSessionMigration(oldId, newId);

    set((s) => {
      // Remove old session and add new one
      const { [oldId]: _, ...rest } = s.sessions;
      return {
        sessions: {
          ...rest,
          [newId]: oldSession,
        },
      };
    });

    logger.debug('[ChatStore] Migrated session from', oldId, 'to', newId);

    // Persist messages after migration
    persistMessages(get().sessions);
  },

  deleteMessage: (sessionId, messageId) => {
    set((s) => {
      const session = s.sessions[sessionId];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...session,
            messages: session.messages.filter((m) => m.id !== messageId),
          },
        },
      };
    });
    // Persist after deleting message
    persistMessages(get().sessions);
  },
}));

// Store a mapping of old session IDs to new session IDs for callbacks that might still use old IDs
// This is a workaround for the race condition between onSessionCreated and onComplete
const sessionIdMap: Record<string, string> = {};
const MAX_SESSION_MAP_SIZE = 50;

export function registerSessionMigration(oldId: string, newId: string) {
  sessionIdMap[oldId] = newId;
  logger.debug('[ChatStore] Registered session migration:', oldId, '->', newId);

  // Prevent unbounded growth: remove oldest entries if map gets too large
  const keys = Object.keys(sessionIdMap);
  if (keys.length > MAX_SESSION_MAP_SIZE) {
    // Remove oldest entries (first inserted)
    const toRemove = keys.slice(0, keys.length - MAX_SESSION_MAP_SIZE);
    for (const key of toRemove) {
      delete sessionIdMap[key];
    }
  }
}

export function resolveSessionId(id: string): string {
  // Check if this ID was migrated
  const resolvedId = sessionIdMap[id];
  if (resolvedId) {
    logger.debug('[ChatStore] Resolved session ID:', id, '->', resolvedId);
    return resolvedId;
  }
  return id;
}

export function clearSessionMigration(oldId: string) {
  delete sessionIdMap[oldId];
}

// Approximate localStorage limit (most browsers allow ~5MB)
const LS_LIMIT_BYTES = 5 * 1024 * 1024;
const LS_WARN_THRESHOLD = 0.7; // warn at 70% usage
const MAX_MESSAGES_PER_SESSION = 200; // cap per session to prevent unbounded growth

// Estimate the byte size of a string
function estimateByteSize(str: string): number {
  // Each char is 2 bytes in UTF-16 (what localStorage uses internally),
  // but the serialized JSON is what matters. Use Blob for accurate measurement.
  try {
    return new Blob([str]).size;
  } catch {
    return str.length * 2; // fallback estimate
  }
}

// Persist messages to localStorage with capacity management
// Uses debounced async writes to avoid blocking main thread
let isPersisting = false;
let persistRetryCount = 0;
let persistTimeoutId: ReturnType<typeof setTimeout> | null = null;
const MAX_PERSIST_RETRIES = 1;
const PERSIST_DEBOUNCE_MS = 500; // Debounce to batch rapid updates

// Track pending sessions (sessions with messages that haven't been persisted yet)
// This helps restoreTabs know about new_ sessions even before persistence completes.
// Capped to prevent unbounded growth if clearPendingSession is never called.
const pendingSessionIds: Set<string> = new Set();
const MAX_PENDING_SESSIONS = 100;

// Export for use in navigationStore
export function hasPendingSession(sessionId: string): boolean {
  return pendingSessionIds.has(sessionId);
}

export function clearPendingSession(sessionId: string): void {
  pendingSessionIds.delete(sessionId);
}

function persistMessages(sessions: Record<string, PerSessionState>) {
  // Track sessions that have messages pending persistence
  for (const [sessionId, state] of Object.entries(sessions)) {
    if (state.messages.length > 0) {
      pendingSessionIds.add(sessionId);
    }
  }

  // Prevent unbounded growth: if the set gets too large, remove oldest entries
  if (pendingSessionIds.size > MAX_PENDING_SESSIONS) {
    const excess = pendingSessionIds.size - MAX_PENDING_SESSIONS;
    const iter = pendingSessionIds.values();
    for (let i = 0; i < excess; i++) {
      const next = iter.next();
      if (!next.done) pendingSessionIds.delete(next.value);
    }
  }

  // Debounce: cancel pending write and schedule new one
  if (persistTimeoutId) {
    clearTimeout(persistTimeoutId);
  }

  persistTimeoutId = setTimeout(() => {
    doPersist(sessions);
  }, PERSIST_DEBOUNCE_MS);
}

// Actual persistence logic (runs asynchronously via requestIdleCallback)
function doPersist(sessions: Record<string, PerSessionState>) {
  // Guard against recursive calls
  if (isPersisting) {
    logger.debug('[ChatStore] Skipping persist - already in progress');
    return;
  }

  isPersisting = true;

  // Use requestIdleCallback or setTimeout to avoid blocking main thread
  const scheduleWrite = (typeof window !== 'undefined' && 'requestIdleCallback' in window)
    ? (cb: () => void) => (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 1000 })
    : (cb: () => void) => setTimeout(cb, 0);

  scheduleWrite(() => {
    try {
      // Only persist messages, not streaming state
      const messagesToSave: Record<string, ChatMessage[]> = {};
      for (const [sessionId, state] of Object.entries(sessions)) {
        if (state.messages.length > 0) {
          // Cap per-session message count to prevent unbounded growth
          if (state.messages.length > MAX_MESSAGES_PER_SESSION) {
            logger.warn(`[ChatStore] Session ${sessionId} has ${state.messages.length} messages, capping to ${MAX_MESSAGES_PER_SESSION}`);
            messagesToSave[sessionId] = state.messages.slice(-MAX_MESSAGES_PER_SESSION);
          } else {
            messagesToSave[sessionId] = state.messages;
          }
        }
      }

      const serialized = JSON.stringify(messagesToSave);
      const byteSize = estimateByteSize(serialized);

      // Warn if approaching the limit
      if (byteSize > LS_LIMIT_BYTES * LS_WARN_THRESHOLD) {
        logger.warn(
          `[ChatStore] localStorage usage: ${(byteSize / 1024 / 1024).toFixed(1)}MB / ${(LS_LIMIT_BYTES / 1024 / 1024).toFixed(0)}MB ` +
          `(${(byteSize / LS_LIMIT_BYTES * 100).toFixed(0)}%)`
        );
      }

      localStorage.setItem(CHAT_MESSAGES_KEY, serialized);
      logger.debug('[ChatStore] Persisted messages for', Object.keys(messagesToSave).length, 'sessions');
      // Reset retry count on success
      persistRetryCount = 0;
    } catch (err) {
      // If quota exceeded, truncate the largest sessions and retry
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        logger.warn('[ChatStore] localStorage quota exceeded, truncating largest sessions');

        if (persistRetryCount >= MAX_PERSIST_RETRIES) {
          logger.error('[ChatStore] Max persist retries reached, stopping to prevent infinite loop');
          persistRetryCount = 0;
          return;
        }

        persistRetryCount++;
        const sessionIds = Object.keys(sessions);
        if (sessionIds.length > 0) {
          // Sort by message count descending — truncate the largest session
          const sorted = [...sessionIds].sort(
            (a, b) => (sessions[b]?.messages.length ?? 0) - (sessions[a]?.messages.length ?? 0)
          );
          const largestId = sorted[0];
          if (largestId && sessions[largestId]) {
            const currentCount = sessions[largestId].messages.length;
            const keepCount = Math.max(50, Math.floor(currentCount / 2));
            logger.warn(`[ChatStore] Truncating session ${largestId}: ${currentCount} -> ${keepCount} messages`);
            // Build a new sessions object instead of mutating the existing one
            const truncatedSessions = {
              ...sessions,
              [largestId]: {
                ...sessions[largestId],
                messages: sessions[largestId].messages.slice(-keepCount),
              },
            };
            useChatStore.setState({ sessions: truncatedSessions });
            isPersisting = false;
            doPersist(truncatedSessions);
            return;
          }
        }
      } else {
        logger.error('[ChatStore] Failed to persist messages:', err);
      }
    } finally {
      isPersisting = false;
    }
  });
}

// Restore messages from localStorage
export function restoreMessages(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) return {};

    const messages = JSON.parse(raw) as Record<string, ChatMessage[]>;
    logger.debug('[ChatStore] Restored messages for', Object.keys(messages).length, 'sessions');
    return messages;
  } catch (err) {
    logger.error('[ChatStore] Failed to restore messages:', err);
    return {};
  }
}

// Initialize store with persisted messages
export function initializeChatStore() {
  const persistedMessages = restoreMessages();
  const sessions: Record<string, PerSessionState> = {};

  for (const [sessionId, messages] of Object.entries(persistedMessages)) {
    sessions[sessionId] = {
      ...createDefaultSessionState(),
      messages,
    };
  }

  useChatStore.setState({ sessions });
  logger.debug('[ChatStore] Initialized with', Object.keys(sessions).length, 'sessions');

  // Background: for any open tab that has no messages in localStorage,
  // attempt to load from the server (Tauri backend).
  // This handles the case where localStorage was cleared but sessions still exist.
  setTimeout(async () => {
    try {
      const { getSession } = await import('../services/sessionApi');
      const { openTabs } = (await import('./navigationStore')).useNavigationStore.getState();
      const currentSessions = useChatStore.getState().sessions;

      for (const tab of openTabs) {
        // Skip if we already have messages for this session
        if (currentSessions[tab.id]?.messages?.length > 0) continue;
        // Skip new_ sessions (not yet on server)
        if (tab.id.startsWith('new_')) continue;

        try {
          const response = await getSession(tab.id);
          if (response && response.messages && response.messages.length > 0) {
            // Convert SessionMessage[] to ChatMessage[] for the chat store
            const chatMessages: ChatMessage[] = response.messages.map((m, idx) => ({
              id: `server-${tab.id}-${idx}-${Date.now()}`,
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content,
              timestamp: m.timestamp,
              reasoning: m.reasoning,
            }));
            useChatStore.getState().loadMessages(tab.id, chatMessages);
            logger.debug('[ChatStore] Loaded', chatMessages.length, 'messages from server for session:', tab.id);
          }
        } catch {
          // Session might not exist on server, that's fine
        }
      }
    } catch {
      // Import failed or other non-critical error
    }
  }, 2000); // Delay to avoid blocking app startup
}
