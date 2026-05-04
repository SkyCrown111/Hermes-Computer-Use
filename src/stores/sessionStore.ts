// Session Store - 会话状态管理
// Refactored: Added message cache, refresh mechanism, and real-time updates

import { create } from 'zustand';
import type { Session, SessionMessage } from '../types';
import type { Checkpoint } from '../types/checkpoint';
import { sessionApi } from '../services';
import * as sessionApiRaw from '../services/sessionApi';
import { useNavigationStore } from './navigationStore';
import { useChatStore } from './chatStore';
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

  // 检查点状态
  checkpoints: Checkpoint[];
  isLoadingCheckpoints: boolean;
  checkpointsBySession: Record<string, Checkpoint[]>;

  // 筛选条件
  platform: string | null;
  searchQuery: string;

  // 分页
  limit: number;
  offset: number;

  // 刷新键 - 递增此值触发刷新
  refreshKey: number;

  // 请求计数器 - 防并发竞态
  _fetchReqId: number;

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

  // Actions - 检查点
  fetchCheckpoints: (sessionId: string) => Promise<Checkpoint[]>;
  createCheckpoint: (sessionId: string, name?: string, description?: string) => Promise<Checkpoint>;
  restoreCheckpoint: (sessionId: string, checkpointId: string) => Promise<void>;
  deleteCheckpoint: (checkpointId: string, sessionId: string) => Promise<void>;
  clearCheckpoints: () => void;

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

  // 初始状态 - 检查点
  checkpoints: [],
  isLoadingCheckpoints: false,
  checkpointsBySession: {},

  // 初始状态 - 筛选
  platform: null,
  searchQuery: '',

  // 初始状态 - 分页
  limit: 20,
  offset: 0,

  // 初始状态 - 刷新键
  refreshKey: 0,

  // 初始状态 - 请求计数器
  _fetchReqId: 0,

  // 获取会话列表
  fetchSessions: async (_platform?: string, _limit?: number, _offset?: number) => {
    const platform = _platform ?? get().platform;
    const limit = _limit ?? get().limit;
    const offset = _offset ?? get().offset;

    // 请求计数器：防止并发请求的竞态条件
    const { _fetchReqId } = get();
    const thisReqId = _fetchReqId + 1;
    set({ _fetchReqId: thisReqId, isLoading: true, error: null, platform: platform ?? null, limit, offset });

    try {
      const response = await sessionApi.listSessions({ platform: platform || undefined, limit, offset });
      logger.debug('[SessionStore] Server returned sessions:', response.sessions.length);

      // Preserve optimistically added sessions that are not yet in the server response
      const { sessions: currentSessions, optimisticSessionIds } = get();
      const optimisticSessions = currentSessions.filter(s =>
        optimisticSessionIds.has(s.id) && !response.sessions.some(rs => rs.id === s.id)
      );

      logger.debug('[SessionStore] Optimistic sessions to preserve:', optimisticSessions.length);

      // 如果此时 _fetchReqId 已变化，说明有更新的请求，丢弃此结果
      if (get()._fetchReqId !== thisReqId) {
        logger.debug('[SessionStore] Discarding stale fetch result (reqId mismatch)');
        return;
      }

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

      // Check for open tabs that are not in the session list
      const { openTabs } = useNavigationStore.getState();

      // For each open tab that's not in mergedSessions
      for (const tab of openTabs) {
        if (mergedSessions.some(s => s.id === tab.id)) continue;

        // Handle "new_" tabs - create optimistic session entry
        if (tab.id.startsWith('new_')) {
          const now = new Date().toISOString();
          const newSession: Session = {
            id: tab.id,
            platform: 'cli',
            chat_id: '',
            chat_name: tab.title || 'New Session',
            started_at: now,
            last_activity_at: now,
            message_count: 0,
            model: '',
            input_tokens: 0,
            output_tokens: 0,
            estimated_cost_usd: 0,
            status: 'active',
          };
          mergedSessions.unshift(newSession);
          logger.debug('[SessionStore] Created optimistic session for new_ tab:', tab.id);
          continue;
        }

        logger.debug('[SessionStore] Tab not in session list, fetching:', tab.id);

        // Try to fetch this session individually
        try {
          const sessionResponse = await sessionApi.getSession(tab.id);
          if (sessionResponse) {
            // getSession returns SessionMessagesResponse which has session_id and messages
            // Build a Session object from the response and existing data
            const existingSession = get().sessions.find(s => s.id === tab.id);
            const sessionWithTitle: Session = existingSession || {
              id: sessionResponse.session_id,
              platform: 'cli',
              chat_id: '',
              chat_name: tab.title || `会话 ${tab.id.slice(0, 12)}`,
              started_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
              message_count: sessionResponse.messages?.length || 0,
              model: '',
              input_tokens: 0,
              output_tokens: 0,
              estimated_cost_usd: 0,
              status: 'active',
            };
            mergedSessions.unshift(sessionWithTitle);
            logger.debug('[SessionStore] Fetched missing session:', tab.id, 'title:', sessionWithTitle.chat_name);
          }
        } catch (err) {
          // Session does not exist on server - close the stale tab
          logger.warn('[SessionStore] Session not found, closing tab:', tab.id);
          newOptimisticIds.delete(tab.id);
          // Close the stale tab in navigation store
          useNavigationStore.getState().closeTab(tab.id);
        }
      }

      // Sort by last_activity_at descending
      mergedSessions.sort((a, b) =>
        new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      );

      // Deduplicate by session id (in case of any duplicates from merge or server)
      const deduplicatedSessions = mergedSessions.filter((session, index, self) =>
        index === self.findIndex(s => s.id === session.id)
      );

      // 最后一次检查是否已被更新请求覆盖
      if (get()._fetchReqId !== thisReqId) {
        logger.debug('[SessionStore] Discarding stale fetch result before set (reqId mismatch)');
        return;
      }

      if (deduplicatedSessions.length !== mergedSessions.length) {
        logger.debug('[SessionStore] Removed duplicates:', mergedSessions.length - deduplicatedSessions.length);
      }

      // Apply user-renamed titles from localStorage (overrides Hermes Agent auto-titles)
      let storedTitles: Record<string, string> = {};
      try {
        storedTitles = JSON.parse(localStorage.getItem('hermes-session-titles') || '{}');
      } catch {}
      if (Object.keys(storedTitles).length > 0) {
        for (const session of deduplicatedSessions) {
          if (storedTitles[session.id] && session.chat_name !== storedTitles[session.id]) {
            session.chat_name = storedTitles[session.id];
          }
        }
      }

      set({
        sessions: deduplicatedSessions,
        total: response.total + optimisticSessions.length,
        isLoading: false,
        optimisticSessionIds: newOptimisticIds,
      });

      logger.debug('[SessionStore] Final merged sessions:', mergedSessions.length);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
    }
  },

  // 强制刷新会话列表
  refreshSessions: () => {
    const { refreshKey, fetchSessions } = get();
    set({ refreshKey: refreshKey + 1 });
    // Immediately fetch sessions from server
    fetchSessions();
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
      logger.debug('[SessionStore] Session already exists, skipping optimistic add:', sessionId);
      return;
    }

    // Default title - will be updated when session is fetched from server
    const sessionTitle = 'New Session';

    const now = new Date().toISOString();
    const newSession: Session = {
      id: sessionId,
      platform: 'cli',
      chat_id: '',
      chat_name: sessionTitle,
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
    logger.debug('[SessionStore] Optimistically added session:', sessionId, 'title:', sessionTitle);
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
    // 先检查缓存 — 命中则立即返回，后台静默刷新
    const cached = get().getCachedMessages(id);
    if (cached && cached.length > 0) {
      logger.debug('[SessionStore] Using cached messages for:', id);

      // 从会话列表中找到 session 信息
      const sessionFromList = get().sessions.find(s => s.id === id);
      set({
        currentSession: sessionFromList || get().currentSession,
        messages: cached,
        isLoading: false,
        isLoadingMessages: false,
      });

      // 后台刷新缓存（静默，不显示 loading）
      try {
        const response = await sessionApi.getSession(id);
        if (response && response.messages) {
          get().cacheMessages(id, response.messages);
          set({ messages: response.messages });
        }
      } catch (error) {
        logger.debug('[SessionStore] Background cache refresh failed, using cached data:', error);
      }

      return cached;
    }

    set({ isLoading: true, isLoadingMessages: true, error: null });

    try {
      logger.debug('[SessionStore] Fetching session:', id);
      const response = await sessionApi.getSession(id);
      logger.debug('[SessionStore] Session response:', response);

      if (!response) {
        set({ isLoading: false, isLoadingMessages: false, currentSession: null, messages: [] });
        return [];
      }

      // 缓存消息
      const messages = response.messages || [];
      get().cacheMessages(id, messages);

      // Build currentSession from the session list or create a minimal one
      const sessionFromList = get().sessions.find(s => s.id === id);
      const currentSession: Session = sessionFromList || {
        id: response.session_id,
        platform: 'cli',
        chat_id: '',
        chat_name: '',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        message_count: messages.length,
        model: '',
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        status: 'active',
      };

      set({
        currentSession,
        messages,
        isLoading: false,
        isLoadingMessages: false
      });

      return messages;
    } catch (err) {
      logger.error('[SessionStore] Error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false, isLoadingMessages: false, currentSession: null, messages: [] });
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

      if (!response) {
        set({ isLoadingMessages: false });
        return [];
      }

      logger.debug('[SessionStore] Messages response:', response.messages.length, 'messages');

      // 缓存消息
      get().cacheMessages(sessionId, response.messages);

      // Build currentSession from the session list or create a minimal one
      const sessionFromList = get().sessions.find(s => s.id === sessionId);
      const currentSession: Session = sessionFromList || {
        id: response.session_id,
        platform: 'cli',
        chat_id: '',
        chat_name: '',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        message_count: response.messages.length,
        model: '',
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        status: 'active',
      };

      // 更新状态
      const currentState = get();
      if (!currentState.currentSession) {
        set({
          currentSession,
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

      // 清除 chatStore 中的会话状态（防止流式状态悬挂）
      useChatStore.getState().clearSession(id);

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

      // Save user-renamed titles to localStorage so they survive Hermes Agent overwrites
      try {
        const stored = JSON.parse(localStorage.getItem('hermes-session-titles') || '{}');
        stored[id] = title;
        localStorage.setItem('hermes-session-titles', JSON.stringify(stored));
      } catch {}

      // Update the tab title in navigation store
      useNavigationStore.getState().updateTabTitle(id, title);

      // Save tabs to persist the updated title
      useNavigationStore.getState().saveTabs();

      logger.debug('[SessionStore] Updated session title:', id, title);
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

  // ============================================
  // Checkpoint Actions (using real backend API)
  // ============================================

  // 获取会话的检查点列表
  fetchCheckpoints: async (sessionId: string): Promise<Checkpoint[]> => {
    set({ isLoadingCheckpoints: true, error: null });

    try {
      const checkpoints = await sessionApiRaw.listCheckpoints(sessionId);

      // Cache checkpoints locally
      const { checkpointsBySession } = get();
      set({
        checkpoints,
        checkpointsBySession: {
          ...checkpointsBySession,
          [sessionId]: checkpoints,
        },
        isLoadingCheckpoints: false,
      });

      logger.debug('[SessionStore] Fetched checkpoints:', checkpoints.length, 'for session:', sessionId);
      return checkpoints;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoadingCheckpoints: false });
      return [];
    }
  },

  // 创建检查点
  createCheckpoint: async (sessionId: string, name?: string, description?: string): Promise<Checkpoint> => {
    set({ isLoadingCheckpoints: true, error: null });

    try {
      const checkpoint = await sessionApiRaw.createCheckpoint(sessionId, name, description);

      if (!checkpoint) {
        throw new Error('Failed to create checkpoint');
      }

      const { checkpointsBySession } = get();
      const sessionCheckpoints = checkpointsBySession[sessionId] || [];

      set({
        checkpoints: [checkpoint, ...get().checkpoints],
        checkpointsBySession: {
          ...checkpointsBySession,
          [sessionId]: [checkpoint, ...sessionCheckpoints],
        },
        isLoadingCheckpoints: false,
      });

      logger.debug('[SessionStore] Created checkpoint:', checkpoint.id, 'for session:', sessionId);
      return checkpoint;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoadingCheckpoints: false });
      throw err;
    }
  },

  // 恢复检查点
  restoreCheckpoint: async (sessionId: string, checkpointId: string): Promise<void> => {
    set({ isLoading: true, error: null });

    try {
      await sessionApiRaw.restoreCheckpoint(sessionId, checkpointId);

      // Clear message cache and refresh messages for this session
      const { messageCache } = get();
      const newCache = { ...messageCache };
      delete newCache[sessionId];

      const { currentSession } = get();
      if (currentSession?.id === sessionId) {
        await get().fetchMessages(sessionId);
      }

      set({
        messageCache: newCache,
        isLoading: false,
      });

      logger.debug('[SessionStore] Restored checkpoint:', checkpointId, 'for session:', sessionId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error', isLoading: false });
      throw err;
    }
  },

  // 删除检查点
  deleteCheckpoint: async (checkpointId: string, sessionId: string): Promise<void> => {
    try {
      await sessionApiRaw.deleteCheckpoint(checkpointId);

      const { checkpointsBySession } = get();
      const sessionCheckpoints = checkpointsBySession[sessionId] || [];
      const updatedSessionCheckpoints = sessionCheckpoints.filter(c => c.id !== checkpointId);

      set({
        checkpoints: get().checkpoints.filter(c => c.id !== checkpointId),
        checkpointsBySession: {
          ...checkpointsBySession,
          [sessionId]: updatedSessionCheckpoints,
        },
      });

      logger.debug('[SessionStore] Deleted checkpoint:', checkpointId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg || 'Unknown error' });
      throw err;
    }
  },

  // 清除检查点状态
  clearCheckpoints: () => {
    set({
      checkpoints: [],
      checkpointsBySession: {},
      isLoadingCheckpoints: false,
    });
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
      // 保留已有会话的信息（chat_name, model 等）
      const { sessions: existingSessions } = get();
      const existingMap = new Map(existingSessions.map(s => [s.id, s]));

      const sessions: Session[] = response.results.map((result) => {
        const existing = existingMap.get(result.session_id);
        return {
          id: result.session_id,
          platform: result.platform as Session['platform'],
          chat_id: existing?.chat_id || '',
          chat_name: existing?.chat_name || '',
          started_at: existing?.started_at || result.matched_at,
          last_activity_at: result.matched_at,
          message_count: existing?.message_count || 0,
          model: existing?.model || '',
          input_tokens: existing?.input_tokens || 0,
          output_tokens: existing?.output_tokens || 0,
          estimated_cost_usd: existing?.estimated_cost_usd || 0,
          status: existing?.status || 'completed',
        };
      });

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

// Debug: log state changes only in development mode with explicit debug flag
// This prevents performance issues from excessive logging in production
if (typeof window !== 'undefined' && import.meta.env?.DEV && localStorage.getItem('hermes-debug') === 'true') {
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
