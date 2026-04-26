import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Button, AlertIcon, RefreshIcon } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import { monitorApi } from '../../services/monitorApi';
import { restartGateway } from '../../services/settingsApi';
import { logger } from '../../lib/logger';
import type { GatewayDetailedStatus } from '../../types/monitor';
import './Gateway.css';

// Polling intervals with exponential backoff
const POLL_INTERVAL_NORMAL = 15000; // 15s when healthy
const POLL_INTERVAL_ERROR = 60000;  // 60s when errors occur
const MAX_CONSECUTIVE_ERRORS = 3;    // After this many errors, switch to longer interval

export const Gateway: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

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

  const handleRestart = async () => {
    setIsRestarting(true);
    setError(null);
    try {
      await restartGateway();
      // Reset error state on successful restart
      setConsecutiveErrors(0);
      // Wait a moment then refresh status
      setTimeout(() => fetchStatus(), 3000);
    } catch (err) {
      logger.error('[Gateway] Restart failed:', err);
      setError(t('gateway.restartFailed'));
    } finally {
      setIsRestarting(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const statusColor = status?.status === 'online' ? 'var(--color-success)'
    : status?.status === 'degraded' ? 'var(--color-warning)'
    : 'var(--color-error)';

  const statusLabel =
    status?.status === 'online' ? t('gateway.online')
    : status?.status === 'degraded' ? t('gateway.degraded')
    : t('gateway.offline');

  return (
    <div className="gateway-page">
      <div className="gateway-header">
        <h1>{t('gateway.title')}</h1>
        <div className="gateway-actions">
          <Button
            variant="secondary"
            onClick={() => fetchStatus()}
            disabled={isLoading}
          >
            <RefreshIcon size={14} className={isLoading ? 'spinning' : ''} />
            {isLoading && !isRetrying ? t('gateway.refreshing') : t('gateway.refresh')}
          </Button>
          <Button variant="primary" onClick={handleRestart} disabled={isRestarting}>
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
                  <span className="info-value">{status.total_messages}</span>
                </div>
                <div className="gateway-info-item">
                  <span className="info-label">{t('gateway.messagesPerMin')}</span>
                  <span className="info-value">{status.messages_per_minute}</span>
                </div>
              </div>
            </div>
          </Card>

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
