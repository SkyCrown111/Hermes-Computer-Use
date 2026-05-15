// Monitor Store - 监控日志状态管理

import { create } from 'zustand';
import type { LogLine, LogFile, LogLevel, LogsResponse, GatewayDetailedStatus, PerformanceMetrics, LogStats } from '../types/monitor';
import { monitorApi } from '../services/monitorApi';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';

// 解析日志行
const parseLogLine = (raw: string): LogLine => {
  // 尝试解析标准格式: 2025-01-15 10:30:15 INFO [component] message
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL)?\s*(?:\[([^\]]+)\])?\s*(.*)$/);
  
  if (match) {
    return {
      raw,
      timestamp: match[1],
      level: match[2] as LogLevel | undefined,
      component: match[3],
      message: match[4],
    };
  }
  
  return { raw };
};

interface MonitorState {
  // 日志数据
  logs: LogLine[];
  rawLines: string[];
  currentFile: LogFile;
  isLoadingLogs: boolean;

  // 筛选条件
  filterLevel: LogLevel | null;
  filterComponent: string | null;
  searchQuery: string;

  // 搜索防抖
  searchTimeoutId: ReturnType<typeof setTimeout> | null;
  
  // 日志统计
  logStats: LogStats | null;
  
  // Gateway 状态
  gatewayStatus: GatewayDetailedStatus | null;
  isLoadingGateway: boolean;
  
  // 性能指标
  performanceMetrics: PerformanceMetrics | null;
  isLoadingMetrics: boolean;
  
  // 可用组件
  availableComponents: string[];
  
  // 自动刷新
  autoRefresh: boolean;
  refreshInterval: number;

  // 实时日志流
  liveStream: boolean;
  liveStreamId: string | null;
  
  // 错误
  error: string | null;
  
  // Actions
  fetchLogs: (params?: { file?: LogFile; lines?: number }) => Promise<void>;
  setFilterLevel: (level: LogLevel | null) => void;
  setFilterComponent: (component: string | null) => void;
  setSearchQuery: (query: string) => void;
  cleanupSearchTimer: () => void;
  fetchLogStats: () => Promise<void>;
  fetchGatewayStatus: () => Promise<void>;
  fetchPerformanceMetrics: (minutes?: number) => Promise<void>;
  fetchComponents: () => Promise<void>;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  startLiveStream: () => Promise<void>;
  stopLiveStream: () => Promise<void>;
  appendLiveLogEntry: (entry: { timestamp: string; level: string; message: string }) => void;
  clearLogs: () => void;
  clearError: () => void;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  // 初始状态
  logs: [],
  rawLines: [],
  currentFile: 'agent',
  isLoadingLogs: false,
  filterLevel: null,
  filterComponent: null,
  searchQuery: '',
  searchTimeoutId: null,
  logStats: null,
  gatewayStatus: null,
  isLoadingGateway: false,
  performanceMetrics: null,
  isLoadingMetrics: false,
  availableComponents: [],
  autoRefresh: true,
  refreshInterval: 5000,
  liveStream: false,
  liveStreamId: null,
  error: null,

  // 获取日志
  fetchLogs: async (params = {}) => {
    const { file, lines = 200 } = params;
    const currentFile = file || get().currentFile;
    
    set({ isLoadingLogs: true, currentFile });
    try {
      const { filterLevel, filterComponent, searchQuery } = get();
      const response: LogsResponse = await monitorApi.getLogs({
        file: currentFile,
        lines,
        level: filterLevel || undefined,
        component: filterComponent || undefined,
        search: searchQuery || undefined,
      });
      
      const parsedLogs = response.lines.map(parseLogLine);
      set({ 
        logs: parsedLogs, 
        rawLines: response.lines, 
        isLoadingLogs: false 
      });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingLogs: false });
    }
  },

  // 设置级别筛选 (skip if value unchanged)
  setFilterLevel: (level) => {
    if (get().filterLevel === level) return;
    set({ filterLevel: level });
    get().fetchLogs();
  },

  // 设置组件筛选 (skip if value unchanged)
  setFilterComponent: (component) => {
    if (get().filterComponent === component) return;
    set({ filterComponent: component });
    get().fetchLogs();
  },

  // 设置搜索查询
  setSearchQuery: (query) => {
    // 清除上一次防抖定时器
    const { searchTimeoutId } = get();
    if (searchTimeoutId) clearTimeout(searchTimeoutId);

    set({ searchQuery: query, searchTimeoutId: null });
    // 防抖搜索
    const timeoutId = setTimeout(() => {
      // 检查 store 中的 query 是否还是当前值，且 timer 未被清理
      const state = get();
      if (state.searchQuery === query && state.searchTimeoutId === null) {
        get().fetchLogs();
      }
    }, 300);
    set({ searchTimeoutId: timeoutId });
  },

  // 清理搜索定时器（组件卸载时调用）
  cleanupSearchTimer: () => {
    const { searchTimeoutId } = get();
    if (searchTimeoutId) {
      clearTimeout(searchTimeoutId);
      set({ searchTimeoutId: null });
    }
  },

  // 获取日志统计
  fetchLogStats: async () => {
    try {
      const stats = await monitorApi.getLogStats(get().currentFile);
      set({ logStats: stats });
    } catch (err) {
      logger.error('Failed to fetch log stats:', err);
      set({ error: getErrorMessage(err) });
    }
  },

  // 获取 Gateway 状态
  fetchGatewayStatus: async () => {
    set({ isLoadingGateway: true });
    try {
      const status = await monitorApi.getGatewayStatus();
      set({ gatewayStatus: status, isLoadingGateway: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingGateway: false });
    }
  },

  // 获取性能指标
  fetchPerformanceMetrics: async (minutes = 30) => {
    set({ isLoadingMetrics: true });
    try {
      const metrics = await monitorApi.getPerformanceMetrics(minutes);
      set({ performanceMetrics: metrics, isLoadingMetrics: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingMetrics: false });
    }
  },

  // 获取可用组件
  fetchComponents: async () => {
    try {
      const components = await monitorApi.getComponents();
      set({ availableComponents: components });
    } catch (err) {
      logger.error('Failed to fetch components:', err);
      set({ error: getErrorMessage(err) });
    }
  },

  // 设置自动刷新
  setAutoRefresh: (enabled) => {
    set({ autoRefresh: enabled });
  },

  // 设置刷新间隔
  setRefreshInterval: (interval) => {
    set({ refreshInterval: interval });
  },

  appendLiveLogEntry: (entry) => {
    const raw = `[${entry.timestamp}] ${entry.level} ${entry.message}`;
    const parsed = parseLogLine(raw);
    const line: LogLine = parsed.message
      ? parsed
      : {
          raw,
          timestamp: entry.timestamp,
          level: entry.level as LogLevel | undefined,
          message: entry.message,
        };
    set((state) => ({
      logs: [...state.logs, line].slice(-2000),
      rawLines: [...state.rawLines, raw].slice(-2000),
    }));
  },

  startLiveStream: async () => {
    const { currentFile, filterLevel, filterComponent, searchQuery, liveStreamId } = get();
    try {
      if (liveStreamId) {
        await monitorApi.stopLogStream(liveStreamId);
      }
      const streamId = await monitorApi.startLogStream(currentFile, {
        level: filterLevel ?? undefined,
        module: filterComponent ?? undefined,
        keyword: searchQuery || undefined,
      });
      set({ liveStream: true, liveStreamId: streamId, autoRefresh: false });
    } catch (err) {
      set({ error: getErrorMessage(err) });
      throw err;
    }
  },

  stopLiveStream: async () => {
    const { liveStreamId } = get();
    try {
      if (liveStreamId) {
        await monitorApi.stopLogStream(liveStreamId);
      }
    } catch (err) {
      logger.error('[MonitorStore] stopLiveStream failed:', err);
    } finally {
      set({ liveStream: false, liveStreamId: null });
    }
  },

  // 清除日志
  clearLogs: () => {
    set({ logs: [], rawLines: [] });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
