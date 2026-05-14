// ChatPage - Claude Code desktop style: full-width messages, role labels, clean terminal aesthetic
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { streamChatRealtime, respondApproval, respondClarify, respondSecret, abortChat } from '../../services/hermesChat';
import { useSessionStore, useNavigationStore, useChatStore, resolveSessionId } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { logger } from '../../lib/logger';
import { cleanErrorMessage } from '../../lib/errorUtils';
import { normalizeContent } from '../../lib/contentUtils';
import { parseToolJson } from '../../components/chat/parseToolJson';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  FileTextIcon,
  RefreshIcon,
  SearchIcon,
  TerminalIcon,
  ToolIcon,
  TrashIcon,
} from '../../components';
import { requestNotificationPermission } from '../../services/notifications';
import { toast } from '../../stores/toastStore';
import { ChatInput, PermissionCard, ClarifyCard, SecretCard } from '../../components/chat';
import type { ChatInputHandle, AttachedFile } from '../../components/chat';
import { ThinkingBlock } from '../../components/chat/ThinkingBlock';
import { ToolItem } from '../../components/chat/ToolItem';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import './ChatPage.css';

// ---- Tool Calls Block ----

const ToolCallsBlock: React.FC<{ tools: ToolCallInfo[]; isStreaming?: boolean; lang: 'zh' | 'en' }> = ({ tools, isStreaming, lang }) => {
  const [expanded, setExpanded] = useState(false);
  if (!tools || tools.length === 0) return null;

  const runningCount = tools.filter(t => !t.duration && !t.is_error && isStreaming).length;
  const completedCount = tools.filter(t => t.duration || (!isStreaming && !t.is_error)).length;
  const errorCount = tools.filter(t => t.is_error).length;

  const labels = {
    toolCalls: lang === 'zh' ? '工具调用' : 'tool calls',
    running: lang === 'zh' ? '进行中' : 'running',
    error: lang === 'zh' ? '错误' : 'error',
    done: lang === 'zh' ? '完成' : 'done',
  };

  return (
    <div className="tool-calls-block">
      <button className="tool-calls-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="tool-calls-chevron" aria-hidden="true">
          {expanded ? <ChevronDownIcon size={12} /> : <ChevronUpIcon size={12} className="tool-calls-chevron-collapsed" />}
        </span>
        <span className="tool-calls-icon" aria-hidden="true"><ToolIcon size={14} /></span>
        <span className="tool-calls-title">
          {tools.length} {labels.toolCalls}
        </span>
        {runningCount > 0 && (
          <span className="tool-call-status running">{runningCount} {labels.running}</span>
        )}
        {errorCount > 0 && (
          <span className="tool-call-status error">{errorCount} {labels.error}</span>
        )}
        {completedCount > 0 && !runningCount && (
          <span className="tool-call-status success">{completedCount} {labels.done}</span>
        )}
      </button>
      {expanded && (
        <div className="tool-calls-list">
          {tools.map((tool, i) => (
            <ToolItem key={i} tool={tool} isStreaming={isStreaming} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Message Block ----

interface MessageBlockProps {
  message: ChatMessage;
  onCopy: (content: string) => void;
  onDelete: (messageId: string) => void;
  onRegenerate?: () => void;
  isLast: boolean;
  lang: 'zh' | 'en';
  t: (key: string) => string;
}

const MessageBlock: React.FC<MessageBlockProps> = React.memo(({ message, onCopy, onDelete, onRegenerate, isLast, lang, t }) => {
  const content = normalizeContent(message.content);
  const isAssistant = message.role === 'assistant';
  const thinkingLabel = t('chat.thinking').replace('...', '');

  return (
    <div className={`chat-message ${message.role}`}>
      <div className="chat-message-content">
        {message.reasoning && (
          <ThinkingBlock content={message.reasoning} label={thinkingLabel} />
        )}

        {message.tools && message.tools.length > 0 && (
          <ToolCallsBlock tools={message.tools} lang={lang} />
        )}

        {content && (
          isAssistant ? (
            <MarkdownRenderer content={content} />
          ) : (
            <div>{content}</div>
          )
        )}
      </div>

      {(message.timestamp || message.inputTokens) && (
        <div className="chat-message-meta">
          {message.timestamp && (
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {message.inputTokens != null && (
            <span>{`${message.inputTokens}->${message.outputTokens}->${message.totalTokens} tok`}</span>
          )}
          {message.thinkingTime != null && message.thinkingTime > 0 && (
            <span>{t('chat.thinkingTime')} {Math.round(message.thinkingTime)}s</span>
          )}
        </div>
      )}

      <div className="chat-message-actions">
        <button className="action-btn" onClick={() => onCopy(content)} title={t('common.copy')}>
          <CopyIcon size={14} />
        </button>
        <button className="action-btn" onClick={() => onDelete(message.id)} title={t('common.delete')}>
          <TrashIcon size={14} />
        </button>
        {isAssistant && isLast && onRegenerate && (
          <button className="action-btn" onClick={onRegenerate} title={t('message.regenerate')}>
            <RefreshIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

// ---- Streaming Message Block ----

interface StreamingBlockProps {
  streamingText: string;
  reasoningText: string;
  streamingTools: ToolCallInfo[];
  lang: 'zh' | 'en';
}

const StreamingBlock: React.FC<StreamingBlockProps> = React.memo(({ streamingText, reasoningText, streamingTools, lang }) => {
  return (
    <div className="chat-message assistant chat-message-streaming">
      <div className="chat-message-content">
        {streamingTools.length > 0 && (
          <ToolCallsBlock tools={streamingTools} isStreaming lang={lang} />
        )}

        {reasoningText && (
          <ThinkingBlock content={reasoningText} isActive label={lang === 'zh' ? '思考' : 'Thinking'} />
        )}

        {streamingText ? (
          <div>
            <MarkdownRenderer content={streamingText} />
            <span className="streaming-cursor" />
          </div>
        ) : (
          reasoningText === '' && streamingTools.length === 0 && (
            <div className="streaming-dots">
              <span /><span /><span />
            </div>
          )
        )}
      </div>

      <div className="chat-message-meta">
        <span className="streaming-badge">
          <span className="streaming-dot" />
          {lang === 'zh' ? '流式输出中' : 'streaming'}
        </span>
      </div>
    </div>
  );
});

// ---- Empty State ----

const EmptyState: React.FC<{ lang: 'zh' | 'en' }> = ({ lang }) => (
  <div className="chat-empty">
    <div className="empty-eyebrow">
      <span className="empty-eyebrow-dot" />
      <span>{lang === 'zh' ? 'Hermes 对话工作台' : 'Hermes conversation workspace'}</span>
    </div>
    <div className="empty-icon">
      <TerminalIcon size={30} />
    </div>
    <h2 className="empty-title">Hermes Agent</h2>
    <p className="empty-subtitle">{lang === 'zh' ? '在下方开始一段对话' : 'Start a conversation below'}</p>
    <div className="empty-hints">
      <div className="empty-hint">
        <span className="empty-hint-icon" aria-hidden="true"><FileTextIcon size={16} /></span>
        <span>{lang === 'zh' ? '写代码、调试并构建项目' : 'Write code, debug, and build projects'}</span>
      </div>
      <div className="empty-hint">
        <span className="empty-hint-icon" aria-hidden="true"><SearchIcon size={16} /></span>
        <span>{lang === 'zh' ? '搜索并分析文件' : 'Search and analyze files'}</span>
      </div>
      <div className="empty-hint">
        <span className="empty-hint-icon" aria-hidden="true"><TerminalIcon size={16} /></span>
        <span>{lang === 'zh' ? '运行命令和工具' : 'Run commands and tools'}</span>
      </div>
    </div>
  </div>
);

// ---- Main Component ----

interface ChatPageProps {
  sessionId?: string;
}

export const ChatPage: React.FC<ChatPageProps> = ({ sessionId }) => {
  const { t, lang } = useTranslation();

  // Navigation
  const { chatContext, activeTabId } = useNavigationStore();
  const rawSessionId = chatContext?.sessionId || sessionId || activeTabId;
  const effectiveSessionId = useMemo(() => resolveSessionId(rawSessionId || ''), [rawSessionId]);

  // Chat store selectors
  const sessionMessages = useChatStore((s) => s.sessions[effectiveSessionId || '']?.messages);
  const sessionIsStreaming = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isStreaming);
  const sessionStreamingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingText);
  const sessionReasoningText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.reasoningText);
  const sessionStreamingTools = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingTools);
  const sessionPendingPermission = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingPermission);
  const sessionPendingClarify = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingClarify);
  const sessionPendingSecret = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingSecret);

  // Chat store actions
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setStreamingText = useChatStore((s) => s.setStreamingText);
  const setReasoningText = useChatStore((s) => s.setReasoningText);
  const clearReasoningText = useChatStore((s) => s.clearReasoningText);
  const clearStreamingTools = useChatStore((s) => s.clearStreamingTools);
  const setPendingPermission = useChatStore((s) => s.setPendingPermission);
  const clearPendingPermission = useChatStore((s) => s.clearPendingPermission);
  const setPendingClarify = useChatStore((s) => s.setPendingClarify);
  const clearPendingClarify = useChatStore((s) => s.clearPendingClarify);
  const setPendingSecret = useChatStore((s) => s.setPendingSecret);
  const clearPendingSecret = useChatStore((s) => s.clearPendingSecret);
  const consumePendingPrompt = useChatStore((s) => s.consumePendingPrompt);

  // Session store
  const updateSessionActivity = useSessionStore((s) => s.updateSessionActivity);

  // Refs
  const chatInputRef = useRef<ChatInputHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef<boolean>(true);
  const isStoppedRef = useRef<boolean>(false);
  const isNearBottomRef = useRef<boolean>(true);

  // Derived state (useMemo to stabilize references for useEffect dependencies)
  const messages = useMemo(() => sessionMessages ?? [], [sessionMessages]);
  const isStreaming = sessionIsStreaming ?? false;
  const streamingText = sessionStreamingText ?? '';
  const reasoningText = sessionReasoningText ?? '';
  const streamingTools = useMemo(() => sessionStreamingTools ?? [], [sessionStreamingTools]);

  // Request notification permission
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Cleanup on unmount - only mark as not mounted, don't abort the session
  // The session should continue running in the background
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Don't abort the session when leaving the page - let it continue in background
      // The streaming state will be preserved in the store
    };
  }, []);

  // Safety timeout for stuck streaming (30 min - matches STREAM_TIMEOUT_MS)
  useEffect(() => {
    if (isStreaming) {
      const timeout = setTimeout(() => {
        if (effectiveSessionId && isStreaming) {
          logger.warn('[ChatPage] Streaming stuck, resetting');
          setStreaming(effectiveSessionId, false);
          clearStreamingTools(effectiveSessionId);
          setStreamingText(effectiveSessionId, '');
          clearReasoningText(effectiveSessionId);
        }
      }, 30 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [isStreaming, effectiveSessionId, setStreaming, clearStreamingTools, setStreamingText, clearReasoningText]);

  // Load messages from server when entering a historical session
  useEffect(() => {
    if (!effectiveSessionId || effectiveSessionId.startsWith('new_')) return;

    // Check if messages already exist in chatStore
    const existingMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
    if (existingMessages && existingMessages.length > 0) {
      logger.debug('[ChatPage] Messages already loaded in chatStore for:', effectiveSessionId);
      return;
    }

    logger.debug('[ChatPage] Loading messages for session:', effectiveSessionId);

    useSessionStore.getState().fetchMessages(effectiveSessionId).then((serverMessages) => {
      if (serverMessages && serverMessages.length > 0 && isMountedRef.current) {
        logger.debug('[ChatPage] Loaded', serverMessages.length, 'messages from server');
        const convertedMessages: ChatMessage[] = serverMessages
          .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg, idx) => {
            const rawContent = normalizeContent(msg.content);
            const { cleanContent } = parseToolJson(rawContent);

            // Skip empty messages after cleaning
            if (!cleanContent && !rawContent && (!msg.tool_calls || msg.tool_calls.length === 0)) {
              return null;
            }

            // Log tool calls for debugging
            if (msg.tool_calls && msg.tool_calls.length > 0) {
              logger.debug('[ChatPage] Message', idx, 'has', msg.tool_calls.length, 'tool calls:', msg.tool_calls.map(tc => tc.name));
            }

            return {
              id: `msg-${Date.now()}-${Math.random()}-${idx}`,
              role: msg.role as 'user' | 'assistant',
              content: cleanContent || rawContent,
              timestamp: msg.timestamp,
              reasoning: msg.reasoning,
              tools: msg.tool_calls?.map(tc => ({
                name: tc.name,
                event_type: 'tool.completed',
                args: tc.args,
                duration: 1,
              })),
            } as ChatMessage;
          })
          .filter((msg): msg is NonNullable<typeof msg> => msg !== null);
        useChatStore.getState().loadMessages(effectiveSessionId, convertedMessages);
      } else {
        logger.debug('[ChatPage] No messages found for session:', effectiveSessionId);
      }
    }).catch((err) => {
      logger.error('[ChatPage] Failed to load session:', err);
    });
  }, [effectiveSessionId]);

  // Track scroll position (isNearBottom pattern)
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 200;
  }, []);

  // Auto-scroll: only when near bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && (isNearBottomRef.current || isStreaming)) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, streamingText, streamingTools, isStreaming]);

  // ---- Handlers ----

  const handleSendMessage = useCallback(async (text: string, files: AttachedFile[]) => {
    const currentIsStreaming = useChatStore.getState().sessions[effectiveSessionId || '']?.isStreaming;
    const currentPendingPermission = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingPermission;
    const currentPendingClarify = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingClarify;
    const currentPendingSecret = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingSecret;
    if (!text.trim() || !effectiveSessionId) return;

    if (currentPendingPermission) {
      const choice = text.trim().toLowerCase();
      const normalizedChoice =
        choice === 'y' || choice === 'yes' || choice === 'approve' || choice === 'approved' ? 'once' :
        choice === 'once' || choice === 'session' || choice === 'always' || choice === 'deny' ? choice :
        'deny';
      await respondApproval(currentPendingPermission.id, normalizedChoice);
      clearPendingPermission(effectiveSessionId);
      return;
    }

    if (currentPendingClarify) {
      await respondClarify(currentPendingClarify.id, text.trim());
      clearPendingClarify(effectiveSessionId);
      return;
    }

    if (currentPendingSecret) {
      await respondSecret(currentPendingSecret.id, text.trim());
      clearPendingSecret(effectiveSessionId);
      return;
    }

    if (currentIsStreaming) {
      setStreaming(effectiveSessionId, false);
      clearStreamingTools(effectiveSessionId);
      try { await abortChat(effectiveSessionId); } catch { /* abort may already be complete */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const userMessage = text.trim();
    const requestSessionId = effectiveSessionId;
    let streamSessionId = requestSessionId;
    const getStreamSessionId = () => resolveSessionId(streamSessionId);
    const initialHistoryForApi = (useChatStore.getState().sessions[requestSessionId]?.messages || [])
      .filter((m) => m.content.trim().length > 0)
      .slice(-20);

    isStoppedRef.current = false;
    clearStreamingTools(requestSessionId);
    addMessage(requestSessionId, { role: 'user', content: userMessage });
    setStreaming(requestSessionId, true);

    try {
      let enrichedMessage = userMessage;
      if (files.length > 0) {
        const fileContexts = files.map(f => `[File: ${f.name}]\n${f.content}`);
        enrichedMessage = `${userMessage}\n\n${fileContexts.join('\n\n')}`;
      }

      const historyForApi = initialHistoryForApi.map(m => ({ role: m.role, content: m.content }));

      await streamChatRealtime(enrichedMessage, requestSessionId, { history: historyForApi, callbacks: {
        onChunk: (_chunk, accumulated) => {
          if (isStoppedRef.current || !isMountedRef.current) return;
          setStreamingText(getStreamSessionId(), accumulated);
        },
        onReasoning: (_text, accumulated) => {
          if (isStoppedRef.current || !isMountedRef.current) return;
          setReasoningText(getStreamSessionId(), accumulated);
        },
        onTool: (tool) => {
          if (isStoppedRef.current || !isMountedRef.current) return;
          useChatStore.getState().addStreamingTool(getStreamSessionId(), {
            name: tool.name,
            event_type: tool.event_type,
            preview: tool.preview,
            args: tool.args as Record<string, unknown> | undefined,
          });
        },
        onComplete: (content, newSessionId, _usage, reasoning) => {
          if (isStoppedRef.current || !isMountedRef.current) return;
          const originalSessionId = getStreamSessionId();
          logger.debug('[ChatPage] onComplete - originalSessionId:', originalSessionId, 'newSessionId:', newSessionId);

          // Always operate on the original session (the one displayed in the UI)
          const sessionId = originalSessionId;

          // Handle migration if this was a new_xxx session
          if (newSessionId && requestSessionId.startsWith('new_')) {
            streamSessionId = newSessionId;
          }

          if (!sessionId) {
            logger.error('[ChatPage] onComplete - no sessionId, skipping');
            return;
          }

          const currentSession = useChatStore.getState().sessions[sessionId];
          const sTools = currentSession?.streamingTools || [];

          // Clear streaming on the original session
          setStreaming(sessionId, false);
          clearStreamingTools(sessionId);
          setStreamingText(sessionId, '');
          clearReasoningText(sessionId);

          const lastMessage = currentSession?.messages?.[currentSession.messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            updateMessage(sessionId, lastMessage.id, {
              content: content,
              reasoning: reasoning || currentSession?.reasoningText || undefined,
              tools: sTools.length > 0 ? sTools : undefined,
            });
          } else {
            addMessage(sessionId, {
              role: 'assistant',
              content: content,
              reasoning: reasoning || undefined,
              tools: sTools.length > 0 ? sTools : undefined,
            });
          }
          if (sessionId && !sessionId.startsWith('new_')) {
            updateSessionActivity(sessionId);
          }
          if (newSessionId) useSessionStore.getState().refreshSessions();
        },
        onError: (_error) => {
          if (isStoppedRef.current || !isMountedRef.current) return;
          const targetSessionId = getStreamSessionId();
          // Preserve accumulated content on error (e.g. timeout)
          const currentSession = useChatStore.getState().sessions[targetSessionId];
          const accumulatedText = currentSession?.streamingText || '';
          const reasoningText = currentSession?.reasoningText || '';
          const sTools = currentSession?.streamingTools || [];
          setStreaming(targetSessionId, false);
          clearStreamingTools(targetSessionId);
          setStreamingText(targetSessionId, '');
          clearReasoningText(targetSessionId);
          // If we had accumulated content, save it as the final message
          if (accumulatedText.trim()) {
            const lastMessage = currentSession?.messages?.slice(-1)[0];
            if (lastMessage && lastMessage.role === 'assistant') {
              updateMessage(targetSessionId, lastMessage.id, {
                content: accumulatedText,
                reasoning: reasoningText || undefined,
                tools: sTools.length > 0 ? sTools : undefined,
              });
            } else {
              addMessage(targetSessionId, {
                role: 'assistant',
                content: accumulatedText,
                reasoning: reasoningText || undefined,
                tools: sTools.length > 0 ? sTools : undefined,
              });
            }
          }
        },
        onApproval: (approval) => {
          const targetSessionId = getStreamSessionId();
          if (!targetSessionId) return;
          setPendingPermission(targetSessionId, approval);
        },
        onClarify: (clarify) => {
          const targetSessionId = getStreamSessionId();
          if (!targetSessionId) return;
          setPendingClarify(targetSessionId, clarify);
        },
        onSecret: (secret) => {
          const targetSessionId = getStreamSessionId();
          if (!targetSessionId) return;
          setPendingSecret(targetSessionId, secret);
        },
        onSessionCreated: (newSessionId) => {
          logger.debug('[ChatPage] onSessionCreated - newSessionId:', newSessionId, 'requestSessionId:', requestSessionId);
          if (requestSessionId.startsWith('new_')) {
            // Migrate messages from new_xxx to real session ID
            useChatStore.getState().migrateSession(requestSessionId, newSessionId);
            streamSessionId = newSessionId;
            // Update the tab ID so fetchSessions doesn't close it as stale
            useNavigationStore.getState().replaceTabId(requestSessionId, newSessionId);
            // Add to optimistic sessions so it appears in the session list
            useSessionStore.getState().addSessionOptimistic(newSessionId);
            logger.debug('[ChatPage] onSessionCreated - migration complete, streamSessionId:', streamSessionId);
          }
        },
      }});
    } catch (error) {
      if (!isStoppedRef.current) {
        const targetSessionId = getStreamSessionId();
        setStreaming(targetSessionId, false);
        const lastMessage = useChatStore.getState().sessions[targetSessionId]?.messages?.slice(-1)[0];
        if (lastMessage) {
          updateMessage(targetSessionId, lastMessage.id, {
            content: `${t('chat.error')}: ${cleanErrorMessage(error)}`,
          });
        }
      }
    }
  }, [effectiveSessionId, addMessage, updateMessage, setStreaming, setStreamingText, setReasoningText, clearReasoningText, clearStreamingTools, updateSessionActivity, clearPendingPermission, clearPendingClarify, clearPendingSecret, setPendingPermission, setPendingClarify, setPendingSecret, t]);

  useEffect(() => {
    if (!effectiveSessionId) return;

    const { prompt, autoSend } = consumePendingPrompt(effectiveSessionId);
    if (!prompt) return;

    if (autoSend) {
      void handleSendMessage(prompt, []);
      return;
    }

    chatInputRef.current?.triggerSend(prompt);
  }, [effectiveSessionId, consumePendingPrompt, handleSendMessage]);

  const handleApprovalResponse = useCallback(async (choice: 'once' | 'session' | 'always' | 'deny') => {
    if (!effectiveSessionId || !sessionPendingPermission) return;
    await respondApproval(sessionPendingPermission.id, choice);
    clearPendingPermission(effectiveSessionId);
  }, [effectiveSessionId, sessionPendingPermission, clearPendingPermission]);

  const handleClarifyResponse = useCallback(async (answer: string) => {
    if (!effectiveSessionId || !sessionPendingClarify) return;
    await respondClarify(sessionPendingClarify.id, answer);
    clearPendingClarify(effectiveSessionId);
  }, [effectiveSessionId, sessionPendingClarify, clearPendingClarify]);

  const handleSecretResponse = useCallback(async (value: string) => {
    if (!effectiveSessionId || !sessionPendingSecret) return;
    await respondSecret(sessionPendingSecret.id, value);
    clearPendingSecret(effectiveSessionId);
  }, [effectiveSessionId, sessionPendingSecret, clearPendingSecret]);

  const handleSecretSkip = useCallback(async () => {
    if (!effectiveSessionId || !sessionPendingSecret) return;
    await respondSecret(sessionPendingSecret.id, '');
    clearPendingSecret(effectiveSessionId);
  }, [effectiveSessionId, sessionPendingSecret, clearPendingSecret]);

  const handleStop = useCallback(async () => {
    if (!effectiveSessionId) return;
    isStoppedRef.current = true;
    try { await abortChat(effectiveSessionId); } catch { /* abort may already be complete */ }
    const currentSession = useChatStore.getState().sessions[effectiveSessionId];
    const sTools = currentSession?.streamingTools || [];
    const currentStreamingText = currentSession?.streamingText || '';
    setStreaming(effectiveSessionId, false);
    const lastMessage = currentSession?.messages?.[currentSession.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      updateMessage(effectiveSessionId, lastMessage.id, {
        content: currentStreamingText || lastMessage.content || t('chat.stopped'),
        tools: sTools.length > 0 ? sTools : undefined,
      });
    }
    clearStreamingTools(effectiveSessionId);
    setStreamingText(effectiveSessionId, '');
    clearReasoningText(effectiveSessionId);
  }, [effectiveSessionId, setStreaming, setStreamingText, clearReasoningText, clearStreamingTools, updateMessage, t]);

  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success(t('message.copied')));
  }, [t]);

  const deleteMessageHandler = useCallback((messageId: string) => {
    if (!effectiveSessionId) return;
    deleteMessage(effectiveSessionId, messageId);
  }, [effectiveSessionId, deleteMessage]);

  const regenerateLast = useCallback(async () => {
    if (!effectiveSessionId || isStreaming) return;
    const currentMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages || [];
    const lastAssistant = [...currentMessages].reverse().find(m => m.role === 'assistant');
    const lastUser = [...currentMessages].reverse().find(m => m.role === 'user');
    if (lastAssistant) {
      deleteMessage(effectiveSessionId, lastAssistant.id);
    }
    if (lastUser) {
      await handleSendMessage(lastUser.content, []);
    }
  }, [effectiveSessionId, isStreaming, deleteMessage, handleSendMessage]);

  // ---- Render ----

  return (
    <div className="chat-page">
      {/* Messages area */}
      <div className="chat-messages" ref={scrollContainerRef} onScroll={handleScroll}>
        {messages.length === 0 && !isStreaming ? (
          <EmptyState lang={lang} />
        ) : (
          <>
            {messages
              .filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map((msg, idx, filtered) => (
              <MessageBlock
                key={msg.id}
                message={msg}
                onCopy={copyMessage}
                onDelete={deleteMessageHandler}
                onRegenerate={idx === filtered.length - 1 && msg.role === 'assistant' ? regenerateLast : undefined}
                isLast={idx === filtered.length - 1}
                lang={lang}
                t={t}
              />
            ))}

            {/* Streaming block */}
            {isStreaming && (
              <StreamingBlock
                streamingText={streamingText}
                reasoningText={reasoningText}
                streamingTools={streamingTools}
                lang={lang}
              />
            )}

            {sessionPendingPermission && (
              <PermissionCard approval={sessionPendingPermission} onRespond={handleApprovalResponse} />
            )}

            {sessionPendingClarify && (
              <ClarifyCard clarify={sessionPendingClarify} onRespond={handleClarifyResponse} />
            )}

            {sessionPendingSecret && (
              <SecretCard
                secret={sessionPendingSecret}
                onRespond={handleSecretResponse}
                onSkip={handleSecretSkip}
              />
            )}

            {/* Bottom spacer for scrolling */}
            <div className="chat-bottom-spacer" />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <ChatInput
          ref={chatInputRef}
          onSendMessage={handleSendMessage}
          onStop={handleStop}
          isStreaming={isStreaming}
          hasPendingInput={!!sessionPendingPermission || !!sessionPendingClarify || !!sessionPendingSecret}
        />
      </div>
    </div>
  );
};
