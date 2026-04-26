// Chat Session Header - Shows session status, token usage, and last update time
import React, { useMemo } from 'react';
import { useNavigationStore, useChatStore, useSessionStore } from '../stores';
import { useTranslation } from '../hooks/useTranslation';
import { formatNumber } from '../utils/format';

// Format relative time
function formatRelativeTime(timestamp: string | undefined): string {
  if (!timestamp) return '';

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export const ChatSessionHeader: React.FC = () => {
  const { t } = useTranslation();

  // Get current session info
  const activeTabId = useNavigationStore((s) => s.activeTabId);
  const openTabs = useNavigationStore((s) => s.openTabs);
  const sessionState = useChatStore((s) => s.sessions[activeTabId || '']);
  const sessions = useSessionStore((s) => s.sessions);

  // Find the session info from sessionStore
  const sessionInfo = useMemo(() => {
    return sessions.find(s => s.id === activeTabId);
  }, [sessions, activeTabId]);

  // Find the current tab info
  const currentTab = useMemo(() => {
    return openTabs.find(tab => tab.id === activeTabId);
  }, [openTabs, activeTabId]);

  // Calculate total tokens
  const totalTokens = useMemo(() => {
    if (!sessionState) return 0;

    // From token usage in streaming state
    const streamingTokens = sessionState.tokenUsage?.input_tokens + sessionState.tokenUsage?.output_tokens || 0;

    // From messages
    const messageTokens = sessionState.messages?.reduce((sum, msg) => {
      return sum + (msg.totalTokens || 0);
    }, 0) || 0;

    return streamingTokens + messageTokens;
  }, [sessionState]);

  // Get last activity time
  const lastActivity = useMemo(() => {
    // From session info in store
    if (sessionInfo?.last_activity_at) {
      return sessionInfo.last_activity_at;
    }

    // From last message timestamp
    if (sessionState?.messages?.length) {
      const lastMsg = sessionState.messages[sessionState.messages.length - 1];
      return lastMsg?.timestamp;
    }

    return undefined;
  }, [sessionInfo, sessionState]);

  // Determine session status
  const status = useMemo(() => {
    if (sessionState?.isStreaming) return 'streaming';
    if (sessionState?.error) return 'error';
    if (sessionState?.messages?.length) return 'active';
    return 'idle';
  }, [sessionState]);

  // Get session title
  const title = currentTab?.title || sessionInfo?.chat_name || t('chat.idle');

  // Don't render if no active session
  if (!activeTabId) return null;

  return (
    <div className="chat-session-header">
      <div className="chat-session-header-left">
        {/* Status indicator */}
        <span className={`chat-session-status ${status}`}>
          {status === 'streaming' && (
            <>
              <span className="chat-session-status-dot pulse" />
              {t('chat.streaming')}
            </>
          )}
          {status === 'active' && (
            <>
              <span className="chat-session-status-dot" />
              {t('chat.active')}
            </>
          )}
          {status === 'error' && (
            <>
              <span className="material-symbols-outlined status-icon error">error</span>
              {t('chat.error')}
            </>
          )}
          {status === 'idle' && t('chat.idle')}
        </span>

        {/* Token usage */}
        {totalTokens > 0 && (
          <span className="chat-session-tokens">
            <span className="material-symbols-outlined token-icon">token</span>
            {formatNumber(totalTokens)}t
          </span>
        )}
      </div>

      <div className="chat-session-header-center">
        <h1 className="chat-session-title">{title}</h1>
      </div>

      <div className="chat-session-header-right">
        {/* Last update time */}
        {lastActivity && (
          <span className="chat-session-last-update">
            <span className="material-symbols-outlined time-icon">schedule</span>
            {t('chat.lastUpdate')} {formatRelativeTime(lastActivity)}
          </span>
        )}
      </div>
    </div>
  );
};
