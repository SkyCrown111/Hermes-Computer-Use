// Session Chat Interface Component
// Allows continuing a conversation with Hermes Agent
// Uses ChatInput + MessageContent from the shared chat component library

import React, { useState, useRef, useEffect } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval, abortChat } from '../../services/hermesChat';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatInput, MessageContent, ThinkingBlock } from '../../components/chat';
import type { ChatInputHandle, AttachedFile, SessionSearchResult } from '../../components/chat';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import { MarkdownRenderer, BotIcon, ThinkingIcon } from '../../components';
import type { Session, SessionMessage } from '../../types';
import './SessionChat.css';

// ---- Helpers ----

let msgCounter = 0;
const nextId = () => `sc-${++msgCounter}-${Date.now()}`;

// ---- Types ----

interface SessionChatProps {
  session: Session;
  initialMessages: SessionMessage[];
  onClose: () => void;
}

// ---- Component ----

export const SessionChat: React.FC<SessionChatProps> = ({
  session,
  initialMessages,
  onClose,
}) => {
  const { t } = useTranslation();

  // ---- Message State ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editMessageContent, setEditMessageContent] = useState('');

  // ---- Streaming State ----
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolCallInfo[]>([]);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  // ---- Refs (avoid stale closures in stream callbacks) ----
  const isStoppedRef = useRef(false);
  const streamingContentRef = useRef('');
  const streamingReasoningRef = useRef('');
  const streamingToolsRef = useRef<ToolCallInfo[]>([]);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Effects ----

  // Convert SessionMessage[] to ChatMessage[] on mount
  useEffect(() => {
    const converted: ChatMessage[] = initialMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id: nextId(),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      }));
    setMessages(converted);
  }, [initialMessages]);

  // Check API availability on mount
  useEffect(() => {
    checkHermesApiHealth().then(available => {
      setApiAvailable(available);
    });
  }, []);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // ---- Send / Stop ----

  const handleSendMessage = async (text: string, _files?: AttachedFile[]) => {
    if (!text.trim() || isStreaming) return;

    isStoppedRef.current = false;

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Reset streaming accumulators
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingTools([]);
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingToolsRef.current = [];

    // Build API history from current messages
    const historyForApi = messages.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      await streamChatRealtime(text.trim(), session.id, historyForApi, {
        onChunk: (_chunk, accumulated) => {
          if (isStoppedRef.current) return;
          streamingContentRef.current = accumulated;
          setStreamingContent(accumulated);
        },
        onReasoning: (_reasoningText, accumulated) => {
          if (isStoppedRef.current) return;
          streamingReasoningRef.current = accumulated;
          setStreamingReasoning(accumulated);
        },
        onTool: (tool) => {
          if (isStoppedRef.current) return;
          streamingToolsRef.current = [...streamingToolsRef.current, tool];
          setStreamingTools([...streamingToolsRef.current]);
        },
        onComplete: (content, _newSessionId, usage) => {
          if (isStoppedRef.current) return;
          setIsStreaming(false);

          const finalContent = content || streamingContentRef.current;
          const finalReasoning = streamingReasoningRef.current;
          const finalTools = streamingToolsRef.current.length > 0
            ? [...streamingToolsRef.current]
            : undefined;

          const assistantMsg: ChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: finalContent,
            reasoning: finalReasoning || undefined,
            tools: finalTools,
            timestamp: new Date().toISOString(),
            inputTokens: usage?.prompt_tokens,
            outputTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens,
          };
          setMessages(prev => [...prev, assistantMsg]);

          // Reset streaming state
          streamingContentRef.current = '';
          streamingReasoningRef.current = '';
          streamingToolsRef.current = [];
          setStreamingContent('');
          setStreamingReasoning('');
          setStreamingTools([]);
        },
        onError: (error) => {
          if (isStoppedRef.current) return;
          setIsStreaming(false);
          const errorMsg: ChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: `${t('chat.error')}: ${error.message}. ${t('chat.ensureGateway')}`,
            timestamp: new Date().toISOString(),
          };
          setMessages(prev => [...prev, errorMsg]);
          streamingContentRef.current = '';
          streamingReasoningRef.current = '';
          streamingToolsRef.current = [];
          setStreamingContent('');
          setStreamingReasoning('');
          setStreamingTools([]);
        },
        onApproval: (approval) => {
          if (isStoppedRef.current) return;
          // Auto-deny for SessionChat (no permission UI)
          respondApproval(approval.id, 'deny').catch(() => {});
        },
      });
    } catch (error) {
      setIsStreaming(false);
      const errorMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: `${t('chat.error')}: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
      streamingContentRef.current = '';
      streamingReasoningRef.current = '';
      streamingToolsRef.current = [];
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingTools([]);
    }
  };

  const handleStop = async () => {
    isStoppedRef.current = true;
    setIsStreaming(false);
    try {
      await abortChat();
    } catch (error) {
      console.error('[SessionChat] Failed to abort chat:', error);
    }
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingToolsRef.current = [];
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingTools([]);
  };

  // ---- Message Operations ----

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('[SessionChat] Failed to copy:', err);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleRegenerate = () => {
    // Find the last user message
    let lastUserMsgIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') continue;
      if (messages[i]?.role === 'user') { lastUserMsgIdx = i; break; }
    }
    if (lastUserMsgIdx < 0) return;
    const userMsg = messages[lastUserMsgIdx];
    if (!userMsg?.content) return;

    // Remove all assistant messages after this user message
    let assistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') { assistantIdx = i; break; }
    }
    if (assistantIdx >= 0) {
      setMessages(prev => prev.slice(0, assistantIdx));
    }

    // Fill the input to resend
    chatInputRef.current?.triggerSend(userMsg.content);
  };

  const startEditMessage = (messageId: string, content: string) => {
    setEditMessageId(messageId);
    setEditMessageContent(content);
  };

  const cancelEditMessage = () => {
    setEditMessageId(null);
    setEditMessageContent('');
  };

  const saveEditMessage = (messageId: string) => {
    if (!editMessageContent.trim()) return;
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: editMessageContent.trim() } : m
    ));
    setEditMessageId(null);
    setEditMessageContent('');
  };

  // ---- Stub callbacks (features not applicable in SessionChat) ----

  const noop = () => {};
  const noopToggle = (_msgId: string, _sessionId: string) => {};
  const noopToggleAll = (_msgId: string, _sessionIds: string[]) => {};
  const noopBatchDelete = (_msgId: string) => {};
  const noopBatchExport = (_msgId: string, _sessions: SessionSearchResult[]) => {};

  // ---- Helpers ----

  const isFirstInGroup = (msg: ChatMessage, idx: number): boolean => {
    if (idx === 0) return true;
    return messages[idx - 1]?.role !== msg.role;
  };

  // ---- Render ----

  return (
    <div className="session-chat-overlay" onClick={onClose}>
      <div className="session-chat-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <h2>{t('sessions.continue')}</h2>
            <span className="chat-session-id">{session.id.slice(0, 12)}...</span>
          </div>
          <div className="chat-header-actions">
            {apiAvailable === false && (
              <span className="api-status offline">{t('dashboard.offline')}</span>
            )}
            {apiAvailable === true && (
              <span className="api-status online">{t('dashboard.online')}</span>
            )}
            <button className="chat-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="chat-messages">
          {messages.length === 0 && !isStreaming && (
            <div className="chat-empty">
              <p>{t('common.noData')}, {t('chat.startConversation').toLowerCase()}</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageContent
              key={msg.id}
              message={msg}
              isFirstInGroup={isFirstInGroup(msg, idx)}
              messageSearchQuery=""
              pendingPermission={null}
              editMessageId={editMessageId}
              editMessageContent={editMessageContent}
              selectedSearchResults={{}}
              onToggleSearchResult={noopToggle}
              onToggleSelectAll={noopToggleAll}
              onBatchDelete={noopBatchDelete}
              onBatchExport={noopBatchExport}
              onCopyMessage={copyMessage}
              onDeleteMessage={handleDeleteMessage}
              onRegenerate={handleRegenerate}
              onStartEdit={startEditMessage}
              onCancelEdit={cancelEditMessage}
              onSaveEdit={saveEditMessage}
              onEditContentChange={setEditMessageContent}
              onApprovalResponse={noop}
              t={t}
            />
          ))}

          {/* Streaming display - real-time reasoning + tools + content */}
          {isStreaming && (
            <div className="chat-message assistant streaming">
              <div className="message-avatar">
                <BotIcon size={16} />
              </div>
              <div className="message-content">
                {/* Thinking dots while waiting for first content */}
                {!streamingReasoning && !streamingContent && (
                  <div className="thinking-indicator">
                    <div className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="thinking-text">
                      <ThinkingIcon size={14} /> {t('chat.thinking')}
                    </span>
                  </div>
                )}

                {/* Reasoning block (collapsible) */}
                {streamingReasoning && (
                  <ThinkingBlock content={streamingReasoning} isActive={true} />
                )}

                {/* Tool calls */}
                {streamingTools.length > 0 && (
                  <div className="tools-block">
                    {streamingTools.map((tool, i) => (
                      <div key={i} className={`tool-item ${tool.is_error ? 'tool-error' : ''}`}>
                        <span className="tool-name">{tool.name}</span>
                        <span className="tool-status">
                          {tool.is_error ? 'error' : tool.event_type === 'tool.completed' ? 'done' : 'running'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Streamed content with Markdown */}
                {streamingContent && (
                  <div className="message-text">
                    <MarkdownRenderer content={streamingContent} searchQuery="" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ChatInput (from shared component library) */}
        <div className="session-chat-input">
          <ChatInput
            ref={chatInputRef}
            onSendMessage={handleSendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
            disabled={apiAvailable === false}
          />
        </div>
      </div>
    </div>
  );
};
