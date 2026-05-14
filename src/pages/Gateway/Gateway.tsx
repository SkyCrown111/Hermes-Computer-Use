import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Button, AlertIcon, RefreshIcon, SettingsIcon, ZapIcon, ClockIcon } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import { monitorApi } from '../../services/monitorApi';
import { restartGateway } from '../../services/settingsApi';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import type { GatewayDetailedStatus, ConnectionEvent } from '../../types/monitor';
import './Gateway.css';

// Polling intervals with exponential backoff
const POLL_INTERVAL_NORMAL = 15000; // 15s when healthy
const POLL_INTERVAL_ERROR = 60000;  // 60s when errors occur
const MAX_CONSECUTIVE_ERRORS = 3;    // After this many errors, switch to longer interval
const MAX_HISTORY_POINTS = 20;

interface PerformanceHistory {
  cpu: number[];
  memory: number[];
  timestamps: number[];
}

// Safe number helper - returns default value if input is null/undefined
const safeNumber = (value: number | null | undefined, defaultValue: number = 0): number => {
  if (value == null || isNaN(value)) return defaultValue;
  return value;
};

// Safe toFixed helper - returns default value if input is null/undefined
const safeToFixed = (value: number | null | undefined, decimals: number = 1, defaultValue: string = '0'): string => {
  if (value == null || isNaN(value)) return defaultValue;
  return value.toFixed(decimals);
};

const formatUptime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes == null) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Get event type color
const getEventColor = (eventType: ConnectionEvent['event_type']): string => {
  switch (eventType) {
    case 'connect': return 'var(--color-success)';
    case 'disconnect': return 'var(--color-warning)';
    case 'error': return 'var(--color-error)';
    default: return 'var(--color-text-tertiary)';
  }
};

// Get progress bar class based on percentage
const getProgressClass = (percent: number): string => {
  if (percent < 60) return 'metric-fill-normal';
  if (percent < 85) return 'metric-fill-warning';
  return 'metric-fill-danger';
};

export const Gateway: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isReloadingConfig, setIsReloadingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistory>({
    cpu: [],
    memory: [],
    timestamps: [],
  });

  // Use ref for interval to handle dynamic timing
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (isRetry = false) => {
    if (isRetry) setIsRetrying(true);
    setIsLoading(true);
    setError(null);

    try {
      const result = await monitorApi.getGatewayStatus();
      setStatus(result);
      setConsecutiveErrors(0);
      setError(null);

      // Update performance history
      setPerformanceHistory(prev => {
        const newCpu = [...prev.cpu, safeNumber(result.cpu_usage_percent)].slice(-MAX_HISTORY_POINTS);
        const newMemory = [...prev.memory, safeNumber(result.memory_usage_mb)].slice(-MAX_HISTORY_POINTS);
        const newTimestamps = [...prev.timestamps, Date.now()].slice(-MAX_HISTORY_POINTS);
        return { cpu: newCpu, memory: newMemory, timestamps: newTimestamps };
      });
    } catch (err) {
      logger.error('[Gateway] Failed to fetch status:', err);
      const errorMsg = err instanceof Error ? err.message : t('gateway.fetchFailed');
      setError(errorMsg);
      setConsecutiveErrors(prev => prev + 1);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [t]);

  // Setup polling with dynamic interval based on error state
  useEffect(() => {
    const setupInterval = () => {
      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Determine interval based on error state
      const interval = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
        ? POLL_INTERVAL_ERROR
        : POLL_INTERVAL_NORMAL;

      intervalRef.current = setInterval(() => {
        fetchStatus();
      }, interval);
    };

    // Initial fetch
    fetchStatus();

    // Setup interval
    setupInterval();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStatus, consecutiveErrors]);

  // Handle manual retry
  const handleRetry = useCallback(() => {
    setConsecutiveErrors(0);
    fetchStatus(true);
  }, [fetchStatus]);

  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    setError(null);
    try {
      await restartGateway();
      // Reset error state on successful restart
      setConsecutiveErrors(0);
      // Wait a moment then refresh status
      setTimeout(() => fetchStatus(), 3000);
      toast.success(t('gateway.restartSuccess'));
    } catch (err) {
      logger.error('[Gateway] Restart failed:', err);
      setError(t('gateway.restartFailed'));
      toast.error(t('gateway.restartFailed'));
    } finally {
      setIsRestarting(false);
    }
  }, [fetchStatus, t]);

  const handleReloadConfig = useCallback(async () => {
    setIsReloadingConfig(true);
    setError(null);
    try {
      // Call the reload config API
      await monitorApi.reloadGatewayConfig();
      toast.success(t('gateway.configReloaded'));
      // Refresh status after config reload
      setTimeout(() => fetchStatus(), 1000);
    } catch (err) {
      logger.error('[Gateway] Config reload failed:', err);
      setError(t('gateway.configReloadFailed'));
      toast.error(t('gateway.configReloadFailed'));
    } finally {
      setIsReloadingConfig(false);
    }
  }, [fetchStatus, t]);

  const statusColor = status?.status === 'online' ? 'var(--color-success)'
    : status?.status === 'degraded' ? 'var(--color-warning)'
    : 'var(--color-error)';

  const statusLabel =
    status?.status === 'online' ? t('gateway.online')
    : status?.status === 'degraded' ? t('gateway.degraded')
    : t('gateway.offline');

  // Memoize refresh click handler
  const handleRefreshClick = useCallback(() => fetchStatus(), [fetchStatus]);

  return (
    <div className="gateway-page">
      <div className="gateway-header">
        <h1>{t('gateway.title')}</h1>
        <div className="gateway-actions">
          <Button
            variant="secondary"
            onClick={handleRefreshClick}
            disabled={isLoading}
          >
            <RefreshIcon size={14} className={isLoading ? 'spinning' : ''} />
            {isLoading && !isRetrying ? t('gateway.refreshing') : t('gateway.refresh')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleReloadConfig}
            disabled={isReloadingConfig}
          >
            <SettingsIcon size={14} className={isReloadingConfig ? 'spinning' : ''} />
            {isReloadingConfig ? t('gateway.reloadingConfig') : t('gateway.reloadConfig')}
          </Button>
          <Button variant="primary" onClick={handleRestart} disabled={isRestarting}>
            <ZapIcon size={14} />
            {isRestarting ? t('gateway.restarting') : t('gateway.restart')}
          </Button>
        </div>
      </div>

      {/* Error state with retry option */}
      {error && (
        <div className="error-message gateway-error">
          <span><AlertIcon size={16} /> {error}</span>
          {consecutiveErrors > 0 && (
            <Button variant="ghost" size="sm" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? t('common.loading') : t('dashboard.recheck')}
            </Button>
          )}
          {consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && (
            <span className="error-hint">
              {t('gateway.autoRetryHint')}
            </span>
          )}
        </div>
      )}

      {isLoading && !status ? (
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      ) : status ? (
        <div className="gateway-content">
          {/* Status Overview */}
          <Card className="gateway-status-card">
            <div className="gateway-status-overview">
              <div className="gateway-status-indicator">
                <span className="gateway-status-dot" style={{ background: statusColor }} />
                <span className="gateway-status-text" style={{ color: statusColor }}>
                  {statusLabel}
                </span>
              </div>
              <div className="gateway-info-grid">
                <div className="gateway-info-item">
                  <span className="info-label">{t('gateway.version')}</span>
                  <span className="info-value">{status.version}</span>
                </div>
                <div className="gateway-info-item">
                  <span className="info-label">{t('gateway.uptime')}</span>
                  <span className="info-value">{formatUptime(status.uptime_seconds)}</span>
                </div>
                <div className="gateway-info-item">
                  <span className="info-label">{t('gateway.totalMessages')}</span>
                  <span className="info-value">{status.total_messages.toLocaleString()}</span>
                </div>
                <div className="gateway-info-item">
                  <span className="info-label">{t('gateway.messagesPerMin')}</span>
                  <span className="info-value">{safeToFixed(status.messages_per_minute, 1)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Advanced Metrics Grid */}
          <div className="gateway-metrics-grid">
            {/* Request Queue Panel */}
            <Card className="gateway-metric-card" title={t('gateway.requestQueue')}>
              <div className="metric-detail-grid">
                <div className="metric-detail-item">
                  <span className="metric-detail-label">{t('gateway.activeRequests')}</span>
                  <span className="metric-detail-value">{status.active_requests}</span>
                </div>
                <div className="metric-detail-item">
                  <span className="metric-detail-label">{t('gateway.queueDepth')}</span>
                  <span className="metric-detail-value">{status.queue_depth}</span>
                </div>
                <div className="metric-detail-item">
                  <span className="metric-detail-label">{t('gateway.avgResponseTime')}</span>
                  <span className="metric-detail-value">{safeToFixed(status.avg_response_time_ms, 1)} ms</span>
                </div>
              </div>
              {/* Queue indicator */}
              <div className="queue-indicator">
                <div className="queue-bar">
                  <div
                    className={`queue-fill ${safeNumber(status.queue_depth) > 10 ? 'queue-high' : safeNumber(status.queue_depth) > 5 ? 'queue-medium' : 'queue-low'}`}
                    style={{ width: `${Math.min((safeNumber(status.queue_depth) / 20) * 100, 100)}%` }}
                  />
                </div>
                <span className="queue-label">{t('gateway.queueUtilization')}</span>
              </div>
            </Card>

            {/* Resource Usage Panel */}
            <Card className="gateway-metric-card" title={t('gateway.resourceUsage')}>
              <div className="resource-metrics">
                {/* CPU Usage */}
                <div className="resource-item">
                  <div className="resource-header">
                    <span className="resource-label">{t('gateway.cpuUsage')}</span>
                    <span className={`resource-value ${safeNumber(status.cpu_usage_percent) > 80 ? 'stat-danger' : safeNumber(status.cpu_usage_percent) > 60 ? 'stat-warning' : ''}`}>
                      {safeToFixed(status.cpu_usage_percent, 1)}%
                    </span>
                  </div>
                  <div className="metric-bar">
                    <div
                      className={`metric-fill ${getProgressClass(safeNumber(status.cpu_usage_percent))}`}
                      style={{ width: `${Math.min(safeNumber(status.cpu_usage_percent), 100)}%` }}
                    />
                  </div>
                  {/* Mini Chart */}
                  <div className="mini-chart">
                    {performanceHistory.cpu.slice(-15).map((val, i) => (
                      <div
                        key={i}
                        className="chart-bar"
                        style={{ height: `${Math.min(val, 100)}%` }}
                        title={`${safeToFixed(val, 1)}%`}
                      />
                    ))}
                  </div>
                </div>

                {/* Memory Usage */}
                <div className="resource-item">
                  <div className="resource-header">
                    <span className="resource-label">{t('gateway.memoryUsage')}</span>
                    <span className="resource-value">{safeToFixed(status.memory_usage_mb, 1)} MB</span>
                  </div>
                  <div className="metric-bar">
                    <div
                      className={`metric-fill ${getProgressClass(safeNumber(status.memory_usage_mb) / 10)}`}
                      style={{ width: `${Math.min(safeNumber(status.memory_usage_mb) / 10, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Throughput Panel */}
            <Card className="gateway-metric-card" title={t('gateway.throughput')}>
              <div className="throughput-grid">
                <div className="throughput-item">
                  <span className="throughput-label">{t('gateway.requestsPerSecond')}</span>
                  <span className="throughput-value">{safeToFixed(status.throughput?.requests_per_second, 2)}</span>
                </div>
                <div className="throughput-item">
                  <span className="throughput-label">{t('gateway.peakRequests')}</span>
                  <span className="throughput-value">{safeToFixed(status.throughput?.peak_requests_per_second, 2)}</span>
                </div>
                <div className="throughput-item">
                  <span className="throughput-label">{t('gateway.bytesPerSecond')}</span>
                  <span className="throughput-value">{formatBytes(status.throughput?.bytes_per_second)}/s</span>
                </div>
                <div className="throughput-item">
                  <span className="throughput-label">{t('gateway.peakBytes')}</span>
                  <span className="throughput-value">{formatBytes(status.throughput?.peak_bytes_per_second)}/s</span>
                </div>
              </div>
            </Card>

            {/* Error Statistics Panel */}
            <Card className="gateway-metric-card" title={t('gateway.errorStats')}>
              <div className="error-stats-overview">
                <div className="error-total">
                  <span className="error-total-value">{status.error_stats.total_errors}</span>
                  <span className="error-total-label">{t('gateway.totalErrors')}</span>
                </div>
                <div className="error-time-stats">
                  <div className="error-time-item">
                    <span className="error-time-value">{status.error_stats.last_hour}</span>
                    <span className="error-time-label">{t('gateway.lastHour')}</span>
                  </div>
                  <div className="error-time-item">
                    <span className="error-time-value">{status.error_stats.last_24h}</span>
                    <span className="error-time-label">{t('gateway.last24h')}</span>
                  </div>
                </div>
              </div>
              {/* Error type distribution */}
              {Object.keys(status.error_stats.by_type).length > 0 && (
                <div className="error-type-distribution">
                  <span className="error-type-title">{t('gateway.errorsByType')}</span>
                  <div className="error-type-bars">
                    {Object.entries(status.error_stats.by_type).map(([type, count]) => (
                      <div key={type} className="error-type-row">
                        <span className="error-type-name">{type}</span>
                        <div className="error-type-bar-container">
                          <div
                            className="error-type-bar"
                            style={{ width: `${Math.min((count / (status.error_stats.total_errors || 1)) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="error-type-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Platform Connections */}
          <Card title={t('gateway.platformConnections')} className="gateway-connections-card">
            {status.connections.length > 0 ? (
              <div className="connection-list">
                {status.connections.map((conn, i) => (
                  <div key={i} className="connection-item">
                    <span className="connection-platform">{conn.platform}</span>
                    <span className={`connection-status connection-${conn.status}`}>
                      {conn.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>{t('gateway.noConnections')}</span>
              </div>
            )}
          </Card>

          {/* Connection History Timeline */}
          {status.connection_history.length > 0 && (
            <Card title={t('gateway.connectionHistory')} className="gateway-history-card">
              <div className="connection-timeline">
                {status.connection_history.slice(0, 10).map((event, i) => (
                  <div key={i} className="timeline-event">
                    <div className="timeline-dot" style={{ background: getEventColor(event.event_type) }} />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-platform">{event.platform}</span>
                        <span className={`timeline-type timeline-type-${event.event_type}`}>
                          {t(`gateway.event${event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}`)}
                        </span>
                      </div>
                      {event.message && (
                        <span className="timeline-message">{event.message}</span>
                      )}
                      <span className="timeline-time">
                        <ClockIcon size={12} /> {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <div className="empty-state">
            <AlertIcon size={24} />
            <span>{t('gateway.notRunning')}</span>
            <Button variant="primary" onClick={handleRestart} disabled={isRestarting}>
              {t('gateway.restart')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
