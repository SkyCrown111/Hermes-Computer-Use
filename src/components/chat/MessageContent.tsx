import React, { memo } from 'react';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolsBlock } from './ToolsBlock';
import { PermissionCard } from './PermissionCard';
import { ToolErrorCard } from './ToolErrorCard';
import { SessionSearchCard } from './SessionSearchCard';
import { parseToolJson } from './parseToolJson';
import type { SessionSearchResult } from './constants';
import type { ChatMessage } from '../../stores/chatStore';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { UserIcon, BotIcon, TokenIcon, ThinkingIcon } from '../ui/Icons';
import { useNavigationStore } from '../../stores/navigationStore';

// ---- Types ----

interface PermissionApproval {
  id: string;
  command: string;
  description: string;
  allow_permanent: boolean;
}

export interface MessageContentProps {
  message: ChatMessage;
  isFirstInGroup: boolean;
  isStreamingMsg?: boolean;
  style?: React.CSSProperties;
  messageSearchQuery?: string;
  pendingPermission?: PermissionApproval | null;
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
  onApprovalResponse: (choice: 'once' | 'session' | 'always' | 'deny') => void;
  t: (key: string) => string;
}

// ---- Component ----

const MessageContentComponent: React.FC<MessageContentProps> = ({
  message,
  isFirstInGroup,
  isStreamingMsg = false,
  style,
  messageSearchQuery = '',
  pendingPermission,
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
  onApprovalResponse,
  t,
}) => {
  const msg = message;
  const role = msg.role;
  const { cleanContent, errors, sessionSearchResults } = parseToolJson(msg.content);

  return (
    <div
      id={`chat-msg-${msg.id}`}
      className={`chat-message ${role} ${isStreamingMsg ? 'streaming' : ''} ${!isFirstInGroup ? 'grouped' : ''}`}
      style={style}
    >
      {isFirstInGroup && (
        <div className="message-avatar">
          {role === 'user' ? <UserIcon size={16} /> : <BotIcon size={16} />}
        </div>
      )}
      <div className="message-content">
        {/* Thinking indicator - only during streaming */}
        {role === 'assistant' && isStreamingMsg && msg.thinking && (
          <div className="thinking-indicator">
            <div className="thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="thinking-text"><ThinkingIcon size={14} /> {msg.thinking}</span>
            {msg.totalTokens && (
              <span className="thinking-tokens">
                <TokenIcon size={12} /> {msg.totalTokens.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Reasoning display - collapsible thinking block */}
        {role === 'assistant' && msg.reasoning && (
          <ThinkingBlock content={msg.reasoning} isActive={isStreamingMsg} />
        )}

        {/* Tool calls display - collapsible block */}
        {role === 'assistant' && msg.tools && msg.tools.length > 0 && (
          <ToolsBlock tools={msg.tools} isStreaming={isStreamingMsg} />
        )}

        {/* Pending approval - only during streaming */}
        {role === 'assistant' && isStreamingMsg && pendingPermission && (
          <PermissionCard
            approval={pendingPermission}
            onRespond={onApprovalResponse}
          />
        )}

        {/* Message content (parsed) */}
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

        {/* Action buttons - hidden during streaming or editing */}
        {!isStreamingMsg && editMessageId !== msg.id && (
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
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but props haven't changed
export const MessageContent = memo(MessageContentComponent);