// Monitor Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMonitorStore } from '../monitorStore';
import type { LogLine } from '../../types/monitor';

// Mock the monitor API
vi.mock('../../services/monitorApi', () => ({
  monitorApi: {
    getLogs: vi.fn(),
    getLogStats: vi.fn(),
    getGatewayStatus: vi.fn(),
    getPerformanceMetrics: vi.fn(),
    getComponents: vi.fn(),
  },
}));

import { monitorApi } from '../../services/monitorApi';

describe('MonitorStore', () => {
  beforeEach(() => {
    useMonitorStore.setState({
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
      autoRefresh: false,
      refreshInterval: 5000,
      error: null,
    });
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fetchLogs', () => {
    it('should fetch and parse logs', async () => {
      const mockLines = [
        '2025-01-15 10:30:15 INFO [gateway] Application started',
        '2025-01-15 10:30:20 ERROR [chat] Connection failed',
      ];
      vi.mocked(monitorApi.getLogs).mockResolvedValue({ lines: mockLines, file: 'agent' });

      await useMonitorStore.getState().fetchLogs();

      const state = useMonitorStore.getState();
      expect(state.logs).toHaveLength(2);
      expect(state.logs[0].level).toBe('INFO');
      expect(state.logs[0].component).toBe('gateway');
      expect(state.logs[1].level).toBe('ERROR');
    });

    it('should use provided file parameter', async () => {
      vi.mocked(monitorApi.getLogs).mockResolvedValue({ lines: [], file: 'gateway' });

      await useMonitorStore.getState().fetchLogs({ file: 'gateway' });

      expect(useMonitorStore.getState().currentFile).toBe('gateway');
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(monitorApi.getLogs).mockRejectedValue(new Error('Failed'));

      await useMonitorStore.getState().fetchLogs();

      expect(useMonitorStore.getState().error).toBe('Failed');
    });
  });

  describe('setFilterLevel', () => {
    it('should set filter level and refetch', async () => {
      vi.mocked(monitorApi.getLogs).mockResolvedValue({ lines: [], file: 'agent' });

      useMonitorStore.getState().setFilterLevel('ERROR');

      expect(useMonitorStore.getState().filterLevel).toBe('ERROR');
      expect(monitorApi.getLogs).toHaveBeenCalled();
    });
  });

  describe('setFilterComponent', () => {
    it('should set filter component and refetch', async () => {
      vi.mocked(monitorApi.getLogs).mockResolvedValue({ lines: [], file: 'agent' });

      useMonitorStore.getState().setFilterComponent('gateway');

      expect(useMonitorStore.getState().filterComponent).toBe('gateway');
      expect(monitorApi.getLogs).toHaveBeenCalled();
    });
  });

  describe('setSearchQuery', () => {
    it('should set search query with debounce', () => {
      vi.mocked(monitorApi.getLogs).mockResolvedValue({ lines: [], file: 'agent' });

      useMonitorStore.getState().setSearchQuery('test');

      expect(useMonitorStore.getState().searchQuery).toBe('test');
      // Should have set a timeout for debounced search
      expect(useMonitorStore.getState().searchTimeoutId).not.toBeNull();
    });

    it('should clear previous timeout on new query', () => {
      useMonitorStore.getState().setSearchQuery('test1');
      const firstTimeout = useMonitorStore.getState().searchTimeoutId;

      useMonitorStore.getState().setSearchQuery('test2');
      const secondTimeout = useMonitorStore.getState().searchTimeoutId;

      expect(firstTimeout).not.toBe(secondTimeout);
    });
  });

  describe('cleanupSearchTimer', () => {
    it('should clear search timeout', () => {
      useMonitorStore.getState().setSearchQuery('test');
      expect(useMonitorStore.getState().searchTimeoutId).not.toBeNull();

      useMonitorStore.getState().cleanupSearchTimer();

      expect(useMonitorStore.getState().searchTimeoutId).toBeNull();
    });
  });

  describe('fetchLogStats', () => {
    it('should fetch log stats', async () => {
      const mockStats = {
        total_lines: 100,
        by_level: { DEBUG: 0, INFO: 80, WARNING: 0, ERROR: 20, CRITICAL: 0 },
        by_component: [],
        error_rate: 0.2,
      };
      vi.mocked(monitorApi.getLogStats).mockResolvedValue(mockStats);

      await useMonitorStore.getState().fetchLogStats();

      expect(useMonitorStore.getState().logStats).toEqual(mockStats);
    });
  });

  describe('fetchGatewayStatus', () => {
    it('should fetch gateway status', async () => {
      const mockStatus = {
        status: 'online' as const,
        version: '1.0.0',
        uptime_seconds: 3600,
        connections: [],
        total_messages: 100,
        messages_per_minute: 5,
        active_requests: 0,
        queue_depth: 0,
        avg_response_time_ms: 0,
        memory_usage_mb: 0,
        cpu_usage_percent: 0,
        error_stats: { total_errors: 0, by_type: {}, last_hour: 0, last_24h: 0 },
        connection_history: [],
        throughput: { requests_per_second: 0, bytes_per_second: 0, peak_requests_per_second: 0, peak_bytes_per_second: 0 },
      };
      vi.mocked(monitorApi.getGatewayStatus).mockResolvedValue(mockStatus);

      await useMonitorStore.getState().fetchGatewayStatus();

      expect(useMonitorStore.getState().gatewayStatus).toEqual(mockStatus);
    });
  });

  describe('fetchPerformanceMetrics', () => {
    it('should fetch performance metrics', async () => {
      const mockMetrics = {
        cpu: [{ timestamp: '', value: 25 }],
        memory: [{ timestamp: '', value: 50 }],
        network_in: [],
        network_out: [],
      };
      vi.mocked(monitorApi.getPerformanceMetrics).mockResolvedValue(mockMetrics);

      await useMonitorStore.getState().fetchPerformanceMetrics(30);

      expect(useMonitorStore.getState().performanceMetrics).toEqual(mockMetrics);
      expect(monitorApi.getPerformanceMetrics).toHaveBeenCalledWith(30);
    });
  });

  describe('fetchComponents', () => {
    it('should fetch available components', async () => {
      const mockComponents = ['gateway', 'chat', 'cron'];
      vi.mocked(monitorApi.getComponents).mockResolvedValue(mockComponents);

      await useMonitorStore.getState().fetchComponents();

      expect(useMonitorStore.getState().availableComponents).toEqual(mockComponents);
    });
  });

  describe('setAutoRefresh', () => {
    it('should set auto refresh', () => {
      useMonitorStore.getState().setAutoRefresh(true);
      expect(useMonitorStore.getState().autoRefresh).toBe(true);
    });
  });

  describe('setRefreshInterval', () => {
    it('should set refresh interval', () => {
      useMonitorStore.getState().setRefreshInterval(10000);
      expect(useMonitorStore.getState().refreshInterval).toBe(10000);
    });
  });

  describe('clearLogs', () => {
    it('should clear logs', () => {
      useMonitorStore.setState({ logs: [{ raw: 'test', level: 'INFO' } satisfies LogLine], rawLines: ['test'] });
      useMonitorStore.getState().clearLogs();
      expect(useMonitorStore.getState().logs).toHaveLength(0);
      expect(useMonitorStore.getState().rawLines).toHaveLength(0);
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useMonitorStore.setState({ error: 'Error' });
      useMonitorStore.getState().clearError();
      expect(useMonitorStore.getState().error).toBeNull();
    });
  });
});

import { afterEach } from 'vitest';
