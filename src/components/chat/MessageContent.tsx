import React, { memo, useMemo } from 'react';
import { ToolErrorCard } from './ToolErrorCard';
import { SessionSearchCard } from './SessionSearchCard';
import { ToolsBlock } from './ToolsBlock';
import { parseToolJson } from './parseToolJson';
import type { SessionSearchResult } from './constants';
import type { ChatMessage } from '../../stores/chatStore';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { UserIcon, BotIcon } from '../ui/Icons';
import { useNavigationStore } from '../../stores/navigationStore';

// ---- Types ----

export interface MessageContentProps {
  message: ChatMessage;
  isFirstInGroup: boolean;
  style?: React.CSSProperties;
  messageSearchQuery?: string;
  editMessageId: string | null;
  editMessageContent: string;
  selectedSearchResults: Record<string, string[]>;
  onToggleSearchResult: (msgId: string, sessionId: string) => void;
  onToggleSelectAll: (msgId: string, sessionIds: string[]) => void;
  onBatchDelete: (msgId: string) => void;
  onBatchExport: (msgId: string, sessions: SessionSearchResult[]) => void;
  onCopyMessage: (content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerate: () => void;
  onStartEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (messageId: string) => void;
  onEditContentChange: (content: string) => void;
  t: (key: string) => string;
}

// ---- Helpers ----

// ---- Component ----

const MessageContentComponent: React.FC<MessageContentProps> = ({
  message,
  isFirstInGroup,
  style,
  messageSearchQuery = '',
  editMessageId,
  editMessageContent,
  selectedSearchResults,
  onToggleSearchResult,
  onToggleSelectAll,
  onBatchDelete,
  onBatchExport,
  onCopyMessage,
  onDeleteMessage,
  onRegenerate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditContentChange,
  t,
}) => {
  const msg = message;
  const role = msg.role;

  const { cleanContent, errors, sessionSearchResults } = useMemo(
    () => parseToolJson(msg.content),
    [msg.content]
  );

  // Format metadata
  const hasTokens = msg.inputTokens !== undefined || msg.outputTokens !== undefined;

  return (
    <div
      id={`chat-msg-${msg.id}`}
      className={`chat-message ${role} ${!isFirstInGroup ? 'grouped' : ''}`}
      style={style}
    >
      {isFirstInGroup && (
        <div className="message-avatar">
          {role === 'user' ? <UserIcon size={16} /> : <BotIcon size={16} />}
        </div>
      )}
      <div className="message-content">
        {/* Tool calls - displayed above the message text */}
        {msg.tools && msg.tools.length > 0 && (
          <ToolsBlock tools={msg.tools} isStreaming={false} />
        )}

        {/* Message content */}
        {msg.content && (
          <>
            {cleanContent && (
              <div className="message-text">
                <MarkdownRenderer content={cleanContent} searchQuery={messageSearchQuery} />
              </div>
            )}

            {/* Tool errors */}
            {errors.map((err, i) => (
              <ToolErrorCard key={i} error={err.error} />
            ))}

            {/* Session search results */}
            {sessionSearchResults && sessionSearchResults.results.length > 0 && (() => {
              const msgSelectedIds = selectedSearchResults[msg.id] || [];
              const allSelected = sessionSearchResults.results.every(r => msgSelectedIds.includes(r.session_id));
              const selectedCount = msgSelectedIds.length;
              return (
                <div className="session-search-results">
                  <div className="session-search-toolbar">
                    <label className="session-search-select-all">
                      <input
                        type="checkbox"
                        checked={allSelected && selectedCount > 0}
                        onChange={() => onToggleSelectAll(msg.id, sessionSearchResults.results.map(r => r.session_id))}
                      />
                      <span>{sessionSearchResults.results.length} 个会话</span>
                    </label>
                    <div className="session-search-toolbar-actions">
                      <button
                        className="session-search-toolbar-btn"
                        disabled={selectedCount === 0}
                        onClick={(e) => { e.stopPropagation(); onBatchDelete(msg.id); }}
                      >
                        <span className="material-symbols-outlined session-search-btn-icon">delete</span>
                        删除{selectedCount > 0 ? ` (${selectedCount})` : ''}
                      </button>
                      <button
                        className="session-search-toolbar-btn"
                        disabled={selectedCount === 0}
                        onClick={(e) => { e.stopPropagation(); onBatchExport(msg.id, sessionSearchResults.results); }}
                      >
                        <span className="material-symbols-outlined session-search-btn-icon">file_download</span>
                        导出{selectedCount > 0 ? ` (${selectedCount})` : ''}
                      </button>
                    </div>
                  </div>
                  <div className="session-search-list">
                    {sessionSearchResults.results.map((result, i) => (
                      <SessionSearchCard
                        key={i}
                        result={result}
                        selected={msgSelectedIds.includes(result.session_id)}
                        onToggle={() => onToggleSearchResult(msg.id, result.session_id)}
                        onClick={() => {
                          const { openTab } = useNavigationStore.getState();
                          openTab(result.session_id, result.title || `会话 ${result.session_id.slice(0, 8)}`, 'session');
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Edit mode for user messages */}
        {editMessageId === msg.id && (
          <div className="message-edit-mode">
            <textarea
              className="message-edit-textarea"
              value={editMessageContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              rows={3}
            />
            <div className="message-edit-actions">
              <button className="message-edit-save" onClick={() => onSaveEdit(msg.id)}>
                <span className="material-symbols-outlined">check</span>
                {t('common.confirm')}
              </button>
              <button className="message-edit-cancel" onClick={onCancelEdit}>
                <span className="material-symbols-outlined">close</span>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Action buttons - hidden during editing */}
        {editMessageId !== msg.id && (
          <div className="message-actions">
            {msg.role === 'user' && (
              <button className="message-action-btn" onClick={() => onStartEdit(msg.id, msg.content)} title={t('message.edit')}>
                <span className="material-symbols-outlined">edit</span>
              </button>
            )}
            <button className="message-action-btn" onClick={() => onCopyMessage(msg.content)} title={t('message.copy')}>
              <span className="material-symbols-outlined">content_copy</span>
            </button>
            {msg.role === 'assistant' && (
              <button className="message-action-btn" onClick={onRegenerate} title={t('message.regenerate')}>
                <span className="material-symbols-outlined">replay</span>
              </button>
            )}
            <button className="message-action-btn delete" onClick={() => onDeleteMessage(msg.id)} title={t('message.delete')}>
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        )}

        {/* Message metadata footer - CLI style */}
        {role === 'assistant' && hasTokens && (
          <div className="message-meta">
            {hasTokens && (
              <span className="message-meta-tokens">
                {msg.inputTokens !== undefined && <span>↑{msg.inputTokens}</span>}
                {msg.outputTokens !== undefined && <span>↓{msg.outputTokens}</span>}
                {msg.totalTokens !== undefined && <span>Σ{msg.totalTokens}</span>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Memoize to prevent re-renders
export const MessageContent = memo(MessageContentComponent);
