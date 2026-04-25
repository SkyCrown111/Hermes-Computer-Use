// Session Sidebar - Shows session list next to main navigation
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSessionStore, useNavigationStore, useChatStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { PlusIcon } from '../../index';
import { InputModal } from '../../ui/Modal';
import './SessionSidebar.css';

// Context menu position type
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  sessionId: string;
  sessionName: string;
}

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
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const activeTabId = useNavigationStore((s) => s.activeTabId);
  const openTab = useNavigationStore((s) => s.openTab);
  const closeTab = useNavigationStore((s) => s.closeTab);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);

  // Get chat sessions state for status indicators
  const chatSessions = useChatStore((s) => s.sessions);

  const [searchQuery, setSearchQuery] = useState('');

  // Track previous streaming state to detect when streaming ends
  const wasStreamingRef = useRef(false);

  // Real-time update: poll sessions every 30 seconds
  useEffect(() => {
    // Initial fetch
    fetchSessions();

    // Set up polling interval (30 seconds)
    const intervalId = setInterval(() => {
      fetchSessions();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchSessions]);

  // Refresh when streaming ends (was streaming, now not)
  useEffect(() => {
    const isCurrentlyStreaming = Object.values(chatSessions).some(s => s?.isStreaming);

    // If was streaming but now stopped, refresh the session list
    if (wasStreamingRef.current && !isCurrentlyStreaming) {
      fetchSessions();
    }

    // Update ref for next check
    wasStreamingRef.current = isCurrentlyStreaming;
  }, [chatSessions, fetchSessions]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    sessionId: '',
    sessionName: '',
  });

  // Rename modal state
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    sessionId: '',
    currentName: '',
  });

  // Ref for context menu to handle click outside
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  // Get session status: 'streaming' | 'active' | 'idle'
  const getSessionStatus = useCallback((sessionId: string): 'streaming' | 'active' | 'idle' => {
    const chatSession = chatSessions[sessionId];
    if (!chatSession) return 'idle';
    if (chatSession.isStreaming) return 'streaming';
    if (chatSession.messages && chatSession.messages.length > 0) return 'active';
    return 'idle';
  }, [chatSessions]);

  const handleNewChat = () => {
    const newId = `new_${Date.now()}`;
    openTab(newId, '新会话', 'new');
  };

  // Handle right-click on session item
  const handleContextMenu = useCallback((e: React.MouseEvent, session: { id: string; chat_name: string }) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      sessionId: session.id,
      sessionName: session.chat_name || `会话 ${session.id.slice(0, 12)}`,
    });
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Handle rename action
  const handleRename = useCallback(() => {
    setRenameModal({
      isOpen: true,
      sessionId: contextMenu.sessionId,
      currentName: contextMenu.sessionName,
    });
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.sessionId, contextMenu.sessionName]);

  // Handle rename confirmation
  const handleRenameConfirm = useCallback(async (newName: string) => {
    try {
      await updateSessionTitle(renameModal.sessionId, newName);
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
    setRenameModal({ isOpen: false, sessionId: '', currentName: '' });
  }, [renameModal.sessionId, updateSessionTitle]);

  // Handle rename cancel
  const handleRenameCancel = useCallback(() => {
    setRenameModal({ isOpen: false, sessionId: '', currentName: '' });
  }, []);

  // Handle delete action
  const handleDelete = useCallback(async () => {
    const sessionId = contextMenu.sessionId;
    setContextMenu(prev => ({ ...prev, visible: false }));

    try {
      // Close the tab if it's open
      closeTab(sessionId);

      // Delete the session from server
      await deleteSession(sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [contextMenu.sessionId, closeTab, deleteSession]);

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
                const status = getSessionStatus(session.id);
                return (
                  <div
                    key={session.id}
                    className={`session-sidebar-item ${activeTabId === session.id ? 'active' : ''}`}
                    onClick={() => openTab(session.id, session.chat_name || `会话 ${session.id.slice(0, 12)}`, 'session')}
                    onContextMenu={(e) => handleContextMenu(e, session)}
                  >
                    <span className={`session-sidebar-item-dot ${status}`} />
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

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="session-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <div
            className="session-context-menu-item"
            onClick={handleRename}
          >
            <span className="session-context-menu-icon">✏️</span>
            {t('sidebar.rename') || '重命名'}
          </div>
          <div
            className="session-context-menu-item delete"
            onClick={handleDelete}
          >
            <span className="session-context-menu-icon">🗑️</span>
            {t('sessions.delete') || '删除'}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      <InputModal
        isOpen={renameModal.isOpen}
        title={t('sidebar.renameSession') || '重命名会话'}
        placeholder={t('sidebar.enterSessionName') || '请输入会话名称'}
        defaultValue={renameModal.currentName}
        confirmText={t('common.confirm') || '确定'}
        cancelText={t('common.cancel') || '取消'}
        onConfirm={handleRenameConfirm}
        onCancel={handleRenameCancel}
      />
    </aside>
  );
};
