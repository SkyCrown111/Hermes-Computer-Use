// Chat Page - Full screen chat interface with Hermes Agent
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval, abortChat } from '../../services/hermesChat';
import { useSessionStore, useNavigationStore, useChatStore, registerSessionMigration, resolveSessionId } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatSessionHeader } from '../../components';
import { logger } from '../../lib/logger';
import type { ChatMessage } from '../../stores/chatStore';
import { sendNotification, requestNotificationPermission } from '../../services/notifications';
import './ChatPage.css';

import {
  MessageList, ChatInput,
  parseToolJson,
} from '../../components/chat';
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
  const effectiveSessionId = chatContext?.sessionId || sessionId || activeTabId;

  // Chat store - use stable selectors for each primitive value
  // This avoids object recreation issues that cause infinite loops
  const sessionMessages = useChatStore((s) => s.sessions[effectiveSessionId || '']?.messages);
  const sessionStreamingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingText);
  const sessionIsStreaming = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isStreaming);
  const sessionIsThinking = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isThinking);
  const sessionThinkingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.thinkingText);
  const sessionReasoningText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.reasoningText);
  const sessionStreamingTools = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingTools);
  const sessionPendingPermission = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingPermission);
  const sessionTokenUsage = useChatStore((s) => s.sessions[effectiveSessionId || '']?.tokenUsage);
  const sessionError = useChatStore((s) => s.sessions[effectiveSessionId || '']?.error);

  // Build session state with stable references
  // Use primitive values for dependencies to avoid object reference issues
  const sessionState = useMemo(() => ({
    messages: sessionMessages ?? [],
    streamingText: sessionStreamingText ?? '',
    isStreaming: sessionIsStreaming ?? false,
    isThinking: sessionIsThinking ?? false,
    thinkingText: sessionThinkingText ?? '',
    reasoningText: sessionReasoningText ?? '',
    streamingTools: sessionStreamingTools ?? [],
    pendingPermission: sessionPendingPermission ?? null,
    tokenUsage: sessionTokenUsage ?? { input_tokens: 0, output_tokens: 0 },
  }), [
    // Use stable primitive values for comparison
    sessionMessages,
    sessionStreamingText,
    sessionIsStreaming,
    sessionIsThinking,
    sessionThinkingText,
    sessionReasoningText,
    sessionStreamingTools,
    sessionPendingPermission,
    sessionTokenUsage,
  ]);

  const {
    addMessage,
    updateMessage,
    setStreaming,
    setStreamingText,
    setThinking,
    appendReasoningText,
    clearReasoningText,
    addStreamingTool,
    clearStreamingTools,
    setPendingPermission: setChatPendingPermission,
    clearPendingPermission,
    setTokenUsage,
    loadMessages,
  } = useChatStore();

  // Session store for loading history from server
  const fetchMessagesFromServer = useSessionStore((s) => s.fetchMessages);
  const updateSessionActivity = useSessionStore((s) => s.updateSessionActivity);

  // Local UI state (not per-session)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
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
    if (!window.confirm(`确定删除选中的 ${count} 个会话？此操作不可恢复。`)) return;

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

    sendNotification(`已删除 ${success}/${count} 个会话`);
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

    sendNotification(`已导出 ${selectedIds.length} 个会话`);
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
      return !!(cleanContent || msg.reasoning || (msg.tools && msg.tools.length > 0) || msg.thinking);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState.messages]);

  // Virtual scrolling: only activate for large lists when NOT streaming
  const shouldVirtualize = sessionState.messages.length > 30 && !sessionState.isStreaming;

  const isStoppedRef = useRef<boolean>(false);
  const accumulatedContentRef = useRef<string>('');

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Load session messages from server when effectiveSessionId changes
  useEffect(() => {
    if (!effectiveSessionId) return;

    // Skip new session tabs (they start with "new_")
    if (effectiveSessionId.startsWith('new_')) return;

    // Check if we already have messages loaded in chatStore for this session
    const existingMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
    if (existingMessages && existingMessages.length > 0) {
      logger.component('ChatPage', 'Already have messages in chatStore for:', effectiveSessionId);
      return;
    }

    // Load from server - use returned messages directly to avoid stale closure issues
    logger.component('ChatPage', 'Loading messages for:', effectiveSessionId);
    fetchMessagesFromServer(effectiveSessionId).then((serverMessages) => {
      // Use returned messages directly instead of getCachedMessages
      if (serverMessages && serverMessages.length > 0) {
        const convertedMessages: ChatMessage[] = serverMessages.map((msg) => ({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          reasoning: msg.reasoning,
          tools: msg.tool_calls?.map(tc => ({
            name: tc.name,
            event_type: 'tool.completed',
            args: tc.args,
            duration: 0,
          })),
        }));
        loadMessages(effectiveSessionId, convertedMessages);
        logger.component('ChatPage', 'Loaded', convertedMessages.length, 'messages for session:', effectiveSessionId);
      } else {
        logger.component('ChatPage', 'No messages found for session:', effectiveSessionId);
      }
    }).catch((err) => {
      logger.error('[ChatPage] Failed to load session:', err);
    });
  }, [effectiveSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Track previous streaming state for notification on completion
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !sessionState.isStreaming && sessionState.messages.length > 0) {
      // Streaming just finished — check if it was a real completion (not a stop)
      // If the last message has content, it was a real completion
      const lastMsg = sessionState.messages[sessionState.messages.length - 1];
      if (lastMsg?.content && lastMsg.content !== sessionState.streamingText) {
        // Message has been finalized with content
        sendNotification('Hermes', {
          body: '对话已完成',
          tag: 'hermes-stream-complete',
        });
      }
    }
    prevStreamingRef.current = sessionState.isStreaming;
  }, [sessionState.isStreaming, sessionState.messages, sessionState.streamingText]);

  // Track error state for notification
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const currentError = sessionError ?? null;
    if (currentError && currentError !== prevErrorRef.current) {
      sendNotification('Hermes', {
        body: `出错: ${currentError.slice(0, 100)}`,
        tag: 'hermes-stream-error',
      });
    }
    prevErrorRef.current = currentError;
  }, [sessionError]);

  // Handle slash command filtering
  const handleSendMessage = useCallback(async (text: string, files: AttachedFile[]) => {
    // Get current streaming state from store directly to avoid stale closure
    const currentIsStreaming = useChatStore.getState().sessions[effectiveSessionId || '']?.isStreaming;
    if (!text.trim() || !effectiveSessionId) return;

    // If currently streaming, stop it first then send new message
    if (currentIsStreaming) {
      console.log('[ChatPage] Stopping current stream to send new message');
      isStoppedRef.current = true;
      setStreaming(effectiveSessionId, false);
      setThinking(effectiveSessionId, false);
      // Clear streaming tools to prevent duplication
      clearStreamingTools(effectiveSessionId);
      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const userMessage = text.trim();
    setThinkingStartTime(Date.now());
    isStoppedRef.current = false;
    accumulatedContentRef.current = '';

    // Clear previous streaming state
    setStreamingText(effectiveSessionId, '');
    clearReasoningText(effectiveSessionId);
    clearStreamingTools(effectiveSessionId);

    // Add user message to chatStore
    addMessage(effectiveSessionId, {
      role: 'user',
      content: userMessage,
    });

    // Add streaming placeholder message
    addMessage(effectiveSessionId, {
      role: 'assistant',
      content: '',
    });

    // Set streaming state
    setStreaming(effectiveSessionId, true);
    setThinking(effectiveSessionId, true, t('chat.thinking'));

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

      // Get current messages from store directly to avoid stale closure
      const currentMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages || [];
      const historyForApi = currentMessages.slice(-20);

      await streamChatRealtime(
        enrichedMessage,
        effectiveSessionId,
        historyForApi,
        {
          onStatus: (_status, msg) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) setThinking(currentTabId, true, msg);
          },
          onChunk: (_chunk, accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              setStreamingText(currentTabId, accumulated);
              setThinking(currentTabId, false);
            }
          },
          onReasoning: (text, _accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              appendReasoningText(currentTabId, text);
              setThinking(currentTabId, false); // Stop showing "thinking" when reasoning starts
            }
          },
          onTool: (tool) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            console.log('[ChatPage] Tool call:', tool);
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              addStreamingTool(currentTabId, tool); // Only add to streaming display during streaming
              setThinking(currentTabId, false);
            }
          },
          onUsage: (usage) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              setTokenUsage(currentTabId, {
                input_tokens: usage.prompt_tokens,
                output_tokens: usage.completion_tokens,
              });
            }
          },
          onComplete: (content, newSessionId, usage) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            const thinkingTime = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;

            // Get the current active tab ID from navigation store (most up-to-date)
            const currentActiveTabId = useNavigationStore.getState().activeTabId;

            // Resolve the session ID - this handles the case where the ID was migrated
            // from new_xxx to a real session ID
            let targetSessionId = resolveSessionId(effectiveSessionId);

            // If we have a newSessionId from the event, prefer that
            if (newSessionId) {
              targetSessionId = newSessionId;
            } else if (currentActiveTabId) {
              // Also try to resolve the current active tab ID
              targetSessionId = resolveSessionId(currentActiveTabId);
            }

            console.log('[ChatPage] onComplete - effectiveSessionId:', effectiveSessionId);
            console.log('[ChatPage] onComplete - newSessionId:', newSessionId);
            console.log('[ChatPage] onComplete - currentActiveTabId:', currentActiveTabId);
            console.log('[ChatPage] onComplete - resolved targetSessionId:', targetSessionId);

            setStreaming(targetSessionId, false);
            setThinking(targetSessionId, false);
            setThinkingStartTime(null);

            // Use accumulated content if event content is empty
            const finalContent = content || accumulatedContentRef.current;

            // Get the reasoning text and tools from the current store state
            const currentSession = useChatStore.getState().sessions[targetSessionId];
            const currentReasoningText = currentSession?.reasoningText || '';
            const currentStreamingTools = currentSession?.streamingTools || [];

            // Get the last message ID from the current store state (not closure)
            const currentMessages = currentSession?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];
            if (lastMessage) {
              updateMessage(targetSessionId, lastMessage.id, {
                content: finalContent,
                reasoning: currentReasoningText,
                tools: currentStreamingTools, // Save streaming tools to message
                thinkingTime,
                inputTokens: usage?.prompt_tokens,
                outputTokens: usage?.completion_tokens,
                totalTokens: usage?.total_tokens,
              });
              console.log('[ChatPage] onComplete - Updated message:', lastMessage.id, 'content length:', finalContent.length);
            } else {
              console.log('[ChatPage] onComplete - No last message found for session:', targetSessionId);
              // Log all available sessions for debugging
              const allSessions = useChatStore.getState().sessions;
              console.log('[ChatPage] Available sessions:', Object.keys(allSessions));
            }

            // Clear streaming state after saving to message
            setStreamingText(targetSessionId, '');
            clearReasoningText(targetSessionId);
            clearStreamingTools(targetSessionId);

            // Update session activity in the list
            if (targetSessionId && !targetSessionId.startsWith('new_')) {
              updateSessionActivity(targetSessionId);
            }

            // If new session was created, refresh the session list
            if (newSessionId) {
              useSessionStore.getState().refreshSessions();
            }
          },
          onError: (error) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            logger.error('[ChatPage] Stream error:', error);

            // Get the current session ID from navigation store (in case it was replaced)
            const currentTabId = useNavigationStore.getState().activeTabId;
            const targetSessionId = currentTabId || effectiveSessionId;

            setStreaming(targetSessionId, false);
            setThinking(targetSessionId, false);
            setThinkingStartTime(null);

            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message || 'Unknown error';
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object') {
              errorMessage = JSON.stringify(error);
            }

            // Get the last message ID from the current store state (not closure)
            const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];
            if (lastMessage) {
              updateMessage(targetSessionId, lastMessage.id, {
                content: `${t('chat.error')}: ${errorMessage}\n\n${t('chat.ensureGateway')}。\n\n${t('chat.runCommand')}: hermes gateway`,
              });
            }
          },
          onApproval: (approval) => {
            if (!isMountedRef.current) return;
            console.log('[ChatPage] Approval request:', approval);
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) setChatPendingPermission(currentTabId, approval);
          },
          onSessionCreated: (newSessionId) => {
            if (!isMountedRef.current) return;
            console.log('[ChatPage] Session created:', newSessionId);

            // Get current tab ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;

            console.log('[ChatPage] onSessionCreated - currentTabId:', currentTabId);
            console.log('[ChatPage] onSessionCreated - effectiveSessionId:', effectiveSessionId);

            // If current tab is a temporary "new_" tab, replace it with the real session ID
            if (currentTabId && currentTabId.startsWith('new_')) {
              console.log('[ChatPage] Migrating session from', currentTabId, 'to', newSessionId);

              // Register the migration so onComplete can find the new ID
              registerSessionMigration(currentTabId, newSessionId);

              // Migrate messages from old ID to new ID
              useChatStore.getState().migrateSession(currentTabId, newSessionId);

              // Then update the tab with the new session ID
              useNavigationStore.getState().replaceTabId(currentTabId, newSessionId, '新会话');

              console.log('[ChatPage] Session migration complete');
            }

            // Optimistically add session to list immediately
            useSessionStore.getState().addSessionOptimistic(newSessionId);
            // Then fetch the full session list to get the actual session data from server
            useSessionStore.getState().fetchSessions();
          },
        }
      );
    } catch (error) {
      if (!isMountedRef.current) return;
      logger.error('[ChatPage] Error:', error);
      setStreaming(effectiveSessionId, false);
      setThinking(effectiveSessionId, false);
      setThinkingStartTime(null);

      // Get the last message ID from the current store state (not closure)
      const currentMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
      const lastMessage = currentMessages?.[currentMessages.length - 1];
      if (lastMessage) {
        updateMessage(effectiveSessionId, lastMessage.id, {
          content: `${t('chat.error')}: ${(error as Error).message}`,
        });
      }
    }
  }, [effectiveSessionId, addMessage, updateMessage, setStreaming, setStreamingText, setThinking, appendReasoningText, clearReasoningText, clearStreamingTools, addStreamingTool, setTokenUsage, setChatPendingPermission, thinkingStartTime, t, updateSessionActivity]);

  // Stop running
  const handleStop = async () => {
    // Get current session ID from navigation store (in case tab was switched)
    const currentTabId = useNavigationStore.getState().activeTabId;
    const targetSessionId = currentTabId || effectiveSessionId;
    if (!targetSessionId) return;

    console.log('[ChatPage] Stopping chat...');
    isStoppedRef.current = true;

    // Abort the backend process
    try {
      await abortChat();
      console.log('[ChatPage] Backend process aborted');
    } catch (error) {
      console.error('[ChatPage] Failed to abort chat:', error);
    }

    setStreaming(targetSessionId, false);
    setThinking(targetSessionId, false);
    setThinkingStartTime(null);

    // Clear streaming tools to prevent duplication
    clearStreamingTools(targetSessionId);

    // Get the last message from the current store state (not closure)
    const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
    const lastMessage = currentMessages?.[currentMessages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      updateMessage(targetSessionId, lastMessage.id, {
        content: lastMessage.content || t('chat.stopped'),
      });
    }
  };

  // Handle approval response
  const handleApprovalResponse = async (choice: 'once' | 'session' | 'always' | 'deny') => {
    // Get current pending permission from store directly to avoid stale closure
    const currentPendingPermission = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingPermission;
    if (!effectiveSessionId || !currentPendingPermission) return;

    console.log('[ChatPage] Approval response:', choice);
    try {
      await respondApproval(currentPendingPermission.id, choice);
    } catch (error) {
      logger.error('[ChatPage] Failed to send approval response:', error);
    }
    clearPendingPermission(effectiveSessionId);
  };

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
        isThinking={sessionState.isThinking}
        thinkingText={sessionState.thinkingText}
        reasoningText={sessionState.reasoningText}
        streamingText={sessionState.streamingText}
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
      />
    </div>
  );
};
