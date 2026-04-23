// Shared utility functions

/**
 * Format large numbers with K/M suffix
 */
export const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

/**
 * Format currency with dollar sign
 */
export const formatCurrency = (amount: number, decimals: number = 4): string => {
  return `$${amount.toFixed(decimals)}`;
};

/**
 * Format date and time
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format time only
 */
export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Format relative time with i18n support
 */
export const formatRelativeTime = (
  dateString: string,
  t: (key: string) => string
): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return `${diffMins} ${t('time.minutesAgo')}`;
  if (diffHours < 24) return `${diffHours} ${t('time.hoursAgo')}`;
  if (diffDays < 7) return `${diffDays} ${t('time.daysAgo')}`;
  return formatDateTime(dateString);
};

/**
 * Get platform icon
 */
export const getPlatformIcon = (platform: string): string => {
  const icons: Record<string, string> = {
    cli: '💻',
    weixin: '💬',
    telegram: '📱',
    discord: '🎮',
    slack: '💼',
    web: '🌐',
    cron: '⏰',
    api: '🔌',
  };
  return icons[platform] || '🤖';
};

/**
 * Get platform display name
 */
export const getPlatformName = (platform: string): string => {
  const names: Record<string, string> = {
    cli: 'CLI',
    weixin: 'WeChat',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    web: 'Web',
    cron: 'Cron',
    api: 'API',
  };
  return names[platform] || platform;
};

/**
 * Format bytes to human readable
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Format duration in seconds to human readable
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};
