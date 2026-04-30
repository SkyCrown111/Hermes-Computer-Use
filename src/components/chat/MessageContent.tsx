import React, { memo, useState, useMemo, useCallback } from 'react';
import { ToolErrorCard } from './ToolErrorCard';
import { SessionSearchCard } from './SessionSearchCard';
import { parseToolJson } from './parseToolJson';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { UserIcon, BotIcon } from '../ui/Icons';
import { useNavigationStore } from '../../stores/navigationStore';
import { SimpleDiffViewer } from './SimpleDiffViewer';
import { TOOL_ICONS } from './constants';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import type { SessionSearchResult } from './constants';

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

// ---- Inline Tool Card Component ----

interface InlineToolCardProps {
  tool: ToolCallInfo;
  isStreaming?: boolean;
}

const InlineToolCard: React.FC<InlineToolCardProps> = ({ tool, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = !tool.duration && !tool.is_error && isStreaming;
  const icon = TOOL_ICONS[tool.name] || 'build';

  const args = tool.args as Record<string, unknown> | undefined;
  const filePath = (args?.file_path || args?.path) as string | undefined;
  const oldString = args?.old_string as string | undefined;
  const newString = args?.new_string as string | undefined;
  const content = args?.content as string | undefined;

  const canShowDiff =
    (tool.name === 'edit_file' ||
      tool.name === 'write_file' ||
      tool.name === 'Edit' ||
      tool.name === 'Write') &&
    (oldString !== undefined || newString !== undefined || content !== undefined);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`mc-tool-card ${tool.is_error ? 'mc-tool-error' : ''} ${isRunning ? 'mc-tool-running' : ''}`}>
      <div
        className="mc-tool-card-header"
        onClick={() => {
          if (canShowDiff || tool.preview) setExpanded((v) => !v);
        }}
        role={canShowDiff || tool.preview ? 'button' : undefined}
        tabIndex={canShowDiff || tool.preview ? 0 : undefined}
      >
        <span className="material-symbols-outlined mc-tool-icon">{icon}</span>
        <span className="mc-tool-name">{tool.name}</span>
        {filePath && (
          <span className="mc-tool-filepath" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        )}
        {!filePath && tool.preview && (
          <span className="mc-tool-preview-text">
            {tool.preview.length > 60 ? tool.preview.slice(0, 60) + '...' : tool.preview}
          </span>
        )}
        <span className="mc-tool-spacer" />
        {isRunning && (
          <span className="mc-tool-status mc-tool-status-running">
            <span className="mc-tool-spinner" />
            running
          </span>
        )}
        {!isRunning && !tool.is_error && (
          <span className="mc-tool-status mc-tool-status-done">
            <span className="material-symbols-outlined">check_circle</span>
            {tool.duration != null && formatDuration(tool.duration)}
          </span>
        )}
        {tool.is_error && (
          <span className="mc-tool-status mc-tool-status-error">
            <span className="material-symbols-outlined">error</span>
            error
          </span>
        )}
        {(canShowDiff || tool.preview) && (
          <span className="material-symbols-outlined mc-tool-expand">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        )}
      </div>
      {expanded && (
        <div className="mc-tool-card-body">
          {canShowDiff && tool.name === ('Edit' as string) ? (
            <SimpleDiffViewer oldStr={oldString || ''} newStr={newString || ''} filePath={filePath} />
          ) : canShowDiff && tool.name === ('edit_file' as string) ? (
            <SimpleDiffViewer oldStr={oldString || ''} newStr={newString || ''} filePath={filePath} />
          ) : canShowDiff && (tool.name === 'Write' || tool.name === 'write_file') ? (
            <SimpleDiffViewer oldStr="" newStr={content || ''} filePath={filePath} />
          ) : tool.preview ? (
            <div className="mc-tool-preview-content">
              <MarkdownRenderer content={tool.preview} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// ---- Thinking Block Component ----

interface ThinkingBlockProps {
  content: string;
  thinkingTime?: number;
  isStreaming?: boolean;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, thinkingTime, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  const preview = content.length > 120 ? content.slice(0, 120) + '...' : content;
  const hasContent = content.length > 0;

  return (
    <div className={`mc-thinking-block ${isStreaming && hasContent ? 'mc-thinking-active' : ''}`}>
      <button className="mc-thinking-header" onClick={() => setExpanded((v) => !v)}>
        <span className="mc-thinking-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="mc-thinking-label">
          Thinking
          {isStreaming && hasContent && <span className="mc-thinking-dots" />}
        </span>
        {!expanded && hasContent && (
          <span className="mc-thinking-preview">{preview}</span>
        )}
        {thinkingTime != null && thinkingTime > 0 && (
          <span className="mc-thinking-time">
            {(thinkingTime / 1000).toFixed(1)}s
          </span>
        )}
      </button>
      {expanded && (
        <div className="mc-thinking-content">
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
};

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
  const [isHovered, setIsHovered] = useState(false);
  const msg = message;
  const role = msg.role;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  const { cleanContent, errors, sessionSearchResults } = useMemo(
    () => parseToolJson(msg.content),
    [msg.content],
  );

  const hasTokens =
    msg.inputTokens !== undefined || msg.outputTokens !== undefined;

  const handleCopy = useCallback(
    () => onCopyMessage(msg.content),
    [onCopyMessage, msg.content],
  );

  const handleDelete = useCallback(
    () => onDeleteMessage(msg.id),
    [onDeleteMessage, msg.id],
  );

  const handleStartEdit = useCallback(
    () => onStartEdit(msg.id, msg.content),
    [onStartEdit, msg.id, msg.content],
  );

  // ---- User Message ----
  if (isUser) {
    return (
      <div
        id={`chat-msg-${msg.id}`}
        className={`mc-message mc-message-user ${!isFirstInGroup ? 'mc-message-grouped' : ''}`}
        style={style}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isFirstInGroup && (
          <div className="mc-role-label mc-role-label-user">
            <UserIcon size={14} />
            <span>You</span>
          </div>
        )}
        <div className="mc-message-bubble-user">
          {editMessageId === msg.id ? (
            <div className="mc-edit-mode">
              <textarea
                className="mc-edit-textarea"
                value={editMessageContent}
                onChange={(e) => onEditContentChange(e.target.value)}
                rows={3}
              />
              <div className="mc-edit-actions">
                <button className="mc-edit-save" onClick={() => onSaveEdit(msg.id)}>
                  <span className="material-symbols-outlined">check</span>
                  {t('common.confirm')}
                </button>
                <button className="mc-edit-cancel" onClick={onCancelEdit}>
                  <span className="material-symbols-outlined">close</span>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mc-message-text mc-message-text-user">
              {cleanContent || msg.content}
            </div>
          )}
          {isHovered && editMessageId !== msg.id && (
            <div className="mc-hover-actions mc-hover-actions-user">
              <button
                className="mc-action-btn"
                onClick={handleStartEdit}
                title={t('message.edit')}
              >
                <span className="material-symbols-outlined">edit</span>
              </button>
              <button
                className="mc-action-btn"
                onClick={handleCopy}
                title={t('message.copy')}
              >
                <span className="material-symbols-outlined">content_copy</span>
              </button>
              <button
                className="mc-action-btn mc-action-delete"
                onClick={handleDelete}
                title={t('message.delete')}
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Assistant Message ----
  return (
    <div
      id={`chat-msg-${msg.id}`}
      className={`mc-message mc-message-assistant ${!isFirstInGroup ? 'mc-message-grouped' : ''}`}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isFirstInGroup && (
        <div className="mc-role-label mc-role-label-assistant">
          <BotIcon size={14} />
          <span>Assistant</span>
        </div>
      )}

      {/* Thinking block - rendered above tools and text */}
      {(msg.reasoning || msg.thinking) && (
        <ThinkingBlock
          content={msg.reasoning || msg.thinking || ''}
          thinkingTime={msg.thinkingTime}
          isStreaming={!!msg.thinking && !msg.content}
        />
      )}

      {/* Tool cards - each tool rendered as individual collapsible card */}
      {msg.tools && msg.tools.length > 0 && (
        <div className="mc-tools-container">
          {msg.tools.map((tool, idx) => (
            <InlineToolCard key={idx} tool={tool} isStreaming={false} />
          ))}
        </div>
      )}

      {/* Tool errors */}
      {errors.length > 0 && (
        <div className="mc-tool-errors">
          {errors.map((err, i) => (
            <ToolErrorCard key={i} error={err.error} />
          ))}
        </div>
      )}

      {/* Message text content */}
      {editMessageId === msg.id ? (
        <div className="mc-edit-mode">
          <textarea
            className="mc-edit-textarea"
            value={editMessageContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            rows={3}
          />
          <div className="mc-edit-actions">
            <button className="mc-edit-save" onClick={() => onSaveEdit(msg.id)}>
              <span className="material-symbols-outlined">check</span>
              {t('common.confirm')}
            </button>
            <button className="mc-edit-cancel" onClick={onCancelEdit}>
              <span className="material-symbols-outlined">close</span>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : cleanContent ? (
        <div className="mc-message-text mc-message-text-assistant">
          <MarkdownRenderer content={cleanContent} searchQuery={messageSearchQuery} />
        </div>
      ) : null}

      {/* Session search results */}
      {sessionSearchResults && sessionSearchResults.results.length > 0 && (() => {
        const msgSelectedIds = selectedSearchResults[msg.id] || [];
        const allSelected = sessionSearchResults.results.every((r) =>
          msgSelectedIds.includes(r.session_id),
        );
        const selectedCount = msgSelectedIds.length;
        return (
          <div className="mc-session-search-results">
            <div className="mc-session-search-toolbar">
              <label className="mc-session-search-select-all">
                <input
                  type="checkbox"
                  checked={allSelected && selectedCount > 0}
                  onChange={() =>
                    onToggleSelectAll(
                      msg.id,
                      sessionSearchResults.results.map((r) => r.session_id),
                    )
                  }
                />
                <span>{sessionSearchResults.results.length} 个会话</span>
              </label>
              <div className="mc-session-search-toolbar-actions">
                <button
                  className="mc-session-search-toolbar-btn"
                  disabled={selectedCount === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBatchDelete(msg.id);
                  }}
                >
                  <span className="material-symbols-outlined">delete</span>
                  删除{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
                <button
                  className="mc-session-search-toolbar-btn"
                  disabled={selectedCount === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBatchExport(msg.id, sessionSearchResults.results);
                  }}
                >
                  <span className="material-symbols-outlined">file_download</span>
                  导出{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
              </div>
            </div>
            <div className="mc-session-search-list">
              {sessionSearchResults.results.map((result, i) => (
                <SessionSearchCard
                  key={i}
                  result={result}
                  selected={msgSelectedIds.includes(result.session_id)}
                  onToggle={() => onToggleSearchResult(msg.id, result.session_id)}
                  onClick={() => {
                    const { openTab } = useNavigationStore.getState();
                    openTab(
                      result.session_id,
                      result.title || `会话 ${result.session_id.slice(0, 8)}`,
                      'session',
                    );
                  }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Token usage footer */}
      {isAssistant && hasTokens && (
        <div className="mc-token-usage">
          {msg.inputTokens !== undefined && (
            <span className="mc-token-item">
              <span className="mc-token-icon">↑</span>
              {msg.inputTokens.toLocaleString()}
            </span>
          )}
          {msg.outputTokens !== undefined && (
            <span className="mc-token-item">
              <span className="mc-token-icon">↓</span>
              {msg.outputTokens.toLocaleString()}
            </span>
          )}
          {msg.totalTokens !== undefined && (
            <span className="mc-token-item mc-token-total">
              <span className="mc-token-icon">Σ</span>
              {msg.totalTokens.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Hover action buttons */}
      {isHovered && editMessageId !== msg.id && (
        <div className="mc-hover-actions mc-hover-actions-assistant">
          <button
            className="mc-action-btn"
            onClick={handleCopy}
            title={t('message.copy')}
          >
            <span className="material-symbols-outlined">content_copy</span>
          </button>
          <button
            className="mc-action-btn"
            onClick={onRegenerate}
            title={t('message.regenerate')}
          >
            <span className="material-symbols-outlined">replay</span>
          </button>
          <button
            className="mc-action-btn mc-action-delete"
            onClick={handleDelete}
            title={t('message.delete')}
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders
export const MessageContent = memo(MessageContentComponent);
