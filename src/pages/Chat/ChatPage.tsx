// Chat Page - Simplified CLI-style chat interface
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval, abortChat } from '../../services/hermesChat';
import { useSessionStore, useNavigationStore, useChatStore, registerSessionMigration, resolveSessionId } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatSessionHeader } from '../../components';
import { logger } from '../../lib/logger';
import { getErrorMessage } from '../../lib/errorUtils';
import type { ChatMessage } from '../../stores/chatStore';
import { sendNotification, requestNotificationPermission } from '../../services/notifications';
import { toast } from '../../stores/toastStore';
import './ChatPage.css';

/**
 * Normalize message content to prevent garbled rendering.
 * Handles escaped newlines, tool JSON, and other common issues.
 */
function normalizeContent(content: string): string {
  if (!content) return '';
  let clean = content;
  // Unescape literal \n (backslash-n) to actual newlines
  clean = clean.replace(/\\n/g, '\n');
  // Remove excessive whitespace
  clean = clean.replace(/\r\n/g, '\n');
  return clean.trim();
}

import {
  ChatInput, parseToolJson,
} from '../../components/chat';
import { MessageList } from '../../components/chat/MessageList';
import type { SessionSearchResult, ChatInputHandle, AttachedFile } from '../../components/chat';

interface ChatPageProps {
  sessionId?: string;
}

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
}) => {
  const { t } = useTranslation();

  // Navigation store for tabs
  const { chatContext, activeTabId } = useNavigationStore();
  const rawSessionId = chatContext?.sessionId || sessionId || activeTabId;
  // Resolve session ID to handle migration (new_xxx -> real session ID)
  // This ensures we use the correct session ID when looking up pending clarify/approval/secret
  const effectiveSessionId = useMemo(() => resolveSessionId(rawSessionId || ''), [rawSessionId]);

  // Chat store - use stable selectors for each primitive value
  // This avoids object recreation issues that cause infinite loops
  const sessionMessages = useChatStore((s) => s.sessions[effectiveSessionId || '']?.messages);
  const sessionIsStreaming = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isStreaming);
  const sessionStreamingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingText);
  const sessionReasoningText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.reasoningText);
  const sessionStreamingTools = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingTools);
  const sessionPendingPermission = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingPermission);
  const sessionPendingClarify = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingClarify);
  const sessionPendingSecret = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingSecret);
  const sessionTokenUsage = useChatStore((s) => s.sessions[effectiveSessionId || '']?.tokenUsage);
  const sessionError = useChatStore((s) => s.sessions[effectiveSessionId || '']?.error);

  // Build session state with stable references
  // Use primitive values for dependencies to avoid object reference issues
  const sessionState = useMemo(() => ({
    messages: sessionMessages ?? [],
    isStreaming: sessionIsStreaming ?? false,
    streamingText: sessionStreamingText ?? '',
    reasoningText: sessionReasoningText ?? '',
    streamingTools: sessionStreamingTools ?? [],
    pendingPermission: sessionPendingPermission ?? null,
    pendingClarify: sessionPendingClarify ?? null,
    pendingSecret: sessionPendingSecret ?? null,
    tokenUsage: sessionTokenUsage ?? { input_tokens: 0, output_tokens: 0 },
  }), [
    // Use stable primitive values for comparison
    sessionMessages,
    sessionIsStreaming,
    sessionStreamingText,
    sessionReasoningText,
    sessionStreamingTools,
    sessionPendingPermission,
    sessionPendingClarify,
    sessionPendingSecret,
    sessionTokenUsage,
  ]);

  const {
    addMessage,
    updateMessage,
    setStreaming,
    setStreamingText,
    setReasoningText,
    clearReasoningText,
    clearStreamingTools,
    clearPendingPermission,
  } = useChatStore();

  // Session store for loading history from server
  const updateSessionActivity = useSessionStore((s) => s.updateSessionActivity);

  // Local UI state (not per-session)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // In-message search state
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Batch selection for session search results (keyed by message ID)
  const [selectedSearchResults, setSelectedSearchResults] = useState<Record<string, string[]>>({});

  const toggleSearchResult = useCallback((msgId: string, sessionId: string) => {
    setSelectedSearchResults(prev => {
      const current = prev[msgId] || [];
      const next = { ...prev };
      if (current.includes(sessionId)) {
        const filtered = current.filter(id => id !== sessionId);
        if (filtered.length === 0) {
          delete next[msgId];
        } else {
          next[msgId] = filtered;
        }
      } else {
        next[msgId] = [...current, sessionId];
      }
      return next;
    });
  }, []);

  const toggleSelectAllSearchResults = useCallback((msgId: string, sessionIds: string[]) => {
    setSelectedSearchResults(prev => {
      const current = prev[msgId] || [];
      const allSelected = sessionIds.every(id => current.includes(id));
      const next = { ...prev };
      if (allSelected) {
        delete next[msgId];
      } else {
        next[msgId] = [...sessionIds];
      }
      return next;
    });
  }, []);

  const batchDeleteSearchResults = useCallback(async (msgId: string) => {
    const selectedIds = selectedSearchResults[msgId];
    if (!selectedIds || selectedIds.length === 0) return;

    const count = selectedIds.length;
    if (!window.confirm(t('chat.confirmBatchDelete').replace('{count}', String(count)))) return;

    let success = 0;
    for (const id of selectedIds) {
      try {
        await useSessionStore.getState().deleteSession(id);
        success++;
      } catch (err) {
        logger.error('[ChatPage] Batch delete failed:', err);
      }
    }

    // Clear selection
    setSelectedSearchResults(prev => {
      const next = { ...prev };
      delete next[msgId];
      return next;
    });

    sendNotification(t('chat.batchDeleteNotification').replace('{success}', String(success)).replace('{count}', String(count)));
  }, [selectedSearchResults]);

  const batchExportSearchResults = useCallback((msgId: string, sessions: SessionSearchResult[]) => {
    const selectedIds = selectedSearchResults[msgId];
    if (!selectedIds || selectedIds.length === 0) return;

    const selectedResults = sessions.filter(r => selectedIds.includes(r.session_id));
    const exportData = {
      exportedAt: new Date().toISOString(),
      count: selectedResults.length,
      sessions: selectedResults.map(r => ({
        sessionId: r.session_id,
        title: r.title,
        source: r.source,
        lastActive: r.last_active,
        messageCount: r.message_count,
        preview: r.preview,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sendNotification(t('chat.exportNotification').replace('{count}', String(selectedIds.length)));
  }, [selectedSearchResults]);

  // Compute matching message indices
  const messageMatchIndices = useMemo(() => {
    if (!messageSearchQuery.trim()) return [];
    const q = messageSearchQuery.toLowerCase();
    const indices: number[] = [];
    sessionState.messages.forEach((msg, idx) => {
      const raw = msg.content?.toLowerCase() ?? '';
      if (raw.includes(q)) indices.push(idx);
    });
    return indices;
  }, [messageSearchQuery, sessionState.messages]);

  // Compute messages that have visible content (for virtual scrolling)
  const visibleMessages = useMemo(() => {
    return sessionState.messages.filter(msg => {
      const { cleanContent } = msg.content ? parseToolJson(msg.content) : { cleanContent: '' };
      return !!(cleanContent || (msg.tools && msg.tools.length > 0));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState.messages]);

  // Virtual scrolling: only activate for large lists when NOT streaming
  const shouldVirtualize = sessionState.messages.length > 30 && !sessionState.isStreaming;

  const isStoppedRef = useRef<boolean>(false);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Load session messages from server when effectiveSessionId changes
  useEffect(() => {
    if (!effectiveSessionId) return;

    // Skip new session tabs (they start with "new_")
    if (effectiveSessionId.startsWith("new_")) return;

    // Check if we already have messages loaded in chatStore for this session
    const existingMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
    if (existingMessages && existingMessages.length > 0) {
      logger.component("ChatPage", "Already have messages in chatStore for:", effectiveSessionId);
      return;
    }

    // Load from server - use returned messages directly to avoid stale closure issues
    // Use getState() to get fresh references and avoid dependency issues
    logger.component("ChatPage", "Loading messages for:", effectiveSessionId);
    useSessionStore.getState().fetchMessages(effectiveSessionId).then((serverMessages) => {
      // Use returned messages directly instead of getCachedMessages
      if (serverMessages && serverMessages.length > 0) {
        const convertedMessages: ChatMessage[] = serverMessages.map((msg) => ({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: msg.role as "user" | "assistant" | "system",
          content: normalizeContent(msg.content),
          timestamp: msg.timestamp,
          reasoning: msg.reasoning,
          tools: msg.tool_calls?.map(tc => ({
            name: tc.name,
            event_type: "tool.completed",
            args: tc.args,
            duration: 0,
          })),
        }));
        useChatStore.getState().loadMessages(effectiveSessionId, convertedMessages);
        logger.component("ChatPage", "Loaded", convertedMessages.length, "messages for session:", effectiveSessionId);
      } else {
        logger.component("ChatPage", "No messages found for session:", effectiveSessionId);
      }
    }).catch((err) => {
      logger.error("[ChatPage] Failed to load session:", err);
      // Check if session doesn't exist (404 or "not found" error)
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('not found') || errorMsg.includes('Session not found')) {
        logger.warn("[ChatPage] Session no longer exists, closing tab:", effectiveSessionId);
        // Close the invalid tab
        useNavigationStore.getState().closeTab(effectiveSessionId);
        // Show a toast notification
        toast.warning(t('chat.sessionNotFound') || 'Session no longer exists');
      }
    });
  }, [effectiveSessionId]);

  // Track if component is mounted to prevent state updates after unmount
  // Check API availability on mount
  useEffect(() => {
    checkHermesApiHealth().then(available => {
      setApiAvailable(available);
      logger.component('ChatPage', 'Hermes API available:', available);
    });
  }, []);

  // Request notification permission on mount (user will see browser prompt)
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Ctrl+F: toggle in-message search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowMessageSearch(prev => {
          if (!prev) {
            // Open search and focus input after render
            setTimeout(() => {
              const el = document.querySelector<HTMLInputElement>('.message-search-input');
              el?.focus();
              el?.select();
            }, 50);
            return true;
          }
          // Close search
          setMessageSearchQuery('');
          setActiveMatchIndex(0);
          return false;
        });
      }
      if (e.key === 'Escape' && showMessageSearch) {
        setShowMessageSearch(false);
        setMessageSearchQuery('');
        setActiveMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showMessageSearch]);

  // Track error state for notification
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const currentError = sessionError ?? null;
    if (currentError && currentError !== prevErrorRef.current) {
      sendNotification('Hermes', {
        body: `${t('chat.error')}: ${currentError.slice(0, 100)}`,
        tag: 'hermes-stream-error',
      });
    }
    prevErrorRef.current = currentError;
  }, [sessionError]);

  // Handle slash command filtering
  const handleSendMessage = useCallback(async (text: string, files: AttachedFile[]) => {
    // Get current streaming state from store directly to avoid stale closure
    const currentIsStreaming = useChatStore.getState().sessions[effectiveSessionId || '']?.isStreaming;
    const currentPendingPermission = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingPermission;
    if (!text.trim() || !effectiveSessionId) return;

    // If there's a pending permission, deny it and continue (user chose to send new message instead)
    if (currentPendingPermission) {
      logger.debug('[ChatPage] Clearing pending permission to send new message');
      try {
        await respondApproval(currentPendingPermission.id, false);
      } catch (err) {
        logger.error('[ChatPage] Failed to deny pending permission:', err);
      }
      clearPendingPermission(effectiveSessionId);
    }

    // If currently streaming, stop it first then send new message
    if (currentIsStreaming) {
      logger.debug('[ChatPage] Stopping current stream to send new message');
      isStoppedRef.current = true;
      setStreaming(effectiveSessionId, false);
      // Clear streaming tools to prevent duplication
      clearStreamingTools(effectiveSessionId);
      // Abort the backend process
      try {
        await abortChat(effectiveSessionId);
      } catch (err) {
        logger.error('[ChatPage] Failed to abort chat:', err);
      }
      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const userMessage = text.trim();
    const requestSessionId = effectiveSessionId;
    let streamSessionId = requestSessionId;
    const getStreamSessionId = () => resolveSessionId(streamSessionId);
    const initialHistoryForApi = (useChatStore.getState().sessions[requestSessionId]?.messages || [])
      .filter((message) => message.content.trim().length > 0)
      .slice(-20);

    isStoppedRef.current = false;
    clearStreamingTools(requestSessionId);

    // Add user message to chatStore
    addMessage(requestSessionId, {
      role: 'user',
      content: userMessage,
    });

    // Set processing state (minimal — just flags for input disable/stop button)
    setStreaming(requestSessionId, true);

    try {
      // Build message history - include attached files as system context
      let enrichedMessage = userMessage;
      const fileContexts: string[] = [];
      for (const file of files) {
        if (file.isText && file.content) {
          fileContexts.push(`[Attached file: ${file.name}]\n\`\`\`\n${file.content.slice(0, 5000)}\n\`\`\``);
        } else {
          fileContexts.push(`[Attached file: ${file.name}] (${(file.size / 1024).toFixed(1)}KB, ${file.type || 'unknown type'})`);
        }
      }
      if (fileContexts.length > 0) {
        enrichedMessage = `[Attached files]\n${fileContexts.join('\n\n')}\n\n---\n\n${userMessage}`;
      }

      await streamChatRealtime(
        enrichedMessage,
        requestSessionId,
        initialHistoryForApi,
        {
          onChunk: (_chunk, accumulated) => {
            if (isStoppedRef.current) return;
            const targetSessionId = getStreamSessionId();
            setStreamingText(targetSessionId, accumulated);
          },
          onReasoning: (_text, accumulated) => {
            if (isStoppedRef.current) return;
            const targetSessionId = getStreamSessionId();
            setReasoningText(targetSessionId, accumulated);
          },
          onTool: (tool) => {
            if (isStoppedRef.current) return;
            const targetSessionId = getStreamSessionId();
            useChatStore.getState().addStreamingTool(targetSessionId, tool);
          },
          onComplete: (content, newSessionId, usage) => {
            if (isStoppedRef.current) return;

            let targetSessionId = getStreamSessionId();
            if (newSessionId) {
              targetSessionId = newSessionId;
              streamSessionId = newSessionId;
            }

            // Get streaming tools BEFORE clearing streaming state
            const currentSession = useChatStore.getState().sessions[targetSessionId];
            const streamingTools = currentSession?.streamingTools || [];

            // Clear streaming text and reasoning before setting final message
            setStreamingText(targetSessionId, '');
            clearReasoningText(targetSessionId);
            setStreaming(targetSessionId, false);

            // Add complete assistant message
            const currentMessages = currentSession?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];

            if (lastMessage && lastMessage.role === 'assistant') {
              updateMessage(targetSessionId, lastMessage.id, {
                content: content,
                reasoning: currentSession?.reasoningText || undefined,
                tools: streamingTools.length > 0 ? streamingTools : undefined,
                inputTokens: usage?.prompt_tokens ?? usage?.input_tokens,
                outputTokens: usage?.completion_tokens ?? usage?.output_tokens,
                totalTokens: usage?.total_tokens,
              });
            } else {
              addMessage(targetSessionId, {
                role: 'assistant',
                content: content,
                reasoning: currentSession?.reasoningText || undefined,
                tools: streamingTools.length > 0 ? streamingTools : undefined,
              });
            }

            if (targetSessionId && !targetSessionId.startsWith('new_')) {
              updateSessionActivity(targetSessionId);
            }
            if (newSessionId) {
              useSessionStore.getState().refreshSessions();
            }
          },
          onError: (error) => {
            if (isStoppedRef.current) return;
            const targetSessionId = getStreamSessionId();
            setStreamingText(targetSessionId, '');
            clearReasoningText(targetSessionId);
            setStreaming(targetSessionId, false);

            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message || 'Unknown error';
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else {
              try { errorMessage = JSON.stringify(error); } catch { errorMessage = String(error); }
            }

            const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];
            if (lastMessage) {
              updateMessage(targetSessionId, lastMessage.id, {
                content: `${t('chat.error')}: ${errorMessage}\n\n${t('chat.ensureGateway')}。`,
              });
            }
          },
          onApproval: (approval) => {
            // Auto-deny in CLI mode
            respondApproval(approval.id, false).catch((err) => logger.error('[ChatPage] Auto-deny approval failed:', err));
          },
          onSessionCreated: (newSessionId) => {
            if (requestSessionId.startsWith('new_')) {
              registerSessionMigration(requestSessionId, newSessionId);
              streamSessionId = newSessionId;
              useChatStore.getState().migrateSession(requestSessionId, newSessionId);
              useNavigationStore.getState().replaceTabId(requestSessionId, newSessionId, t('chat.idle'));
            }
            useSessionStore.getState().addSessionOptimistic(newSessionId);
            useSessionStore.getState().fetchSessions();
          },
        }
      );
    } catch (error) {
      logger.error('[ChatPage] Error:', error);
      const targetSessionId = getStreamSessionId();
      setStreaming(targetSessionId, false);

      // Get the last message ID from the current store state (not closure)
      const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
      const lastMessage = currentMessages?.[currentMessages.length - 1];
      if (lastMessage) {
        updateMessage(targetSessionId, lastMessage.id, {
          content: `${t('chat.error')}: ${getErrorMessage(error)}`,
        });
      }
    }
  }, [effectiveSessionId, addMessage, updateMessage, setStreaming, t, updateSessionActivity]);

  // Stop running
  const handleStop = async () => {
    // Get current session ID from navigation store (in case tab was switched)
    const currentTabId = useNavigationStore.getState().activeTabId;
    const targetSessionId = currentTabId || effectiveSessionId;
    if (!targetSessionId) return;

    logger.debug('[ChatPage] Stopping chat...');
    isStoppedRef.current = true;

    // Abort the backend process
    try {
      await abortChat(effectiveSessionId);
      logger.debug('[ChatPage] Backend process aborted');
    } catch (error) {
      logger.error('[ChatPage] Failed to abort chat:', error);
    }

    // Get current streaming state BEFORE clearing
    const currentSession = useChatStore.getState().sessions[targetSessionId];
    const streamingTools = currentSession?.streamingTools || [];
    const currentStreamingText = currentSession?.streamingText || '';

    setStreaming(targetSessionId, false);

    // Get the last message from the current store state (not closure)
    const currentMessages = currentSession?.messages;
    const lastMessage = currentMessages?.[currentMessages.length - 1];

    // Save accumulated streaming content to message before clearing
    if (lastMessage && lastMessage.role === 'assistant') {
      updateMessage(targetSessionId, lastMessage.id, {
        content: currentStreamingText || lastMessage.content || t('chat.stopped'),
        tools: streamingTools.length > 0 ? streamingTools : undefined,
      });
    }

    // Clear streaming state AFTER saving to message
    setStreamingText(targetSessionId, '');
    clearReasoningText(targetSessionId);
    clearStreamingTools(targetSessionId);
  };

  // Handle approval response - wrapped in useCallback to prevent stale closure issues
  const handleApprovalResponse = useCallback(async (choice: 'once' | 'session' | 'always' | 'deny') => {
    // Get current pending permission from store directly to avoid stale closure
    const currentSessionId = effectiveSessionId || useNavigationStore.getState().activeTabId;
    const currentPendingPermission = useChatStore.getState().sessions[currentSessionId || '']?.pendingPermission;

    if (!currentSessionId || !currentPendingPermission) {
      logger.warn('[ChatPage] handleApprovalResponse - No session or pending permission', {
        currentSessionId,
        hasPermission: !!currentPendingPermission
      });
      return;
    }

    logger.info('[ChatPage] Approval response:', {
      choice,
      approvalId: currentPendingPermission.id,
      sessionId: currentSessionId
    });

    try {
      await respondApproval(currentPendingPermission.id, choice !== 'deny');
      logger.info('[ChatPage] Approval response sent successfully');
    } catch (error) {
      logger.error('[ChatPage] Failed to send approval response:', error);
    }
    clearPendingPermission(currentSessionId);
  }, [effectiveSessionId, clearPendingPermission]);

  // ---- Message operations ----
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editMessageContent, setEditMessageContent] = useState('');

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      logger.error('[ChatPage] Failed to copy:', err);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!effectiveSessionId) return;
    useChatStore.getState().deleteMessage(effectiveSessionId, messageId);
  };

  const handleRegenerate = () => {
    if (!effectiveSessionId) return;
    const msgs = useChatStore.getState().sessions[effectiveSessionId]?.messages ?? [];
    // Find the last user message before the current assistant message
    let lastUserMsgIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'assistant') continue;
      if (msgs[i]?.role === 'user') { lastUserMsgIdx = i; break; }
    }
    if (lastUserMsgIdx < 0) return;

    const userMsg = msgs[lastUserMsgIdx];
    if (!userMsg?.content) return;

    // Remove the last assistant message (the one being regenerated)
    // and any messages after it
    let assistantIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'assistant') { assistantIdx = i; break; }
    }
    if (assistantIdx >= 0) {
      const idsToRemove = msgs.slice(assistantIdx).map(m => m.id);
      for (const id of idsToRemove) {
        useChatStore.getState().deleteMessage(effectiveSessionId, id);
      }
    }

    // Fill the input for the user to review/edit before sending
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
    if (!effectiveSessionId || !editMessageContent.trim()) return;
    useChatStore.getState().updateMessage(effectiveSessionId, messageId, {
      content: editMessageContent.trim(),
    });
    setEditMessageId(null);
    setEditMessageContent('');
  };

  const closeSearch = useCallback(() => {
    setShowMessageSearch(false);
    setMessageSearchQuery('');
    setActiveMatchIndex(0);
  }, []);

  return (
    <div className="chat-page">
      <ChatSessionHeader />

      <MessageList
        messages={sessionState.messages}
        visibleMessages={visibleMessages}
        shouldVirtualize={shouldVirtualize}
        isStreaming={sessionState.isStreaming}
        streamingText={sessionState.streamingText}
        reasoningText={sessionState.reasoningText}
        streamingTools={sessionState.streamingTools}
        pendingPermission={sessionState.pendingPermission}
        apiAvailable={apiAvailable}
        showMessageSearch={showMessageSearch}
        messageSearchQuery={messageSearchQuery}
        messageMatchIndices={messageMatchIndices}
        activeMatchIndex={activeMatchIndex}
        editMessageId={editMessageId}
        editMessageContent={editMessageContent}
        selectedSearchResults={selectedSearchResults}
        onSetSearchQuery={setMessageSearchQuery}
        onSetActiveMatch={setActiveMatchIndex}
        onCloseSearch={closeSearch}
        onToggleSearchResult={toggleSearchResult}
        onToggleSelectAll={toggleSelectAllSearchResults}
        onBatchDelete={batchDeleteSearchResults}
        onBatchExport={batchExportSearchResults}
        onCopyMessage={copyMessage}
        onDeleteMessage={handleDeleteMessage}
        onRegenerate={handleRegenerate}
        onStartEdit={startEditMessage}
        onCancelEdit={cancelEditMessage}
        onSaveEdit={saveEditMessage}
        onEditContentChange={setEditMessageContent}
        onApprovalResponse={handleApprovalResponse}
        t={t}
      />

      <ChatInput
        ref={chatInputRef}
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isStreaming={sessionState.isStreaming}
        hasPendingPermission={!!sessionState.pendingPermission}
      />
    </div>
  );
};
