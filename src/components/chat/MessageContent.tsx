import React, { memo, useState, useMemo, useCallback } from 'react';
import { ToolErrorCard } from './ToolErrorCard';
import { SessionSearchCard } from './SessionSearchCard';
import { parseToolJson } from './parseToolJson';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import {
  UserIcon,
  BotIcon,
  ToolIcon,
  TerminalIcon,
  SearchIcon,
  FileTextIcon,
  EditIcon,
  GlobeIcon,
  DownloadIcon,
  SparklesIcon,
  CheckIcon,
  AlertIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  TrashIcon,
  RefreshIcon,
  ThinkingIcon,
  ExportIcon,
} from '../ui/Icons';
import { SimpleDiffViewer } from './SimpleDiffViewer';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import type { SessionSearchResult } from './constants';

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
  onOpenSessionSearchResult?: (session: SessionSearchResult) => void;
  onCopyMessage: (content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerate: () => void;
  onStartEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (messageId: string) => void;
  onEditContentChange: (content: string) => void;
  t: (key: string) => string;
}

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'terminal':
      return <TerminalIcon size={16} />;
    case 'search_files':
    case 'glob':
    case 'grep':
      return <SearchIcon size={16} />;
    case 'read_file':
      return <FileTextIcon size={16} />;
    case 'write_file':
    case 'edit_file':
    case 'Edit':
    case 'Write':
      return <EditIcon size={16} />;
    case 'web_search':
      return <GlobeIcon size={16} />;
    case 'web_fetch':
      return <DownloadIcon size={16} />;
    case 'skill':
      return <SparklesIcon size={16} />;
    default:
      return <ToolIcon size={16} />;
  }
};

interface InlineToolCardProps {
  tool: ToolCallInfo;
  isStreaming?: boolean;
  t: (key: string) => string;
}

const InlineToolCard: React.FC<InlineToolCardProps> = ({ tool, isStreaming, t }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = !tool.duration && !tool.is_error && isStreaming;

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

  const formatDuration = (ms: number) => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`);

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
        <span className="mc-tool-icon">{getToolIcon(tool.name)}</span>
        <span className="mc-tool-name">{tool.name}</span>
        {filePath && (
          <span className="mc-tool-filepath" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        )}
        {!filePath && tool.preview && (
          <span className="mc-tool-preview-text">
            {tool.preview.length > 60 ? `${tool.preview.slice(0, 60)}...` : tool.preview}
          </span>
        )}
        <span className="mc-tool-spacer" />
        {isRunning && (
          <span className="mc-tool-status mc-tool-status-running">
            <span className="mc-tool-spinner" />
            {t('chat.running')}
          </span>
        )}
        {!isRunning && !tool.is_error && (
          <span className="mc-tool-status mc-tool-status-done">
            <CheckIcon size={14} />
            {tool.duration != null && formatDuration(tool.duration)}
          </span>
        )}
        {tool.is_error && (
          <span className="mc-tool-status mc-tool-status-error">
            <AlertIcon size={14} />
            {t('chat.error')}
          </span>
        )}
        {(canShowDiff || tool.preview) && (
          <span className="mc-tool-expand">
            {expanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
          </span>
        )}
      </div>
      {expanded && (
        <div className="mc-tool-card-body">
          {canShowDiff && (tool.name === 'Edit' || tool.name === 'edit_file') ? (
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

interface ThinkingBlockProps {
  content: string;
  thinkingTime?: number;
  isStreaming?: boolean;
  t: (key: string) => string;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, thinkingTime, isStreaming, t }) => {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  const preview = content.length > 120 ? `${content.slice(0, 120)}...` : content;
  const hasContent = content.length > 0;

  return (
    <div className={`mc-thinking-block ${isStreaming && hasContent ? 'mc-thinking-active' : ''}`}>
      <button className="mc-thinking-header" onClick={() => setExpanded((v) => !v)}>
        <span className="mc-thinking-arrow">{expanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}</span>
        <span className="mc-thinking-label">
          <ThinkingIcon size={14} />
          {t('chat.thinking')}
          {isStreaming && hasContent && <span className="mc-thinking-dots" />}
        </span>
        {!expanded && hasContent && <span className="mc-thinking-preview">{preview}</span>}
        {thinkingTime != null && thinkingTime > 0 && (
          <span className="mc-thinking-time">{(thinkingTime / 1000).toFixed(1)}s</span>
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
  onOpenSessionSearchResult,
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

  const { cleanContent, errors, sessionSearchResults } = useMemo(() => parseToolJson(msg.content), [msg.content]);

  const hasTokens = msg.inputTokens !== undefined || msg.outputTokens !== undefined;

  const handleCopy = useCallback(() => onCopyMessage(msg.content), [onCopyMessage, msg.content]);
  const handleDelete = useCallback(() => onDeleteMessage(msg.id), [onDeleteMessage, msg.id]);
  const handleStartEdit = useCallback(() => onStartEdit(msg.id, msg.content), [onStartEdit, msg.id, msg.content]);

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
            <span>{t('message.you')}</span>
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
                  <CheckIcon size={14} />
                  {t('common.confirm')}
                </button>
                <button className="mc-edit-cancel" onClick={onCancelEdit}>
                  <AlertIcon size={14} />
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mc-message-text mc-message-text-user">{cleanContent || msg.content}</div>
          )}
          {isHovered && editMessageId !== msg.id && (
            <div className="mc-hover-actions mc-hover-actions-user">
              <button className="mc-action-btn" onClick={handleStartEdit} title={t('message.edit')}>
                <EditIcon size={14} />
              </button>
              <button className="mc-action-btn" onClick={handleCopy} title={t('message.copy')}>
                <CopyIcon size={14} />
              </button>
              <button className="mc-action-btn mc-action-delete" onClick={handleDelete} title={t('message.delete')}>
                <TrashIcon size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
          <span>{t('message.assistant')}</span>
        </div>
      )}

      {(msg.reasoning || msg.thinking) && (
        <ThinkingBlock
          content={msg.reasoning || msg.thinking || ''}
          thinkingTime={msg.thinkingTime}
          isStreaming={!!msg.thinking && !msg.content}
          t={t}
        />
      )}

      {msg.tools && msg.tools.length > 0 && (
        <div className="mc-tools-container">
          {msg.tools.map((tool, idx) => (
            <InlineToolCard key={idx} tool={tool} isStreaming={false} t={t} />
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mc-tool-errors">
          {errors.map((err, i) => (
            <ToolErrorCard key={i} error={err.error} />
          ))}
        </div>
      )}

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
              <CheckIcon size={14} />
              {t('common.confirm')}
            </button>
            <button className="mc-edit-cancel" onClick={onCancelEdit}>
              <AlertIcon size={14} />
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : cleanContent ? (
        <div className="mc-message-text mc-message-text-assistant">
          <MarkdownRenderer content={cleanContent} searchQuery={messageSearchQuery} />
        </div>
      ) : null}

      {sessionSearchResults && sessionSearchResults.results.length > 0 && (() => {
        const msgSelectedIds = selectedSearchResults[msg.id] || [];
        const allSelected = sessionSearchResults.results.every((r) => msgSelectedIds.includes(r.session_id));
        const selectedCount = msgSelectedIds.length;
        return (
          <div className="mc-session-search-results">
            <div className="mc-session-search-toolbar">
              <label className="mc-session-search-select-all">
                <input
                  type="checkbox"
                  checked={allSelected && selectedCount > 0}
                  onChange={() => onToggleSelectAll(msg.id, sessionSearchResults.results.map((r) => r.session_id))}
                />
                <span>{sessionSearchResults.results.length} {t('message.sessions')}</span>
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
                  <TrashIcon size={14} />
                  {t('message.deleteSelected')}{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
                <button
                  className="mc-session-search-toolbar-btn"
                  disabled={selectedCount === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBatchExport(msg.id, sessionSearchResults.results);
                  }}
                >
                  <ExportIcon size={14} />
                  {t('message.exportSelected')}{selectedCount > 0 ? ` (${selectedCount})` : ''}
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
                  onClick={() => onOpenSessionSearchResult?.(result)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {isAssistant && hasTokens && (
        <div className="mc-token-usage">
          {msg.inputTokens !== undefined && (
            <span className="mc-token-item">
              <span className="mc-token-icon">In</span>
              {msg.inputTokens.toLocaleString()}
            </span>
          )}
          {msg.outputTokens !== undefined && (
            <span className="mc-token-item">
              <span className="mc-token-icon">Out</span>
              {msg.outputTokens.toLocaleString()}
            </span>
          )}
          {msg.totalTokens !== undefined && (
            <span className="mc-token-item mc-token-total">
              <span className="mc-token-icon">Total</span>
              {msg.totalTokens.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {isHovered && editMessageId !== msg.id && (
        <div className="mc-hover-actions mc-hover-actions-assistant">
          <button className="mc-action-btn" onClick={handleCopy} title={t('message.copy')}>
            <CopyIcon size={14} />
          </button>
          <button className="mc-action-btn" onClick={onRegenerate} title={t('message.regenerate')}>
            <RefreshIcon size={14} />
          </button>
          <button className="mc-action-btn mc-action-delete" onClick={handleDelete} title={t('message.delete')}>
            <TrashIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export const MessageContent = memo(MessageContentComponent);
