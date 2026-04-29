import React, { useRef, useEffect, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageContent } from './MessageContent';
import { parseToolJson } from './parseToolJson';
import type { SessionSearchResult } from './constants';
import type { ChatMessage } from '../../stores/chatStore';
import { ZapIcon, AlertIcon } from '../../components';

// ---- Types ----

interface PermissionApproval {
  id: string;
  command: string;
  description: string;
  allow_permanent: boolean;
  choices?: ('once' | 'session' | 'always' | 'deny')[];
}

interface ToolCallInfo {
  name: string;
  event_type: string;
  preview?: string;
  args?: Record<string, unknown>;
  duration?: number;
  is_error?: boolean;
}

export interface MessageListProps {
  messages: ChatMessage[];
  visibleMessages: ChatMessage[];
  shouldVirtualize: boolean;
  isStreaming: boolean;
  streamingTools: ToolCallInfo[];
  pendingPermission: PermissionApproval | null;
  apiAvailable: boolean | null;
  showMessageSearch: boolean;
  messageSearchQuery: string;
  messageMatchIndices: number[];
  activeMatchIndex: number;
  editMessageId: string | null;
  editMessageContent: string;
  selectedSearchResults: Record<string, string[]>;
  onSetSearchQuery: (query: string) => void;
  onSetActiveMatch: (index: number | ((prev: number) => number)) => void;
  onCloseSearch: () => void;
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

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  visibleMessages,
  shouldVirtualize,
  isStreaming,
  streamingTools,
  apiAvailable,
  showMessageSearch,
  messageSearchQuery,
  messageMatchIndices,
  activeMatchIndex,
  editMessageId,
  editMessageContent,
  selectedSearchResults,
  onSetSearchQuery,
  onSetActiveMatch,
  onCloseSearch,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track if we're in the middle of a window focus event to prevent layout shifts
  const isWindowFocusingRef = useRef(false);

  // Virtual scrolling: only activate for large lists when NOT streaming
  const virtualizerOptions = useMemo(() => ({
    count: shouldVirtualize ? visibleMessages.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    scrollPaddingStart: 0,
    scrollPaddingEnd: 0,
  }), [shouldVirtualize, visibleMessages.length]);

  const virtualizer = useVirtualizer(virtualizerOptions);

  // Handle window focus/blur to prevent layout shifts
  useEffect(() => {
    const handleFocus = () => {
      isWindowFocusingRef.current = true;
      requestAnimationFrame(() => {
        isWindowFocusingRef.current = false;
      });
    };

    const handleBlur = () => {
      isWindowFocusingRef.current = true;
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Scroll to active match for in-message search
  useEffect(() => {
    if (messageMatchIndices.length === 0) return;
    const matchIdx = messageMatchIndices[activeMatchIndex];
    if (matchIdx === undefined) return;
    const el = document.getElementById(`chat-msg-${messages[matchIdx]?.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchIndex, messageMatchIndices, messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* In-message Search Bar */}
      {showMessageSearch && (
        <div className="message-search-bar">
          <span className="material-symbols-outlined message-search-icon">search</span>
          <input
            className="message-search-input"
            type="text"
            placeholder={t('message.searchPlaceholder')}
            value={messageSearchQuery}
            onChange={(e) => {
              onSetSearchQuery(e.target.value);
              onSetActiveMatch(0);
            }}
          />
          <span className="message-search-count">
            {messageSearchQuery.trim()
              ? `${activeMatchIndex + 1}/${messageMatchIndices.length}`
              : ''}
          </span>
          <button
            className="message-search-nav"
            disabled={messageMatchIndices.length === 0}
            onClick={() => onSetActiveMatch(i => i <= 0 ? messageMatchIndices.length - 1 : i - 1)}
            title={t('message.previous')}
          >
            <span className="material-symbols-outlined">keyboard_arrow_up</span>
          </button>
          <button
            className="message-search-nav"
            disabled={messageMatchIndices.length === 0}
            onClick={() => onSetActiveMatch(i => i >= messageMatchIndices.length - 1 ? 0 : i + 1)}
            title={t('message.next')}
          >
            <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </button>
          <button
            className="message-search-close"
            onClick={onCloseSearch}
            title={t('message.close')}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="chat-page-messages" ref={scrollContainerRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon"><ZapIcon size={48} /></div>
            <h2>{t('chat.title')}</h2>
            <p>{t('chat.startConversation')}</p>
            {apiAvailable === false && (
              <div className="chat-welcome-warning">
                <p><AlertIcon size={16} /> {t('chat.gatewayNotRunning')}</p>
                <code>hermes gateway</code>
              </div>
            )}
          </div>
        )}

        {/* Virtual scrolling for large lists (non-streaming) */}
        {shouldVirtualize ? (
          <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const msg = visibleMessages[virtualRow.index];
              const prevVisible = visibleMessages[virtualRow.index - 1];
              const isFirstInGroup = !prevVisible || prevVisible.role !== msg.role;

              return (
                <MessageContent
                  key={virtualRow.key}
                  message={msg}
                  isFirstInGroup={isFirstInGroup}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  messageSearchQuery={messageSearchQuery}
                  editMessageId={editMessageId}
                  editMessageContent={editMessageContent}
                  selectedSearchResults={selectedSearchResults}
                  onToggleSearchResult={onToggleSearchResult}
                  onToggleSelectAll={onToggleSelectAll}
                  onBatchDelete={onBatchDelete}
                  onBatchExport={onBatchExport}
                  onCopyMessage={onCopyMessage}
                  onDeleteMessage={onDeleteMessage}
                  onRegenerate={onRegenerate}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onSaveEdit={onSaveEdit}
                  onEditContentChange={onEditContentChange}
                  t={t}
                />
              );
            })}
          </div>
        ) : (
          messages.map((msg, idx) => {
            // Check if message has any visible content
            const { cleanContent } = msg.content ? parseToolJson(msg.content) : { cleanContent: '' };
            const hasVisibleContent = cleanContent || (msg.tools && msg.tools.length > 0);
            if (!hasVisibleContent) return null;

            let prevVisibleIdx = idx - 1;
            while (prevVisibleIdx >= 0) {
              const prevMsg = messages[prevVisibleIdx];
              const prevClean = prevMsg.content ? parseToolJson(prevMsg.content).cleanContent : '';
              if (prevClean || prevMsg.reasoning || (prevMsg.tools && prevMsg.tools.length > 0)) {
                break;
              }
              prevVisibleIdx--;
            }

            const isFirstInGroup = prevVisibleIdx < 0 || messages[prevVisibleIdx].role !== msg.role;

            return (
              <MessageContent
                key={idx}
                message={msg}
                isFirstInGroup={isFirstInGroup}
                messageSearchQuery={messageSearchQuery}
                editMessageId={editMessageId}
                editMessageContent={editMessageContent}
                selectedSearchResults={selectedSearchResults}
                onToggleSearchResult={onToggleSearchResult}
                onToggleSelectAll={onToggleSelectAll}
                onBatchDelete={onBatchDelete}
                onBatchExport={onBatchExport}
                onCopyMessage={onCopyMessage}
                onDeleteMessage={onDeleteMessage}
                onRegenerate={onRegenerate}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                onEditContentChange={onEditContentChange}
                t={t}
              />
            );
          })
        )}

        {/* Streaming tools - displayed during active streaming */}
        {isStreaming && streamingTools.length > 0 && (
          <div className="streaming-tools">
            {streamingTools.map((tool, i) => (
              <div key={i} className="streaming-tool-item">
                <span className="streaming-tool-icon">⚙️</span>
                <span className="streaming-tool-name">{tool.name || 'tool'}</span>
                {tool.preview && <span className="streaming-tool-preview">{tool.preview}</span>}
              </div>
            ))}
          </div>
        )}

        {/* CLI-style processing indicator */}
        {isStreaming && (
          <div className="cli-processing">
            <span className="cli-processing-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span className="cli-processing-text">processing</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
};

// Memoize to prevent re-renders when parent updates but props haven't changed
export const MessageList = memo(MessageListComponent);
