// Global Status Bar — shows gateway status, model, token usage, background tasks
import React, { useEffect, useState, useRef } from 'react';
import { statusApi } from '../../../services/statusApi';
import { useNavigationStore, useChatStore, useSessionStore } from '../../../stores';
import type { SystemStatus } from '../../../types/status';
import { toast } from '../../../stores/toastStore';
import { TokenIcon, CpuIcon } from '../../ui/Icons';
import { useTranslation } from '../../../hooks/useTranslation';
import './StatusBar.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const StatusBar: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useTranslation();

  // Active tab / session
  const activeTabId = useNavigationStore((s) => s.activeTabId);

  // Token usage for active session
  const tokenUsage = useChatStore(
    (s) => (activeTabId ? s.sessions[activeTabId]?.tokenUsage : undefined)
  );

  // Session list for model lookup
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionModel = activeTabId
    ? sessions.find((s) => s.id === activeTabId)?.model
    : undefined;

  // Poll system status every 30s
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await statusApi.getSystemStatus();
        setSystemStatus(status);
      } catch {
        // Silently fail — status bar shows last known state
      }
    };

    // Initial fetch
    poll();

    pollingRef.current = setInterval(poll, 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const gateway = systemStatus?.gateway;
  const isOnline = gateway?.status === 'online';
  const isDegraded = gateway?.status === 'degraded';
  const pendingTasks = systemStatus?.pending_tasks ?? 0;
  const activeSessions = systemStatus?.active_sessions ?? 0;
  const inputTokens = tokenUsage?.input_tokens ?? 0;
  const outputTokens = tokenUsage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const hasTokenUsage = totalTokens > 0;

  const statusDotClass = isOnline ? 'online' : isDegraded ? 'degraded' : 'offline';
  const statusLabel = isOnline
    ? t('status.connected')
    : isDegraded
      ? t('status.degraded')
      : t('status.offline');

  const handleGatewayClick = async () => {
    try {
      const status = await statusApi.getSystemStatus();
      setSystemStatus(status);
      const gw = status.gateway;
      const platforms = gw.connected_platforms?.map((p) => p.name).join(', ') || 'none';
      toast.info('Hermes Gateway', `Status: ${gw.status}\nPlatforms: ${platforms}\nUptime: ${Math.floor(gw.uptime_seconds / 60)}m`);
    } catch {
      toast.error(t('status.checkFailed'), t('status.cannotReach'));
    }
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* Gateway status */}
        <div
          className="status-gateway"
          onClick={handleGatewayClick}
          title={t('status.clickRefresh')}
        >
          <span className={`status-dot ${statusDotClass}`} />
          <span className="status-label">{t('status.gateway')}: {statusLabel}</span>
        </div>

        <span className="status-separator" />

        {/* Active model */}
        {activeSessionModel && (
          <>
            <div className="status-model" title={t('status.currentModel')}>
              <CpuIcon size={12} />
              <span>{activeSessionModel}</span>
            </div>
            <span className="status-separator" />
          </>
        )}

        {/* Token usage for active session */}
        {hasTokenUsage && (
          <>
            <div className="status-tokens" title={t('status.tokenUsage')}>
              <TokenIcon size={12} />
              <span className="status-tokens-value">
                ↑{formatTokens(inputTokens)} ↓{formatTokens(outputTokens)}
              </span>
            </div>
            <span className="status-separator" />
          </>
        )}
      </div>

      <div className="status-bar-right">
        {/* Active sessions count */}
        {activeSessions > 0 && (
          <span className="status-tokens" title={t('status.activeSessions')}>
            {activeSessions} {t('status.sessions')}
          </span>
        )}

        {/* Pending background tasks */}
        {pendingTasks > 0 && (
          <>
            <span className="status-separator" />
            <div className="status-tasks" title={`${pendingTasks} ${t('status.pendingTasksLabel')}`}>
              <span className="status-tasks-spinner" />
              <span className="status-tasks-count">{pendingTasks}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
