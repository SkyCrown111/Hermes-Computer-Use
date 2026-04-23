// Monitor Store - 监控日志状态管理

import { create } from 'zustand';
import type { LogLine, LogFile, LogLevel, LogsResponse, GatewayDetailedStatus, PerformanceMetrics, LogStats } from '../types/monitor';
import { monitorApi } from '../services/monitorApi';
import { logger } from '../lib/logger';

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
  
  // 错误
  error: string | null;
  
  // Actions
  fetchLogs: (params?: { file?: LogFile; lines?: number }) => Promise<void>;
  setFilterLevel: (level: LogLevel | null) => void;
  setFilterComponent: (component: string | null) => void;
  setSearchQuery: (query: string) => void;
  fetchLogStats: () => Promise<void>;
  fetchGatewayStatus: () => Promise<void>;
  fetchPerformanceMetrics: (minutes?: number) => Promise<void>;
  fetchComponents: () => Promise<void>;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
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
  logStats: null,
  gatewayStatus: null,
  isLoadingGateway: false,
  performanceMetrics: null,
  isLoadingMetrics: false,
  availableComponents: [],
  autoRefresh: false,
  refreshInterval: 5000,
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
      set({ error: (err as Error).message, isLoadingLogs: false });
    }
  },

  // 设置级别筛选
  setFilterLevel: (level) => {
    set({ filterLevel: level });
    get().fetchLogs();
  },

  // 设置组件筛选
  setFilterComponent: (component) => {
    set({ filterComponent: component });
    get().fetchLogs();
  },

  // 设置搜索查询
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    // 防抖搜索
    setTimeout(() => {
      if (get().searchQuery === query) {
        get().fetchLogs();
      }
    }, 300);
  },

  // 获取日志统计
  fetchLogStats: async () => {
    try {
      const stats = await monitorApi.getLogStats(get().currentFile);
      set({ logStats: stats });
    } catch (err) {
      logger.error('Failed to fetch log stats:', err);
    }
  },

  // 获取 Gateway 状态
  fetchGatewayStatus: async () => {
    set({ isLoadingGateway: true });
    try {
      const status = await monitorApi.getGatewayStatus();
      set({ gatewayStatus: status, isLoadingGateway: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingGateway: false });
    }
  },

  // 获取性能指标
  fetchPerformanceMetrics: async (minutes = 30) => {
    set({ isLoadingMetrics: true });
    try {
      const metrics = await monitorApi.getPerformanceMetrics(minutes);
      set({ performanceMetrics: metrics, isLoadingMetrics: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingMetrics: false });
    }
  },

  // 获取可用组件
  fetchComponents: async () => {
    try {
      const components = await monitorApi.getComponents();
      set({ availableComponents: components });
    } catch (err) {
      logger.error('Failed to fetch components:', err);
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

  // 清除日志
  clearLogs: () => {
    set({ logs: [], rawLines: [] });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
