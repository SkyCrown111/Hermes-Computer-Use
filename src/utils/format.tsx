import React from 'react';
import { TerminalIcon, ChatIcon, SmartphoneIcon, GlobeIcon, ClockIcon, PlugIcon, BotIcon, BriefcaseIcon } from '../components/ui/Icons';

export const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null || Number.isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export const formatCurrency = (amount: number | undefined | null, decimals: number = 4): string => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return `$${(0).toFixed(decimals)}`;
  }
  return `$${amount.toFixed(decimals)}`;
};

export const formatDateTime = (dateString: string | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatTime = (dateString: string | undefined | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

export const formatTimestamp = (unixSeconds: number | undefined | null): string => {
  if (unixSeconds === undefined || unixSeconds === null) return '-';
  return formatDateTime(new Date(unixSeconds * 1000).toISOString());
};

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

export const formatRelativeTimeCompact = (dateString: string | undefined | null): string => {
  if (!dateString) return '-';
  const diff = Date.now() - new Date(dateString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
};

export const formatFutureTime = (
  dateString: string,
  t: (key: string) => string
): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return t('time.soon') || 'Soon';
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t('time.soon') || 'Soon';
  if (diffMins < 60) return `${diffMins} ${t('time.minutesLater') || 'min later'}`;
  if (diffHours < 24) return `${diffHours} ${t('time.hoursLater') || 'hr later'}`;
  return `${diffDays} ${t('time.daysLater') || 'days later'}`;
};

export const formatRelativeTimeShort = formatRelativeTimeCompact;

export const getPlatformIcon = (platform: string): React.ReactNode => {
  const icons: Record<string, React.ReactNode> = {
    cli: <TerminalIcon size={14} />,
    weixin: <ChatIcon size={14} />,
    telegram: <SmartphoneIcon size={14} />,
    discord: <ChatIcon size={14} />,
    slack: <BriefcaseIcon size={14} />,
    web: <GlobeIcon size={14} />,
    cron: <ClockIcon size={14} />,
    api: <PlugIcon size={14} />,
  };
  return icons[platform] || <BotIcon size={14} />;
};

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

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || seconds < 0) return '0s';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

export const formatDurationMs = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return formatDuration(ms / 1000);
};

export const formatPercentage = (value: number | null | undefined, decimals: number = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
};

export const formatCost = (cost: number | null | undefined): string => {
  if (cost === null || cost === undefined) return '$0.0000';
  if (cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(4)}`;
};

export const formatTokenCount = (tokens: number | null | undefined): string => {
  if (tokens === null || tokens === undefined) return '0';
  return formatNumber(tokens);
};

export type TimeGroup = 'today' | 'yesterday' | 'last7days' | 'older';

export const TIME_GROUP_ORDER: TimeGroup[] = ['today', 'yesterday', 'last7days', 'older'];

export interface TimeGroupItem {
  id: string;
  last_activity_at: string;
}

export function groupByTime<T extends TimeGroupItem>(items: T[]): Map<TimeGroup, T[]> {
  const groups = new Map<TimeGroup, T[]>();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const sevenDaysAgo = startOfToday - 7 * 86400000;

  for (const item of items) {
    const ts = new Date(item.last_activity_at).getTime();
    let group: TimeGroup;
    if (ts >= startOfToday) group = 'today';
    else if (ts >= startOfYesterday) group = 'yesterday';
    else if (ts >= sevenDaysAgo) group = 'last7days';
    else group = 'older';

    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }

  return groups;
}
