import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Button, ChatIcon, UserIcon, BotIcon, ToolIcon, ExportIcon, SearchIcon, ClockIcon, TrashIcon, SettingsIcon, AlertIcon, EditIcon, ConfirmModal, XIcon } from '../../components';
import { useSessionStore, useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import type { Session, SessionMessage } from '../../types';
import type { Checkpoint } from '../../types/checkpoint';
import { sessionApi } from '../../services';
import { formatNumber, formatCurrency, formatDateTime, formatRelativeTime, getPlatformIcon, getPlatformName } from '../../utils/format';
import { logger } from '../../lib/logger';
import JSZip from 'jszip';
import './Sessions.css';

// Session Card Component
interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  isBatchMode: boolean;
  onClick: () => void;
  onDetail: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onExport: () => void;
  onToggleSelect: () => void;
  t: (key: string) => string;
}

const SessionCard: React.FC<SessionCardProps> = React.memo(({ session, isSelected, isBatchMode, onClick, onDetail, onDelete, onEdit, onExport, onToggleSelect, t }) => {
  return (
    <div className={`session-card ${isSelected ? 'session-card-selected' : ''}`} onClick={isBatchMode ? onToggleSelect : onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isBatchMode ? onToggleSelect() : onClick(); } }}>
      {isBatchMode && (
        <div className="session-checkbox" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect} />
        </div>
      )}
      <div className={`platform-badge platform-${session.platform}`}>
        {getPlatformIcon(session.platform)}
      </div>
      <div className="session-info">
        <div className="session-header-row">
          <span className="session-name">{session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 12))}</span>
          <span className="session-model">{(session.model || 'unknown').split('/').pop()}</span>
        </div>
        <div className="session-meta">
          <span className="session-meta-item">
            <ChatIcon size={14} />
            <span>{session.message_count} {t('sessions.messages')}</span>
          </span>
          <span className="session-meta-item">
            <ClockIcon size={14} />
            <span>{formatRelativeTime(session.last_activity_at, t)}</span>
          </span>
        </div>
      </div>
      <div className="session-stats">
        <span className="session-cost">{formatCurrency(session.estimated_cost_usd)}</span>
        <span className="session-tokens">
          {formatNumber(session.input_tokens + session.output_tokens)} {t('common.tokens')}
        </span>
      </div>
      <div className="session-actions">
        <button
          className="action-btn"
          title={t('sessions.detail') || '详情'}
          onClick={(e) => {
            e.stopPropagation();
            onDetail();
          }}
        >
          <SettingsIcon size={14} />
        </button>
        <button
          className="action-btn"
          title={t('sessions.editName')}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <EditIcon size={14} />
        </button>
        <button
          className="action-btn"
          title={t('sessions.export')}
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
        >
          <ExportIcon size={14} />
        </button>
        <button
          className="action-btn action-btn-delete"
          title={t('sessions.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <TrashIcon size={14} />
        </button>
      </div>
    </div>
  );
});

// Message Item Component
interface MessageItemProps {
  message: SessionMessage;
  t: (key: string) => string;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({ message, t }) => {
  const getRoleIcon = (role: string) => {
    if (role === 'user') return <UserIcon size={16} />;
    if (role === 'assistant') return <BotIcon size={16} />;
    return <SettingsIcon size={16} />;
  };

  const getRoleName = (role: string, lang: 'zh' | 'en'): string => {
    const names: Record<string, { zh: string; en: string }> = {
      user: { zh: '用户', en: 'User' },
      assistant: { zh: '助手', en: 'Assistant' },
      system: { zh: '系统', en: 'System' },
    };
    return names[role]?.[lang] || role;
  };

  return (
    <div className={`message-item message-${message.role}`}>
      <div className="message-content-wrapper">
        <div className="message-role">{getRoleName(message.role, t('nav.home') === 'Home' ? 'en' : 'zh')}</div>
        <div className="message-content">{message.content}</div>
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="tool-calls">
            {message.tool_calls.map((tool, index) => (
              <div key={index} className="tool-call-item">
                <span className="tool-call-icon"><ToolIcon size={14} /></span>
                <span>{tool.name}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {JSON.stringify(tool.args).slice(0, 50)}...
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="message-timestamp">{formatDateTime(message.timestamp)}</div>
      </div>
    </div>
  );
});

// Export Modal Component
interface ExportModalProps {
  session: Session | null;
  onClose: () => void;
  onExport: (format: 'jsonl' | 'json' | 'markdown') => void;
  t: (key: string) => string;
}

const ExportModal: React.FC<ExportModalProps> = ({ session, onClose, onExport, t }) => {
  const [selectedFormat, setSelectedFormat] = useState<'jsonl' | 'json' | 'markdown'>('json');

  if (!session) return null;

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="export-modal-title">{t('sessions.export')}</h3>
        <div className="export-options">
          {(['json', 'jsonl', 'markdown'] as const).map((format) => (
            <div
              key={format}
              className={`export-option ${selectedFormat === format ? 'export-option-selected' : ''}`}
              onClick={() => setSelectedFormat(format)}
            >
              <span>{format === 'markdown' ? 'MD' : 'JSON'}</span>
              <span>{format.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="export-modal-actions">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onExport(selectedFormat)}>{t('sessions.export')}</Button>
        </div>
      </div>
    </div>
  );
};

// Main Sessions Page Component
export const Sessions: React.FC = () => {
  const { t } = useTranslation();

  // Get store state and actions - only subscribe to what's needed for the list view
  const sessions = useSessionStore(s => s.sessions);
  const currentSession = useSessionStore(s => s.currentSession);
  const total = useSessionStore(s => s.total);
  const isLoading = useSessionStore(s => s.isLoading);
  const error = useSessionStore(s => s.error);
  const platform = useSessionStore(s => s.platform);
  const searchQuery = useSessionStore(s => s.searchQuery);
  const limit = useSessionStore(s => s.limit);
  const offset = useSessionStore(s => s.offset);
  const refreshKey = useSessionStore(s => s.refreshKey);
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  const fetchSession = useSessionStore(s => s.fetchSession);
  const deleteSession = useSessionStore(s => s.deleteSession);
  const updateSessionTitle = useSessionStore(s => s.updateSessionTitle);
  const setPlatform = useSessionStore(s => s.setPlatform);
  const setSearchQuery = useSessionStore(s => s.setSearchQuery);
  const clearCurrentSession = useSessionStore(s => s.clearCurrentSession);
  const setPagination = useSessionStore(s => s.setPagination);

  // Only subscribe to detail-related state when detail drawer is open
  const messages = useSessionStore(s => s.messages);
  const isLoadingMessages = useSessionStore(s => s.isLoadingMessages);
  const checkpoints = useSessionStore(s => s.checkpoints);
  const isLoadingCheckpoints = useSessionStore(s => s.isLoadingCheckpoints);
  const fetchCheckpoints = useSessionStore(s => s.fetchCheckpoints);
  const createCheckpoint = useSessionStore(s => s.createCheckpoint);
  const restoreCheckpoint = useSessionStore(s => s.restoreCheckpoint);
  const deleteCheckpoint = useSessionStore(s => s.deleteCheckpoint);

  // Navigation
  const { openTab } = useNavigationStore();

  // Local UI state
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedSessionForExport, setSelectedSessionForExport] = useState<Session | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Session | null>(null);
  // Batch mode state - explicit toggle to allow entering batch mode without pre-selection
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // Checkpoint UI state
  const [restoreConfirm, setRestoreConfirm] = useState<{ checkpoint: Checkpoint; session: Session } | null>(null);
  const [deleteCheckpointConfirm, setDeleteCheckpointConfirm] = useState<{ checkpoint: Checkpoint; sessionId: string } | null>(null);
  const [createCheckpointModal, setCreateCheckpointModal] = useState<Session | null>(null);
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointDescription, setCheckpointDescription] = useState('');
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        useSessionStore.getState().searchSessions(value, platform ?? undefined, 30);
      } else {
        fetchSessions(platform ?? undefined, limit, offset);
      }
    }, 300);
  }, [setSearchQuery, platform, limit, offset, fetchSessions]);

  const toggleBatchMode = useCallback(() => {
    setIsBatchMode(prev => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map(id => deleteSession(id))
    );

    const failed = results.filter(r => r.status === 'rejected');
    const succeeded = results.filter(r => r.status === 'fulfilled');

    if (failed.length > 0) {
      toast.error(`Deleted ${succeeded.length}/${ids.length} sessions. ${failed.length} failed.`);
    } else {
      toast.success(`Successfully deleted ${succeeded.length} sessions`);
    }

    clearSelection();
    setBatchDeleteConfirm(false);
  };

  const handleBatchExport = async () => {
    const ids = Array.from(selectedIds);

    if (ids.length === 0) {
      toast.error(t('sessions.noSelection'));
      return;
    }

    toast.info(`Exporting ${ids.length} sessions...`);

    try {
      const zip = new JSZip();
      const sessionsFolder = zip.folder('sessions');

      if (!sessionsFolder) {
        throw new Error('Failed to create ZIP folder');
      }

      // Fetch all sessions and add to ZIP
      const results = await Promise.allSettled(
        ids.map(async (id, index) => {
          const blob = await sessionApi.exportSessions({ format: 'json', session_id: id });
          const text = typeof blob === 'string' ? blob : JSON.stringify(blob);
          return { id, text, index };
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string; text: string; index: number }>[];
      const failed = results.filter(r => r.status === 'rejected');

      // Add each successful session to the ZIP
      for (const result of succeeded) {
        const { id, text } = result.value;
        sessionsFolder.file(`session-${id}.json`, text);
      }

      // Add a summary file
      const summary = {
        exportDate: new Date().toISOString(),
        totalSessions: ids.length,
        succeeded: succeeded.length,
        failed: failed.length,
        sessions: succeeded.map(r => r.value.id),
      };
      zip.file('export-summary.json', JSON.stringify(summary, null, 2));

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Download ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sessions-export-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      if (failed.length > 0) {
        toast.warning(`Exported ${succeeded.length}/${ids.length} sessions. ${failed.length} failed.`);
      } else {
        toast.success(`Successfully exported ${succeeded.length} sessions as ZIP`);
      }
    } catch (err) {
      logger.error('[Sessions] Batch export failed:', err);
      toast.error(t('sessions.exportFailed'));
    }

    clearSelection();
  };

  // Calculate page from offset
  const currentPage = Math.floor(offset / limit);
  const totalPages = Math.ceil(total / limit);

  // Single source of truth for fetching sessions
  // Only depends on: platform, offset, limit, refreshKey
  useEffect(() => {
    logger.component('Sessions', 'Fetching sessions...', { platform, offset, limit, refreshKey });
    fetchSessions(platform ?? undefined, limit, offset);
  }, [platform, offset, limit, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear session detail on mount
  useEffect(() => {
    clearCurrentSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to detail view when session is selected
  useEffect(() => {
    if (currentSession) {
      setTimeout(() => {
        const detailView = document.querySelector('.session-detail-view');
        if (detailView) {
          detailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [currentSession]);

  // Fetch checkpoints when session detail is opened
  useEffect(() => {
    if (currentSession) {
      fetchCheckpoints(currentSession.id);
    }
  }, [currentSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const handleSessionClick = useCallback((session: Session) => {
    openTab(session.id, session.chat_name || t('sessions.untitled').replace('{id}', session.id.slice(0, 8)), 'session');
  }, [openTab, t]);

  const handleShowDetail = useCallback(async (session: Session) => {
    try {
      await fetchSession(session.id);
    } catch (err) {
      logger.error('[Sessions] Error fetching session:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('not found') || errorMsg.includes('Session not found')) {
        toast.error(t('sessions.sessionNotFound').replace('{id}', session.id.slice(0, 12)));
        useSessionStore.getState().refreshSessions();
      } else {
        toast.error(t('sessions.loadFailed') || 'Failed to load session details');
      }
    }
  }, [fetchSession, t]);

  const handleDeleteSession = useCallback((session: Session) => {
    setDeleteConfirm(session);
  }, []);

  const handleEditSession = useCallback((session: Session) => {
    setEditingSession(session);
    setEditName(session.chat_name || '');
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (deleteConfirm) {
      await deleteSession(deleteConfirm.id);
      if (currentSession?.id === deleteConfirm.id) {
        clearCurrentSession();
      }
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, deleteSession, currentSession, clearCurrentSession]);

  const handleSaveEdit = useCallback(async () => {
    if (editingSession && editName.trim()) {
      await updateSessionTitle(editingSession.id, editName.trim());
      setEditingSession(null);
      setEditName('');
    }
  }, [editingSession, editName, updateSessionTitle]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      useSessionStore.getState().searchSessions(searchQuery, platform ?? undefined, 30);
    } else {
      fetchSessions(platform ?? undefined, limit, offset);
    }
  }, [searchQuery, platform, limit, offset, fetchSessions]);

  const handleExport = async (format: 'jsonl' | 'json' | 'markdown') => {
    if (!selectedSessionForExport) return;

    try {
      const exportData = await sessionApi.exportSessions({ format: format as 'jsonl' | 'json' | 'markdown', session_id: selectedSessionForExport.id });
      const blob = new Blob([typeof exportData === 'string' ? exportData : JSON.stringify(exportData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${selectedSessionForExport.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Session exported successfully');
    } catch (err) {
      logger.error('[Sessions] Export failed:', err);
      toast.error('Failed to export session');
    }

    setShowExportModal(false);
    setSelectedSessionForExport(null);
  };

  const handlePageChange = useCallback((newPage: number) => {
    const newOffset = newPage * limit;
    setPagination(limit, newOffset);
  }, [limit, setPagination]);

  // Checkpoint handlers
  const handleCreateCheckpoint = async () => {
    if (!createCheckpointModal) return;
    setIsCreatingCheckpoint(true);
    try {
      await createCheckpoint(
        createCheckpointModal.id,
        checkpointName || undefined,
        checkpointDescription || undefined
      );
      toast.success(t('checkpoint.createSuccess'));
      setCreateCheckpointModal(null);
      setCheckpointName('');
      setCheckpointDescription('');
      // Refresh checkpoints
      await fetchCheckpoints(createCheckpointModal.id);
    } catch (err) {
      toast.error(t('checkpoint.createFailed'));
    } finally {
      setIsCreatingCheckpoint(false);
    }
  };

  const handleRestoreCheckpoint = async () => {
    if (!restoreConfirm) return;
    try {
      await restoreCheckpoint(restoreConfirm.session.id, restoreConfirm.checkpoint.id);
      toast.success(t('checkpoint.restoreSuccess'));
      setRestoreConfirm(null);
      // Refresh messages if viewing this session
      if (currentSession?.id === restoreConfirm.session.id) {
        await fetchSession(restoreConfirm.session.id);
      }
    } catch (err) {
      toast.error(t('checkpoint.restoreFailed'));
    }
  };

  const handleDeleteCheckpoint = async () => {
    if (!deleteCheckpointConfirm) return;
    try {
      await deleteCheckpoint(deleteCheckpointConfirm.checkpoint.id, deleteCheckpointConfirm.sessionId);
      toast.success(t('checkpoint.deleteSuccess'));
      setDeleteCheckpointConfirm(null);
    } catch (err) {
      toast.error(t('checkpoint.deleteFailed'));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="sessions-page">
      {/* Header */}
      <div className="sessions-header">
        <h1 className="sessions-title">{t('sessions.title')}</h1>
        <div className="sessions-actions">
          <Button
            variant={isBatchMode ? 'primary' : 'secondary'}
            onClick={toggleBatchMode}
          >
            {isBatchMode ? t('sessions.exitBatchMode') || 'Exit Selection' : t('sessions.batchSelect') || 'Select'}
          </Button>
          <Button
            variant="secondary"
            icon={<ExportIcon size={16} />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              setSelectedSessionForExport(null);
              setShowExportModal(true);
            }}
          >
            {t('sessions.batchExport')}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <form className="filters-section" onSubmit={handleSearch}>
          <div className="filter-group">
            <label className="filter-label">{t('sessions.platform')}:</label>
            <select
              className="filter-select"
              value={platform ?? ''}
              onChange={(e) => setPlatform(e.target.value || null)}
            >
              <option value="">{t('sessions.all')}</option>
              <option value="cli">CLI</option>
              <option value="cron">Cron</option>
              <option value="weixin">WeChat</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
            </select>
          </div>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder={t('sessions.search')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" icon={<SearchIcon size={16} />}>{t('common.search')}</Button>
        </form>
      </Card>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="batch-bar">
          <span className="batch-count">{t('sessions.selectedCount').replace('{count}', String(selectedIds.size))}</span>
          <Button variant="error" size="sm" onClick={() => setBatchDeleteConfirm(true)}>
            {t('sessions.deleteSelected')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleBatchExport}>
            {t('sessions.export')}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            {t('sessions.clearSelection')}
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">
          <AlertIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Sessions List */}
      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      ) : sessions.length > 0 ? (
        <div className="sessions-list">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isSelected={selectedIds.has(session.id)}
              isBatchMode={isBatchMode}
              onClick={() => handleSessionClick(session)}
              onDetail={() => handleShowDetail(session)}
              onDelete={() => handleDeleteSession(session)}
              onEdit={() => handleEditSession(session)}
              onExport={() => {
                setSelectedSessionForExport(session);
                setShowExportModal(true);
              }}
              onToggleSelect={() => toggleSelect(session.id)}
              t={t}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div className="empty-state">
            <div className="empty-icon"><ChatIcon size={32} /></div>
            <h3 className="empty-title">{t('sessions.noSessions')}</h3>
            <p className="empty-description">{t('common.noData')}</p>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={currentPage === 0}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            ← {t('sessions.prevPage')}
          </button>
          <span className="pagination-info">
            {t('sessions.page')} {currentPage + 1} / {totalPages} · {t('sessions.total')} {total} {t('sessions.items')}
          </span>
          <button
            className="pagination-btn"
            disabled={currentPage >= totalPages - 1}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            {t('sessions.nextPage')} →
          </button>
        </div>
      )}

      {/* Session Detail View - Modal/Drawer Style */}
      {currentSession && (
        <div className="session-detail-overlay" onClick={clearCurrentSession}>
          <div className="session-detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>{t('sessions.detail')}</h2>
              <button className="drawer-close" onClick={clearCurrentSession}><XIcon size={14} /></button>
            </div>
            <div className="drawer-content">
              {/* Messages Panel */}
              <div className="messages-panel-wrapper">
                <h3><ChatIcon size={16} /> {t('sessions.chatHistory')} ({messages.length} {t('sessions.messages')})</h3>
                <div className="messages-panel">
                  {isLoadingMessages ? (
                    <div className="loading-container">
                      <div className="loading-spinner" />
                    </div>
                  ) : messages.length > 0 ? (
                    messages.map((message: SessionMessage) => (
                      <MessageItem key={`${message.timestamp}-${message.role}`} message={message} t={t} />
                    ))
                  ) : (
                    <div className="empty-state">
                      <span style={{ color: 'var(--text-tertiary)' }}>{t('common.noData')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Detail Panel */}
              <div className="detail-panel-wrapper">
                <h3><SettingsIcon size={16} /> {t('sessions.sessionInfo')}</h3>
                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.sessionId')}</span>
                    <span className="detail-value">{currentSession.id}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.platform')}</span>
                    <span className="detail-value">
                      {getPlatformIcon(currentSession.platform)} {getPlatformName(currentSession.platform)}
                    </span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.model')}</span>
                    <span className="detail-value model-badge">{currentSession.model}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.messageCount')}</span>
                    <span className="detail-value">{currentSession.message_count} {t('sessions.countUnit')}</span>
                  </div>
                </div>

                {/* Token Usage Section */}
                <div className="detail-section">
                  <h4 className="detail-section-title">{t('sessions.tokenUsage')}</h4>
                  <div className="token-stats-grid">
                    <div className="token-stat-item">
                      <span className="token-stat-label">{t('sessions.inputTokens')}</span>
                      <span className="token-stat-value">{formatNumber(currentSession.input_tokens)}</span>
                    </div>
                    <div className="token-stat-item">
                      <span className="token-stat-label">{t('sessions.outputTokens')}</span>
                      <span className="token-stat-value">{formatNumber(currentSession.output_tokens)}</span>
                    </div>
                    {currentSession.cache_read_tokens !== undefined && currentSession.cache_read_tokens > 0 && (
                      <div className="token-stat-item token-stat-cache">
                        <span className="token-stat-label">{t('sessions.cacheTokens')}</span>
                        <span className="token-stat-value">{formatNumber(currentSession.cache_read_tokens)}</span>
                      </div>
                    )}
                    {currentSession.reasoning_tokens !== undefined && currentSession.reasoning_tokens > 0 && (
                      <div className="token-stat-item token-stat-reasoning">
                        <span className="token-stat-label">{t('sessions.reasoningTokens')}</span>
                        <span className="token-stat-value">{formatNumber(currentSession.reasoning_tokens)}</span>
                      </div>
                    )}
                    <div className="token-stat-item token-stat-total">
                      <span className="token-stat-label">{t('sessions.totalTokens')}</span>
                      <span className="token-stat-value">
                        {formatNumber(currentSession.input_tokens + currentSession.output_tokens + (currentSession.cache_read_tokens || 0) + (currentSession.reasoning_tokens || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cost Section */}
                <div className="detail-section">
                  <h4 className="detail-section-title">{t('sessions.costInfo')}</h4>
                  <div className="cost-info">
                    <div className="cost-item cost-estimated">
                      <span className="cost-label">{t('sessions.estimatedCost')}</span>
                      <span className="cost-value">{formatCurrency(currentSession.estimated_cost_usd)}</span>
                    </div>
                    {currentSession.actual_cost_usd !== undefined && currentSession.actual_cost_usd !== null && (
                      <div className="cost-item cost-actual">
                        <span className="cost-label">{t('sessions.actualCost')}</span>
                        <span className="cost-value">{formatCurrency(currentSession.actual_cost_usd)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkpoints Section */}
                <div className="detail-section">
                  <div className="checkpoint-header">
                    <h4 className="detail-section-title">{t('checkpoint.title')}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateCheckpointModal(currentSession)}
                    >
                      {t('checkpoint.create')}
                    </Button>
                  </div>
                  <div className="checkpoint-list">
                    {isLoadingCheckpoints ? (
                      <div className="checkpoint-loading">{t('checkpoint.loading')}</div>
                    ) : checkpoints.length > 0 ? (
                      checkpoints.slice(0, 5).map((cp) => (
                        <div key={cp.id} className="checkpoint-item">
                          <div className="checkpoint-info">
                            <span className="checkpoint-name">{cp.name || t('checkpoint.latest')}</span>
                            <div className="checkpoint-meta">
                              <span>{formatDateTime(cp.created_at)}</span>
                              <span>{cp.message_count} {t('checkpoint.messageCount')}</span>
                              <span>{formatBytes(cp.size_bytes)}</span>
                            </div>
                          </div>
                          <div className="checkpoint-actions">
                            <button
                              className="action-btn"
                              title={t('checkpoint.restore')}
                              onClick={() => setRestoreConfirm({ checkpoint: cp, session: currentSession })}
                            >
                              <SettingsIcon size={14} />
                            </button>
                            <button
                              className="action-btn action-btn-delete"
                              title={t('checkpoint.delete')}
                              onClick={() => setDeleteCheckpointConfirm({ checkpoint: cp, sessionId: currentSession.id })}
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="checkpoint-empty">{t('checkpoint.noCheckpoints')}</div>
                    )}
                  </div>
                </div>

                <div className="drawer-actions">
                  <Button
                    variant="primary"
                    icon={<ChatIcon size={16} />}
                    onClick={() => {
                      openTab(currentSession.id, currentSession.chat_name || t('sessions.untitled').replace('{id}', currentSession.id.slice(0, 8)), 'session');
                    }}
                  >
                    {t('sessions.continue')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<ExportIcon size={16} />}
                    onClick={() => {
                      setSelectedSessionForExport(currentSession);
                      setShowExportModal(true);
                    }}
                  >
                    {t('sessions.export')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          session={selectedSessionForExport}
          onClose={() => {
            setShowExportModal(false);
            setSelectedSessionForExport(null);
          }}
          onExport={handleExport}
          t={t}
        />
      )}

      {/* Edit Session Name Modal */}
      {editingSession && (
        <div className="edit-modal-overlay" onClick={() => setEditingSession(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="edit-modal-title">{t('sessions.editModal.title')}</h3>
            <input
              type="text"
              className="edit-modal-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('sessions.editModal.placeholder')}
              autoFocus
            />
            <div className="edit-modal-actions">
              <Button variant="ghost" onClick={() => setEditingSession(null)}>{t('sessions.editModal.cancel')}</Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={!editName.trim()}>{t('sessions.editModal.save')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title={t('sessions.delete')}
        message={t('sessions.deleteConfirm')}
        confirmText={t('sessions.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Batch Delete Confirmation */}
      <ConfirmModal
        isOpen={batchDeleteConfirm}
        title={t('sessions.batchDeleteConfirm.title')}
        message={t('sessions.batchDeleteConfirm.message').replace('{count}', String(selectedIds.size))}
        confirmText={t('sessions.batchDeleteConfirm.confirm')}
        cancelText={t('sessions.batchDeleteConfirm.cancel')}
        variant="danger"
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteConfirm(false)}
      />

      {/* Create Checkpoint Modal */}
      {createCheckpointModal && (
        <div className="edit-modal-overlay" onClick={() => setCreateCheckpointModal(null)}>
          <div className="edit-modal checkpoint-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="edit-modal-title">{t('checkpoint.create')}</h3>
            <div className="checkpoint-form">
              <div className="form-group">
                <label>{t('checkpoint.namePlaceholder')}</label>
                <input
                  type="text"
                  className="edit-modal-input"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  placeholder={t('checkpoint.namePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label>{t('checkpoint.descriptionPlaceholder')}</label>
                <textarea
                  className="edit-modal-textarea"
                  value={checkpointDescription}
                  onChange={(e) => setCheckpointDescription(e.target.value)}
                  placeholder={t('checkpoint.descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
            <div className="edit-modal-actions">
              <Button variant="ghost" onClick={() => setCreateCheckpointModal(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleCreateCheckpoint} disabled={isCreatingCheckpoint}>
                {isCreatingCheckpoint ? t('checkpoint.creating') : t('checkpoint.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Checkpoint Confirmation */}
      <ConfirmModal
        isOpen={restoreConfirm !== null}
        title={t('checkpoint.restore')}
        message={t('checkpoint.confirmRestore')}
        confirmText={t('checkpoint.restore')}
        cancelText={t('common.cancel')}
        variant="warning"
        onConfirm={handleRestoreCheckpoint}
        onCancel={() => setRestoreConfirm(null)}
      />

      {/* Delete Checkpoint Confirmation */}
      <ConfirmModal
        isOpen={deleteCheckpointConfirm !== null}
        title={t('checkpoint.delete')}
        message={t('checkpoint.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={handleDeleteCheckpoint}
        onCancel={() => setDeleteCheckpointConfirm(null)}
      />
    </div>
  );
};
