import React, { useEffect, useRef } from 'react';
import { Card, Button, RefreshIcon, EmptyIcon, GlobeIcon, ChartIcon, TrendingUpIcon, AlertIcon, FileTextIcon } from '../../components';
import { useMonitorStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import type { LogFile, LogLevel, LogLine } from '../../types/monitor';
import './Monitor.css';

// 格式化运行时间
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// 获取进度条颜色类
const getProgressClass = (percent: number): string => {
  if (percent < 60) return 'metric-fill-normal';
  if (percent < 85) return 'metric-fill-warning';
  return 'metric-fill-danger';
};

// 获取日志级别样式类
const getLogLevelClass = (level?: LogLevel): string => {
  if (!level) return '';
  return `log-level-${level.toLowerCase()}`;
};

// 获取日志行样式类
const getLogLineClass = (line: LogLine): string => {
  if (line.level === 'ERROR' || line.level === 'CRITICAL') return 'log-line-error';
  if (line.level === 'WARNING') return 'log-line-warning';
  return '';
};

// 平台图标映射
const platformIcons: Record<string, string> = {
  telegram: '📱',
  discord: '💬',
  slack: '💼',
  cli: '⌨️',
  web: '🌐',
};

export const Monitor: React.FC = () => {
  const { t } = useTranslation();
  const {
    logs,
    currentFile,
    isLoadingLogs,
    filterLevel,
    filterComponent,
    searchQuery,
    gatewayStatus,
    isLoadingGateway,
    performanceMetrics,
    availableComponents,
    autoRefresh,
    refreshInterval,
    error,
    fetchLogs,
    setFilterLevel,
    setFilterComponent,
    setSearchQuery,
    fetchGatewayStatus,
    fetchPerformanceMetrics,
    fetchComponents,
    setAutoRefresh,
    clearLogs,
  } = useMonitorStore();

  const logContentRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 初始化数据
  useEffect(() => {
    fetchLogs();
    fetchGatewayStatus();
    fetchPerformanceMetrics();
    fetchComponents();
  }, []);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchLogs();
        fetchGatewayStatus();
        fetchPerformanceMetrics();
      }, refreshInterval);
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchLogs, fetchGatewayStatus, fetchPerformanceMetrics]);

  // 切换日志文件
  const handleFileChange = (file: LogFile) => {
    fetchLogs({ file });
  };

  // 刷新日志
  const handleRefresh = () => {
    fetchLogs();
    fetchGatewayStatus();
    fetchPerformanceMetrics();
  };

  // 滚动到底部
  const scrollToBottom = () => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  };

  // 计算性能指标平均值
  const getAverageMetric = (metrics?: { value: number }[]): number => {
    if (!metrics || metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  };

  const avgCpu = performanceMetrics ? getAverageMetric(performanceMetrics.cpu) : 0;
  const avgMemory = performanceMetrics ? getAverageMetric(performanceMetrics.memory) : 0;

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
            >
              <span className={`refresh-icon ${autoRefresh ? 'refresh-icon-spinning' : ''}`}><RefreshIcon size={14} /></span>
              <span>{autoRefresh ? t('monitor.autoRefreshing') : t('monitor.autoRefresh')}</span>
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
                <span className="log-count">{logs.length} {t('monitor.lines')}</span>
              </div>
              <div className="log-actions">
                <Button variant="ghost" size="sm" onClick={scrollToBottom}>
                  ↓ {t('monitor.latest')}
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
              ) : logs.length > 0 ? (
                logs.map((line, index) => (
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
            {/* Gateway Status */}
            <Card className="gateway-status" title={t('monitor.gatewayStatus')} icon={<GlobeIcon size={18} />}>
              {isLoadingGateway ? (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : gatewayStatus ? (
                <>
                  <div className="gateway-header">
                    <div className="gateway-indicator">
                      <span className={`gateway-dot gateway-dot-${gatewayStatus.status}`} />
                      <span className="gateway-status-text">
                        {gatewayStatus.status === 'online' ? t('dashboard.online') :
                         gatewayStatus.status === 'offline' ? t('dashboard.offline') : t('monitor.degraded')}
                      </span>
                    </div>
                  </div>
                  <div className="gateway-info">
                    <span className="gateway-version">v{gatewayStatus.version}</span>
                    <span className="gateway-uptime">
                      {t('monitor.uptime')}: {formatUptime(gatewayStatus.uptime_seconds)}
                    </span>
                  </div>

                  {/* Platform Connections */}
                  <div className="platform-list">
                    {gatewayStatus.connections.map((conn) => (
                      <div key={conn.platform} className="platform-item">
                        <span className="platform-name">
                          <span className="platform-icon">
                            {platformIcons[conn.platform] || '🔌'}
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
                      <span className="metric-value">{avgCpu.toFixed(1)}%</span>
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
                      <span className="metric-value">{avgMemory.toFixed(1)}%</span>
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
                </div>
              ) : (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              )}
            </Card>

            {/* Log Stats */}
            <Card className="log-stats" title={t('monitor.logStats')} icon={<TrendingUpIcon size={18} />}>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.totalLines')}</span>
                  <span className="stat-value">{logs.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.errorCount')}</span>
                  <span className="stat-value" style={{ color: 'var(--accent-error)' }}>
                    {logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.warningCount')}</span>
                  <span className="stat-value" style={{ color: 'var(--accent-warning)' }}>
                    {logs.filter(l => l.level === 'WARNING').length}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('monitor.infoCount')}</span>
                  <span className="stat-value">
                    {logs.filter(l => l.level === 'INFO').length}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
  );
};
