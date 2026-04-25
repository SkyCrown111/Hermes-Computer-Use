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
  activeToolName: string | null;
  pendingPermission: {
    id: string;
    command: string;
    description: string;
    allow_permanent: boolean;
  } | null;
  tokenUsage: {
    input_tokens: number;
    output_tokens: number;
  };
  elapsedSeconds: number;
  statusVerb: string;
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
  activeToolName: null,
  pendingPermission: null,
  tokenUsage: { input_tokens: 0, output_tokens: 0 },
  elapsedSeconds: 0,
  statusVerb: '',
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
  appendThinkingText: (sessionId: string, text: string) => void;

  // 设置推理内容
  setReasoningText: (sessionId: string, text: string) => void;
  appendReasoningText: (sessionId: string, text: string) => void;
  clearReasoningText: (sessionId: string) => void;

  // 设置流式工具
  addStreamingTool: (sessionId: string, tool: ToolCallInfo) => void;
  clearStreamingTools: (sessionId: string) => void;

  // 设置工具
  setActiveTool: (sessionId: string, toolName: string | null) => void;
  addToolCall: (sessionId: string, tool: ToolCallInfo) => void;
  updateToolCall: (sessionId: string, toolName: string, updates: Partial<ToolCallInfo>) => void;

  // 设置权限请求
  setPendingPermission: (sessionId: string, permission: PerSessionState['pendingPermission']) => void;
  clearPendingPermission: (sessionId: string) => void;

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
function updateSessionIn(
  sessions: Record<string, PerSessionState>,
  sessionId: string,
  updater: (s: PerSessionState) => Partial<PerSessionState>
): Record<string, PerSessionState> {
  const session = sessions[sessionId] ?? createDefaultSessionState();
  return { ...sessions, [sessionId]: { ...session, ...updater(session) } };
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
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
        isStreaming,
        isThinking: isStreaming ? false : session.isThinking,
      })),
    }));
  },

  setStreamingText: (sessionId, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        streamingText: text,
      })),
    }));
  },

  appendStreamingText: (sessionId, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
        streamingText: session.streamingText + text,
      })),
    }));
  },

  setThinking: (sessionId, isThinking, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        isThinking,
        thinkingText: text ?? '',
      })),
    }));
  },

  appendThinkingText: (sessionId, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
        thinkingText: session.thinkingText + text,
      })),
    }));
  },

  setReasoningText: (sessionId, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        reasoningText: text,
      })),
    }));
  },

  appendReasoningText: (sessionId, text) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, (session) => ({
        reasoningText: session.reasoningText + text,
      })),
    }));
  },

  clearReasoningText: (sessionId) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        reasoningText: '',
      })),
    }));
  },

  addStreamingTool: (sessionId, tool) => {
    set((s) => ({
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
      }),
    }));
  },

  clearStreamingTools: (sessionId) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        streamingTools: [],
      })),
    }));
  },

  setActiveTool: (sessionId, toolName) => {
    set((s) => ({
      sessions: updateSessionIn(s.sessions, sessionId, () => ({
        activeToolName: toolName,
      })),
    }));
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

    console.log('[ChatStore] Migrating session from', oldId, 'to', newId);
    console.log('[ChatStore] Old session messages:', oldSession.messages.length);
    console.log('[ChatStore] Old session streamingText:', oldSession.streamingText?.length || 0);

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
  },
}));

// Store a mapping of old session IDs to new session IDs for callbacks that might still use old IDs
// This is a workaround for the race condition between onSessionCreated and onComplete
const sessionIdMap: Record<string, string> = {};

export function registerSessionMigration(oldId: string, newId: string) {
  sessionIdMap[oldId] = newId;
  console.log('[ChatStore] Registered session migration:', oldId, '->', newId);
}

export function resolveSessionId(id: string): string {
  // Check if this ID was migrated
  const resolvedId = sessionIdMap[id];
  if (resolvedId) {
    console.log('[ChatStore] Resolved session ID:', id, '->', resolvedId);
    return resolvedId;
  }
  return id;
}

// Approximate localStorage limit (most browsers allow ~5MB)
const LS_LIMIT_BYTES = 5 * 1024 * 1024;
const LS_WARN_THRESHOLD = 0.8; // warn at 80% usage

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
function persistMessages(sessions: Record<string, PerSessionState>) {
  try {
    // Only persist messages, not streaming state
    const messagesToSave: Record<string, ChatMessage[]> = {};
    for (const [sessionId, state] of Object.entries(sessions)) {
      if (state.messages.length > 0) {
        messagesToSave[sessionId] = state.messages;
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
  } catch (err) {
    // If quota exceeded, drop oldest session's messages and retry once
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      logger.warn('[ChatStore] localStorage quota exceeded, dropping oldest session messages');
      const sessionIds = Object.keys(sessions);
      if (sessionIds.length > 0) {
        // Remove the session with the fewest messages
        const sorted = sessionIds.sort(
          (a, b) => (sessions[a]?.messages.length ?? 0) - (sessions[b]?.messages.length ?? 0)
        );
        const toRemove = sorted[0];
        if (toRemove) {
          logger.warn(`[ChatStore] Dropping messages for session: ${toRemove}`);
          // Update the in-memory store
          const { [toRemove]: _removed, ...remaining } = sessions;
          useChatStore.setState({ sessions: remaining });
          // Retry persist without the dropped session
          persistMessages(remaining);
        }
      }
    } else {
      logger.error('[ChatStore] Failed to persist messages:', err);
    }
  }
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
}
