import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  respondApproval,
  respondClarify,
  respondSecret,
} from '../../services/hermesChat';
import { useTranslation } from '../../hooks/useTranslation';
import { useHermesReadiness } from '../../hooks/useHermesReadiness';
import { useStreamChat } from '../../hooks/useStreamChat';
import { useNavigationStore } from '../../stores';
import { ChatInput, PermissionCard, ClarifyCard, SecretCard } from '../../components/chat';
import type { ChatInputHandle, AttachedFile } from '../../components/chat';
import { ThinkingBlock } from '../../components/chat/ThinkingBlock';
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

  const runningLabel = lang === 'zh' ? '杩涜涓?..' : 'running...';
  const failedLabel = lang === 'zh' ? '澶辫触' : 'FAILED';
  const toolCallsLabel = lang === 'zh' ? '宸ュ叿璋冪敤' : 'tool calls';

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
  const roleLabel = message.role === 'user' ? (lang === 'zh' ? '浣?' : 'You') : (lang === 'zh' ? '鍔╂墜' : 'Assistant');

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
        {message.reasoning && (
          <ThinkingBlock content={message.reasoning} label={t('chat.thinking').replace('...', '')} />
        )}
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
  const setActiveItem = useNavigationStore((s) => s.setActiveItem);
  const { readiness, refreshReadiness } = useHermesReadiness();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [reasoningText, setReasoningText] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolCallInfo[]>([]);
  const [pendingPermission, setPendingPermission] = useState<{
    id: string;
    command: string;
    description: string;
    allow_permanent: boolean;
    choices?: Array<'once' | 'session' | 'always' | 'deny'>;
  } | null>(null);
  const [pendingClarify, setPendingClarify] = useState<{
    id: string;
    question: string;
    choices: string[];
    is_open_ended: boolean;
  } | null>(null);
  const [pendingSecret, setPendingSecret] = useState<{
    id: string;
    var_name: string;
    prompt: string;
    metadata: Record<string, unknown>;
  } | null>(null);

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
        reasoning: m.reasoning ? normalizeContent(m.reasoning) : undefined,
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
    const container = scrollContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, streamingContent, reasoningText, isStreaming, pendingPermission, pendingClarify, pendingSecret]);

  const resetStreamingState = useCallback(() => {
    setStreamingContent('');
    setReasoningText('');
    setStreamingTools([]);
  }, []);

  const appendAssistantMessage = useCallback((content: string, reasoning?: string, tools?: ToolCallInfo[]) => {
    setMessages((prev) => [...prev, {
      id: nextId(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      reasoning: reasoning || undefined,
      tools: tools && tools.length > 0 ? [...tools] : undefined,
    }]);
  }, []);

  const {
    send,
    abort,
    getSnapshot,
    isStopped,
  } = useStreamChat({
    sessionId: session.id,
    onContentChunk: (_chunk, accumulated) => {
      setStreamingContent(accumulated);
    },
    onReasoningChunk: (_text, accumulated) => {
      setReasoningText(accumulated);
    },
    onToolCall: (tool) => {
      setStreamingTools((prev) => [...prev, tool]);
    },
    onApproval: (approval) => {
      setPendingPermission(approval);
    },
    onClarify: (clarify) => {
      setPendingClarify(clarify);
    },
    onSecret: (secret) => {
      setPendingSecret(secret);
    },
    onComplete: (result) => {
      if (isStopped.current) return;
      setIsStreaming(false);
      appendAssistantMessage(
        result.content,
        result.reasoning || undefined,
        result.tools,
      );
      resetStreamingState();
    },
    onError: (result) => {
      if (isStopped.current) return;
      setIsStreaming(false);
      if (result.content.trim()) {
        appendAssistantMessage(result.content, result.reasoning || undefined, result.tools);
      } else {
        appendAssistantMessage(
          `${t('chat.error')}: ${cleanErrorMessage(result.error)}. ${t('chat.ensureGateway')}`,
          result.reasoning || undefined,
        );
      }
      resetStreamingState();
    },
    onStatusChange: (status) => {
      setIsStreaming(status === 'streaming');
    },
  });

  useEffect(() => {
    return () => {
      if (isStreaming) {
        abort().catch(() => {});
      }
    };
  }, [abort, isStreaming]);

  const handleSendMessage = useCallback(async (text: string, _files?: AttachedFile[]) => {
    if (pendingPermission) {
      const choice = text.trim().toLowerCase();
      const normalizedChoice =
        choice === 'y' || choice === 'yes' || choice === 'approve' || choice === 'approved' ? 'once' :
        choice === 'once' || choice === 'session' || choice === 'always' || choice === 'deny' ? choice :
        'deny';
      await respondApproval(pendingPermission.id, normalizedChoice);
      setPendingPermission(null);
      return;
    }

    if (pendingClarify) {
      await respondClarify(pendingClarify.id, text.trim());
      setPendingClarify(null);
      return;
    }

    if (pendingSecret) {
      await respondSecret(pendingSecret.id, text.trim());
      setPendingSecret(null);
      return;
    }

    if (!readiness.ready) {
      appendAssistantMessage(`${readiness.title}. ${readiness.description}`);
      return;
    }

    if (!text.trim() || isStreaming) return;

    setMessages((prev) => [...prev, {
      id: nextId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    }]);

    resetStreamingState();

    const historyForApi = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    try {
      await send(text.trim(), historyForApi);
    } catch (error) {
      appendAssistantMessage(`${t('chat.error')}: ${cleanErrorMessage(error)}`);
      resetStreamingState();
    }
  }, [appendAssistantMessage, isStreaming, messages, pendingClarify, pendingPermission, pendingSecret, readiness, resetStreamingState, send, t]);

  const handleStop = useCallback(async () => {
    const snapshot = getSnapshot();
    setIsStreaming(false);
    try {
      await abort();
    } catch {
      // Ignore abort errors when the stream has already finished.
    }
    if (snapshot.content.trim()) {
      appendAssistantMessage(
        snapshot.content,
        snapshot.reasoning || undefined,
        snapshot.tools,
      );
    }
    resetStreamingState();
  }, [abort, appendAssistantMessage, getSnapshot, resetStreamingState]);

  const handleApprovalResponse = useCallback(async (choice: 'once' | 'session' | 'always' | 'deny') => {
    if (!pendingPermission) return;
    await respondApproval(pendingPermission.id, choice);
    setPendingPermission(null);
  }, [pendingPermission]);

  const handleClarifyResponse = useCallback(async (answer: string) => {
    if (!pendingClarify) return;
    await respondClarify(pendingClarify.id, answer);
    setPendingClarify(null);
  }, [pendingClarify]);

  const handleSecretResponse = useCallback(async (value: string) => {
    if (!pendingSecret) return;
    await respondSecret(pendingSecret.id, value);
    setPendingSecret(null);
  }, [pendingSecret]);

  const handleSecretSkip = useCallback(async () => {
    if (!pendingSecret) return;
    await respondSecret(pendingSecret.id, '');
    setPendingSecret(null);
  }, [pendingSecret]);

  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  }, []);

  const statusLabel = isStreaming
    ? lang === 'zh' ? '娴佸紡杈撳嚭涓?' : 'Streaming'
    : readiness.ready
      ? lang === 'zh' ? '灏辩华' : 'Ready'
      : lang === 'zh' ? '绂荤嚎' : 'Offline';

  return (
    <div className="session-chat-overlay" onClick={onClose}>
      <div className="session-chat-container" onClick={(e) => e.stopPropagation()}>
        <div className="tc-header">
          <span className="tc-header-title">{session.chat_name || session.id.slice(0, 12)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`tc-header-status ${isStreaming ? 'streaming' : ''}`}>
              <span className={`chat-status-dot ${isStreaming ? 'streaming' : readiness.ready ? 'ready' : 'offline'}`} />
              {statusLabel}
            </span>
            <button className="chat-close-btn" onClick={onClose} title={t('common.close')}>
              <XIcon size={14} />
            </button>
          </div>
        </div>

        <div className="tc-messages" ref={scrollContainerRef}>
          {!readiness.loading && !readiness.ready && (
            <div className="session-chat-readiness">
              <div className="session-chat-readiness-copy">
                <strong>{readiness.title}</strong>
                <span>{readiness.description}</span>
              </div>
              <div className="session-chat-readiness-actions">
                <button
                  className="session-chat-readiness-btn"
                  onClick={() => {
                    onClose();
                    setActiveItem('settings');
                  }}
                >
                  {t('chat.openSettings')}
                </button>
                <button className="session-chat-readiness-btn secondary" onClick={refreshReadiness}>
                  {t('common.recheck')}
                </button>
              </div>
            </div>
          )}

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
                  {lang === 'zh' ? '鍔╂墜' : 'Assistant'}
                </span>
                <span className="tc-streaming-indicator">{lang === 'zh' ? '姝ｅ湪杈撳叆...' : 'typing...'}</span>
              </div>
              <div className="tc-msg-body">
                {streamingTools.length > 0 && (
                  <ToolCallBlock tools={streamingTools} isStreaming lang={lang} />
                )}
                {reasoningText && (
                  <ThinkingBlock
                    content={reasoningText}
                    isActive
                    label={lang === 'zh' ? '鎬濊€?' : 'Thinking'}
                  />
                )}
                <div className="tc-msg-text">
                  {streamingContent ? <MarkdownRenderer content={streamingContent} /> : ' '}
                  <span className="tc-cursor" />
                </div>
              </div>
            </div>
          )}

          {pendingPermission && (
            <PermissionCard approval={pendingPermission} onRespond={handleApprovalResponse} />
          )}

          {pendingClarify && (
            <ClarifyCard clarify={pendingClarify} onRespond={handleClarifyResponse} />
          )}

          {pendingSecret && (
            <SecretCard
              secret={pendingSecret}
              onRespond={handleSecretResponse}
              onSkip={handleSecretSkip}
            />
          )}

          <div />
        </div>

        <div className="session-chat-input">
          <ChatInput
            ref={chatInputRef}
            onSendMessage={handleSendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
            hasPendingInput={!!pendingPermission || !!pendingClarify || !!pendingSecret}
            disabled={!readiness.loading && !readiness.ready && !pendingPermission && !pendingClarify && !pendingSecret}
          />
        </div>
      </div>
    </div>
  );
};
