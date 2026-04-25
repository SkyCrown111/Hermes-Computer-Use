import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import { monitorApi } from '../../services/monitorApi';
import { restartGateway } from '../../services/settingsApi';
import { logger } from '../../lib/logger';
import type { GatewayDetailedStatus } from '../../types/monitor';
import './Gateway.css';

export const Gateway: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await monitorApi.getGatewayStatus();
      setStatus(result);
    } catch (err) {
      logger.error('[Gateway] Failed to fetch status:', err);
      setError(t('gateway.fetchFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await restartGateway();
      // Wait a moment then refresh status
      setTimeout(fetchStatus, 3000);
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
          <Button variant="secondary" onClick={fetchStatus} disabled={isLoading}>
            {isLoading ? t('gateway.refreshing') : t('gateway.refresh')}
          </Button>
          <Button variant="primary" onClick={handleRestart} disabled={isRestarting}>
            {isRestarting ? t('gateway.restarting') : t('gateway.restart')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
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
            <span>{t('gateway.notRunning')}</span>
          </div>
        </Card>
      )}
    </div>
  );
};
