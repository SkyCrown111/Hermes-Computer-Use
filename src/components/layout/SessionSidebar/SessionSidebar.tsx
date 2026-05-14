import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSessionStore, useNavigationStore, useChatStore, useThemeStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import {
  EditIcon,
  TrashIcon,
  XIcon,
  LayoutIcon,
} from '../../index';
import { InputModal } from '../../ui/Modal';
import { formatRelativeTimeShort, groupByTime, type TimeGroup, TIME_GROUP_ORDER } from '../../../utils/format';
import { FOCUS_SEARCH_EVENT } from '../../../hooks/useKeyboardShortcuts';
import { OPEN_COMMAND_PALETTE_EVENT } from '../../ui/CommandPalette/CommandPalette';
import { logger } from '../../../lib/logger';
import './SessionSidebar.css';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  sessionId: string;
  sessionName: string;
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`session-sidebar-group-chevron ${expanded ? 'expanded' : ''}`}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export const SessionSidebar: React.FC = () => {
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);
  const activeTabId = useNavigationStore((s) => s.activeTabId);
  const openTab = useNavigationStore((s) => s.openTab);
  const closeTab = useNavigationStore((s) => s.closeTab);
  const setActiveItem = useNavigationStore((s) => s.setActiveItem);
  const mobileSidebarOpen = useThemeStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useThemeStore((s) => s.setMobileSidebarOpen);

  const isStreamingActive = useChatStore(s =>
    Object.values(s.sessions).some(session => session?.isStreaming)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    const handler = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, handler);
  }, []);

  useEffect(() => {
    fetchSessions();
    const intervalId = setInterval(() => {
      fetchSessions();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchSessions]);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreamingActive) {
      fetchSessions();
    }
    wasStreamingRef.current = isStreamingActive;
  }, [isStreamingActive, fetchSessions]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    sessionId: '',
    sessionName: '',
  });

  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    sessionId: '',
    currentName: '',
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<TimeGroup, boolean>>({
    today: false,
    yesterday: false,
    last7days: false,
    older: true,
  });

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(s =>
      s.chat_name?.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const timeGroups = useMemo(() => groupByTime(filteredSessions), [filteredSessions]);

  const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
    today: t('sidebar.timeGroup.today'),
    yesterday: t('sidebar.timeGroup.yesterday'),
    last7days: t('sidebar.timeGroup.last7days'),
    older: t('sidebar.timeGroup.older'),
  };

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      for (const group of TIME_GROUP_ORDER) {
        if (!timeGroups.has(group)) {
          next[group] = false;
        }
      }
      return next;
    });
  }, [timeGroups]);

  const closeSidebarOnMobile = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileSidebarOpen(false);
    }
  }, [setMobileSidebarOpen]);

  const handleNewChat = useCallback(() => {
    const { openTabs, activeTabId } = useNavigationStore.getState();
    const chatSessions = useChatStore.getState().sessions;

    if (activeTabId) {
      const activeSession = chatSessions[activeTabId];
      if (activeTabId.startsWith('new_') && activeSession && !activeSession.messages?.length && !activeSession.isStreaming) {
        useNavigationStore.getState().setActiveItem('chat');
        closeSidebarOnMobile();
        return;
      }
    }

    for (const tab of openTabs) {
      const session = chatSessions[tab.id];
      if (tab.id.startsWith('new_') && session && !session.messages?.length && !session.isStreaming) {
        useNavigationStore.getState().switchTab(tab.id);
        closeSidebarOnMobile();
        return;
      }
    }

    const newId = `new_${Date.now()}`;
    openTab(newId, t('sidebar.newChat'), 'new');
    closeSidebarOnMobile();
  }, [closeSidebarOnMobile, openTab, t]);

  const handleContextMenu = useCallback((e: React.MouseEvent, session: { id: string; chat_name?: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      sessionId: session.id,
      sessionName: session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12)),
    });
  }, [t]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRename = useCallback(() => {
    setRenameModal({
      isOpen: true,
      sessionId: contextMenu.sessionId,
      currentName: contextMenu.sessionName,
    });
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.sessionId, contextMenu.sessionName]);

  const handleRenameConfirm = useCallback(async (newName: string) => {
    try {
      await updateSessionTitle(renameModal.sessionId, newName);
    } catch (error) {
      logger.error('[SessionSidebar] Failed to rename session:', error);
    }
    setRenameModal({ isOpen: false, sessionId: '', currentName: '' });
  }, [renameModal.sessionId, updateSessionTitle]);

  const handleDelete = useCallback(async () => {
    const sessionId = contextMenu.sessionId;
    setContextMenu(prev => ({ ...prev, visible: false }));

    try {
      closeTab(sessionId);
      await deleteSession(sessionId);
    } catch (error) {
      logger.error('[SessionSidebar] Failed to delete session:', error);
    }
  }, [contextMenu.sessionId, closeTab, deleteSession]);

  const toggleGroup = useCallback((group: TimeGroup) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }, []);

  return (
    <>
      <div
        className={`session-sidebar-overlay ${mobileSidebarOpen ? 'active' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className={`session-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="session-sidebar-header">
          <button className="session-sidebar-new-chat" onClick={handleNewChat} title={t('nav.newChat')}>
            <span className="session-sidebar-new-chat-icon"><SparkIcon /></span>
            <span className="session-sidebar-new-chat-label">{t('nav.newChat')}</span>
          </button>
          <div className="session-sidebar-header-actions">
            <button
              className="session-sidebar-icon-btn session-sidebar-mobile-close"
              onClick={() => setMobileSidebarOpen(false)}
              title="Close sidebar"
            >
              <XIcon size={14} />
            </button>
          </div>
        </div>

        <div className="session-sidebar-search">
          <div className="session-sidebar-search-row">
            <div className="session-sidebar-search-field">
              <span className="session-sidebar-search-leading"><SearchIcon /></span>
              <input
                ref={searchInputRef}
                type="text"
                className="session-sidebar-search-input"
                placeholder={t('sidebar.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="session-sidebar-launcher session-sidebar-launcher-compact"
              onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
              title="Open launcher"
            >
              <span className="session-sidebar-launcher-shortcut">Ctrl K</span>
            </button>
          </div>
        </div>

        <div className="session-sidebar-list">
          <div className="session-sidebar-list-header">
            <div className="session-sidebar-group-label session-sidebar-group-label-top">
              Recent chats
            </div>
            <div className="session-sidebar-list-count">{filteredSessions.length}</div>
          </div>
          {filteredSessions.length === 0 && (
            <div className="session-sidebar-empty">
              {searchQuery ? t('sidebar.noMatching') : t('sidebar.noSessions')}
            </div>
          )}
          {TIME_GROUP_ORDER.map((group) => {
            const items = timeGroups.get(group);
            if (!items || items.length === 0) return null;
            const isCollapsed = collapsedGroups[group];
            return (
              <div key={group} className="session-sidebar-group">
                <button
                  type="button"
                  className="session-sidebar-group-toggle"
                  onClick={() => toggleGroup(group)}
                >
                  <span className="session-sidebar-group-toggle-left">
                    <ChevronIcon expanded={!isCollapsed} />
                    <span className="session-sidebar-group-label">{TIME_GROUP_LABELS[group]}</span>
                  </span>
                  <span className="session-sidebar-group-count">{items.length}</span>
                </button>
                {!isCollapsed && items.map((session) => {
                  const displayTitle = session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12));
                  return (
                    <div
                      key={session.id}
                      className={`session-sidebar-item ${activeTabId === session.id ? 'active' : ''}`}
                      onClick={() => {
                        openTab(session.id, displayTitle, 'session');
                        closeSidebarOnMobile();
                      }}
                      onContextMenu={(e) => handleContextMenu(e, session)}
                      title={displayTitle}
                    >
                      <span className="session-sidebar-item-title">{displayTitle}</span>
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
        <div className="session-sidebar-footer">
          <button
            className="session-sidebar-footer-preferences"
            onClick={() => {
              setActiveItem('preferences');
              closeSidebarOnMobile();
            }}
          >
            <span className="session-sidebar-footer-preferences-icon"><LayoutIcon size={14} /></span>
            <span>{t('nav.preferences')}</span>
          </button>
        </div>

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
            <div className="session-context-menu-item" onClick={handleRename}>
              <span className="session-context-menu-icon"><EditIcon size={14} /></span>
              {t('sidebar.rename')}
            </div>
            <div className="session-context-menu-item delete" onClick={handleDelete}>
              <span className="session-context-menu-icon"><TrashIcon size={14} /></span>
              {t('sessions.delete')}
            </div>
          </div>
        )}

        <InputModal
          isOpen={renameModal.isOpen}
          title={t('sidebar.renameSession')}
          placeholder={t('sidebar.enterSessionName')}
          defaultValue={renameModal.currentName}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleRenameConfirm}
          onCancel={() => setRenameModal({ isOpen: false, sessionId: '', currentName: '' })}
        />
      </aside>
    </>
  );
};
