import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Button, Skeleton, SkeletonList, SkeletonStatCard, CardGrid, RocketIcon, ChatIcon, TargetIcon, ClockIcon, ChartIcon, ZapIcon, MonitorIcon, TrendingUpIcon, AlertIcon, LightbulbIcon } from '../../components';
import { useDashboardStore, useNavigationStore, useHermesEnvironmentStore, useHermesReadinessStore } from '../../stores';
import { useWindowFocus } from '../../hooks';
import { useTranslation } from '../../hooks/useTranslation';
import { checkForUpdates } from '../../services/updateApi';
import { restartGateway } from '../../services/settingsApi';
import { buildHermesReadinessChecks, evaluateHermesReadiness, type HermesReadinessCheck } from '../../lib/hermesReadiness';
import { formatNumber, formatCurrency, formatTime } from '../../utils/format';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import './Dashboard.css';

// 引导界面组件
const OnboardingGuide: React.FC<{ onRetry: () => void; t: (key: string) => string }> = ({ onRetry, t }) => {
  return (
    <div className="onboarding-container">
      <Card className="onboarding-card">
        <div className="onboarding-icon"><RocketIcon size={48} /></div>
        <h2 className="onboarding-title">{t('dashboard.welcome')}</h2>
        <p className="onboarding-description">
          {t('dashboard.welcomeDesc')}
        </p>

        <div className="onboarding-steps">
          <h3>{t('dashboard.quickStart')}</h3>
          <div className="step">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>{t('dashboard.installHermes')}</strong>
              <code>pip install hermes-agent</code>
            </div>
          </div>
          <div className="step">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>{t('dashboard.startGateway')}</strong>
              <code>hermes gateway start</code>
            </div>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>{t('dashboard.configureApi')}</strong>
              <code>hermes config set model.api_key YOUR_KEY</code>
            </div>
          </div>
        </div>

        <div className="onboarding-actions">
          <Button variant="primary" onClick={onRetry}>
            {t('dashboard.recheck')}
          </Button>
          <Button variant="secondary" onClick={() => {
            // 打开文档链接
            window.open('https://github.com/hermes-agent/hermes', '_blank');
          }}>
            {t('dashboard.viewDocs')}
          </Button>
        </div>

        <div className="onboarding-info">
          <p><LightbulbIcon size={14} /> {t('dashboard.dataDir')}: <code>~/.hermes</code></p>
          <p>{t('dashboard.dataDirDesc')}</p>
        </div>
      </Card>
    </div>
  );
};

// Get progress bar color class
const getProgressClass = (percent: number): string => {
  if (percent < 60) return 'progress-fill-normal';
  if (percent < 85) return 'progress-fill-warning';
  return 'progress-fill-danger';
};

const capabilityLabels = {
  chat: 'chat',
  sessions: 'sessions',
  skills: 'skills',
  memories: 'memories',
  mcp: 'mcp',
  cron: 'cron',
  platforms: 'platforms',
} as const;

interface SetupCheck {
  label: string;
  ok: boolean;
  detail: string;
}

interface SetupSummary {
  ready: boolean;
  title: string;
  description: string;
  checks: SetupCheck[];
}

export const Dashboard: React.FC = () => {
  const setActiveItem = useNavigationStore(s => s.setActiveItem);
  const openTab = useNavigationStore(s => s.openTab);
  const { t } = useTranslation();
  const systemStatus = useDashboardStore(s => s.systemStatus);
  const usageAnalytics = useDashboardStore(s => s.usageAnalytics);
  const skills = useDashboardStore(s => s.skills);
  const todayTasks = useDashboardStore(s => s.todayTasks);
  const isLoadingStatus = useDashboardStore(s => s.isLoadingStatus);
  const isLoadingAnalytics = useDashboardStore(s => s.isLoadingAnalytics);
  const isLoadingSkills = useDashboardStore(s => s.isLoadingSkills);
  const isLoadingTasks = useDashboardStore(s => s.isLoadingTasks);
  const error = useDashboardStore(s => s.error);
  const fetchAll = useDashboardStore(s => s.fetchAll);
  const hermesEnvironment = useHermesEnvironmentStore(s => s.environment);
  const isLoadingEnvironment = useHermesEnvironmentStore(s => s.isLoading);
  const readinessSnapshot = useHermesReadinessStore(s => s.snapshot);
  const refreshReadinessSnapshot = useHermesReadinessStore(s => s.refreshSnapshot);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isRestartingGateway, setIsRestartingGateway] = useState(false);
  const [setupSummary, setSetupSummary] = useState<SetupSummary | null>(null);
  const [lastFocusRefreshAt, setLastFocusRefreshAt] = useState(0);
  const [dashboardBootstrapped, setDashboardBootstrapped] = useState(false);
  const readinessLabels = useMemo(() => ({
    notInitializedTitle: 'Hermes not initialized',
    notInitializedDescription: 'Install Hermes and create the ~/.hermes workspace before using the app.',
    runtimeMissingTitle: 'Hermes runtime missing',
    runtimeMissingDescription: 'The Hermes home exists, but the CLI or Python runtime is not available yet.',
    needsConfigTitle: 'Hermes needs model configuration',
    needsConfigDescription: 'Finish provider and credential setup in Settings so chat requests can run.',
    gatewayOfflineTitle: 'Gateway is not running',
    gatewayOfflineDescription: 'Your Hermes environment looks valid, but the gateway is offline right now.',
    readyTitle: 'Hermes is ready',
    readyDescription: 'Runtime, gateway, storage, and model settings all look usable.',
  }), []);

  const checkHermesStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const snapshot = await refreshReadinessSnapshot(false);
      if (!snapshot) {
        setShowOnboarding(true);
        setSetupSummary(null);
        return;
      }
      const readiness = evaluateHermesReadiness(
        snapshot.exists,
        snapshot.health,
        snapshot.config,
        snapshot.environment,
        snapshot.systemStatus.gateway.status,
        readinessLabels,
      );
      const checks: HermesReadinessCheck[] = buildHermesReadinessChecks(
        readiness,
        snapshot.config,
        snapshot.environment,
        snapshot.health,
        { includeSessionStore: true },
      );
      const summary = {
        ...readiness,
        checks,
      };
      setSetupSummary(summary);
      setShowOnboarding(!summary.ready);
      setDashboardBootstrapped(true);
    } catch (err) {
      logger.error('[Dashboard] Failed to check Hermes status:', err);
      setShowOnboarding(true);
    } finally {
      setIsChecking(false);
    }
  }, [readinessLabels, refreshReadinessSnapshot]);

  useEffect(() => {
    void checkHermesStatus();
  }, [checkHermesStatus]);

  useEffect(() => {
    if (!dashboardBootstrapped || showOnboarding) return;

    const supportsIdleCallback = typeof window.requestIdleCallback === 'function';
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const loadDashboardData = () => {
      void fetchAll(true);
    };

    if (supportsIdleCallback) {
      idleId = window.requestIdleCallback(() => loadDashboardData(), { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(loadDashboardData, 150);
    }

    return () => {
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dashboardBootstrapped, fetchAll, showOnboarding]);

  useEffect(() => {
    if (!readinessSnapshot) return;
    const readiness = evaluateHermesReadiness(
      readinessSnapshot.exists,
      readinessSnapshot.health,
      readinessSnapshot.config,
      readinessSnapshot.environment,
      readinessSnapshot.systemStatus.gateway.status,
      readinessLabels,
    );
    const checks = buildHermesReadinessChecks(
      readiness,
      readinessSnapshot.config,
      readinessSnapshot.environment,
      readinessSnapshot.health,
      { includeSessionStore: true },
    );
    setSetupSummary({ ...readiness, checks });
    setShowOnboarding(!readiness.ready);
  }, [readinessLabels, readinessSnapshot]);

  useWindowFocus(() => {
    const now = Date.now();
    if (now - lastFocusRefreshAt < 15_000) return;
    setLastFocusRefreshAt(now);
    void refreshReadinessSnapshot(true);
    void fetchAll(true, true);
  }, !showOnboarding);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await checkForUpdates();
      if (result.available) {
        toast.info(t('dashboard.updateAvailable'), `v${result.newVersion}${result.releaseNotes ? ` - ${result.releaseNotes.slice(0, 100)}...` : ''}`);
      } else {
        toast.success(t('dashboard.upToDate'));
      }
    } catch {
      toast.error(t('dashboard.updateCheckFailed'));
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [t]);

  const handleRestartGateway = useCallback(async () => {
    setIsRestartingGateway(true);
    try {
      await restartGateway();
      toast.success(t('dashboard.gatewayRestarted'));
    } catch {
      toast.error(t('dashboard.gatewayRestartFailed'));
    } finally {
      setIsRestartingGateway(false);
    }
  }, [t]);

  // Memoize new session handler �?must be before any early returns (Rules of Hooks)
  const handleNewSession = useCallback(() => {
    const sessionId = `new_${Date.now()}`;
    openTab(sessionId, t('dashboard.newSession'), 'new');
    setActiveItem('chat');
  }, [openTab, setActiveItem, t]);


  // 计算统计数据
  const stats = {
    totalSessions: usageAnalytics?.totals.total_sessions ?? 0,
    skillCalls: skills.length,
    scheduledTasks: todayTasks.length,
    tokenUsage: usageAnalytics?.totals.total_input ?? 0,
  };

  // 获取最近会话（从统计中获取�?
  const recentSessions = usageAnalytics?.daily.slice(-5).reverse() ?? [];
  const capabilityEntries = hermesEnvironment
    ? (Object.entries(capabilityLabels) as Array<[keyof typeof capabilityLabels, string]>).map(([key, label]) => ({
        key,
        label,
        detail: hermesEnvironment.capabilities[key],
      }))
    : [];
  const availableCapabilities = capabilityEntries.filter((entry) => entry.detail?.available);
  const unavailableCapabilities = capabilityEntries.filter((entry) => !entry.detail?.available);
  const cliDisplay = hermesEnvironment?.runtime.cli_command
    ?? (hermesEnvironment?.runtime.python_path ? 'Python runtime mode' : 'Unavailable');
  const cliStatusClass = hermesEnvironment?.runtime.cli_command
    ? 'status-value-online'
    : hermesEnvironment?.runtime.python_path
      ? ''
      : 'status-value-error';
  const showInitialSkeleton = isChecking && !setupSummary;
  const showAnalyticsSkeleton = (isLoadingAnalytics && !usageAnalytics) || showInitialSkeleton;
  const showSkillsSkeleton = (isLoadingSkills && skills.length === 0) || showInitialSkeleton;
  const showTasksSkeleton = (isLoadingTasks && todayTasks.length === 0) || showInitialSkeleton;
  const showSystemSkeleton = (isLoadingStatus && !systemStatus) || showInitialSkeleton;
  const showEnvironmentSkeleton = (isLoadingEnvironment && !hermesEnvironment) || showInitialSkeleton;

  if (showOnboarding && !isChecking) {
    return (
      <div className="dashboard">
        <OnboardingGuide onRetry={checkHermesStatus} t={t} />
        {setupSummary && (
          <div className="setup-summary-panel">
            <Card title={setupSummary.title} icon={<MonitorIcon size={18} />}>
              <p className="setup-summary-copy">{setupSummary.description}</p>
              <div className="setup-check-list">
                {setupSummary.checks.map((check) => (
                  <div key={check.label} className="setup-check-row">
                    <span className={`setup-check-badge ${check.ok ? 'ok' : 'issue'}`}>{check.ok ? 'OK' : 'Fix'}</span>
                    <div className="setup-check-text">
                      <span className="setup-check-label">{check.label}</span>
                      <span className="setup-check-detail">{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Stats Grid */}
      <div className="stats-grid">
        {showInitialSkeleton ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <Card className="stat-card">
              <div className="stat-icon stat-icon-primary"><ChatIcon size={20} /></div>
              <div className="stat-content">
                {showAnalyticsSkeleton ? <Skeleton width="72px" height="28px" /> : <span className="stat-value">{formatNumber(stats.totalSessions)}</span>}
                <span className="stat-label">{t('dashboard.totalSessions')}</span>
              </div>
            </Card>
            <Card className="stat-card">
              <div className="stat-icon stat-icon-success"><TargetIcon size={20} /></div>
              <div className="stat-content">
                {showSkillsSkeleton ? <Skeleton width="60px" height="28px" /> : <span className="stat-value">{stats.skillCalls}</span>}
                <span className="stat-label">{t('dashboard.availableSkills')}</span>
              </div>
            </Card>
            <Card className="stat-card">
              <div className="stat-icon stat-icon-warning"><ClockIcon size={20} /></div>
              <div className="stat-content">
                {showTasksSkeleton ? <Skeleton width="60px" height="28px" /> : <span className="stat-value">{stats.scheduledTasks}</span>}
                <span className="stat-label">{t('dashboard.todayTasks')}</span>
              </div>
            </Card>
            <Card className="stat-card">
              <div className="stat-icon stat-icon-info"><ChartIcon size={20} /></div>
              <div className="stat-content">
                {showAnalyticsSkeleton ? <Skeleton width="96px" height="28px" /> : <span className="stat-value">{formatNumber(stats.tokenUsage)}</span>}
                <span className="stat-label">{t('dashboard.tokenUsage')}</span>
              </div>
            </Card>
          </>
        )}
      </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {setupSummary ? (
          <div className={`setup-banner ${setupSummary.ready ? 'ready' : 'issue'}`}>
            <div className="setup-banner-text">
              <strong>{setupSummary.title}</strong>
              <span>{setupSummary.description}</span>
            </div>
            <Button variant="secondary" onClick={checkHermesStatus}>
              {t('dashboard.recheck')}
            </Button>
          </div>
        ) : showInitialSkeleton ? (
          <div className="setup-banner setup-banner-skeleton">
            <div className="setup-banner-text">
              <Skeleton width="180px" height="18px" />
              <Skeleton width="360px" height="16px" />
            </div>
            <Skeleton width="92px" height="36px" variant="rounded" />
          </div>
        ) : null}

        {/* Main Content */}
        <div className="dashboard-main">
          {/* Recent Sessions */}
          <Card title={t('dashboard.recentActivity')} icon={<TrendingUpIcon size={18} />} className="recent-sessions">
            {showAnalyticsSkeleton ? (
              <div className="dashboard-list-skeleton">
                <SkeletonList count={5} />
              </div>
            ) : recentSessions.length > 0 ? (
              <div className="session-list">
                {recentSessions.map((day) => (
                  <div key={day.day} className="session-item">
                    <div className="session-info">
                      <span className="session-title">{day.day}</span>
                      <span className="session-preview">
                        {day.sessions} {t('nav.sessions').toLowerCase()} · {formatNumber(day.input_tokens + day.output_tokens)} tokens
                      </span>
                    </div>
                    <span className="session-time">{formatCurrency(day.estimated_cost, 2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="loading-container">
                <span className="empty-text">{t('dashboard.noActivity')}</span>
              </div>
            )}
            <Button variant="ghost" className="view-all-btn" onClick={() => setActiveItem('sessions')}>
              {t('dashboard.viewAllSessions')}
            </Button>
          </Card>

          {/* Quick Actions */}
          <Card title={t('dashboard.quickActions')} icon={<ZapIcon size={18} />} className="quick-actions">
            <div className="action-grid">
              <Button variant="primary" onClick={handleNewSession}>{t('dashboard.newSession')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('skills')}>{t('dashboard.executeSkill')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('tasks')}>{t('dashboard.createTask')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('settings')}>{t('dashboard.openSettings')}</Button>
              <Button variant="secondary" onClick={handleCheckUpdates} disabled={isCheckingUpdates}>
                {isCheckingUpdates ? t('dashboard.checkingUpdates') : t('dashboard.checkForUpdates')}
              </Button>
              <Button variant="secondary" onClick={handleRestartGateway} disabled={isRestartingGateway}>
                {isRestartingGateway ? t('dashboard.restarting') : t('dashboard.restartGateway')}
              </Button>
            </div>
          </Card>

          {/* Today Tasks */}
          <Card title={t('dashboard.todayTasks')} icon={<ClockIcon size={18} />} className="today-tasks">
            {showTasksSkeleton ? (
              <div className="dashboard-list-skeleton">
                <SkeletonList count={3} />
              </div>
            ) : todayTasks.length > 0 ? (
              <div className="task-list">
                {todayTasks.map((task) => (
                  <div key={task.id} className="task-item">
                    <span className={`task-status task-status-${task.enabled ? 'pending' : 'completed'}`}>
                      {task.enabled ? t('tasks.pending') : t('tasks.paused')}
                    </span>
                    <span className="task-name">{task.name}</span>
                    <span className="task-time">
                      {task.next_run_at ? formatTime(task.next_run_at) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="loading-container">
                <span className="empty-text">{t('dashboard.noTodayTasks')}</span>
              </div>
            )}
          </Card>
        </div>

        {/* System Status Section */}
        <div className="system-status-section">
          <Card title={t('dashboard.systemStatus')} icon={<MonitorIcon size={18} />}>
            {showSystemSkeleton ? (
              <CardGrid columns={3} gap="md">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="status-item">
                    <Skeleton width="88px" height="12px" />
                    <Skeleton width="120px" height="28px" />
                    {index < 3 ? <Skeleton width="100%" height="6px" variant="rounded" /> : null}
                  </div>
                ))}
              </CardGrid>
            ) : systemStatus ? (
              <div className="status-grid">
                {/* Gateway Status */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.gatewayStatus')}</span>
                  <span className={`status-value status-value-${['online', 'running', 'available'].includes(systemStatus.gateway.status) ? 'online' : 'error'}`}>
                    {['online', 'running', 'available'].includes(systemStatus.gateway.status) ? t('dashboard.online') : t('dashboard.offline')}
                  </span>
                </div>

                {/* CPU Usage */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.cpuUsage')}</span>
                  <span className="status-value">{systemStatus.metrics.cpu_percent.toFixed(1)}%</span>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(systemStatus.metrics.cpu_percent)}`}
                      style={{ width: `${Math.min(systemStatus.metrics.cpu_percent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Memory Usage */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.memoryUsage')}</span>
                  <span className="status-value">
                    {systemStatus.metrics.memory_used_mb} / {systemStatus.metrics.memory_total_mb} MB
                  </span>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(systemStatus.metrics.memory_percent)}`}
                      style={{ width: `${Math.min(systemStatus.metrics.memory_percent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Active Sessions */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.activeSessions')}</span>
                  <span className="status-value">{systemStatus.active_sessions}</span>
                </div>

                {/* Pending Tasks */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.pendingTasks')}</span>
                  <span className="status-value">{systemStatus.pending_tasks}</span>
                </div>

                {/* Connected Platforms */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.connectedPlatforms')}</span>
                  <span className="status-value">
                    {systemStatus.gateway.connected_platforms.filter(p => p.status === 'connected').length} / {systemStatus.gateway.connected_platforms.length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="loading-container">
                <span className="empty-text">{t('dashboard.cannotGetStatus')}</span>
              </div>
            )}
          </Card>
        </div>

        <div className="system-status-section">
          <Card title="Hermes Environment" icon={<RocketIcon size={18} />}>
            {showEnvironmentSkeleton ? (
              <CardGrid columns={3} gap="md">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="status-item">
                    <Skeleton width="96px" height="12px" />
                    <Skeleton width={index % 3 === 0 ? '60%' : '90%'} height="28px" />
                  </div>
                ))}
              </CardGrid>
            ) : (
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Hermes Home</span>
                  <span className="status-value">{hermesEnvironment?.hermes_home ?? '-'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Python Runtime</span>
                  <span className="status-value">{hermesEnvironment?.runtime.python_path ?? '-'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">CLI</span>
                  <span className={`status-value ${cliStatusClass}`}>
                    {cliDisplay}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Profile</span>
                  <span className="status-value">{hermesEnvironment?.active_profile ?? 'default'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Skills Path</span>
                  <span className="status-value">{hermesEnvironment?.paths.skills_dir ?? '-'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Capabilities</span>
                  <span className="status-value">
                    {availableCapabilities.map((entry) => entry.label).join(', ') || '-'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Unavailable</span>
                  <span className={`status-value ${unavailableCapabilities.length === 0 ? 'status-value-online' : 'status-value-error'}`}>
                    {unavailableCapabilities.length === 0
                      ? 'None'
                      : unavailableCapabilities
                          .map((entry) => `${entry.label}: ${entry.detail.reason ?? 'Unavailable'}`)
                          .join(' | ')}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Detection</span>
                  <span className="status-value">
                    {capabilityEntries
                      .map((entry) => `${entry.label}:${entry.detail.detection_method}`)
                      .join(', ') || '-'}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Skills Quick Access */}
        <div className="skills-quick">
          <Card title={t('dashboard.commonSkills')} icon={<TargetIcon size={18} />}>
            {showSkillsSkeleton ? (
              <div className="skills-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <span key={index} className="skill-chip skill-chip-skeleton">
                    <Skeleton width="88px" height="16px" />
                  </span>
                ))}
              </div>
            ) : skills.length > 0 ? (
              <div className="skills-grid">
                {skills.slice(0, 8).map((skill) => (
                  <button key={skill.path} className="skill-chip" onClick={() => setActiveItem('skills')}>
                    <span className="skill-chip-icon"><TargetIcon size={14} /></span>
                    <span>{skill.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="loading-container">
                <span className="empty-text">{t('dashboard.noSkills')}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
  );
};
