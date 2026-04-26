import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageContent } from './MessageContent';
import { parseToolJson } from './parseToolJson';
import type { SessionSearchResult } from './constants';
import type { ChatMessage } from '../../stores/chatStore';
import { ZapIcon, BotIcon, AlertIcon, ThinkingIcon, MarkdownRenderer } from '../../components';
import { ThinkingBlock, ToolsBlock, PermissionCard } from './index';

// ---- Types ----

interface PermissionApproval {
  id: string;
  command: string;
  description: string;
  allow_permanent: boolean;
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
  isThinking: boolean;
  thinkingText: string;
  reasoningText: string;
  streamingText: string;
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

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  visibleMessages,
  shouldVirtualize,
  isStreaming,
  isThinking,
  thinkingText,
  reasoningText,
  streamingText,
  streamingTools,
  pendingPermission,
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
  onApprovalResponse,
  t,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling: only activate for large lists when NOT streaming
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? visibleMessages.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

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
                  onApprovalResponse={onApprovalResponse}
                  t={t}
                />
              );
            })}
          </div>
        ) : (
          messages.map((msg, idx) => {
            // Check if message has any visible content
            const { cleanContent } = msg.content ? parseToolJson(msg.content) : { cleanContent: '' };
            const hasVisibleContent = cleanContent || msg.reasoning || (msg.tools && msg.tools.length > 0) || msg.thinking;

            // Skip rendering if no visible content
            if (!hasVisibleContent) return null;

            // Find the previous visible message to determine grouping
            let prevVisibleIdx = idx - 1;
            while (prevVisibleIdx >= 0) {
              const prevMsg = messages[prevVisibleIdx];
              const prevClean = prevMsg.content ? parseToolJson(prevMsg.content).cleanContent : '';
              if (prevClean || prevMsg.reasoning || (prevMsg.tools && prevMsg.tools.length > 0) || prevMsg.thinking) {
                break;
              }
              prevVisibleIdx--;
            }

            const isFirstInGroup = prevVisibleIdx < 0 || messages[prevVisibleIdx].role !== msg.role;
            const isStreamingMsg = idx === messages.length - 1 && isStreaming;

            return (
              <MessageContent
                key={idx}
                message={msg}
                isFirstInGroup={isFirstInGroup}
                isStreamingMsg={isStreamingMsg}
                messageSearchQuery={messageSearchQuery}
                pendingPermission={isStreamingMsg ? pendingPermission : null}
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
                onApprovalResponse={onApprovalResponse}
                t={t}
              />
            );
          })
        )}

        {/* Streaming state display - shows real-time thinking/streaming */}
        {isStreaming && (
          <div className="chat-message assistant streaming">
            <div className="message-avatar">
              <BotIcon size={16} />
            </div>
            <div className="message-content">
              {/* Thinking indicator - show if thinking OR if no content yet */}
              {(isThinking || (!reasoningText && !streamingTools?.length && !streamingText)) && (
                <div className="thinking-indicator">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="thinking-text">
                    <ThinkingIcon size={14} /> {thinkingText || t('chat.thinking')}
                  </span>
                </div>
              )}
              {/* Reasoning display - actual AI reasoning content */}
              {reasoningText && (
                <ThinkingBlock content={reasoningText} isActive={true} />
              )}
              {/* Tool calls display - show during streaming */}
              {streamingTools && streamingTools.length > 0 && (
                <ToolsBlock tools={streamingTools} isStreaming={true} />
              )}
              {/* Streaming content */}
              {streamingText && (
                <div className="message-text"><MarkdownRenderer content={streamingText} searchQuery={messageSearchQuery} /></div>
              )}
              {/* Pending approval */}
              {pendingPermission && (
                <PermissionCard
                  approval={pendingPermission}
                  onRespond={onApprovalResponse}
                />
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
};
