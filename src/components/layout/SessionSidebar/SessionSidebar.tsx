// Session Sidebar - Shows session list next to main navigation
import React, { useState, useMemo } from 'react';
import { useSessionStore, useNavigationStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { PlusIcon } from '../../index';
import './SessionSidebar.css';

// Time group type for session list
type TimeGroup = 'today' | 'yesterday' | 'last7days' | 'older';

const TIME_GROUP_ORDER: TimeGroup[] = ['today', 'yesterday', 'last7days', 'older'];

// Group sessions by time
function groupSessionsByTime(sessions: { id: string; last_activity_at: string; chat_name: string }[]): Map<TimeGroup, typeof sessions> {
  const groups = new Map<TimeGroup, typeof sessions>();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const sevenDaysAgo = startOfToday - 7 * 86400000;

  for (const session of sessions) {
    const ts = new Date(session.last_activity_at).getTime();
    let group: TimeGroup;
    if (ts >= startOfToday) group = 'today';
    else if (ts >= startOfYesterday) group = 'yesterday';
    else if (ts >= sevenDaysAgo) group = 'last7days';
    else group = 'older';

    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(session);
  }

  return groups;
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
}

export const SessionSidebar: React.FC = () => {
  const sessions = useSessionStore((s) => s.sessions);
  const activeTabId = useNavigationStore((s) => s.activeTabId);
  const openTab = useNavigationStore((s) => s.openTab);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(s =>
      s.chat_name?.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // Group by time
  const timeGroups = useMemo(() => groupSessionsByTime(filteredSessions), [filteredSessions]);

  const { t } = useTranslation();

  const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
    today: t('sidebar.timeGroup.today') || '今天',
    yesterday: t('sidebar.timeGroup.yesterday') || '昨天',
    last7days: t('sidebar.timeGroup.last7days') || '最近7天',
    older: t('sidebar.timeGroup.older') || '更早',
  };

  const handleNewChat = () => {
    const newId = `new_${Date.now()}`;
    openTab(newId, '新会话', 'new');
  };

  return (
    <aside className="session-sidebar">
      {/* Header */}
      <div className="session-sidebar-header">
        <span className="session-sidebar-title">{t('nav.sessions') || '会话'}</span>
        <button className="session-sidebar-new-btn" onClick={handleNewChat} title={t('nav.newChat') || '新建会话'}>
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="session-sidebar-search">
        <input
          type="text"
          className="session-sidebar-search-input"
          placeholder={t('sidebar.searchPlaceholder') || '搜索会话...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Session List */}
      <div className="session-sidebar-list">
        {filteredSessions.length === 0 && (
          <div className="session-sidebar-empty">
            {searchQuery ? (t('sidebar.noMatching') || '没有匹配的会话') : (t('sidebar.noSessions') || '暂无会话')}
          </div>
        )}
        {TIME_GROUP_ORDER.map((group) => {
          const items = timeGroups.get(group);
          if (!items || items.length === 0) return null;
          return (
            <div key={group} className="session-sidebar-group">
              <div className="session-sidebar-group-label">{TIME_GROUP_LABELS[group]}</div>
              {items.map((session) => {
                // Generate a more descriptive title for untitled sessions
                const displayTitle = session.chat_name || `会话 ${session.id.slice(0, 12)}`;
                return (
                  <div
                    key={session.id}
                    className={`session-sidebar-item ${activeTabId === session.id ? 'active' : ''}`}
                    onClick={() => openTab(session.id, session.chat_name || `会话 ${session.id.slice(0, 12)}`, 'session')}
                  >
                    <span className="session-sidebar-item-dot" />
                    <span className="session-sidebar-item-title">
                      {displayTitle}
                    </span>
                    <span className="session-sidebar-item-time">
                      {formatRelativeTime(session.last_activity_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
