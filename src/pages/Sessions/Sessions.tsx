import React, { useEffect, useState } from 'react';
import { Card, Button, ChatIcon, UserIcon, BotIcon, ToolIcon, ExportIcon, SearchIcon, ClockIcon, TrashIcon, SettingsIcon, AlertIcon, EditIcon, ConfirmModal } from '../../components';
import { useSessionStore, useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import type { Session, SessionMessage } from '../../types';
import { sessionApi } from '../../services';
import { formatNumber, formatCurrency, formatDateTime, formatRelativeTime, getPlatformIcon, getPlatformName } from '../../utils/format';
import { logger } from '../../lib/logger';
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
  onToggleSelect: () => void;
  t: (key: string) => string;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, isSelected, isBatchMode, onClick, onDetail, onDelete, onEdit, onToggleSelect, t }) => {
  return (
    <div className={`session-card ${isSelected ? 'session-card-selected' : ''}`} onClick={isBatchMode ? onToggleSelect : onClick}>
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
          <span className="session-name">{session.chat_name || `会话 ${session.id.slice(0, 12)}`}</span>
          <span className="session-model">{session.model.split('/').pop()}</span>
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
        <button className="action-btn" title={t('sessions.export')} onClick={(e) => { e.stopPropagation(); }}>
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
};

// Message Item Component
interface MessageItemProps {
  message: SessionMessage;
  t: (key: string) => string;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, t }) => {
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
      <div className="message-avatar">{getRoleIcon(message.role)}</div>
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
};

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
              <span>{format === 'markdown' ? '📝' : '📄'}</span>
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
  logger.component('Sessions', 'Component rendering...');

  const { t } = useTranslation();

  // Get store state and actions
  const {
    sessions,
    currentSession,
    messages,
    total,
    isLoading,
    isLoadingMessages,
    error,
    platform,
    searchQuery,
    limit,
    offset,
    refreshKey,
    fetchSessions,
    fetchSession,
    deleteSession,
    updateSessionTitle,
    setPlatform,
    setSearchQuery,
    clearCurrentSession,
    setPagination,
  } = useSessionStore();

  // Navigation
  const { openTab } = useNavigationStore();

  // Local UI state
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedSessionForExport, setSelectedSessionForExport] = useState<Session | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Session | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await deleteSession(id);
    }
    clearSelection();
    setBatchDeleteConfirm(false);
  };

  const handleBatchExport = async () => {
    for (const id of selectedIds) {
      const session = sessions.find(s => s.id === id);
      if (session) {
        try {
          const blob = await sessionApi.export('json', id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `session-${id}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Export failed for', id, err);
        }
      }
    }
    clearSelection();
  };

  // Calculate page from offset
  const currentPage = Math.floor(offset / limit);
  const totalPages = Math.ceil(total / limit);

  // Single source of truth for fetching sessions
  // Only depends on: platform, offset, refreshKey
  useEffect(() => {
    logger.component('Sessions', 'Fetching sessions...', { platform, offset, refreshKey });
    fetchSessions(platform ?? undefined, limit, offset);
  }, [platform, offset, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Handlers
  const handleSessionClick = (session: Session) => {
    logger.component('Sessions', 'Opening session as tab:', session.id);
    openTab(session.id, session.chat_name || `会话 ${session.id.slice(0, 8)}`, 'session');
  };

  const handleShowDetail = async (session: Session) => {
    logger.component('Sessions', 'Showing detail for session:', session.id);
    try {
      await fetchSession(session.id);
    } catch (err) {
      logger.error('[Sessions] Error fetching session:', err);
    }
  };

  const handleDeleteSession = (session: Session) => {
    setDeleteConfirm(session);
  };

  const confirmDeleteSession = async () => {
    if (deleteConfirm) {
      await deleteSession(deleteConfirm.id);
      if (currentSession?.id === deleteConfirm.id) {
        clearCurrentSession();
      }
      setDeleteConfirm(null);
    }
  };

  const handleEditSession = (session: Session) => {
    setEditingSession(session);
    setEditName(session.chat_name || '');
  };

  const handleSaveEdit = async () => {
    if (editingSession && editName.trim()) {
      await updateSessionTitle(editingSession.id, editName.trim());
      setEditingSession(null);
      setEditName('');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      useSessionStore.getState().searchSessions(searchQuery, platform ?? undefined, 30);
    } else {
      fetchSessions(platform ?? undefined, limit, offset);
    }
  };

  const handleExport = async (format: 'jsonl' | 'json' | 'markdown') => {
    if (!selectedSessionForExport) return;

    try {
      const blob = await sessionApi.export(format, selectedSessionForExport.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${selectedSessionForExport.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }

    setShowExportModal(false);
    setSelectedSessionForExport(null);
  };

  const handlePageChange = (newPage: number) => {
    const newOffset = newPage * limit;
    setPagination(limit, newOffset);
  };

  return (
    <div className="sessions-page">
      {/* Header */}
      <div className="sessions-header">
        <h1 className="sessions-title">{t('sessions.title')}</h1>
        <div className="sessions-actions">
          <Button variant="secondary" icon="📤" onClick={() => {
            setSelectedSessionForExport(null);
            setShowExportModal(true);
          }}>
            {t('sessions.batchExport')}
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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" icon={<SearchIcon size={16} />}>{t('common.search')}</Button>
        </form>
      </Card>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="batch-bar">
          <span className="batch-count">{selectedIds.size} selected</span>
          <Button variant="error" size="sm" onClick={() => setBatchDeleteConfirm(true)}>
            Delete Selected
          </Button>
          <Button variant="secondary" size="sm" onClick={handleBatchExport}>
            Export Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear Selection
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
              isBatchMode={selectedIds.size > 0}
              onClick={() => handleSessionClick(session)}
              onDetail={() => handleShowDetail(session)}
              onDelete={() => handleDeleteSession(session)}
              onEdit={() => handleEditSession(session)}
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
              <button className="drawer-close" onClick={clearCurrentSession}>✕</button>
            </div>
            <div className="drawer-content">
              {/* Messages Panel */}
              <div className="messages-panel-wrapper">
                <h3>💬 {t('sessions.chatHistory')} ({messages.length} {t('sessions.messages')})</h3>
                <div className="messages-panel">
                  {isLoadingMessages ? (
                    <div className="loading-container">
                      <div className="loading-spinner" />
                    </div>
                  ) : messages.length > 0 ? (
                    messages.map((message: SessionMessage, index: number) => (
                      <MessageItem key={index} message={message} t={t} />
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
                <h3>📋 {t('sessions.sessionInfo')}</h3>
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
                    <span className="detail-value">{currentSession.model}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.messageCount')}</span>
                    <span className="detail-value">{currentSession.message_count} {t('sessions.messages').replace('消息', '').replace('messages', '')}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.tokenUsage')}</span>
                    <span className="detail-value">
                      {t('sessions.tokenUsage').includes('Token') ? 'Input' : '输入'}: {formatNumber(currentSession.input_tokens)} /
                      {t('sessions.tokenUsage').includes('Token') ? ' Output' : ' 输出'}: {formatNumber(currentSession.output_tokens)}
                    </span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-label">{t('sessions.estimatedCost')}</span>
                    <span className="detail-value">{formatCurrency(currentSession.estimated_cost_usd)}</span>
                  </div>
                </div>
                <div className="drawer-actions">
                  <Button
                    variant="primary"
                    icon="💬"
                    onClick={() => {
                      openTab(currentSession.id, currentSession.chat_name || `会话 ${currentSession.id.slice(0, 8)}`, 'session');
                    }}
                  >
                    {t('sessions.continue')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon="📤"
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
        title="Delete Sessions"
        message={`Are you sure you want to delete ${selectedIds.size} sessions? This action cannot be undone.`}
        confirmText="Delete All"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteConfirm(false)}
      />
    </div>
  );
};
