// Session Sidebar - Shows session list next to main navigation
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSessionStore, useNavigationStore, useChatStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { PlusIcon, EditIcon, TrashIcon } from '../../index';
import { InputModal } from '../../ui/Modal';
import { formatRelativeTimeShort, groupByTime, type TimeGroup, TIME_GROUP_ORDER } from '../../../utils/format';
import { FOCUS_SEARCH_EVENT } from '../../../hooks/useKeyboardShortcuts';
import { logger } from '../../../lib/logger';
import './SessionSidebar.css';

// Context menu position type
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  sessionId: string;
  sessionName: string;
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Listen for global focus-search event (Ctrl+K)
  useEffect(() => {
    const handler = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, handler);
  }, []);

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
  const timeGroups = useMemo(() => groupByTime(filteredSessions), [filteredSessions]);

  const { t } = useTranslation();

  const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
    today: t('sidebar.timeGroup.today'),
    yesterday: t('sidebar.timeGroup.yesterday'),
    last7days: t('sidebar.timeGroup.last7days'),
    older: t('sidebar.timeGroup.older'),
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
    openTab(newId, t('sidebar.newChat'), 'new');
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
      sessionName: session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12)),
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
      logger.error('[SessionSidebar] Failed to rename session:', error);
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
      logger.error('[SessionSidebar] Failed to delete session:', error);
    }
  }, [contextMenu.sessionId, closeTab, deleteSession]);

  return (
    <aside className="session-sidebar">
      {/* Header */}
      <div className="session-sidebar-header">
        <span className="session-sidebar-title">{t('nav.sessions')}</span>
        <button className="session-sidebar-new-btn" onClick={handleNewChat} title={t('nav.newChat')}>
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="session-sidebar-search">
        <input
          ref={searchInputRef}
          type="text"
          className="session-sidebar-search-input"
          placeholder={t('sidebar.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Session List */}
      <div className="session-sidebar-list">
        {filteredSessions.length === 0 && (
          <div className="session-sidebar-empty">
            {searchQuery ? t('sidebar.noMatching') : t('sidebar.noSessions')}
          </div>
        )}
        {TIME_GROUP_ORDER.map((group) => {
          const items = timeGroups.get(group);
          if (!items || items.length === 0) return null;
          return (
            <div key={group} className="session-sidebar-group">
              <div className="session-sidebar-group-label">{TIME_GROUP_LABELS[group]}</div>
              {items.map((session) => {
                const displayTitle = session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12));
                const status = getSessionStatus(session.id);
                return (
                  <div
                    key={session.id}
                    className={`session-sidebar-item ${activeTabId === session.id ? 'active' : ''}`}
                    onClick={() => openTab(session.id, session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12)), 'session')}
                    onContextMenu={(e) => handleContextMenu(e, session)}
                  >
                    <span className={`session-sidebar-item-dot ${status}`} />
                    <span className="session-sidebar-item-title">
                      {displayTitle}
                    </span>
                    <span className="session-sidebar-item-time">
                      {formatRelativeTimeShort(session.last_activity_at)}
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
            <span className="session-context-menu-icon"><EditIcon size={14} /></span>
            {t('sidebar.rename')}
          </div>
          <div
            className="session-context-menu-item delete"
            onClick={handleDelete}
          >
            <span className="session-context-menu-icon"><TrashIcon size={14} /></span>
            {t('sessions.delete')}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      <InputModal
        isOpen={renameModal.isOpen}
        title={t('sidebar.renameSession')}
        placeholder={t('sidebar.enterSessionName')}
        defaultValue={renameModal.currentName}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleRenameConfirm}
        onCancel={handleRenameCancel}
      />
    </aside>
  );
};
