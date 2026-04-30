import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, Button, RefreshIcon, EmptyIcon, GlobeIcon, ChartIcon, TrendingUpIcon, AlertIcon, FileTextIcon, DownloadIcon } from '../../components';
import { useMonitorStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { logger } from '../../lib/logger';
import type { LogFile, LogLevel, LogLine } from '../../types/monitor';
import './Monitor.css';

// Time range options
type TimeRange = '5m' | '15m' | '1h' | '24h' | 'all';

// Format uptime
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// Format bytes for network I/O
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Get health score class
const getHealthClass = (score: number): string => {
  if (score >= 90) return 'health-excellent';
  if (score >= 70) return 'health-good';
  if (score >= 50) return 'health-fair';
  return 'health-poor';
};

// Get health label
const getHealthLabel = (score: number, t: (key: string) => string): string => {
  if (score >= 90) return t('monitor.excellent');
  if (score >= 70) return t('monitor.good');
  if (score >= 50) return t('monitor.fair');
  return t('monitor.poor');
};

// Get log level style class
const getLogLevelClass = (level?: LogLevel): string => {
  if (!level) return '';
  return `log-level-${level.toLowerCase()}`;
};

// Get log line style class
const getLogLineClass = (line: LogLine): string => {
  if (line.level === 'ERROR' || line.level === 'CRITICAL') return 'log-line-error';
  if (line.level === 'WARNING') return 'log-line-warning';
  return '';
};

// Get progress bar color class
const getProgressClass = (percent: number): string => {
  if (percent < 60) return 'metric-fill-normal';
  if (percent < 85) return 'metric-fill-warning';
  return 'metric-fill-danger';
};

// Platform icons mapping
const platformIcons: Record<string, string> = {
  telegram: 'TG',
  discord: 'DC',
  slack: 'SL',
  cli: 'CLI',
  web: 'WEB',
};

// Calculate performance metrics average
const getAverageMetric = (metrics?: { value: number }[]): number => {
  if (!metrics || metrics.length === 0) return 0;
  return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
};

// Calculate network throughput
const getNetworkThroughput = (metrics?: { value: number }[]): { current: number; avg: number } => {
  if (!metrics || metrics.length === 0) return { current: 0, avg: 0 };
  const current = metrics[metrics.length - 1]?.value || 0;
  const avg = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  return { current, avg };
};

// Time range to milliseconds
const timeRangeToMs = (range: TimeRange): number | null => {
  switch (range) {
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case 'all': return null;
  }
};

// Parse timestamp from log line
const parseTimestamp = (line: LogLine): Date | null => {
  if (!line.timestamp) return null;
  const parsed = new Date(line.timestamp);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const Monitor: React.FC = () => {
  const { t } = useTranslation();
  const logs = useMonitorStore(s => s.logs);
  const currentFile = useMonitorStore(s => s.currentFile);
  const isLoadingLogs = useMonitorStore(s => s.isLoadingLogs);
  const filterLevel = useMonitorStore(s => s.filterLevel);
  const filterComponent = useMonitorStore(s => s.filterComponent);
  const searchQuery = useMonitorStore(s => s.searchQuery);
  const gatewayStatus = useMonitorStore(s => s.gatewayStatus);
  const isLoadingGateway = useMonitorStore(s => s.isLoadingGateway);
  const performanceMetrics = useMonitorStore(s => s.performanceMetrics);
  const availableComponents = useMonitorStore(s => s.availableComponents);
  const autoRefresh = useMonitorStore(s => s.autoRefresh);
  const refreshInterval = useMonitorStore(s => s.refreshInterval);
  const error = useMonitorStore(s => s.error);
  const fetchLogs = useMonitorStore(s => s.fetchLogs);
  const setFilterLevel = useMonitorStore(s => s.setFilterLevel);
  const setFilterComponent = useMonitorStore(s => s.setFilterComponent);
  const setSearchQuery = useMonitorStore(s => s.setSearchQuery);
  const fetchGatewayStatus = useMonitorStore(s => s.fetchGatewayStatus);
  const fetchPerformanceMetrics = useMonitorStore(s => s.fetchPerformanceMetrics);
  const fetchComponents = useMonitorStore(s => s.fetchComponents);
  const setAutoRefresh = useMonitorStore(s => s.setAutoRefresh);
  const clearLogs = useMonitorStore(s => s.clearLogs);

  const logContentRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  // 初始化数据
  useEffect(() => {
    fetchLogs();
    fetchGatewayStatus();
    fetchPerformanceMetrics();
    fetchComponents();
  }, [fetchLogs, fetchGatewayStatus, fetchPerformanceMetrics, fetchComponents]);

  // Page Visibility API - pause refresh when page is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Auto refresh - respects page visibility
  useEffect(() => {
    // Only run interval when autoRefresh is on AND page is visible
    if (autoRefresh && isPageVisible) {
      refreshIntervalRef.current = setInterval(() => {
        fetchLogs();
        fetchGatewayStatus();
        fetchPerformanceMetrics();
      }, refreshInterval);
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, isPageVisible, refreshInterval, fetchLogs, fetchGatewayStatus, fetchPerformanceMetrics]);

  // Filter logs by time range
  const filteredLogs = useMemo(() => {
    const rangeMs = timeRangeToMs(timeRange);
    if (!rangeMs) return logs;

    const cutoff = Date.now() - rangeMs;
    return logs.filter(line => {
      const ts = parseTimestamp(line);
      return ts ? ts.getTime() >= cutoff : true;
    });
  }, [logs, timeRange]);

  // Log statistics
  const logStats = useMemo(() => {
    const totalLines = filteredLogs.length;
    const errorCount = filteredLogs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length;
    const warningCount = filteredLogs.filter(l => l.level === 'WARNING').length;
    const infoCount = filteredLogs.filter(l => l.level === 'INFO').length;
    const debugCount = filteredLogs.filter(l => l.level === 'DEBUG').length;
    const errorRate = totalLines > 0 ? (errorCount / totalLines) * 100 : 0;

    return { totalLines, errorCount, warningCount, infoCount, debugCount, errorRate };
  }, [filteredLogs]);

  // Calculate health score
  const healthScore = useMemo(() => {
    if (!gatewayStatus) return 0;

    let score = 100;

    // Deduct for offline status
    if (gatewayStatus.status === 'offline') score -= 50;
    else if (gatewayStatus.status === 'degraded') score -= 20;

    // Deduct for connection issues
    const disconnectedCount = gatewayStatus.connections.filter(c => c.status !== 'connected').length;
    score -= disconnectedCount * 10;

    // Deduct for error rate
    if (logStats.errorRate > 5) score -= 20;
    else if (logStats.errorRate > 1) score -= 10;

    // Deduct for high CPU
    const avgCpu = performanceMetrics
      ? performanceMetrics.cpu.reduce((sum, m) => sum + m.value, 0) / Math.max(performanceMetrics.cpu.length, 1)
      : 0;
    if (avgCpu > 80) score -= 15;
    else if (avgCpu > 60) score -= 5;

    // Deduct for high memory
    const avgMemory = performanceMetrics
      ? performanceMetrics.memory.reduce((sum, m) => sum + m.value, 0) / Math.max(performanceMetrics.memory.length, 1)
      : 0;
    if (avgMemory > 90) score -= 15;
    else if (avgMemory > 75) score -= 5;

    return Math.max(0, Math.min(100, score));
  }, [gatewayStatus, logStats.errorRate, performanceMetrics]);

  // Switch log file
  const handleFileChange = useCallback((file: LogFile) => {
    fetchLogs({ file });
  }, [fetchLogs]);

  // Refresh logs
  const handleRefresh = useCallback(() => {
    fetchLogs();
    fetchGatewayStatus();
    fetchPerformanceMetrics();
  }, [fetchLogs, fetchGatewayStatus, fetchPerformanceMetrics]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, []);

  // Export logs
  const handleExportLogs = useCallback(() => {
    const content = filteredLogs
      .map(line => {
        const parts = [];
        if (line.timestamp) parts.push(line.timestamp);
        if (line.level) parts.push(line.level);
        if (line.component) parts.push(`[${line.component}]`);
        parts.push(line.message || line.raw);
        return parts.join(' ');
      })
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFile}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredLogs, currentFile]);

  // Copy logs to clipboard
  const handleCopyLogs = useCallback(async () => {
    const content = filteredLogs
      .map(line => {
        const parts = [];
        if (line.timestamp) parts.push(line.timestamp);
        if (line.level) parts.push(line.level);
        if (line.component) parts.push(`[${line.component}]`);
        parts.push(line.message || line.raw);
        return parts.join(' ');
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      logger.error('[Monitor] Failed to copy to clipboard:', err);
    }
  }, [filteredLogs]);

  const avgCpu = performanceMetrics ? getAverageMetric(performanceMetrics.cpu) : 0;
  const avgMemory = performanceMetrics ? getAverageMetric(performanceMetrics.memory) : 0;
  const networkIn = performanceMetrics ? getNetworkThroughput(performanceMetrics.network_in) : { current: 0, avg: 0 };
  const networkOut = performanceMetrics ? getNetworkThroughput(performanceMetrics.network_out) : { current: 0, avg: 0 };

  // Virtual list for logs (only enable for large lists > 200 lines)
  const logVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => logContentRef.current,
    estimateSize: () => 24, // Approximate log line height
    overscan: 20,
  });

  return (
    <div className="monitor">
      {/* Header Controls */}
      <div className="monitor-header">
          <div className="monitor-controls">
            {/* File Selector */}
            <div className="file-selector">
              <span className="file-selector-label">{t('monitor.logFile')}:</span>
              <div className="file-selector-tabs">
                {(['agent', 'gateway', 'cron', 'mcp'] as LogFile[]).map((file) => (
                  <button
                    key={file}
                    className={`file-tab ${currentFile === file ? 'file-tab-active' : ''}`}
                    onClick={() => handleFileChange(file)}
                  >
                    {file}
                  </button>
                ))}
              </div>
            </div>

            {/* Level Filter */}
            <select
              className="filter-select"
              value={filterLevel || ''}
              onChange={(e) => setFilterLevel(e.target.value as LogLevel || null)}
            >
              <option value="">{t('monitor.allLevels')}</option>
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Component Filter */}
            {availableComponents.length > 0 && (
              <select
                className="filter-select"
                value={filterComponent || ''}
                onChange={(e) => setFilterComponent(e.target.value || null)}
              >
                <option value="">{t('monitor.allComponents')}</option>
                {availableComponents.map((comp) => (
                  <option key={comp} value={comp}>{comp}</option>
                ))}
              </select>
            )}

            {/* Time Range Filter */}
            <select
              className="filter-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="all">{t('monitor.allTime')}</option>
              <option value="5m">{t('monitor.last5min')}</option>
              <option value="15m">{t('monitor.last15min')}</option>
              <option value="1h">{t('monitor.last1hour')}</option>
              <option value="24h">{t('monitor.last24hours')}</option>
            </select>

            {/* Search */}
            <input
              type="text"
              className="search-input"
              placeholder={t('monitor.searchLogs')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="monitor-controls">
            {/* Auto Refresh Toggle */}
            <button
              className={`refresh-toggle ${autoRefresh ? 'refresh-toggle-active' : ''}`}
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh && !isPageVisible ? 'Auto-refresh paused (page hidden)' : undefined}
            >
              <span className={`refresh-icon ${autoRefresh && isPageVisible ? 'refresh-icon-spinning' : ''}`}><RefreshIcon size={14} /></span>
              <span>
                {autoRefresh
                  ? isPageVisible
                    ? t('monitor.autoRefreshing')
                    : 'Auto-refresh (paused)'
                  : t('monitor.autoRefresh')}
              </span>
            </button>

            <Button variant="secondary" onClick={handleRefresh}>
              {t('monitor.refresh')}
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertIcon size={16} />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshIcon size={14} /> {t('common.refresh')}
            </Button>
          </div>
        )}

        {/* Main Content */}
        <div className="monitor-grid">
          {/* Log Viewer */}
          <Card className="log-viewer">
            <div className="log-header">
              <div className="log-title">
                <span><FileTextIcon size={16} /></span>
                <span>{currentFile}.log</span>
                <span className="log-count">{filteredLogs.length} {t('monitor.lines')}</span>
              </div>
              <div className="log-actions">
                <Button variant="ghost" size="sm" onClick={scrollToBottom}>
                  {t('monitor.latest')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopyLogs}>
                  {t('monitor.copiedToClipboard')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportLogs}>
                  <DownloadIcon size={14} /> {t('monitor.exportLogs')}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearLogs}>
                  {t('monitor.clear')}
                </Button>
              </div>
            </div>

            <div className="log-content" ref={logContentRef}>
              {isLoadingLogs ? (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : filteredLogs.length > 200 ? (
                // Virtualized list for large log files
                <div
                  style={{
                    height: `${logVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {logVirtualizer.getVirtualItems().map(virtualRow => {
                    const line = filteredLogs[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.index}
                        className={`log-line ${getLogLineClass(line)}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {line.timestamp && (
                          <span className="log-timestamp">{line.timestamp}</span>
                        )}
                        {line.level && (
                          <span className={`log-level ${getLogLevelClass(line.level)}`}>
                            {line.level}
                          </span>
                        )}
                        {line.component && (
                          <span className="log-component">[{line.component}]</span>
                        )}
                        <span className="log-message">{line.message || line.raw}</span>
                      </div>
                    );
                  })}
                </div>
              ) : filteredLogs.length > 0 ? (
                // Normal rendering for small logs
                filteredLogs.map((line, index) => (
                  <div key={index} className={`log-line ${getLogLineClass(line)}`}>
                    {line.timestamp && (
                      <span className="log-timestamp">{line.timestamp}</span>
                    )}
                    {line.level && (
                      <span className={`log-level ${getLogLevelClass(line.level)}`}>
                        {line.level}
                      </span>
                    )}
                    {line.component && (
                      <span className="log-component">[{line.component}]</span>
                    )}
                    <span className="log-message">{line.message || line.raw}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><EmptyIcon size={24} /></span>
                  <span>{t('monitor.noLogs')}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Sidebar */}
          <div className="monitor-sidebar">
            {/* Gateway Health Card */}
            <Card className="gateway-health-card" title={t('monitor.gatewayHealth')} icon={<GlobeIcon size={18} />}>
              {isLoadingGateway ? (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : gatewayStatus ? (
                <>
                  {/* Health Score */}
                  <div className="health-score-section">
                    <div className={`health-score-ring ${getHealthClass(healthScore)}`}>
                      <svg viewBox="0 0 36 36" className="health-ring-svg">
                        <path
                          className="health-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="health-ring-fill"
                          strokeDasharray={`${healthScore}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="health-score-value">{healthScore}</span>
                    </div>
                    <div className="health-score-info">
                      <span className={`health-label ${getHealthClass(healthScore)}`}>
                        {getHealthLabel(healthScore, t)}
                      </span>
                      <span className="health-status-text">
                        {gatewayStatus.status === 'online' ? t('dashboard.online') :
                         gatewayStatus.status === 'offline' ? t('dashboard.offline') : t('monitor.degraded')}
                      </span>
                    </div>
                  </div>

                  {/* Gateway Stats Grid */}
                  <div className="gateway-stats-grid">
                    <div className="gateway-stat-item">
                      <span className="gateway-stat-label">{t('monitor.uptime')}</span>
                      <span className="gateway-stat-value">{formatUptime(gatewayStatus.uptime_seconds)}</span>
                    </div>
                    <div className="gateway-stat-item">
                      <span className="gateway-stat-label">{t('monitor.totalMessages')}</span>
                      <span className="gateway-stat-value">{gatewayStatus.total_messages.toLocaleString()}</span>
                    </div>
                    <div className="gateway-stat-item">
                      <span className="gateway-stat-label">{t('monitor.messagesPerMin')}</span>
                      <span className="gateway-stat-value">{gatewayStatus.messages_per_minute.toFixed(1)}</span>
                    </div>
                    <div className="gateway-stat-item">
                      <span className="gateway-stat-label">{t('monitor.errorRate')}</span>
                      <span className={`gateway-stat-value ${logStats.errorRate > 5 ? 'stat-danger' : logStats.errorRate > 1 ? 'stat-warning' : ''}`}>
                        {logStats.errorRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Advanced Gateway Metrics */}
                  <div className="gateway-advanced-stats">
                    <div className="gateway-stat-row">
                      <span className="gateway-stat-label">{t('gateway.activeRequests')}</span>
                      <span className="gateway-stat-value">{gatewayStatus.active_requests}</span>
                    </div>
                    <div className="gateway-stat-row">
                      <span className="gateway-stat-label">{t('gateway.queueDepth')}</span>
                      <span className={`gateway-stat-value ${gatewayStatus.queue_depth > 10 ? 'stat-danger' : gatewayStatus.queue_depth > 5 ? 'stat-warning' : ''}`}>
                        {gatewayStatus.queue_depth}
                      </span>
                    </div>
                    <div className="gateway-stat-row">
                      <span className="gateway-stat-label">{t('gateway.avgResponseTime')}</span>
                      <span className="gateway-stat-value">{gatewayStatus.avg_response_time_ms.toFixed(0)} ms</span>
                    </div>
                    <div className="gateway-stat-row">
                      <span className="gateway-stat-label">{t('gateway.memoryUsage')}</span>
                      <span className={`gateway-stat-value ${gatewayStatus.memory_usage_mb > 500 ? 'stat-warning' : ''}`}>
                        {gatewayStatus.memory_usage_mb.toFixed(1)} MB
                      </span>
                    </div>
                  </div>

                  {/* Platform Connections */}
                  <div className="platform-list">
                    {gatewayStatus.connections.map((conn) => (
                      <div key={conn.platform} className="platform-item">
                        <span className="platform-name">
                          <span className="platform-icon">
                            {platformIcons[conn.platform] || 'PL'}
                          </span>
                          {conn.platform}
                        </span>
                        <span className={`platform-status platform-status-${conn.status}`}>
                          {conn.status === 'connected' ? t('monitor.connected') :
                           conn.status === 'disconnected' ? t('monitor.disconnected') : t('platforms.error')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span>{t('monitor.cannotGetGateway')}</span>
                </div>
              )}
            </Card>

            {/* Performance Metrics */}
            <Card className="metrics-card" title={t('monitor.performanceMetrics')} icon={<ChartIcon size={18} />}>
              {performanceMetrics ? (
                <div className="metrics-grid">
                  {/* CPU Usage */}
                  <div className="metric-item">
                    <div className="metric-header">
                      <span className="metric-label">{t('monitor.cpuUsage')}</span>
                      <span className={`metric-value ${avgCpu > 80 ? 'stat-danger' : avgCpu > 60 ? 'stat-warning' : ''}`}>
                        {avgCpu.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`metric-fill ${getProgressClass(avgCpu)}`}
                        style={{ width: `${Math.min(avgCpu, 100)}%` }}
                      />
                    </div>
                    {/* Mini Chart */}
                    <div className="mini-chart">
                      {performanceMetrics.cpu.slice(-20).map((point, i) => (
                        <div
                          key={i}
                          className="chart-bar"
                          style={{ height: `${Math.min(point.value, 100)}%` }}
                          title={`${point.value.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Memory Usage */}
                  <div className="metric-item">
                    <div className="metric-header">
                      <span className="metric-label">{t('monitor.memoryUsage')}</span>
                      <span className={`metric-value ${avgMemory > 90 ? 'stat-danger' : avgMemory > 75 ? 'stat-warning' : ''}`}>
                        {avgMemory.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`metric-fill ${getProgressClass(avgMemory)}`}
                        style={{ width: `${Math.min(avgMemory, 100)}%` }}
                      />
                    </div>
                    {/* Mini Chart */}
                    <div className="mini-chart">
                      {performanceMetrics.memory.slice(-20).map((point, i) => (
                        <div
                          key={i}
                          className="chart-bar"
                          style={{ height: `${Math.min(point.value, 100)}%` }}
                          title={`${point.value.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Network I/O */}
                  <div className="metric-item">
                    <div className="metric-header">
                      <span className="metric-label">{t('monitor.networkIO')}</span>
                      <span className="metric-value">
                        {formatBytes(networkIn.avg + networkOut.avg)}/s
                      </span>
                    </div>
                    <div className="network-io-bars">
                      <div className="network-io-row">
                        <span className="network-io-label">{t('monitor.networkIn')}</span>
                        <span className="network-io-value">{formatBytes(networkIn.avg)}/s</span>
                      </div>
                      <div className="network-io-row">
                        <span className="network-io-label">{t('monitor.networkOut')}</span>
                        <span className="network-io-value">{formatBytes(networkOut.avg)}/s</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              )}
            </Card>

            {/* Log Statistics */}
            <Card className="log-stats" title={t('monitor.logStats')} icon={<TrendingUpIcon size={18} />}>
              {/* Visual Indicators */}
              <div className="log-stats-visual">
                <div className="stat-bar-container">
                  {logStats.totalLines > 0 && (
                    <>
                      {logStats.errorCount > 0 && (
                        <div
                          className="stat-bar-segment stat-bar-error"
                          style={{ width: `${(logStats.errorCount / logStats.totalLines) * 100}%` }}
                          title={`${t('monitor.errorCount')}: ${logStats.errorCount}`}
                        />
                      )}
                      {logStats.warningCount > 0 && (
                        <div
                          className="stat-bar-segment stat-bar-warning"
                          style={{ width: `${(logStats.warningCount / logStats.totalLines) * 100}%` }}
                          title={`${t('monitor.warningCount')}: ${logStats.warningCount}`}
                        />
                      )}
                      {logStats.infoCount > 0 && (
                        <div
                          className="stat-bar-segment stat-bar-info"
                          style={{ width: `${(logStats.infoCount / logStats.totalLines) * 100}%` }}
                          title={`${t('monitor.infoCount')}: ${logStats.infoCount}`}
                        />
                      )}
                      {logStats.debugCount > 0 && (
                        <div
                          className="stat-bar-segment stat-bar-debug"
                          style={{ width: `${(logStats.debugCount / logStats.totalLines) * 100}%` }}
                          title={`${t('monitor.debugCount')}: ${logStats.debugCount}`}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.totalLines')}</span>
                  <span className="stat-value">{logStats.totalLines.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.errorCount')}</span>
                  <span className="stat-value stat-value-error">
                    {logStats.errorCount}
                    {logStats.errorCount > 0 && <span className="stat-indicator stat-indicator-error" />}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.warningCount')}</span>
                  <span className="stat-value stat-value-warning">
                    {logStats.warningCount}
                    {logStats.warningCount > 0 && <span className="stat-indicator stat-indicator-warning" />}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.infoCount')}</span>
                  <span className="stat-value">{logStats.infoCount}</span>
                </div>
              </div>

              {/* Error Rate Indicator */}
              {logStats.totalLines > 0 && (
                <div className="error-rate-display">
                  <span className="error-rate-label">{t('monitor.errorRate')}</span>
                  <div className="error-rate-bar">
                    <div
                      className={`error-rate-fill ${logStats.errorRate > 5 ? 'error-rate-high' : logStats.errorRate > 1 ? 'error-rate-medium' : 'error-rate-low'}`}
                      style={{ width: `${Math.min(logStats.errorRate * 10, 100)}%` }}
                    />
                  </div>
                  <span className="error-rate-value">{logStats.errorRate.toFixed(2)}%</span>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
  );
};
