import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval, abortChat } from '../../services/hermesChat';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatInput } from '../../components/chat';
import type { ChatInputHandle, AttachedFile } from '../../components/chat';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import { BotIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, ToolIcon, UserIcon, XIcon } from '../../components';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { normalizeContent } from '../../lib/contentUtils';
import { cleanErrorMessage } from '../../lib/errorUtils';
import type { Session, SessionMessage } from '../../types';
import './SessionChat.css';

let msgCounter = 0;
const nextId = () => `sc-${++msgCounter}-${Date.now()}`;

const ToolCallBlock: React.FC<{ tools: ToolCallInfo[]; isStreaming?: boolean; lang: 'zh' | 'en' }> = ({ tools, isStreaming, lang }) => {
  const [expanded, setExpanded] = useState(false);
  if (!tools || tools.length === 0) return null;

  const runningLabel = lang === 'zh' ? '进行中...' : 'running...';
  const failedLabel = lang === 'zh' ? '失败' : 'FAILED';
  const toolCallsLabel = lang === 'zh' ? '工具调用' : 'tool calls';

  return (
    <div className="tc-tools">
      <button className="tc-tools-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="tc-tools-icon" aria-hidden="true"><ToolIcon size={14} /></span>
        <span className="tc-tools-summary">{tools.length} {toolCallsLabel}</span>
        <span className="tc-tools-chevron" aria-hidden="true">
          {expanded ? <ChevronDownIcon size={12} /> : <ChevronUpIcon size={12} />}
        </span>
      </button>
      {expanded && (
        <div className="tc-tools-detail">
          {tools.map((tool, i) => (
            <div key={i} className={`tc-tool ${tool.is_error ? 'error' : ''}`}>
              <span className="tc-tool-name">{tool.name}</span>
              {tool.preview && <span className="tc-tool-preview">{tool.preview.slice(0, 80)}</span>}
              {tool.duration !== undefined && <span className="tc-tool-duration">{tool.duration.toFixed(0)}ms</span>}
              {tool.is_error && <span className="tc-tool-error">{failedLabel}</span>}
              {!tool.duration && !tool.is_error && isStreaming && <span className="tc-tool-running">{runningLabel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage; onCopy: (content: string) => void; lang: 'zh' | 'en'; t: (key: string) => string }> = React.memo(({ message, onCopy, lang, t }) => {
  const [showActions, setShowActions] = useState(false);
  const content = normalizeContent(message.content);
  const roleLabel = message.role === 'user' ? (lang === 'zh' ? '你' : 'You') : (lang === 'zh' ? '助手' : 'Assistant');

  return (
    <div
      className={`tc-msg tc-msg-${message.role}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="tc-msg-header">
        <span className="tc-msg-role">
          {message.role === 'user' ? <UserIcon size={14} /> : <BotIcon size={14} />}
          {roleLabel}
        </span>
        {showActions && (
          <button className="tc-msg-action" onClick={() => onCopy(content)} title={t('common.copy')}>
            <CopyIcon size={14} />
          </button>
        )}
      </div>
      <div className="tc-msg-body">
        {message.role === 'assistant' ? (
          <div className="tc-msg-text">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <pre className="tc-msg-text">{content}</pre>
        )}
        {message.tools && message.tools.length > 0 && (
          <ToolCallBlock tools={message.tools} lang={lang} />
        )}
      </div>
    </div>
  );
});

interface SessionChatProps {
  session: Session;
  initialMessages: SessionMessage[];
  onClose: () => void;
}

export const SessionChat: React.FC<SessionChatProps> = ({ session, initialMessages, onClose }) => {
  const { t, lang } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolCallInfo[]>([]);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  const isStoppedRef = useRef(false);
  const isStreamingRef = useRef(false);
  const streamingContentRef = useRef('');
  const streamingToolsRef = useRef<ToolCallInfo[]>([]);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const converted: ChatMessage[] = initialMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: nextId(),
        role: m.role as 'user' | 'assistant',
        content: normalizeContent(m.content),
        timestamp: m.timestamp,
        tools: m.tool_calls?.map((tc) => ({
          name: tc.name,
          event_type: 'tool.completed',
          preview: tc.args ? JSON.stringify(tc.args).slice(0, 100) : '',
          args: tc.args,
        })),
      }));
    setMessages(converted);
  }, [initialMessages]);

  useEffect(() => {
    checkHermesApiHealth().then((available) => setApiAvailable(available));
  }, []);

  useEffect(() => {
    return () => {
      if (isStreamingRef.current) {
        abortChat(session.id).catch(() => {});
      }
    };
  }, [session.id]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, streamingContent, isStreaming]);

  const handleSendMessage = useCallback(async (text: string, _files?: AttachedFile[]) => {
    if (!text.trim() || isStreaming) return;

    isStoppedRef.current = false;
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setIsStreaming(true);
    isStreamingRef.current = true;
    setStreamingContent('');
    setStreamingTools([]);
    streamingContentRef.current = '';
    streamingToolsRef.current = [];

    const historyForApi = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    try {
      await streamChatRealtime(text.trim(), session.id, { history: historyForApi, callbacks: {
        onChunk: (_chunk, accumulated) => {
          if (isStoppedRef.current) return;
          streamingContentRef.current = accumulated;
          setStreamingContent(accumulated);
        },
        onReasoning: () => {},
        onTool: (tool) => {
          if (isStoppedRef.current) return;
          streamingToolsRef.current = [...streamingToolsRef.current, tool];
          setStreamingTools([...streamingToolsRef.current]);
        },
        onComplete: (content) => {
          if (isStoppedRef.current) return;
          setIsStreaming(false);
          isStreamingRef.current = false;
          const assistantMsg: ChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: content || streamingContentRef.current,
            timestamp: new Date().toISOString(),
            tools: streamingToolsRef.current.length > 0 ? [...streamingToolsRef.current] : undefined,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          streamingContentRef.current = '';
          streamingToolsRef.current = [];
          setStreamingContent('');
          setStreamingTools([]);
        },
        onError: (error) => {
          if (isStoppedRef.current) return;
          setIsStreaming(false);
          isStreamingRef.current = false;
          const accumulated = streamingContentRef.current;
          const tools = streamingToolsRef.current;
          if (accumulated.trim()) {
            setMessages((prev) => [...prev, {
              id: nextId(),
              role: 'assistant',
              content: accumulated,
              timestamp: new Date().toISOString(),
              tools: tools.length > 0 ? [...tools] : undefined,
            }]);
          } else {
            setMessages((prev) => [...prev, {
              id: nextId(),
              role: 'assistant',
              content: `${t('chat.error')}: ${cleanErrorMessage(error)}. ${t('chat.ensureGateway')}`,
              timestamp: new Date().toISOString(),
            }]);
          }
          streamingContentRef.current = '';
          streamingToolsRef.current = [];
          setStreamingContent('');
          setStreamingTools([]);
        },
        onApproval: (approval) => {
          respondApproval(approval.id, 'deny').catch(() => {});
        },
      } });
    } catch (error) {
      setIsStreaming(false);
      isStreamingRef.current = false;
      setMessages((prev) => [...prev, {
        id: nextId(),
        role: 'assistant',
        content: `${t('chat.error')}: ${cleanErrorMessage(error)}`,
        timestamp: new Date().toISOString(),
      }]);
      streamingContentRef.current = '';
      streamingToolsRef.current = [];
      setStreamingContent('');
      setStreamingTools([]);
    }
  }, [isStreaming, messages, session.id, t]);

  const handleStop = useCallback(async () => {
    isStoppedRef.current = true;
    setIsStreaming(false);
    isStreamingRef.current = false;
    try {
      await abortChat(session.id);
    } catch {
      // Ignore abort errors when the stream has already finished.
    }
    streamingContentRef.current = '';
    streamingToolsRef.current = [];
    setStreamingContent('');
    setStreamingTools([]);
  }, [session.id]);

  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  }, []);

  const statusLabel = isStreaming
    ? lang === 'zh' ? '流式输出中' : 'Streaming'
    : apiAvailable
      ? lang === 'zh' ? '就绪' : 'Ready'
      : lang === 'zh' ? '离线' : 'Offline';

  return (
    <div className="session-chat-overlay" onClick={onClose}>
      <div className="session-chat-container" onClick={(e) => e.stopPropagation()}>
        <div className="tc-header">
          <span className="tc-header-title">{session.chat_name || session.id.slice(0, 12)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`tc-header-status ${isStreaming ? 'streaming' : ''}`}>
              <span className={`chat-status-dot ${isStreaming ? 'streaming' : apiAvailable ? 'ready' : 'offline'}`} />
              {statusLabel}
            </span>
            <button className="chat-close-btn" onClick={onClose} title={t('common.close')}>
              <XIcon size={14} />
            </button>
          </div>
        </div>

        <div className="tc-messages" ref={scrollContainerRef}>
          {messages.length === 0 && !isStreaming && (
            <div className="tc-empty">
              <p>{t('chat.startConversation')}</p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} onCopy={copyMessage} lang={lang} t={t} />
          ))}

          {isStreaming && (
            <div className="tc-msg tc-msg-assistant tc-msg-streaming">
              <div className="tc-msg-header">
                <span className="tc-msg-role">
                  <BotIcon size={14} />
                  {lang === 'zh' ? '助手' : 'Assistant'}
                </span>
                <span className="tc-streaming-indicator">{lang === 'zh' ? '正在输入...' : 'typing...'}</span>
              </div>
              <div className="tc-msg-body">
                {streamingTools.length > 0 && (
                  <ToolCallBlock tools={streamingTools} isStreaming lang={lang} />
                )}
                <div className="tc-msg-text">
                  {streamingContent ? <MarkdownRenderer content={streamingContent} /> : ' '}
                  <span className="tc-cursor" />
                </div>
              </div>
            </div>
          )}

          <div />
        </div>

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
