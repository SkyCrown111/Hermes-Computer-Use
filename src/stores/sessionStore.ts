// Session Store - 会话状态管理
// Refactored: Added message cache, refresh mechanism, and real-time updates

import { create } from 'zustand';
import type { Session, SessionMessage } from '../types';
import { sessionApi } from '../services';
import { logger } from '../lib/logger';

interface SessionState {
  // 会话列表状态
  sessions: Session[];
  total: number;
  isLoading: boolean;
  error: string | null;

  // 乐观添加的会话ID集合（用于刷新时保留）
  optimisticSessionIds: Set<string>;

  // 当前会话
  currentSession: Session | null;
  messages: SessionMessage[];
  isLoadingMessages: boolean;

  // 消息缓存 - 按会话ID缓存消息
  messageCache: Record<string, SessionMessage[]>;

  // 筛选条件
  platform: string | null;
  searchQuery: string;

  // 分页
  limit: number;
  offset: number;

  // 刷新键 - 递增此值触发刷新
  refreshKey: number;

  // Actions - 会话列表
  fetchSessions: (platform?: string, limit?: number, offset?: number) => Promise<void>;
  refreshSessions: () => void; // 强制刷新
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;
  updateSessionActivity: (sessionId: string) => void; // 实时更新会话活动
  addSessionOptimistic: (sessionId: string) => void; // 乐观添加新会话（立即显示在列表中）
  removeOptimisticSession: (sessionId: string) => void; // 从乐观列表中移除（服务器已返回）

  // Actions - 当前会话
  fetchSession: (id: string) => Promise<SessionMessage[]>;
  fetchMessages: (sessionId: string) => Promise<SessionMessage[]>;
  clearCurrentSession: () => void;

  // Actions - 消息缓存
  getCachedMessages: (sessionId: string) => SessionMessage[] | undefined;
  cacheMessages: (sessionId: string, messages: SessionMessage[]) => void;
  clearCache: (sessionId?: string) => void;

  // Actions - 筛选
  setPlatform: (platform: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPagination: (limit: number, offset: number) => void;

  // Actions - 搜索
  searchSessions: (query: string, platform?: string, days?: number) => Promise<void>;

  // Actions - 错误处理
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // 初始状态 - 会话列表
  sessions: [],
  total: 0,
  isLoading: false,
  error: null,

  // 初始状态 - 乐观会话ID
  optimisticSessionIds: new Set<string>(),

  // 初始状态 - 当前会话
  currentSession: null,
  messages: [],
  isLoadingMessages: false,

  // 初始状态 - 缓存
  messageCache: {},

  // 初始状态 - 筛选
  platform: null,
  searchQuery: '',

  // 初始状态 - 分页
  limit: 20,
  offset: 0,

  // 初始状态 - 刷新键
  refreshKey: 0,

  // 获取会话列表
  fetchSessions: async (_platform?: string, _limit?: number, _offset?: number) => {
    const platform = _platform ?? get().platform;
    const limit = _limit ?? get().limit;
    const offset = _offset ?? get().offset;

    set({ isLoading: true, error: null, platform: platform ?? null, limit, offset });

    try {
      const response = await sessionApi.listSessions(platform || undefined, limit, offset);

      // Preserve optimistically added sessions that are not yet in the server response
      const { sessions: currentSessions, optimisticSessionIds } = get();
      const optimisticSessions = currentSessions.filter(s =>
        optimisticSessionIds.has(s.id) && !response.sessions.some(rs => rs.id === s.id)
      );

      // Merge: optimistic sessions first, then server sessions
      const mergedSessions = [...optimisticSessions];
      for (const serverSession of response.sessions) {
        if (!mergedSessions.some(s => s.id === serverSession.id)) {
          mergedSessions.push(serverSession);
        }
      }

      // Remove from optimistic set if server now has the session
      const newOptimisticIds = new Set(optimisticSessionIds);
      for (const serverSession of response.sessions) {
        newOptimisticIds.delete(serverSession.id);
      }

      set({
        sessions: mergedSessions,
        total: response.total + optimisticSessions.length,
        isLoading: false,
        optimisticSessionIds: newOptimisticIds,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
    }
  },

  // 强制刷新会话列表
  refreshSessions: () => {
    const { refreshKey } = get();
    set({ refreshKey: refreshKey + 1 });
  },

  // 更新会话活动状态（发送消息后调用）
  updateSessionActivity: (sessionId: string) => {
    const { sessions } = get();
    const now = new Date().toISOString();

    const updated = sessions.map(s =>
      s.id === sessionId
        ? { ...s, last_activity_at: now, message_count: s.message_count + 1 }
        : s
    );

    // 按最后活动时间重新排序
    updated.sort((a, b) =>
      new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
    );

    set({ sessions: updated });
  },

  // 乐观添加新会话（立即显示在列表中，不等待API）
  addSessionOptimistic: (sessionId: string) => {
    const { sessions, optimisticSessionIds } = get();

    // 检查是否已存在
    if (sessions.some(s => s.id === sessionId)) {
      return;
    }

    const now = new Date().toISOString();
    const newSession: Session = {
      id: sessionId,
      platform: 'cli',
      chat_id: '',
      chat_name: '新会话',
      started_at: now,
      last_activity_at: now,
      message_count: 0,
      model: '',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      status: 'active',
    };

    // Add to optimistic set
    const newOptimisticIds = new Set(optimisticSessionIds);
    newOptimisticIds.add(sessionId);

    // 添加到列表开头
    set({
      sessions: [newSession, ...sessions],
      optimisticSessionIds: newOptimisticIds
    });
    logger.debug('[SessionStore] Optimistically added session:', sessionId);
  },

  // 从乐观列表中移除（服务器已返回）
  removeOptimisticSession: (sessionId: string) => {
    const { optimisticSessionIds } = get();
    const newOptimisticIds = new Set(optimisticSessionIds);
    newOptimisticIds.delete(sessionId);
    set({ optimisticSessionIds: newOptimisticIds });
  },

  // 获取单个会话详情 - 返回消息数组
  fetchSession: async (id: string): Promise<SessionMessage[]> => {
    // 先检查缓存
    const cached = get().getCachedMessages(id);
    if (cached && cached.length > 0) {
      logger.debug('[SessionStore] Using cached messages for:', id);
    }

    set({ isLoading: true, error: null });

    try {
      logger.debug('[SessionStore] Fetching session:', id);
      const response = await sessionApi.getSession(id);
      logger.debug('[SessionStore] Session response:', response);

      // 缓存消息
      get().cacheMessages(id, response.messages || []);

      set({
        currentSession: response.session,
        messages: response.messages || [],
        isLoading: false
      });

      return response.messages || [];
    } catch (err) {
      logger.error('[SessionStore] Error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
      return [];
    }
  },

  // 获取会话消息 - 返回消息数组
  fetchMessages: async (sessionId: string): Promise<SessionMessage[]> => {
    // 先检查缓存
    const cached = get().getCachedMessages(sessionId);
    if (cached && cached.length > 0) {
      logger.debug('[SessionStore] Using cached messages for:', sessionId);
      set({ messages: cached, isLoadingMessages: false });

      // 如果没有 currentSession，也设置它
      const { currentSession } = get();
      if (!currentSession) {
        // 从会话列表中找到对应的会话
        const session = get().sessions.find(s => s.id === sessionId);
        if (session) {
          set({ currentSession: session });
        }
      }
      return cached;
    }

    set({ isLoadingMessages: true, error: null });

    try {
      logger.debug('[SessionStore] Fetching messages for:', sessionId);
      const response = await sessionApi.getSession(sessionId);
      logger.debug('[SessionStore] Messages response:', response.messages.length, 'messages');

      // 缓存消息
      get().cacheMessages(sessionId, response.messages);

      // 更新状态
      const currentState = get();
      if (!currentState.currentSession) {
        set({
          currentSession: response.session,
          messages: response.messages,
          isLoadingMessages: false
        });
      } else {
        set({ messages: response.messages, isLoadingMessages: false });
      }

      return response.messages;
    } catch (err) {
      logger.error('[SessionStore] Error fetching messages:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoadingMessages: false });
      return [];
    }
  },

  // 删除会话
  deleteSession: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      await sessionApi.deleteSession(id);

      // 从列表中移除
      const { sessions, messageCache } = get();
      const newSessions = sessions.filter((s) => s.id !== id);

      // 清除缓存
      const newCache = { ...messageCache };
      delete newCache[id];

      set({
        sessions: newSessions,
        messageCache: newCache,
        isLoading: false,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
    }
  },

  // 更新会话标题
  updateSessionTitle: async (id: string, title: string) => {
    try {
      await sessionApi.updateSessionTitle(id, title);

      const { sessions, currentSession } = get();
      const updated = sessions.map((s) =>
        s.id === id ? { ...s, chat_name: title } : s
      );

      set({ sessions: updated });

      // 同时更新 currentSession
      if (currentSession?.id === id) {
        set({ currentSession: { ...currentSession, chat_name: title } });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error' });
    }
  },

  // 清除当前会话
  clearCurrentSession: () => {
    set({ currentSession: null, messages: [] });
  },

  // 获取缓存的消息
  getCachedMessages: (sessionId: string) => {
    return get().messageCache[sessionId] || [];
  },

  // 缓存消息
  cacheMessages: (sessionId: string, messages: SessionMessage[]) => {
    const { messageCache } = get();
    set({
      messageCache: { ...messageCache, [sessionId]: messages }
    });
  },

  // 清除缓存
  clearCache: (sessionId?: string) => {
    if (sessionId) {
      const { messageCache } = get();
      const newCache = { ...messageCache };
      delete newCache[sessionId];
      set({ messageCache: newCache });
    } else {
      set({ messageCache: {} });
    }
  },

  // 设置平台筛选
  setPlatform: (platform: string | null) => {
    set({ platform, offset: 0 }); // 重置分页
  },

  // 设置搜索查询
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  // 设置分页
  setPagination: (limit: number, offset: number) => {
    set({ limit, offset });
  },

  // 搜索会话
  searchSessions: async (query: string, platform?: string, days?: number) => {
    set({ isLoading: true, error: null, searchQuery: query });

    try {
      const response = await sessionApi.searchSessions({ q: query, platform, days });

      // 搜索结果转换为会话列表格式
      const sessions: Session[] = response.results.map((result) => ({
        id: result.session_id,
        platform: result.platform as Session['platform'],
        chat_id: '',
        chat_name: '',
        started_at: result.matched_at,
        last_activity_at: result.matched_at,
        message_count: 0,
        model: '',
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        status: 'completed',
      }));

      set({ sessions, total: response.total, isLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
    }
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));

// Debug: log state changes
if (typeof window !== 'undefined') {
  useSessionStore.subscribe((state) => {
    logger.debug('[SessionStore] State changed:', {
      sessions: state.sessions.length,
      currentSession: state.currentSession?.id,
      messages: state.messages.length,
      cacheSize: Object.keys(state.messageCache).length,
      isLoading: state.isLoading
    });
  });
}
