// Shared utility functions
import React from 'react';
import { TerminalIcon, ChatIcon, SmartphoneIcon, GlobeIcon, ClockIcon, PlugIcon, BotIcon, BriefcaseIcon } from '../components/ui/Icons';

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

// ----- Relative time formatting (compact, no i18n, for constrained spaces) -----

/**
 * Format relative time as a compact string (e.g. "3m", "2h", "5d").
 * i18n-free — suitable for sidebars, lists, and other tight layouts.
 */
export const formatRelativeTimeShort = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
};

// ----- Session time grouping -----

export type TimeGroup = 'today' | 'yesterday' | 'last7days' | 'older';

export const TIME_GROUP_ORDER: TimeGroup[] = ['today', 'yesterday', 'last7days', 'older'];

export interface TimeGroupItem {
  id: string;
  last_activity_at: string;
}

/**
 * Group sessions (or any items with last_activity_at) into time-based buckets.
 */
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
