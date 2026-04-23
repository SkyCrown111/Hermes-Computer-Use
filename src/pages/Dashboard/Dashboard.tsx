import React, { useEffect, useState } from 'react';
import { Card, Button, RocketIcon, ChatIcon, TargetIcon, ClockIcon, ChartIcon, ZapIcon, MonitorIcon, TrendingUpIcon, AlertIcon } from '../../components';
import { useDashboardStore, useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { safeInvoke } from '../../lib/tauri';
import { formatNumber, formatCurrency, formatTime } from '../../utils/format';
import { logger } from '../../lib/logger';
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
          <p>💡 {t('dashboard.dataDir')}: <code>~/.hermes</code></p>
          <p>{t('dashboard.dataDirDesc')}</p>
        </div>
      </Card>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { setActiveItem } = useNavigationStore();
  const { t } = useTranslation();
  const {
    systemStatus,
    usageAnalytics,
    skills,
    todayTasks,
    isLoadingStatus,
    isLoadingAnalytics,
    isLoadingSkills,
    isLoadingTasks,
    error,
    fetchAll,
  } = useDashboardStore();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    logger.component('Dashboard', 'useEffect triggered, checking status...');
    checkHermesStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkHermesStatus = async () => {
    setIsChecking(true);
    try {
      // 检查数据目录是否存在
      logger.component('Dashboard', 'Checking if data dir exists...');
      const exists = await safeInvoke<boolean>('check_data_dir_exists');
      logger.component('Dashboard', 'Data dir exists:', exists);
      if (!exists) {
        logger.component('Dashboard', 'Showing onboarding...');
        setShowOnboarding(true);
      } else {
        logger.component('Dashboard', 'Fetching all data...');
        setShowOnboarding(false);
        fetchAll();
      }
    } catch (err) {
      logger.error('[Dashboard] Failed to check Hermes status:', err);
      setShowOnboarding(true);
    } finally {
      setIsChecking(false);
    }
  };

  // 正在检测状态
  if (isChecking) {
    return (
      <div className="dashboard">
        <div className="loading-fullscreen">
          <div className="loading-spinner large" />
          <p>{t('dashboard.checking')}</p>
        </div>
      </div>
    );
  }

  // 显示引导界面
  if (showOnboarding) {
    return (
      <div className="dashboard">
        <OnboardingGuide onRetry={checkHermesStatus} t={t} />
      </div>
    );
  }

  // 计算统计数据
  const stats = {
    totalSessions: usageAnalytics?.totals.total_sessions ?? 0,
    skillCalls: skills.length,
    scheduledTasks: todayTasks.length,
    tokenUsage: usageAnalytics?.totals.total_input ?? 0,
  };
  logger.component('Dashboard', 'stats:', stats);

  // 获取最近会话（从统计中获取）
  const recentSessions = usageAnalytics?.daily.slice(-5).reverse() ?? [];

  // 获取进度条颜色类
  const getProgressClass = (percent: number): string => {
    if (percent < 60) return 'progress-fill-normal';
    if (percent < 85) return 'progress-fill-warning';
    return 'progress-fill-danger';
  };

  return (
    <div className="dashboard">
      {/* Stats Grid */}
        <div className="stats-grid">
          <Card className="stat-card">
            <div className="stat-icon stat-icon-primary"><ChatIcon size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{formatNumber(stats.totalSessions)}</span>
              <span className="stat-label">{t('dashboard.totalSessions')}</span>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="stat-icon stat-icon-success"><TargetIcon size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.skillCalls}</span>
              <span className="stat-label">{t('dashboard.availableSkills')}</span>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="stat-icon stat-icon-warning"><ClockIcon size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{stats.scheduledTasks}</span>
              <span className="stat-label">{t('dashboard.todayTasks')}</span>
            </div>
          </Card>
          <Card className="stat-card">
            <div className="stat-icon stat-icon-info"><ChartIcon size={20} /></div>
            <div className="stat-content">
              <span className="stat-value">{formatNumber(stats.tokenUsage)}</span>
              <span className="stat-label">{t('dashboard.tokenUsage')}</span>
            </div>
          </Card>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Main Content */}
        <div className="dashboard-main">
          {/* Recent Sessions */}
          <Card title={t('dashboard.recentActivity')} icon={<TrendingUpIcon size={18} />} className="recent-sessions">
            {isLoadingAnalytics ? (
              <div className="loading-container">
                <div className="loading-spinner" />
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
                <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noActivity')}</span>
              </div>
            )}
            <Button variant="ghost" className="view-all-btn" onClick={() => setActiveItem('sessions')}>
              {t('dashboard.viewAllSessions')}
            </Button>
          </Card>

          {/* Quick Actions */}
          <Card title={t('dashboard.quickActions')} icon={<ZapIcon size={18} />} className="quick-actions">
            <div className="action-grid">
              <Button variant="primary" onClick={() => setActiveItem('sessions')}>{t('dashboard.newSession')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('skills')}>{t('dashboard.executeSkill')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('tasks')}>{t('dashboard.createTask')}</Button>
              <Button variant="secondary" onClick={() => setActiveItem('settings')}>{t('dashboard.openSettings')}</Button>
            </div>
          </Card>

          {/* Today Tasks */}
          <Card title={t('dashboard.todayTasks')} icon={<ClockIcon size={18} />} className="today-tasks">
            {isLoadingTasks ? (
              <div className="loading-container">
                <div className="loading-spinner" />
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
                <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.todayTasks')}</span>
              </div>
            )}
          </Card>
        </div>

        {/* System Status Section */}
        <div className="system-status-section">
          <Card title={t('dashboard.systemStatus')} icon={<MonitorIcon size={18} />}>
            {isLoadingStatus ? (
              <div className="loading-container">
                <div className="loading-spinner" />
              </div>
            ) : systemStatus ? (
              <div className="status-grid">
                {/* Gateway Status */}
                <div className="status-item">
                  <span className="status-label">{t('dashboard.gatewayStatus')}</span>
                  <span className={`status-value status-value-${['online', 'running'].includes(systemStatus.gateway.status) ? 'online' : 'error'}`}>
                    {['online', 'running'].includes(systemStatus.gateway.status) ? t('dashboard.online') : t('dashboard.offline')}
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
                <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.cannotGetStatus')}</span>
              </div>
            )}
          </Card>
        </div>

        {/* Skills Quick Access */}
        <div className="skills-quick">
          <Card title={t('dashboard.commonSkills')} icon={<TargetIcon size={18} />}>
            {isLoadingSkills ? (
              <div className="loading-container">
                <div className="loading-spinner" />
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
                <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.noSkills')}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
  );
};
